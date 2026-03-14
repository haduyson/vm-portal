# Phase 2: API Schemas & Endpoint Updates

## Priority: High
## Status: Pending
## Depends On: Phase 1 (Backend Schema & Model Changes)

## Overview

Update all Pydantic schemas and API endpoints to use `memory_gb` instead of `memory_mb`. Update validation ranges from MB to GB.

## Key Insights

- Current validation: 512 MB - 32768 MB (VM create), 512 MB - 65536 MB (resize)
- New validation: 1 GB - 32 GB (VM create), 1 GB - 64 GB (resize)
- Quota validation already uses GB, simplifies logic
- Resource metrics (used/total) also need conversion

## Requirements

### Functional
- All schemas use `memory_gb` field
- Validation ranges updated to GB
- API responses return GB values
- Resource metrics return GB values

### Non-Functional
- Clear validation error messages in GB
- Consistent field naming across all schemas

## Related Code Files

### Files to Modify

| File | Changes Required |
|------|------------------|
| `backend/app/schemas/vm_schemas.py` | VMCreate, VMResponse, VMResourceResponse, VMResize |
| `backend/app/schemas/admin_schemas.py` | AdminVMResponse (memory_mb field) |
| `backend/app/api/vm_endpoints.py` | Quota validation, VM creation, resize logic |
| `backend/app/api/admin_vm_endpoints.py` | AdminVMResponse construction |

## Implementation Steps

### Step 1: Update VM Schemas

```python
# backend/app/schemas/vm_schemas.py

# VMCreate - Line 25
# Change from:
memory_mb: int = Field(..., ge=512, le=32768)

# To:
memory_gb: int = Field(..., ge=1, le=32, description="RAM in GB")


# VMResponse - Line 56
# Change from:
memory_mb: int

# To:
memory_gb: int


# VMResourceResponse - Lines 82-83
# Change from:
memory_used_mb: float
memory_total_mb: float

# To:
memory_used_gb: float
memory_total_gb: float


# VMResize - Line 90
# Change from:
memory_mb: Optional[int] = Field(None, ge=512, le=65536)

# To:
memory_gb: Optional[int] = Field(None, ge=1, le=64, description="RAM in GB")
```

### Step 2: Update Admin Schemas

```python
# backend/app/schemas/admin_schemas.py

# AdminVMResponse - find memory_mb field
# Change from:
memory_mb: int

# To:
memory_gb: int
```

### Step 3: Update VM Endpoints - Create VM

```python
# backend/app/api/vm_endpoints.py

# Line 63 - RAM calculation (now simpler)
# Change from:
current_ram_mb = sum(vm.memory_mb for vm in user_vms)

# To:
current_ram_gb = sum(vm.memory_gb for vm in user_vms)


# Lines 80-86 - Quota validation (simplified, no conversion needed)
# Change from:
if current_user.max_ram_gb is not None:
    max_ram_mb = current_user.max_ram_gb * 1024
    if current_ram_mb + vm_data.memory_mb > max_ram_mb:
        raise HTTPException(...)

# To:
if current_user.max_ram_gb is not None:
    if current_ram_gb + vm_data.memory_gb > current_user.max_ram_gb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vượt quá giới hạn RAM. Đã dùng: {current_ram_gb}GB, "
                   f"Yêu cầu: {vm_data.memory_gb}GB, Giới hạn: {current_user.max_ram_gb}GB"
        )


# Line 380 - Store in DB
# Change from:
memory_mb=vm_data.memory_mb

# To:
memory_gb=vm_data.memory_gb
```

### Step 4: Update VM Endpoints - Resize VM

```python
# backend/app/api/vm_endpoints.py

# Lines 811, 816 - RAM calculations
# Change from:
new_memory_mb = resize_data.memory_mb or vm.memory_mb
delta_ram = new_memory_mb - vm.memory_mb

# To:
new_memory_gb = resize_data.memory_gb or vm.memory_gb
delta_ram_gb = new_memory_gb - vm.memory_gb


# Lines 826-830 - Quota validation
# Change from:
current_ram_mb = sum(v.memory_mb for v in user_vms)
max_ram_mb = current_user.max_ram_gb * 1024
if current_ram_mb + delta_ram > max_ram_mb:

# To:
current_ram_gb = sum(v.memory_gb for v in user_vms)
if current_ram_gb + delta_ram_gb > current_user.max_ram_gb:


# Line 846 - Proxmox config (convert to MB here)
# Change from:
config_kwargs["memory"] = new_memory_mb

# To:
config_kwargs["memory"] = new_memory_gb * 1024  # Proxmox expects MB


# Line 855 - DB update
# Change from:
vm.memory_mb = new_memory_mb

# To:
vm.memory_gb = new_memory_gb
```

### Step 5: Update VM Endpoints - Clone VM

```python
# backend/app/api/vm_endpoints.py

# Line 921 - Clone config
# Change from:
memory_mb=vm.memory_mb

# To:
memory_gb=vm.memory_gb
```

### Step 6: Update VM Endpoints - Resource Metrics

```python
# backend/app/api/vm_endpoints.py

# Lines 1113-1115 - Resource response
# Change from:
memory_used_mb=...,
memory_total_mb=...

# To:
memory_used_gb=round(memory_used_mb / 1024, 2),
memory_total_gb=round(memory_total_mb / 1024, 2)
```

### Step 7: Update Admin VM Endpoints

```python
# backend/app/api/admin_vm_endpoints.py

# Lines 39, 102, 144, 231 - AdminVMResponse construction
# Change all occurrences of:
memory_mb=vm.memory_mb

# To:
memory_gb=vm.memory_gb
```

### Step 8: Update Proxmox Client Resource Methods

```python
# backend/app/services/proxmox_client.py

# Node resources - return GB instead of MB
# Lines 88-91, 134-136
# Change calculations to return GB:
memory_used_gb = round(mem_used / (1024 * 1024 * 1024), 2)
memory_total_gb = round(mem_total / (1024 * 1024 * 1024), 2)

# VM resources - Lines 406-409, 418-419
# Similar conversion to GB
```

## Todo List

- [ ] Update VMCreate schema (memory_gb, validation 1-32 GB)
- [ ] Update VMResponse schema (memory_gb)
- [ ] Update VMResourceResponse schema (memory_used_gb, memory_total_gb)
- [ ] Update VMResize schema (memory_gb, validation 1-64 GB)
- [ ] Update AdminVMResponse schema (memory_gb)
- [ ] Update vm_endpoints.py create VM logic
- [ ] Update vm_endpoints.py resize VM logic
- [ ] Update vm_endpoints.py clone VM logic
- [ ] Update vm_endpoints.py resource metrics
- [ ] Update admin_vm_endpoints.py responses
- [ ] Update proxmox_client.py resource methods
- [ ] Test all endpoints with new GB values

## Success Criteria

- [ ] All API schemas use `memory_gb`
- [ ] Validation errors show GB values
- [ ] Create VM accepts GB, stores GB
- [ ] Resize VM uses GB calculations
- [ ] Resource metrics return GB
- [ ] Quota validation works with GB only (no conversion)

## Security Considerations

- Validation ranges prevent excessive resource allocation
- Quota enforcement unchanged, just simpler logic

## Next Steps

After Phase 2 complete, proceed to Phase 3 (Frontend Updates) to update UI components.
