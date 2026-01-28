import asyncio
import ssl
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models.virtual_machine_model import VirtualMachine
from app.services.proxmox_client import create_proxmox_service_for_vm
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
    WebSocket proxy endpoint that forwards connections to Proxmox VNC WebSocket.
    This endpoint bridges the client (noVNC in browser) to Proxmox VE VNC WebSocket.
    """
    await websocket.accept()

    # Get VM to find the Proxmox server details
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.vmid == vmid)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        await websocket.close(code=1008, reason="VM not found")
        return

    # Get ProxmoxService to retrieve server host/port
    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
    except Exception as e:
        await websocket.close(code=1011, reason=f"Failed to connect to Proxmox: {str(e)}")
        return

    # Build Proxmox WebSocket URL
    # Format: wss://{host}:{port}/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket?port={port}&vncticket={ticket}
    proxmox_host = proxmox.proxmox._session.proxmox_host
    proxmox_port = proxmox.proxmox._session.proxmox_port or 8006

    proxmox_ws_url = (
        f"wss://{proxmox_host}:{proxmox_port}/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket"
        f"?port={port}&vncticket={vncticket}"
    )

    # SSL context to skip verification (self-signed cert)
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    # Connect to Proxmox WebSocket
    try:
        async with websockets.connect(
            proxmox_ws_url,
            ssl=ssl_context,
            open_timeout=10,
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
