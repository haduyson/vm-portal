-- VM Portal Database Initialization
-- This runs automatically on first docker-compose up

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    telegram_chat_id VARCHAR(100),
    is_admin BOOLEAN DEFAULT FALSE,
    is_suspended BOOLEAN DEFAULT FALSE,
    max_disk_gb INTEGER,
    max_ram_gb INTEGER,
    max_vms INTEGER,
    max_cpu_cores INTEGER,
    totp_secret VARCHAR(255),
    temp_password_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS virtual_machines (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vmid INTEGER UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    cores INTEGER NOT NULL DEFAULT 2,
    memory_gb INTEGER NOT NULL DEFAULT 4,
    disk_gb INTEGER NOT NULL DEFAULT 50,
    os_type VARCHAR(50) DEFAULT 'ubuntu-24.04',
    status VARCHAR(50) DEFAULT 'creating',
    ip_address VARCHAR(50),
    tailscale_ip VARCHAR(45),
    ssh_username VARCHAR(100),
    ssh_password VARCHAR(100),
    proxmox_node VARCHAR(100),
    storage VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vms_user_id ON virtual_machines(user_id);
CREATE INDEX idx_vms_status ON virtual_machines(status);
