# VM Portal - Hệ thống quản lý VM nội bộ

Portal nội bộ tiếng Việt cho phép nhân viên tự khởi tạo máy ảo trên Proxmox VE.

## Kiến trúc hệ thống

```
[React Frontend] → [Nginx:80] → [FastAPI Backend:8000] → [Proxmox VE API]
                                        ↓                       ↓
                                  [PostgreSQL:5432]        [VM + Cloud-init]
                                        ↓
                                 [Telegram Bot API]
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

## Cấu trúc thư mục

```
vm-portal/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/             # API endpoints (auth, vm, health)
│   │   ├── core/            # Security (JWT, bcrypt)
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   │   ├── proxmox_client.py
│   │   │   ├── cloud_init_generator.py
│   │   │   ├── telegram_notifier.py
│   │   │   └── vm_provisioning_service.py
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
│   │   ├── services/        # API client + auth
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

## Hướng dẫn cài đặt

### Yêu cầu

- Docker & Docker Compose
- Proxmox VE với API Token
- Telegram Bot Token
- (Tùy chọn) Cloudflare Tunnel

### Bước 1: Clone và cấu hình

```bash
cd /home/vpscloud
cp .env.example .env
```

Chỉnh sửa `.env` với thông tin thực tế:

```env
# Database
DB_USER=vmadmin
DB_PASSWORD=<mật_khẩu_mạnh>
DB_NAME=vmportal
DATABASE_URL=postgresql+asyncpg://vmadmin:<mật_khẩu>@db:5432/vmportal

# JWT Secret
SECRET_KEY=<chuỗi_ngẫu_nhiên_32_ký_tự>

# Proxmox VE
PROXMOX_HOST=<IP_Proxmox>
PROXMOX_TOKEN_NAME=automation
PROXMOX_TOKEN_VALUE=<API_token_Proxmox>
PROXMOX_NODE=pve
PROXMOX_VM_STORAGE=local-lvm

# Telegram
TELEGRAM_BOT_TOKEN=<bot_token>
TELEGRAM_DEFAULT_CHAT_ID=<chat_id>

# Cloudflare
CF_TUNNEL_DOMAIN=ssh.yourdomain.com
```

### Bước 2: Tạo Proxmox API Token

1. Đăng nhập Proxmox Web UI
2. Datacenter → Permissions → API Tokens → Add
3. User: `root@pam`, Token ID: `automation`
4. Bỏ tick "Privilege Separation"
5. Lưu Token Value vào `.env`

### Bước 3: Tạo Telegram Bot

1. Chat với @BotFather trên Telegram
2. Gửi `/newbot`, đặt tên bot
3. Lưu Bot Token vào `.env`
4. Lấy Chat ID: gửi tin nhắn cho bot, truy cập `https://api.telegram.org/bot<TOKEN>/getUpdates`

### Bước 4: Khởi chạy

```bash
docker-compose up -d
```

Truy cập: http://localhost (port 80)

### Bước 5: Tạo tài khoản đầu tiên

```bash
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## Sử dụng

1. **Đăng nhập** tại http://localhost
2. **Tạo VM**: Dashboard → "Tạo máy ảo mới"
   - Nhập tên, chọn CPU/RAM/Disk/OS
   - Bấm "Khởi tạo máy"
3. **Theo dõi**: VM list tự cập nhật trạng thái
4. **Nhận thông tin**: Telegram gửi IP + SSH credentials khi VM sẵn sàng

## Trạng thái VM

| Trạng thái | Mô tả |
|-----------|-------|
| Đang tạo | VM đang được tạo trên Proxmox |
| Đang cài đặt | OS đang cài đặt via cloud-init |
| Hoàn tất | VM sẵn sàng, có thể SSH |
| Đã dừng | VM đã tắt |
| Lỗi | Có lỗi trong quá trình tạo |

## API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | /api/auth/register | Đăng ký tài khoản |
| POST | /api/auth/login | Đăng nhập, nhận JWT |
| POST | /api/vms/ | Tạo VM mới |
| GET | /api/vms/ | Danh sách VM |
| GET | /api/vms/{id} | Chi tiết VM |
| GET | /api/health | Health check |

## Cloudflare Tunnel (SSH từ ngoài)

1. Cài cloudflared trên Proxmox host:
```bash
curl -L https://pkg.cloudflare.com/cloudflare-release.key | gpg --dearmor > /usr/share/keyrings/cloudflare-release.gpg
apt update && apt install cloudflared
```

2. Tạo tunnel:
```bash
cloudflared tunnel create vm-portal
cloudflared tunnel route dns vm-portal "*.ssh.yourdomain.com"
```

3. Cấu hình `/etc/cloudflared/config.yml` - portal tự thêm ingress rules cho mỗi VM mới.

## Phát triển

```bash
# Backend dev
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend dev
cd frontend
npm install
npm run dev
```

## Disk Layout (Dell R720)

| Disk | Size | Mục đích |
|------|------|---------|
| sda | 240GB | Proxmox OS |
| sdb | 240GB | KHÔNG SỬ DỤNG (health 17%) |
| sdc-sdd | 240GB x2 | VM storage |
| sde | 120GB | VM storage |
| sdf-sdg | 500GB x2 | VM storage |
| sdh | 500GB | Backup |
