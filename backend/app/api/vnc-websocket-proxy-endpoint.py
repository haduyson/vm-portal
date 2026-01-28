import asyncio
import ssl
import urllib.parse
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models.virtual_machine_model import VirtualMachine
from app.models.proxmox_server_model import ProxmoxServer
from app.config import settings
from sqlalchemy import select
import websockets
import aiohttp

router = APIRouter(tags=["vnc-websocket"])


async def _get_pve_auth(host: str, port: int, user: str, password: str) -> dict:
    """Get PVE ticket + CSRF token using username/password.
    Proxmox VNC WebSocket does not support API tokens — ticket auth required.
    Returns dict with 'ticket' and 'CSRFPreventionToken'.
    """
    url = f"https://{host}:{port}/api2/json/access/ticket"
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    async with aiohttp.ClientSession() as session:
        async with session.post(
            url, data={"username": user, "password": password}, ssl=ssl_ctx,
        ) as resp:
            if resp.status != 200:
                raise Exception(f"PVE ticket auth failed: HTTP {resp.status}")
            data = await resp.json()
            return data["data"]


async def _create_vnc_proxy_with_ticket(
    host: str, port: int, node: str, vmid: int, auth: dict,
) -> dict:
    """Create VNC proxy using PVE ticket auth (not API token).
    Returns dict with 'ticket' (VNC ticket) and 'port'.
    """
    url = f"https://{host}:{port}/api2/json/nodes/{node}/qemu/{vmid}/vncproxy"
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    async with aiohttp.ClientSession() as session:
        async with session.post(
            url,
            data={"websocket": "1"},
            headers={
                "Cookie": f"PVEAuthCookie={auth['ticket']}",
                "CSRFPreventionToken": auth["CSRFPreventionToken"],
            },
            ssl=ssl_ctx,
        ) as resp:
            if resp.status != 200:
                raise Exception(f"VNC proxy creation failed: HTTP {resp.status}")
            data = await resp.json()
            return data["data"]


@router.websocket("/vnc-ws")
async def vnc_websocket_proxy(
    websocket: WebSocket,
    vmid: int = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """
    WebSocket proxy: browser noVNC <-> Proxmox VNC WebSocket.
    Handles full VNC setup internally: PVE ticket auth, VNC proxy creation,
    and bidirectional WebSocket proxying.
    """
    print(f"[VNC] WebSocket connection for vmid={vmid} from {websocket.client}")
    await websocket.accept()
    print(f"[VNC] WebSocket accepted for vmid={vmid}")

    # Get VM to find Proxmox server details
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.vmid == vmid)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        await websocket.close(code=1008, reason="VM not found")
        return

    # Get Proxmox server credentials
    if vm.proxmox_server_id:
        srv_result = await session.execute(
            select(ProxmoxServer).where(ProxmoxServer.id == vm.proxmox_server_id)
        )
        server = srv_result.scalar_one_or_none()
        proxmox_host = server.host if server else settings.PROXMOX_HOST
        proxmox_port = server.port if server else 8006
        proxmox_user = server.user if server else settings.PROXMOX_USER
        proxmox_password = server.password if server else settings.PROXMOX_PASSWORD
        proxmox_node = server.node if server else settings.PROXMOX_NODE
    else:
        proxmox_host = settings.PROXMOX_HOST
        proxmox_port = getattr(settings, "PROXMOX_PORT", 8006)
        proxmox_user = settings.PROXMOX_USER
        proxmox_password = settings.PROXMOX_PASSWORD
        proxmox_node = settings.PROXMOX_NODE

    if not proxmox_password:
        await websocket.close(
            code=1011,
            reason="VNC console requires Proxmox password. Set in admin Proxmox server settings.",
        )
        return

    # Step 1: Get PVE auth ticket
    try:
        pve_auth = await _get_pve_auth(
            proxmox_host, proxmox_port, proxmox_user, proxmox_password
        )
    except Exception as e:
        await websocket.close(code=1011, reason=f"PVE auth failed: {str(e)}")
        return

    # Step 2: Create VNC proxy using PVE ticket (not API token)
    node = vm.proxmox_node or proxmox_node
    try:
        vnc_data = await _create_vnc_proxy_with_ticket(
            proxmox_host, proxmox_port, node, vmid, pve_auth
        )
    except Exception as e:
        await websocket.close(code=1011, reason=f"VNC proxy creation failed: {str(e)}")
        return

    vnc_ticket = vnc_data["ticket"]
    vnc_port = vnc_data["port"]

    # Step 3: Connect to Proxmox VNC WebSocket with PVE ticket cookie
    proxmox_ws_url = (
        f"wss://{proxmox_host}:{proxmox_port}/api2/json/nodes/{node}"
        f"/qemu/{vmid}/vncwebsocket"
        f"?port={vnc_port}&vncticket={urllib.parse.quote(vnc_ticket, safe='')}"
    )

    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    print(f"Connecting to Proxmox VNC: {proxmox_ws_url[:80]}...")
    try:
        async with websockets.connect(
            proxmox_ws_url,
            ssl=ssl_context,
            open_timeout=10,
            extra_headers={
                "Cookie": f"PVEAuthCookie={pve_auth['ticket']}",
            },
        ) as proxmox_ws:
            print(f"Connected to Proxmox VNC for vmid {vmid}")
            async def client_to_proxmox():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.receive":
                            if "bytes" in msg and msg["bytes"]:
                                await proxmox_ws.send(msg["bytes"])
                            elif "text" in msg and msg["text"]:
                                await proxmox_ws.send(msg["text"].encode())
                        elif msg["type"] == "websocket.disconnect":
                            print(f"[VNC] Client disconnected for vmid {vmid}")
                            break
                except WebSocketDisconnect:
                    print(f"[VNC] Client WebSocketDisconnect for vmid {vmid}")
                except Exception as e:
                    print(f"[VNC] client_to_proxmox error for vmid {vmid}: {type(e).__name__}: {e}")

            async def proxmox_to_client():
                try:
                    async for message in proxmox_ws:
                        if isinstance(message, bytes):
                            await websocket.send_bytes(message)
                        else:
                            await websocket.send_text(message)
                except Exception as e:
                    print(f"[VNC] proxmox_to_client error for vmid {vmid}: {type(e).__name__}: {e}")

            await asyncio.gather(
                client_to_proxmox(),
                proxmox_to_client(),
                return_exceptions=True,
            )

    except Exception as e:
        print(f"VNC proxy error for vmid {vmid}: {type(e).__name__}: {e}")
        await websocket.close(code=1011, reason=f"Proxmox connection failed: {str(e)}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
