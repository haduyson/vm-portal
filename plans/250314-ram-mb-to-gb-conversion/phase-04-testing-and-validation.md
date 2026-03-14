# Phase 4: Testing & Validation

## Priority: High
## Status: Pending
## Depends On: Phase 3 (Frontend Component & Display Updates)

## Overview

Comprehensive testing of all memory-related functionality after MB to GB conversion. Verify data integrity, API behavior, and UI display.

## Key Insights

- Migration converts existing MB values to GB (CEIL division)
- Proxmox still uses MB internally (conversion at service layer)
- All user-facing values should be in GB
- Quota validation logic simplified

## Requirements

### Functional
- All existing VMs display correct GB values
- New VM creation works with GB input
- VM resize works with GB values
- Quota enforcement accurate in GB
- Resource metrics display GB

### Non-Functional
- No data loss during migration
- No performance regression
- Clear error messages in GB

## Test Cases

### Database Migration Tests

| Test | Expected Result |
|------|-----------------|
| VM with 1024 MB | Converts to 1 GB |
| VM with 2048 MB | Converts to 2 GB |
| VM with 4096 MB | Converts to 4 GB |
| VM with 512 MB | Converts to 1 GB (CEIL) |
| VM with 1536 MB | Converts to 2 GB (CEIL) |

### API Endpoint Tests

#### Create VM
```bash
# Test: Create VM with 2 GB RAM
curl -X POST /api/vms \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "test-vm", "cores": 2, "memory_gb": 2, "disk_gb": 20, "os_type": "ubuntu"}'

# Expected: VM created with memory_gb=2 in response
# Proxmox: VM has 2048 MB memory
```

#### Get VM
```bash
# Test: Get VM details
curl /api/vms/1 -H "Authorization: Bearer $TOKEN"

# Expected: Response contains memory_gb (not memory_mb)
```

#### Resize VM
```bash
# Test: Resize VM to 4 GB RAM
curl -X PUT /api/vms/1/resize \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"memory_gb": 4}'

# Expected: VM resized, Proxmox has 4096 MB
```

#### Resource Metrics
```bash
# Test: Get VM resources
curl /api/vms/1/resources -H "Authorization: Bearer $TOKEN"

# Expected: memory_used_gb, memory_total_gb in response
```

#### Quota Validation
```bash
# Test: User with 8 GB quota, 6 GB used, try create 4 GB VM
# Expected: 400 error with message in GB units
```

### Frontend Tests

| Page | Test | Expected |
|------|------|----------|
| VM Create | Select 2GB preset | Form shows 2 GB, API sends memory_gb: 2 |
| VM Create | Server resources display | Shows "RAM: X / Y GB" |
| VM List | VM card | Shows "X GB RAM" |
| VM Detail | VM info | Shows "X GB" |
| VM Detail | Resource chart | Shows GB values |
| VM Detail | Resize dialog | Shows current GB, accepts GB input |
| Admin VMs | VM table | Shows GB in RAM column |
| Admin Settings | Templates | Shows "RAM: X GB" |

### Proxmox Integration Tests

| Test | Expected |
|------|----------|
| Create 2 GB VM | Proxmox config shows `memory: 2048` |
| Resize to 4 GB | Proxmox config shows `memory: 4096` |
| Clone VM | New VM has same GB, Proxmox has correct MB |

## Implementation Steps

### Step 1: Pre-Migration Backup

```bash
# Backup database before migration
docker exec vmportal-db pg_dump -U vmadmin vmportal > backup_before_gb_migration.sql

# Record current VM memory values
docker exec vmportal-db psql -U vmadmin -d vmportal \
  -c "SELECT id, name, memory_mb FROM virtual_machines;"
```

### Step 2: Run Migration

```bash
# Run Alembic migration
docker exec vmportal-api alembic upgrade head

# Verify column renamed
docker exec vmportal-db psql -U vmadmin -d vmportal \
  -c "\d virtual_machines" | grep memory
```

### Step 3: Verify Data Conversion

```bash
# Check converted values
docker exec vmportal-db psql -U vmadmin -d vmportal \
  -c "SELECT id, name, memory_gb FROM virtual_machines;"

# Compare with backup to verify CEIL conversion
```

### Step 4: API Testing

```bash
# Test each endpoint with curl or API testing tool
# Verify response schema contains memory_gb
# Verify validation error messages use GB
```

### Step 5: Frontend Testing

```bash
# Build frontend
cd frontend && npm run build

# Manual testing of each page
# Check browser console for errors
# Verify TypeScript compilation
```

### Step 6: Proxmox Verification

```bash
# Check Proxmox VM configs
pvesh get /nodes/pve/qemu/VMID/config | grep memory

# Verify memory values are correct MB equivalents
```

## Todo List

- [ ] Create database backup
- [ ] Record pre-migration memory values
- [ ] Run Alembic migration
- [ ] Verify column rename successful
- [ ] Verify data conversion (CEIL logic)
- [ ] Test Create VM API
- [ ] Test Get VM API
- [ ] Test Resize VM API
- [ ] Test Resource Metrics API
- [ ] Test Quota Validation
- [ ] Test VM Create page
- [ ] Test VM List page
- [ ] Test VM Detail page
- [ ] Test Admin VM Overview page
- [ ] Test Admin Settings templates
- [ ] Verify Proxmox VM configs

## Success Criteria

- [ ] All existing VMs have correct GB values
- [ ] No data loss (values rounded up correctly)
- [ ] All API endpoints return GB
- [ ] All frontend pages display GB
- [ ] Proxmox operations work correctly
- [ ] Quota validation accurate
- [ ] No console errors
- [ ] No TypeScript errors

## Rollback Plan

If issues discovered:

```bash
# Rollback migration
docker exec vmportal-api alembic downgrade -1

# Or restore from backup
docker exec -i vmportal-db psql -U vmadmin vmportal < backup_before_gb_migration.sql

# Revert code changes
git checkout HEAD~N -- backend/ frontend/
```

## Security Considerations

- Backup contains production data, secure storage required
- No security changes in this phase

## Post-Implementation

After successful testing:
- [ ] Update API documentation
- [ ] Update any external integrations
- [ ] Notify users if API changed
- [ ] Clean up backup files
