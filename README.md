# VM Portal - Hệ thống quản lý VM nội bộ

Portal nội bộ tiếng Việt cho phép nhân viên tự khởi tạo máy ảo trên Proxmox VE.

## Tính năng chính

### Quản lý VM
- Tạo/Quản lý VM qua giao diện web tiếng Việt
- VNC Console (mạng LAN) và SSH Console (web-based)
- Hỗ trợ nhiều Proxmox server
- Cấu hình Network Bridge và VLAN cho mỗi server
- Quản lý tài nguyên: CPU, RAM, Disk với quota
- Chuyển đổi VM giữa các user (Admin)

### Bảo mật
- Xác thực hai yếu tố (2FA/TOTP)
- JWT với Refresh Token
- Feature Flags 3 cấp độ (Global → User → VM)
- Audit logs cho mọi hoạt động

### Mạng & IP
- IP Pool cá nhân - giữ lại IP khi xóa VM
- Tự động gán IP public cho VM mới
- Cloudflare Tunnel cho SSH từ bên ngoài
- Cấu hình VLAN trunking
- **Tailscale VPN** - Auto-install qua QEMU Guest Agent, Batch install cho nhiều VM

### Thông báo
- Telegram Bot notifications
- Email notifications (SMTP, SendGrid, Resend)
- Tùy chỉnh nội dung thông báo theo template
- Xem trước và reset template về mặc định

### Quản trị
- Quản lý người dùng với Feature Flags
- Quản lý nhiều Proxmox server
- Cloudflare Domains management
- VM Landing Page tùy chỉnh
- Dark/Light theme
- **Tailscale Admin Config** - Cấu hình auth key, auto-install, batch operations
- **VM List Expandable Rows** - Hiển thị Web Domain, OS, Tailscale IP

## Kiến trúc hệ thống

```
[React Frontend] → [Nginx:443/80] → [FastAPI Backend:8000] → [Proxmox VE API]
       ↓                 ↓                   ↓                      ↓
  [Dark/Light]      [SSL/TLS]         [PostgreSQL:5432]       [VM + Cloud-init]
    Theme          [WebSocket]              ↓
                   (VNC/SSH)         [Telegram Bot API]
                                     [Email Provider]
                                            ↓
                                  [Cloudflare Tunnel] → [SSH từ bên ngoài]
```

## Stack công nghệ

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI (Python 3.12), SQLAlchemy Async |
| Frontend | React 18 + TypeScript + Vite + MUI v5 |
| Database | PostgreSQL 16 |
| Proxy | Nginx (SSL/TLS support) |
| Container | Docker Compose |
| Hypervisor | Proxmox VE 7+ |
| Notification | Telegram Bot + Email (SMTP/SendGrid/Resend) |
| SSH Access | Cloudflare Tunnel |
| VPN | Tailscale (auto-install via QEMU Agent) |
| Auth | JWT + 2FA (TOTP) |

---

## Hướng dẫn cài đặt

### Yêu cầu hệ thống

- Docker & Docker Compose v2+
- Proxmox VE 7+ với API Token
- Telegram Bot Token (tùy chọn)
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

# Default Admin (tạo tự động khi khởi động)
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=<mật_khẩu_admin>

# Proxmox VE (có thể cấu hình thêm qua Admin UI)
PROXMOX_HOST=<IP_Proxmox>
PROXMOX_TOKEN_NAME=automation
PROXMOX_TOKEN_VALUE=<API_token_Proxmox>
PROXMOX_NODE=pve
PROXMOX_VM_STORAGE=local-lvm

# Telegram (tùy chọn - có thể cấu hình qua Admin UI)
TELEGRAM_BOT_TOKEN=<bot_token>
TELEGRAM_DEFAULT_CHAT_ID=<chat_id>
```

### Bước 3: Tạo Proxmox API Token

1. Đăng nhập Proxmox Web UI
2. **Datacenter → Permissions → API Tokens → Add**
3. Chọn User: `root@pam`, Token ID: `automation`
4. **Bỏ tick "Privilege Separation"**
5. Lưu Token Value vào `.env`

### Bước 4: Chuẩn bị VM Template trên Proxmox

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

### Bước 5: Khởi chạy

```bash
docker-compose up -d
```

Kiểm tra logs:
```bash
docker-compose logs -f
```

**Lưu ý:** Admin user sẽ được tạo tự động khi khởi động với thông tin từ `.env`.

Truy cập: **http://localhost** hoặc **https://localhost** (nếu có SSL)

---

## Cấu hình SSL/HTTPS (Tùy chọn)

### Sử dụng Let's Encrypt

1. Cài đặt certbot và tạo certificate
2. Mount certificates vào nginx container
3. Uncomment SSL config trong `nginx/nginx.conf`

---

## Menu chức năng

### Menu User
| Menu | Mô tả |
|------|-------|
| Tổng quan | Dashboard thống kê VM |
| Tạo máy ảo | Form tạo VM mới |
| Danh sách VM | Quản lý VM của user |
| IP Pool của tôi | Quản lý IP public đã sở hữu |
| Cài đặt tài khoản | Đổi mật khẩu, 2FA, Telegram |

### Menu Admin
| Menu | Mô tả |
|------|-------|
| Quản lý người dùng | CRUD users, Feature Flags per user |
| Tất cả VM | Xem/quản lý tất cả VM trong hệ thống |
| Nhật ký hoạt động | Audit logs |
| Server Proxmox | Quản lý nhiều Proxmox server |
| Cloudflare Domains | Cấu hình domains cho SSH tunnel |
| Landing Page VM | Tùy chỉnh trang landing cho VM |
| Cấu hình Thông Báo | Telegram/Email settings & templates |
| Cài đặt hệ thống | Feature toggles, OS templates, Global flags |

---

## Tính năng chi tiết

### Two-Factor Authentication (2FA)

1. Vào **Cài đặt tài khoản → Thiết lập 2FA**
2. Quét QR code bằng app Authenticator (Google, Authy, etc.)
3. Nhập mã xác nhận để kích hoạt
4. Mỗi lần đăng nhập sẽ yêu cầu mã TOTP

### IP Pool Management

- Khi tạo VM, IP sẽ thuộc sở hữu của user
- Khi xóa VM, có tùy chọn **"Giữ lại IP"**
- IP đã giữ có thể gán cho VM mới
- Xem tất cả IP của mình tại **IP Pool của tôi**

### Feature Flags (3 cấp độ)

| Cấp độ | Mô tả |
|--------|-------|
| Global | Áp dụng cho toàn hệ thống |
| User | Override cho từng user |
| VM | Override cho từng VM |

**Các flags:**
- `cloudflare_tunnel_enabled` - Cho phép tạo SSH subdomain
- `public_ip_enabled` - Cho phép dùng IP public
- `email_notifications_enabled` - Gửi thông báo email
- `telegram_notifications_enabled` - Gửi thông báo Telegram

### Notification Templates

Tùy chỉnh nội dung thông báo với các biến:
- `{{vm_name}}` - Tên VM
- `{{ip_address}}` - Địa chỉ IP
- `{{username}}` - Username SSH
- `{{password}}` - Password SSH
- `{{ssh_command}}` - Lệnh SSH
- `{{portal_url}}` - URL portal

Hỗ trợ events: `vm_ready`, `vm_error`, `password_reset`

---

## Cấu hình Cloudflare Tunnel

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

4. **Cấu hình trong Portal:**
   - Admin → Cloudflare Domains → Thêm domain
   - Điền: Domain, API Token, Zone ID, Tunnel ID

Portal sẽ tự động tạo DNS CNAME và cấu hình tunnel cho mỗi VM.

---

## Cấu hình Tailscale VPN

### Tính năng
- **Auto-install**: Tự động cài Tailscale khi tạo VM mới (nếu bật)
- **Batch install**: Cài Tailscale hàng loạt cho các VM hiện có
- **QEMU Guest Agent**: Thực thi lệnh trong VM qua Proxmox API

### Cấu hình

1. **Lấy Auth Key từ Tailscale:**
   - Truy cập [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)
   - Tạo **Auth Key** mới (chọn Reusable nếu muốn dùng cho nhiều VM)

2. **Cấu hình trong Portal:**
   - Admin → **Cài đặt hệ thống** → Mục Tailscale
   - Bật **"Tự động cài đặt Tailscale"**
   - Dán Auth Key vào ô **"Tailscale Auth Key"**
   - Bấm **Lưu**

3. **Batch Install cho VM hiện có:**
   - Admin → **Quản lý VM** → Bấm **"Batch Tailscale"**
   - Hệ thống sẽ cài Tailscale cho tất cả VM đang chạy có QEMU Agent

### Yêu cầu
- VM phải có **QEMU Guest Agent** cài sẵn và đang chạy
- VM phải có kết nối internet để download Tailscale

### Sử dụng Tailscale SSH
```bash
# Từ bất kỳ thiết bị nào trong Tailscale network
ssh root@100.x.x.x
```

---

## Sử dụng

### Tạo VM

1. Đăng nhập Portal
2. **Tạo máy ảo** hoặc **Dashboard → "Tạo máy ảo mới"**
3. Chọn:
   - Tên VM
   - Server Proxmox
   - CPU/RAM/Disk
   - OS Template
   - Network Bridge (nếu có)
4. Bấm **"Khởi tạo máy"**
5. Chờ VM provisioning (1-3 phút)
6. Nhận thông tin SSH qua Telegram/Email

### Kết nối SSH

**Cách 1: Web SSH Console (khuyến nghị)**
- Vào chi tiết VM → Tab Console → SSH Console

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
│   │   ├── core/            # Security (JWT, bcrypt, 2FA)
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
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
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Endpoints

### Authentication
| Method | Path | Mô tả |
|--------|------|-------|
| POST | /api/auth/register | Đăng ký tài khoản |
| POST | /api/auth/login | Đăng nhập, nhận JWT |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/auth/me | Thông tin user hiện tại |
| POST | /api/auth/2fa/setup | Thiết lập 2FA |
| POST | /api/auth/2fa/verify | Xác thực 2FA |

### VM Management
| Method | Path | Mô tả |
|--------|------|-------|
| POST | /api/vms/ | Tạo VM mới |
| GET | /api/vms/ | Danh sách VM của user |
| GET | /api/vms/{id} | Chi tiết VM |
| POST | /api/vms/{id}/start | Khởi động VM |
| POST | /api/vms/{id}/stop | Dừng VM |
| POST | /api/vms/{id}/restart | Restart VM |
| DELETE | /api/vms/{id} | Xóa VM |

### Admin Endpoints
| Method | Path | Mô tả |
|--------|------|-------|
| GET | /api/admin/users | Danh sách users |
| GET | /api/admin/vms | Tất cả VMs |
| GET | /api/admin/audit-logs | Nhật ký hoạt động |
| GET | /api/admin/proxmox-servers | Danh sách Proxmox servers |
| GET | /api/admin/feature-flags/global | Global feature flags |

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

**2FA không hoạt động:**
- Đảm bảo thời gian server đồng bộ (NTP)
- Kiểm tra timezone của app Authenticator

---

---

# VM Portal - Internal VM Management System (English)

Internal Vietnamese-language portal allowing employees to self-provision virtual machines on Proxmox VE.

## Key Features

### VM Management
- Create/Manage VMs via Vietnamese web interface
- VNC Console (LAN) and SSH Console (web-based)
- Multi Proxmox server support
- Network Bridge and VLAN configuration
- Resource quotas: CPU, RAM, Disk
- VM transfer between users (Admin)

### Security
- Two-Factor Authentication (2FA/TOTP)
- JWT with Refresh Token
- 3-level Feature Flags (Global → User → VM)
- Audit logs for all activities

### Networking & IP
- Personal IP Pool - retain IP when deleting VM
- Auto-assign public IP for new VMs
- Cloudflare Tunnel for external SSH
- VLAN trunking support
- **Tailscale VPN** - Auto-install via QEMU Guest Agent, Batch install

### Notifications
- Telegram Bot notifications
- Email notifications (SMTP, SendGrid, Resend)
- Customizable notification templates
- Template preview and reset to default

### Administration
- User management with per-user Feature Flags
- Multi Proxmox server management
- Cloudflare Domains management
- Custom VM Landing Page
- Dark/Light theme toggle

## Quick Start

### Prerequisites

- Docker & Docker Compose v2+
- Proxmox VE 7+ with API Token
- Telegram Bot Token (optional)
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
```

**Note:** Admin user is created automatically on startup using credentials from `.env`.

Access: **http://localhost** or **https://localhost** (with SSL)

### Environment Variables

| Variable | Description |
|----------|-------------|
| DB_USER | PostgreSQL username |
| DB_PASSWORD | PostgreSQL password |
| DATABASE_URL | Full database connection string |
| SECRET_KEY | JWT signing key (64 chars) |
| DEFAULT_ADMIN_USERNAME | Auto-created admin username |
| DEFAULT_ADMIN_PASSWORD | Auto-created admin password |
| PROXMOX_HOST | Proxmox server IP |
| PROXMOX_TOKEN_NAME | API token name |
| PROXMOX_TOKEN_VALUE | API token value |
| TELEGRAM_BOT_TOKEN | Telegram bot token (optional) |

### SSH Access (External)

**Option 1: Web SSH Console**
- Built into Portal, works anywhere

**Option 2: Terminal with cloudflared**
```bash
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
