# Plan: RAM Quota Field Conversion (MB → GB)

## Overview
Convert user RAM quota from MB to GB throughout the codebase for better UX. Only USER QUOTA changes - VM specs remain in MB.

## Status
- [x] Phase 01: Database Migration - [phase-01-database-migration-rename-max-ram-mb-to-gb.md](./phase-01-database-migration-rename-max-ram-mb-to-gb.md)
- [x] Phase 02: Backend Schema Updates - [phase-02-backend-schema-updates-admin-and-auth.md](./phase-02-backend-schema-updates-admin-and-auth.md)
- [x] Phase 03: Backend API Endpoint Updates - [phase-03-backend-api-endpoints-quota-logic.md](./phase-03-backend-api-endpoints-quota-logic.md)
- [x] Phase 04: Frontend UI Updates - [phase-04-frontend-ui-updates-labels-and-display.md](./phase-04-frontend-ui-updates-labels-and-display.md)
- [x] Phase 05: Testing & Verification - [phase-05-testing-and-verification.md](./phase-05-testing-and-verification.md)

## Report
See detailed planning report: [planner-260129-1134-ram-quota-mb-to-gb-conversion.md](../reports/planner-260129-1134-ram-quota-mb-to-gb-conversion.md)

## Key Changes

### Database
- Rename `users.max_ram_mb` → `users.max_ram_gb`
- Convert existing values: new_value = old_value / 1024
- Create Alembic migration

### Backend
- Update schemas: `AdminUserCreate`, `AdminUserResponse`, `AdminUserUpdate`, `UserResourceUsageResponse`
- Update quota validation logic in `vm_endpoints.py`
- Update admin endpoints in `admin_user_endpoints.py`
- Update quota response in `auth_endpoints.py`

### Frontend
- Update labels: "Giới hạn RAM MB" → "Giới hạn RAM GB"
- Update quota display logic (convert MB to GB for display)
- Update form inputs to accept GB values

## Important Notes
- VM `memory_mb` field stays as-is (MB)
- Only user quota field changes from MB to GB
- Backend needs to convert GB to MB when comparing with VM totals
- All error messages should display GB for quotas
