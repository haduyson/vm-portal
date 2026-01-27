# System Architecture - VM Portal

## Overview
Internal Vietnamese portal for automated VM provisioning on Proxmox VE.

## Components

### Backend (FastAPI)
- **Auth**: JWT tokens via python-jose, bcrypt password hashing with validation (min 8 chars, uppercase, lowercase, digit)
- **API**: RESTful endpoints for auth, VM CRUD, VM power controls, admin panel, user profile, health check
- **Services**:
  - `proxmox_client.py` - Wraps proxmoxer lib, async via `to_thread()`
  - `cloud_init_generator.py` - Generates user-data YAML per VM
  - `telegram_notifier.py` - Sends notifications via Bot API
  - `vm_provisioning_service.py` - Orchestrates creation flow
- **Database**: Async SQLAlchemy + asyncpg driver
- **Background Tasks**: `asyncio.create_task()` for VM polling

### Frontend (React + TypeScript)
- **Build**: Vite, MUI v5 components
- **Auth**: JWT in localStorage, axios interceptor
- **Pages**: Login, Dashboard, VM Create, VM List, User Profile, Admin User Management, Admin VM Overview
- **VM Controls**: Start, Stop, Restart actions with real-time status updates
- **Admin Panel**: System-wide statistics, user management, VM actions (start/stop/delete)
- **Auto-refresh**: 10s interval for pending VMs

### Infrastructure
- **Docker Compose**: 4 services (db, api, frontend, nginx)
- **Nginx**: Reverse proxy, /api/ → backend, / → frontend
- **PostgreSQL 16**: Users + VMs tables with indexes

## Data Flow

```
1. User submits VM form → POST /api/vms/
2. Backend creates DB record (status=creating)
3. Backend spawns background task:
   a. Generate cloud-init user-data
   b. Call Proxmox API → create VM
   c. Attach ISO + cloud-init
   d. Start VM (status=installing)
4. Background poller (30s interval):
   a. Query Proxmox for VM IP
   b. When IP found → status=running
   c. Send Telegram notification
5. Frontend auto-refreshes VM list
```

## Database Schema

### users
- id, username, hashed_password, telegram_chat_id, is_admin, created_at

### virtual_machines
- id, user_id (FK), vmid, name, cores, memory_mb, disk_gb
- os_type, status, ip_address, ssh_domain
- ssh_username, ssh_password, proxmox_node, storage
- created_at, updated_at

## API Endpoints

### User Endpoints
- `POST /api/auth/register` - User registration with password validation
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PATCH /api/auth/profile` - Update password and telegram_chat_id
- `GET /api/vms/` - List user's VMs
- `POST /api/vms/` - Create new VM
- `GET /api/vms/{vm_id}` - Get VM details
- `POST /api/vms/{vm_id}/start` - Start VM (owner or admin)
- `POST /api/vms/{vm_id}/stop` - Stop VM (owner or admin)
- `POST /api/vms/{vm_id}/restart` - Restart VM (owner or admin)

### Admin Endpoints
- `GET /api/admin/users` - List all users with VM counts
- `PATCH /api/admin/users/{user_id}` - Update user admin status
- `DELETE /api/admin/users/{user_id}` - Delete user and their VMs
- `GET /api/admin/vms` - List all VMs system-wide
- `GET /api/admin/stats` - System statistics (users, VMs, running VMs, creating VMs)
- `POST /api/admin/vms/{vm_id}/start` - Admin start any VM
- `POST /api/admin/vms/{vm_id}/stop` - Admin stop any VM
- `DELETE /api/admin/vms/{vm_id}` - Admin delete any VM from Proxmox + DB

## Security
- JWT tokens (HS256, 8h expiry)
- Bcrypt password hashing with strict validation:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 digit
- API token auth for Proxmox (no password in code)
- All secrets in .env (not committed)
- CORS configured for internal use
- Admin-only endpoints protected with `get_current_admin_user` dependency
