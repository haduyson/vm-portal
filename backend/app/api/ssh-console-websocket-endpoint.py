import asyncio
import json
import paramiko
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, WebSocketException, status
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError
from app.database import get_session
from app.models.virtual_machine_model import VirtualMachine
from app.models.user_model import User
from app.config import settings
from sqlalchemy import select

router = APIRouter(tags=["ssh-websocket"])


async def verify_websocket_token(token: str, session: AsyncSession) -> User:
    """Verify JWT token from WebSocket query params and return user."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if username is None or token_type == "partial_2fa":
            return None
    except JWTError:
        return None

    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


@router.websocket("/ws/vm/{vm_id}/console")
async def ssh_console_websocket(
    websocket: WebSocket,
    vm_id: int,
    token: str = Query(..., description="JWT access token"),
    session: AsyncSession = Depends(get_session),
):
    """
    WebSocket endpoint for SSH console.
    Requires JWT token in query params: ?token=xxx

    Protocol:
    - Client sends: {"type": "auth", "username": "root", "password": "xxx"}
    - Server replies: {"type": "auth_result", "success": true/false, "message": "..."}
    - Client sends: {"type": "input", "data": "command"}
    - Server sends: {"type": "output", "data": "response"}
    - Client sends: {"type": "resize", "cols": 80, "rows": 24}
    """
    # Verify JWT token BEFORE accepting WebSocket
    current_user = await verify_websocket_token(token, session)
    if not current_user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    ssh_client = None
    ssh_channel = None

    try:
        # Lấy thông tin VM từ database
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.id == vm_id)
        )
        vm = result.scalar_one_or_none()

        if not vm:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "VM không tồn tại"
            }))
            await websocket.close()
            return

        # SECURITY: Verify VM ownership (user must own VM or be admin)
        if vm.user_id != current_user.id and not current_user.is_admin:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Bạn không có quyền truy cập VM này"
            }))
            await websocket.close()
            return

        # Kiểm tra VM phải đang chạy
        if vm.status != "running":
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "VM phải đang chạy để kết nối SSH"
            }))
            await websocket.close()
            return

        # Kiểm tra VM có IP address
        if not vm.ip_address:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "VM chưa có địa chỉ IP"
            }))
            await websocket.close()
            return

        # Chờ nhận credentials từ client
        try:
            auth_msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            auth_data = json.loads(auth_msg)

            if auth_data.get("type") != "auth":
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Yêu cầu xác thực trước"
                }))
                await websocket.close()
                return

            username = auth_data.get("username", "root")
            password = auth_data.get("password", "")

            if not password:
                await websocket.send_text(json.dumps({
                    "type": "auth_result",
                    "success": False,
                    "message": "Mật khẩu không được để trống"
                }))
                await websocket.close()
                return

        except asyncio.TimeoutError:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Timeout chờ xác thực"
            }))
            await websocket.close()
            return
        except Exception as e:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Lỗi khi nhận xác thực: {str(e)}"
            }))
            await websocket.close()
            return

        # Tạo SSH connection
        # Note: AutoAddPolicy accepts any host key - acceptable for internal trusted networks
        # For production with untrusted networks, implement known_hosts verification
        ssh_client = paramiko.SSHClient()
        ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            # Kết nối SSH với timeout
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: ssh_client.connect(
                    hostname=vm.ip_address,
                    port=22,
                    username=username,
                    password=password,
                    timeout=10,
                    look_for_keys=False,
                    allow_agent=False,
                )
            )

            # Tạo interactive shell với PTY
            ssh_channel = ssh_client.invoke_shell(term="xterm-256color", width=80, height=24)
            ssh_channel.setblocking(False)

            # Gửi auth success
            await websocket.send_text(json.dumps({
                "type": "auth_result",
                "success": True,
                "message": "Kết nối SSH thành công"
            }))

        except paramiko.AuthenticationException:
            await websocket.send_text(json.dumps({
                "type": "auth_result",
                "success": False,
                "message": "Sai tên đăng nhập hoặc mật khẩu"
            }))
            await websocket.close()
            return
        except paramiko.SSHException as e:
            await websocket.send_text(json.dumps({
                "type": "auth_result",
                "success": False,
                "message": f"Lỗi SSH: {str(e)}"
            }))
            await websocket.close()
            return
        except Exception as e:
            await websocket.send_text(json.dumps({
                "type": "auth_result",
                "success": False,
                "message": f"Không thể kết nối: {str(e)}"
            }))
            await websocket.close()
            return

        # Hàm đọc output từ SSH channel và gửi đến client
        async def ssh_to_client():
            try:
                while True:
                    if ssh_channel.recv_ready():
                        data = await asyncio.get_event_loop().run_in_executor(
                            None,
                            ssh_channel.recv,
                            4096
                        )
                        if data:
                            await websocket.send_text(json.dumps({
                                "type": "output",
                                "data": data.decode("utf-8", errors="replace")
                            }))
                    else:
                        await asyncio.sleep(0.01)

                    # Kiểm tra channel còn mở không
                    if ssh_channel.exit_status_ready():
                        break
            except Exception as e:
                print(f"Error in ssh_to_client: {e}")

        # Hàm nhận input từ client và gửi đến SSH channel
        async def client_to_ssh():
            try:
                while True:
                    msg = await websocket.receive_text()
                    data = json.loads(msg)

                    if data.get("type") == "input":
                        input_data = data.get("data", "")
                        await asyncio.get_event_loop().run_in_executor(
                            None,
                            ssh_channel.send,
                            input_data.encode("utf-8")
                        )

                    elif data.get("type") == "resize":
                        cols = data.get("cols", 80)
                        rows = data.get("rows", 24)
                        ssh_channel.resize_pty(width=cols, height=rows)

            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"Error in client_to_ssh: {e}")

        # Chạy cả 2 hướng bidirectional proxy
        await asyncio.gather(
            ssh_to_client(),
            client_to_ssh(),
            return_exceptions=True
        )

    except Exception as e:
        print(f"SSH WebSocket error: {e}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Lỗi: {str(e)}"
            }))
        except Exception:
            pass

    finally:
        # Cleanup
        if ssh_channel:
            try:
                ssh_channel.close()
            except Exception:
                pass

        if ssh_client:
            try:
                ssh_client.close()
            except Exception:
                pass

        try:
            await websocket.close()
        except Exception:
            pass
