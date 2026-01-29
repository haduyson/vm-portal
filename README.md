# VM Portal - Hệ thống quản lý VM nội bộ

Portal nội bộ tiếng Việt cho phép nhân viên tự khởi tạo máy ảo trên Proxmox VE.

## Tính năng chính

- Tạo/Quản lý VM qua giao diện web tiếng Việt
- VNC Console (mạng LAN) và SSH Console (web-based)
- Hướng dẫn SSH từ Terminal/Termius với Cloudflare Tunnel
- Thông báo qua Telegram khi VM sẵn sàng
- Quản lý tài nguyên: CPU, RAM, Disk với quota
- Quản lý user, audit logs cho Admin
- Hỗ trợ nhiều Proxmox server và Cloudflare domains
- Responsive design (mobile-friendly)

## Kiến trúc hệ thống

```
[React Frontend] → [Nginx:80] → [FastAPI Backend:8000] → [Proxmox VE API]
                        ↓                ↓                      ↓
                   [WebSocket]    [PostgreSQL:5432]       [VM + Cloud-init]
                   (VNC/SSH)             ↓
                                  [Telegram Bot API]
                                         ↓
                              [Cloudflare Tunnel] → [SSH từ bên ngoài]
```

## Stack công nghệ

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI (Python 3.12) |
| Frontend | React + TypeScript + Vite + MUI |
| Database | PostgreSQL 16 |
| Proxy | Nginx |
| Container | Docker Compose |
| Hypervisor | Proxmox VE |
| Notification | Telegram Bot API |
| SSH Access | Cloudflare Tunnel |

---

## Hướng dẫn cài đặt

### Yêu cầu hệ thống

- Docker & Docker Compose v2+
- Proxmox VE 7+ với API Token
- Telegram Bot Token
- Domain với Cloudflare (cho SSH từ bên ngoài)
- Server có ít nhất 2GB RAM, 20GB disk

### Bước 1: Clone repository

```bash
git clone https://github.com/haduyson/vm-portal.git
cd vm-portal
```

### Bước 2: Tạo file cấu hình

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
# Database
DB_USER=vmadmin
DB_PASSWORD=<mật_khẩu_mạnh>
DB_NAME=vmportal
DATABASE_URL=postgresql+asyncpg://vmadmin:<mật_khẩu>@db:5432/vmportal

# JWT Secret (tạo bằng: openssl rand -hex 32)
SECRET_KEY=<chuỗi_ngẫu_nhiên_64_ký_tự>

# Proxmox VE
PROXMOX_HOST=<IP_Proxmox>
PROXMOX_TOKEN_NAME=automation
PROXMOX_TOKEN_VALUE=<API_token_Proxmox>
PROXMOX_NODE=pve
PROXMOX_VM_STORAGE=local-lvm

# Telegram
TELEGRAM_BOT_TOKEN=<bot_token>
TELEGRAM_DEFAULT_CHAT_ID=<chat_id>
```

### Bước 3: Tạo Proxmox API Token

1. Đăng nhập Proxmox Web UI
2. **Datacenter → Permissions → API Tokens → Add**
3. Chọn User: `root@pam`, Token ID: `automation`
4. **Bỏ tick "Privilege Separation"**
5. Lưu Token Value vào `.env`

### Bước 4: Tạo Telegram Bot

1. Chat với **@BotFather** trên Telegram
2. Gửi `/newbot`, đặt tên bot
3. Lưu Bot Token vào `.env`
4. Lấy Chat ID:
   - Gửi tin nhắn cho bot
   - Truy cập: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Tìm `"chat":{"id": <CHAT_ID>}`

### Bước 5: Chuẩn bị VM Template trên Proxmox

Tạo VM template với cloud-init để clone:

```bash
# Download cloud image (ví dụ Ubuntu 22.04)
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# Tạo VM
qm create 9000 --name ubuntu-cloud --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0

# Import disk
qm importdisk 9000 jammy-server-cloudimg-amd64.img local-lvm

# Cấu hình VM
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0
qm set 9000 --ide2 local-lvm:cloudinit
qm set 9000 --boot c --bootdisk scsi0
qm set 9000 --serial0 socket --vga serial0
qm set 9000 --agent enabled=1

# Chuyển thành template
qm template 9000
```

### Bước 6: Khởi chạy

```bash
docker-compose up -d
```

Kiểm tra logs:
```bash
docker-compose logs -f
```

### Bước 7: Tạo tài khoản Admin

```bash
# Đăng ký user đầu tiên
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourSecurePassword123"}'

# Cấp quyền Admin (vào PostgreSQL)
docker-compose exec db psql -U vmadmin -d vmportal -c \
  "UPDATE users SET is_admin = true WHERE username = 'admin';"
```

Truy cập: **http://localhost** hoặc **http://<server-ip>**

---

## Cấu hình Cloudflare Tunnel (SSH từ bên ngoài)

### Trên Server

1. **Cài đặt cloudflared:**

```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

2. **Đăng nhập Cloudflare:**

```bash
cloudflared tunnel login
```

3. **Tạo Tunnel:**

```bash
cloudflared tunnel create vpscloud
```

4. **Tạo file config `/etc/cloudflared/config.yml`:**

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - service: http_status:404
```

5. **Cài đặt service:**

```bash
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
```

6. **Cấu hình trong Portal:**
   - Admin → Cloudflare Domains → Thêm domain
   - Điền: Domain, API Token, Zone ID, Tunnel ID

Portal sẽ tự động:
- Tạo DNS CNAME cho mỗi VM
- Thêm ingress rule vào cloudflared config
- Restart cloudflared service

---

## Sử dụng

### Tạo VM

1. Đăng nhập Portal
2. **Dashboard → "Tạo máy ảo mới"** hoặc **Danh sách VM → "Tạo máy ảo"**
3. Nhập tên, chọn CPU/RAM/Disk/OS Template
4. Bấm **"Khởi tạo máy"**
5. Chờ VM provisioning (1-3 phút)
6. Nhận thông tin SSH qua Telegram

### Kết nối SSH

**Cách 1: Web SSH Console (khuyến nghị)**
- Tab Console → SSH Console

**Cách 2: Terminal với cloudflared**
```bash
ssh -o ProxyCommand="cloudflared access ssh --hostname %h" root@vm-xxx.yourdomain.com
```

**Cách 3: Termius/PuTTY**
```bash
# Chạy proxy trước
cloudflared access tcp --hostname vm-xxx.yourdomain.com --url localhost:2222

# Trong Termius: Host=localhost, Port=2222
```

### VNC Console (mạng LAN)
- Tab Console → Mở VNC Console
- Chỉ hoạt động trong mạng nội bộ

---

## Cấu trúc thư mục

```
vm-portal/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/             # API endpoints
│   │   ├── core/            # Security (JWT, bcrypt)
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── alembic/             # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                # React frontend
│   ├── src/
│   │   ├── components/      # Shared components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API client
│   │   ├── hooks/           # Custom hooks
│   │   └── app.tsx
│   ├── package.json
│   └── Dockerfile
├── nginx/                   # Reverse proxy config
├── database/                # DB init scripts
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | /api/auth/register | Đăng ký tài khoản |
| POST | /api/auth/login | Đăng nhập, nhận JWT |
| GET | /api/auth/me | Thông tin user hiện tại |
| POST | /api/vms/ | Tạo VM mới |
| GET | /api/vms/ | Danh sách VM của user |
| GET | /api/vms/{id} | Chi tiết VM |
| POST | /api/vms/{id}/start | Khởi động VM |
| POST | /api/vms/{id}/stop | Dừng VM |
| DELETE | /api/vms/{id} | Xóa VM |
| GET | /api/health | Health check |

---

## Phát triển local

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

---

## Troubleshooting

**VM stuck ở "Đang cài đặt":**
- Kiểm tra QEMU Guest Agent trong VM template
- Xem logs: `docker-compose logs backend`

**VNC Console không kết nối:**
- Chỉ hoạt động trong mạng LAN
- Dùng SSH Console thay thế

**Cloudflare Tunnel không hoạt động:**
- Kiểm tra: `systemctl status cloudflared`
- Xem config: `cat /etc/cloudflared/config.yml`

---

---

# VM Portal - Internal VM Management System (English)

Internal Vietnamese-language portal allowing employees to self-provision virtual machines on Proxmox VE.

## Key Features

- Create/Manage VMs via Vietnamese web interface
- VNC Console (LAN) and SSH Console (web-based)
- SSH guide for Terminal/Termius via Cloudflare Tunnel
- Telegram notifications when VM is ready
- Resource management: CPU, RAM, Disk with quotas
- User management, audit logs for Admin
- Multi Proxmox server and Cloudflare domain support
- Responsive design (mobile-friendly)

## Quick Start

### Prerequisites

- Docker & Docker Compose v2+
- Proxmox VE 7+ with API Token
- Telegram Bot Token
- Domain with Cloudflare (for external SSH)

### Installation

```bash
# Clone
git clone https://github.com/haduyson/vm-portal.git
cd vm-portal

# Configure
cp .env.example .env
# Edit .env with your settings

# Run
docker-compose up -d

# Create admin user
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourSecurePassword123"}'

# Grant admin privileges
docker-compose exec db psql -U vmadmin -d vmportal -c \
  "UPDATE users SET is_admin = true WHERE username = 'admin';"
```

Access: **http://localhost**

### Environment Variables

| Variable | Description |
|----------|-------------|
| DB_USER | PostgreSQL username |
| DB_PASSWORD | PostgreSQL password |
| DATABASE_URL | Full database connection string |
| SECRET_KEY | JWT signing key (64 chars) |
| PROXMOX_HOST | Proxmox server IP |
| PROXMOX_TOKEN_NAME | API token name |
| PROXMOX_TOKEN_VALUE | API token value |
| PROXMOX_NODE | Proxmox node name |
| PROXMOX_VM_STORAGE | Storage for VMs |
| TELEGRAM_BOT_TOKEN | Telegram bot token |
| TELEGRAM_DEFAULT_CHAT_ID | Default notification chat |

### SSH Access (External)

**Option 1: Web SSH Console**
- Built into Portal, works anywhere

**Option 2: Terminal with cloudflared**
```bash
# Install cloudflared first
ssh -o ProxyCommand="cloudflared access ssh --hostname %h" root@vm-xxx.domain.com
```

**Option 3: Termius/PuTTY**
```bash
# Run proxy
cloudflared access tcp --hostname vm-xxx.domain.com --url localhost:2222

# In Termius: Host=localhost, Port=2222
```

## License

MIT License

## Author

Ha Duy Son - 2026
