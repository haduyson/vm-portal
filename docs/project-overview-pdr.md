# Project Overview - VM Portal PDR

## Purpose
Internal Vietnamese portal enabling employees to self-provision VMs on Proxmox VE with automated OS installation, SSH credential generation, and Telegram notifications.

## Target Users
Company employees needing on-demand VMs for development/testing.

## Key Features
1. JWT-based portal authentication
2. VM creation form (CPU/RAM/Disk/OS selection)
3. Automated Proxmox VM provisioning with cloud-init
4. Background status polling (30s interval, max 40 attempts)
5. Telegram notification with SSH credentials on completion
6. Cloudflare Tunnel SSH domain per VM
7. Full Vietnamese UI

## Tech Stack
- Backend: FastAPI + SQLAlchemy async + asyncpg
- Frontend: React + TypeScript + Vite + MUI v5
- Database: PostgreSQL 16
- Infra: Docker Compose + Nginx
- Integrations: Proxmox API, Telegram Bot API, Cloudflare Tunnel

## Hardware
- Dell R720, 192GB RAM, Proxmox VE
- VM storage: sdc(240G), sdd(240G), sde(120G), sdf(500G), sdg(500G)
- Excluded: sdb (health 17%)

## Status
- Phase 1 (Backend): Complete - 26 files
- Phase 2 (Frontend): Complete - 19 files
- Phase 3 (Infrastructure): Complete - 6 files
