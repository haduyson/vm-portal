-- VM Portal Database Initialization
-- This runs automatically on first docker-compose up

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    telegram_chat_id VARCHAR(100),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS virtual_machines (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vmid INTEGER UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    cores INTEGER NOT NULL DEFAULT 2,
    memory_mb INTEGER NOT NULL DEFAULT 4096,
    disk_gb INTEGER NOT NULL DEFAULT 50,
    os_type VARCHAR(50) DEFAULT 'ubuntu-24.04',
    status VARCHAR(50) DEFAULT 'creating',
    ip_address VARCHAR(50),
    ssh_domain VARCHAR(200),
    ssh_username VARCHAR(100),
    ssh_password VARCHAR(100),
    proxmox_node VARCHAR(100),
    storage VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vms_user_id ON virtual_machines(user_id);
CREATE INDEX idx_vms_status ON virtual_machines(status);
