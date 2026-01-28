import asyncio
import ssl
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models.virtual_machine_model import VirtualMachine
from app.models.proxmox_server_model import ProxmoxServer
from app.config import settings
from sqlalchemy import select
import websockets

router = APIRouter(tags=["vnc-websocket"])


@router.websocket("/vnc-ws")
async def vnc_websocket_proxy(
    websocket: WebSocket,
    node: str = Query(...),
    vmid: int = Query(...),
    port: int = Query(...),
    vncticket: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """
    WebSocket proxy: browser noVNC ↔ Proxmox VNC WebSocket.
    """
    await websocket.accept()

    # Get VM to find Proxmox server details
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.vmid == vmid)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        await websocket.close(code=1008, reason="VM not found")
        return

    # Get Proxmox server credentials and connection info
    if vm.proxmox_server_id:
        srv_result = await session.execute(
            select(ProxmoxServer).where(ProxmoxServer.id == vm.proxmox_server_id)
        )
        server = srv_result.scalar_one_or_none()
        proxmox_host = server.host if server else settings.PROXMOX_HOST
        proxmox_port = server.port if server else 8006
        proxmox_user = server.user if server else settings.PROXMOX_USER
        proxmox_token_name = server.token_name if server else settings.PROXMOX_TOKEN_NAME
        proxmox_token_value = server.token_value if server else settings.PROXMOX_TOKEN_VALUE
    else:
        proxmox_host = settings.PROXMOX_HOST
        proxmox_port = getattr(settings, 'PROXMOX_PORT', 8006)
        proxmox_user = settings.PROXMOX_USER
        proxmox_token_name = settings.PROXMOX_TOKEN_NAME
        proxmox_token_value = settings.PROXMOX_TOKEN_VALUE

    proxmox_ws_url = (
        f"wss://{proxmox_host}:{proxmox_port}/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket"
        f"?port={port}&vncticket={vncticket}"
    )

    # Proxmox API token auth header
    auth_header = f"PVEAPIToken={proxmox_user}!{proxmox_token_name}={proxmox_token_value}"

    # SSL context to skip verification (self-signed cert)
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    # Connect to Proxmox WebSocket with API token auth
    try:
        async with websockets.connect(
            proxmox_ws_url,
            ssl=ssl_context,
            open_timeout=10,
            additional_headers={"Authorization": auth_header},
        ) as proxmox_ws:
            # Start bidirectional proxy tasks
            async def client_to_proxmox():
                """Forward messages from client (browser) to Proxmox"""
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await proxmox_ws.send(data)
                except WebSocketDisconnect:
                    pass
                except Exception:
                    pass

            async def proxmox_to_client():
                """Forward messages from Proxmox to client (browser)"""
                try:
                    async for message in proxmox_ws:
                        if isinstance(message, bytes):
                            await websocket.send_bytes(message)
                        else:
                            await websocket.send_text(message)
                except Exception:
                    pass

            # Run both directions concurrently
            await asyncio.gather(
                client_to_proxmox(),
                proxmox_to_client(),
                return_exceptions=True,
            )

    except Exception as e:
        await websocket.close(code=1011, reason=f"Proxmox connection failed: {str(e)}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
