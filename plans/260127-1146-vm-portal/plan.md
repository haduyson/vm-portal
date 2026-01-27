# VM Portal - Implementation Plan

## Overview
Internal Vietnamese portal for automated VM provisioning on Proxmox VE.
Stack: FastAPI + React + PostgreSQL + Proxmox API + Telegram + Cloudflare Tunnel

## Architecture
```
[React Frontend] → [Nginx] → [FastAPI Backend] → [Proxmox VE API]
                                    ↓                    ↓
                              [PostgreSQL]         [VM + Cloud-init]
                                    ↓
                           [Telegram Bot API]
```

## Phases (Parallel-Executable)

### Phase 1: Backend Core (No dependencies)
- [x] FastAPI app scaffold + config
- [x] Database models + async session
- [x] JWT auth endpoints
- [x] Proxmox API client service
- [x] Cloud-init template generator
- [x] Telegram notification service
- [x] VM CRUD API endpoints
- [x] Background task for VM status polling
- Status: READY

### Phase 2: Frontend (No dependencies)
- [x] Vite + React + TypeScript scaffold
- [x] Auth service + JWT management
- [x] Login page
- [x] Dashboard layout with sidebar
- [x] VM creation form
- [x] VM list with status
- [x] API integration
- Status: READY

### Phase 3: Infrastructure (No dependencies)
- [x] Dockerfiles (backend + frontend)
- [x] docker-compose.yml
- [x] Nginx config
- [x] .env.example
- [x] Database init script
- Status: READY

## Dependency Graph
Phase 1, 2, 3 → ALL PARALLEL (no cross-dependencies)

## File Ownership
- Phase 1: backend/**
- Phase 2: frontend/**
- Phase 3: docker-compose.yml, nginx/, Dockerfile*, .env.example
