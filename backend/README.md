# VM Portal Backend - FastAPI

Complete FastAPI backend for Vietnamese VM provisioning portal with Proxmox VE integration.

## Features

- **User Authentication**: JWT-based authentication with bcrypt password hashing
- **VM Management**: Create, list, and retrieve VMs via RESTful API
- **Proxmox Integration**: Automated VM provisioning on Proxmox VE
- **Cloud-Init**: Automatic SSH credential generation and configuration
- **Telegram Notifications**: Real-time notifications when VMs are ready
- **Async Architecture**: Built with SQLAlchemy async + asyncpg for PostgreSQL

## Project Structure

```
backend/
├── app/
│   ├── main.py                          # FastAPI app, CORS, lifespan
│   ├── config.py                        # Pydantic settings from .env
│   ├── database.py                      # Async SQLAlchemy setup
│   ├── models/
│   │   ├── user_model.py                # User SQLAlchemy model
│   │   └── virtual_machine_model.py     # VirtualMachine model
│   ├── schemas/
│   │   ├── user_schemas.py              # Pydantic schemas for auth
│   │   └── vm_schemas.py                # Pydantic schemas for VMs
│   ├── api/
│   │   ├── auth_endpoints.py            # /api/auth/login, /register
│   │   ├── vm_endpoints.py              # /api/vms endpoints
│   │   └── health_endpoints.py          # /api/health
│   ├── core/
│   │   └── security.py                  # JWT, password hashing, auth
│   └── services/
│       ├── proxmox_client.py            # Proxmox API client
│       ├── cloud_init_generator.py      # Cloud-init YAML generator
│       ├── telegram_notifier.py         # Telegram Bot API client
│       └── vm_provisioning_service.py   # Orchestration service
├── alembic/                             # Database migrations
├── requirements.txt
├── alembic.ini
└── .env.example
```

## Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run Database Migrations

```bash
alembic upgrade head
```

### 4. Start Server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Virtual Machines

- `POST /api/vms` - Create new VM (requires auth)
- `GET /api/vms` - List user's VMs (requires auth)
- `GET /api/vms/{id}` - Get VM details (requires auth)

### Health

- `GET /api/health` - Health check endpoint

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Architecture

### Database Models

**User**
- id, username, hashed_password
- telegram_chat_id (optional)
- is_admin, created_at

**VirtualMachine**
- id, user_id (FK), vmid (Proxmox VMID)
- name, cores, memory_mb, disk_gb, os_type
- status (creating → installing → running)
- ip_address, ssh_domain, ssh_username, ssh_password
- proxmox_node, storage
- created_at, updated_at

### VM Provisioning Flow

1. User creates VM via POST /api/vms
2. Backend gets next VMID from Proxmox
3. Creates DB record with status="creating"
4. Background task:
   - Generates random SSH credentials
   - Generates cloud-init YAML
   - Creates VM in Proxmox with ISO
   - Configures cloud-init
   - Starts VM
   - Updates status to "installing"
5. Polling task:
   - Checks VM status every 30s
   - When IP address available → status="running"
   - Generates SSH domain: {vm-name}.{CF_TUNNEL_DOMAIN}
   - Sends Telegram notification with credentials

### Security

- Passwords hashed with bcrypt
- JWT tokens with configurable expiration
- HTTPBearer authentication for protected endpoints
- User can only access their own VMs (unless admin)

## Vietnamese Language

All user-facing error messages and notifications are in Vietnamese:
- "Tên đăng nhập đã tồn tại"
- "Không thể xác thực thông tin đăng nhập"
- "VM Đã Sẵn Sàng!"

## Notes

- Proxmoxer is synchronous - wrapped with `asyncio.to_thread()`
- Cloud-init file saving needs implementation (SSH to Proxmox or volume mount)
- Background tasks use `asyncio.create_task()` for non-blocking execution
- All files use snake_case naming (Python standard)
- Code kept under 200 lines per file for maintainability

## TODO

- Implement actual cloud-init file writing to `/var/lib/vz/snippets/`
- Add VM stop/delete endpoints
- Add admin endpoints for user management
- Add VM resource usage monitoring
- Add rate limiting for API endpoints
