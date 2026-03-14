# RAM Field Conversion: MB to GB Throughout Codebase

## Overview

Convert RAM/memory fields from MB to GB across the VM Portal codebase for better user experience and consistency with modern cloud platform conventions.

**Additional Enhancement:** Replace SSH Domain with Tailscale IP for external VM access. SSH Domain không thể dùng để SSH từ ngoài vào, thay vào đó dùng Tailscale IP.

## Status: Planning

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Backend Schema & Model Changes | Pending |
| Phase 2 | API Endpoint Updates | Pending |
| Phase 3 | Frontend Display Updates | Pending |
| Phase 4 | Testing & Validation | Pending |
| Phase 5 | Tailscale Integration | Pending |

## Problem Statement

Currently the codebase has inconsistent memory unit usage:
- **VM memory** stored as `memory_mb` (MB)
- **User quotas** stored as `max_ram_gb` (GB)
- **Frontend** converts MB to GB for display
- **API validation** uses MB ranges (512-32768)

This creates:
1. Conversion overhead in frontend
2. Potential rounding errors
3. Confusing API payloads (user thinks GB, sends MB)
4. Inconsistent validation messages

## Solution

Standardize on **GB** throughout the system:
- Store VM memory as `memory_gb` (Integer)
- Accept/return `memory_gb` in API
- Display GB directly without conversion
- Keep Proxmox API communication in MB (convert at service layer)

## Key Dependencies

- Database migration (non-breaking with proper default handling)
- Proxmox API still expects MB (internal conversion needed)
- Frontend forms already use GB input (simplification)

## Phase Files

- [Phase 1: Backend Schema & Model Changes](./phase-01-backend-schema-model-changes.md)
- [Phase 2: API Schemas & Endpoint Updates](./phase-02-api-schemas-and-endpoint-updates.md)
- [Phase 3: Frontend Display Updates](./phase-03-frontend-component-display-updates.md)
- [Phase 4: Testing & Validation](./phase-04-testing-and-validation.md)
- [Phase 5: Tailscale IP Integration (Replace SSH Domain)](./phase-05-tailscale-ip-integration-replace-ssh-domain.md)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Use CEIL(memory_mb/1024) to round up |
| API breaking change | Version API or maintain backward compat temporarily |
| Proxmox API mismatch | Convert at ProxmoxService layer only |
| Frontend display issues | Thorough testing of all VM pages |

## Success Criteria

- [ ] All DB fields use GB
- [ ] API accepts/returns GB
- [ ] Frontend displays GB without conversion
- [ ] Proxmox operations work correctly
- [ ] No data loss during migration
- [ ] All tests pass
- [ ] SSH Domain removed, replaced with Tailscale IP
- [ ] Users can SSH to VMs via Tailscale IP from anywhere
