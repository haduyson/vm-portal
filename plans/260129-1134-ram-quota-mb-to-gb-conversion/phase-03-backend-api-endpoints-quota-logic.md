# Phase 03: Backend API Endpoints - Quota Logic Updates

## Context
Update all API endpoints to use `max_ram_gb` and convert between GB (user quota) and MB (VM specs) correctly.

## Priority
**CRITICAL** - Core business logic for quota validation.

## Current Status
⏳ Pending

## Dependencies
- Phase 01 (Database Migration) must be completed
- Phase 02 (Schema Updates) must be completed

## Related Files
- `backend/app/api/vm_endpoints.py`
- `backend/app/api/admin_user_endpoints.py`
- `backend/app/api/auth_endpoints.py`

## File Ownership
- `backend/app/api/vm_endpoints.py`
- `backend/app/api/admin_user_endpoints.py`
- `backend/app/api/auth_endpoints.py`

## Implementation Steps

### 1. Update vm_endpoints.py - VM Creation Quota Check

**File:** `backend/app/api/vm_endpoints.py`

**Lines 72-77:** Update RAM quota validation
```python
# FROM:
if current_user.max_ram_mb is not None:
    if current_ram_mb + vm_data.memory_mb > current_user.max_ram_mb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đã vượt giới hạn RAM ({(current_ram_mb + vm_data.memory_mb) // 1024}/{current_user.max_ram_mb // 1024} GB)",
        )

# TO:
if current_user.max_ram_gb is not None:
    max_ram_mb = current_user.max_ram_gb * 1024  # Convert GB to MB for comparison
    if current_ram_mb + vm_data.memory_mb > max_ram_mb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đã vượt giới hạn RAM ({(current_ram_mb + vm_data.memory_mb) // 1024}/{current_user.max_ram_gb} GB)",
        )
```

**Reasoning:** Convert user quota from GB to MB before comparing with VM memory_mb sum.

### 2. Update vm_endpoints.py - VM Resize Quota Check

**File:** `backend/app/api/vm_endpoints.py`

**Lines 672-676:** Update RAM quota validation for resize
```python
# FROM:
if current_user.max_ram_mb is not None and current_ram_mb + delta_ram > current_user.max_ram_mb:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Vượt giới hạn RAM ({(current_ram_mb + delta_ram) // 1024}/{current_user.max_ram_mb // 1024} GB)",
    )

# TO:
if current_user.max_ram_gb is not None:
    max_ram_mb = current_user.max_ram_gb * 1024  # Convert GB to MB for comparison
    if current_ram_mb + delta_ram > max_ram_mb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vượt giới hạn RAM ({(current_ram_mb + delta_ram) // 1024}/{current_user.max_ram_gb} GB)",
        )
```

### 3. Update vm_endpoints.py - VM Clone Quota Check

**File:** `backend/app/api/vm_endpoints.py`

**Lines 749-750:** Update RAM quota validation for clone
```python
# FROM:
if current_user.max_ram_mb is not None and current_ram_mb + vm.memory_mb > current_user.max_ram_mb:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đã vượt giới hạn RAM")

# TO:
if current_user.max_ram_gb is not None:
    max_ram_mb = current_user.max_ram_gb * 1024  # Convert GB to MB for comparison
    if current_ram_mb + vm.memory_mb > max_ram_mb:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đã vượt giới hạn RAM")
```

### 4. Update admin_user_endpoints.py - Create User

**File:** `backend/app/api/admin_user_endpoints.py`

**Line 52:** Update field name
```python
# FROM:
max_ram_mb=user_data.max_ram_mb,

# TO:
max_ram_gb=user_data.max_ram_gb,
```

**Lines 91-92:** Update response field
```python
# FROM:
max_disk_gb=new_user.max_disk_gb, max_ram_mb=new_user.max_ram_mb,

# TO:
max_disk_gb=new_user.max_disk_gb, max_ram_gb=new_user.max_ram_gb,
```

### 5. Update admin_user_endpoints.py - List Users

**File:** `backend/app/api/admin_user_endpoints.py`

**Lines 125-126:** Update response field
```python
# FROM:
max_disk_gb=user.max_disk_gb, max_ram_mb=user.max_ram_mb,

# TO:
max_disk_gb=user.max_disk_gb, max_ram_gb=user.max_ram_gb,
```

### 6. Update admin_user_endpoints.py - Update User

**File:** `backend/app/api/admin_user_endpoints.py`

**Lines 190-191:** Update field assignment
```python
# FROM:
if user_update.max_ram_mb is not None:
    user.max_ram_mb = user_update.max_ram_mb

# TO:
if user_update.max_ram_gb is not None:
    user.max_ram_gb = user_update.max_ram_gb
```

**Lines 209-210:** Update response field
```python
# FROM:
max_disk_gb=user.max_disk_gb, max_ram_mb=user.max_ram_mb,

# TO:
max_disk_gb=user.max_disk_gb, max_ram_gb=user.max_ram_gb,
```

### 7. Update admin_user_endpoints.py - Get Resource Usage

**File:** `backend/app/api/admin_user_endpoints.py`

**Lines 275-276 and 283-284:** Update calculation and response
```python
# FROM (line 275):
ram_used_mb = sum(vm.memory_mb for vm in vms)

# TO:
ram_used_mb = sum(vm.memory_mb for vm in vms)
ram_used_gb = ram_used_mb / 1024.0  # Convert to GB for response

# FROM (lines 283-284):
ram_used_mb=float(ram_used_mb),
ram_max_mb=user.max_ram_mb,

# TO:
ram_used_gb=float(ram_used_gb),
ram_max_gb=user.max_ram_gb,
```

### 8. Update auth_endpoints.py - Get Quota

**File:** `backend/app/api/auth_endpoints.py`

**Lines 241-242 and 249-250:** Update calculation and response
```python
# FROM (line 241):
used_ram_mb = sum(vm.memory_mb for vm in user_vms)

# TO:
used_ram_mb = sum(vm.memory_mb for vm in user_vms)
used_ram_gb = used_ram_mb // 1024  # Convert to GB for display

# FROM (lines 249-250):
max_ram_mb=current_user.max_ram_mb,
used_ram_mb=used_ram_mb,

# TO:
max_ram_gb=current_user.max_ram_gb,
used_ram_gb=used_ram_gb,
```

## Success Criteria
- [x] All quota validations use `max_ram_gb` from database
- [x] GB to MB conversions correct (multiply by 1024)
- [x] MB to GB conversions correct (divide by 1024)
- [x] Error messages display GB units
- [x] No references to `max_ram_mb` attribute
- [x] All CRUD operations updated

## Code Quality Checklist
- [x] Conversion logic clear and commented
- [x] Integer division used where appropriate
- [x] Error messages user-friendly
- [x] No magic numbers (1024 is documented)

## Risk Assessment
**High Risk:**
- Incorrect conversions could allow quota bypass
- Division/multiplication errors could corrupt quota checks

**Mitigation:**
- Test with various quota values (1GB, 2GB, 4GB, 8GB)
- Verify edge cases (null quotas, 0 values)
- Test quota enforcement before/after changes

## Security Considerations
**CRITICAL:**
- Ensure quotas still enforced correctly
- Verify GB→MB conversion doesn't allow overflow
- Test boundary conditions (e.g., user with 1GB quota trying to create 1024MB VM)
- Confirm null quotas (unlimited) still work

## Testing Requirements
1. Create VM with quota enforcement enabled
2. Try exceeding quota (should fail)
3. Resize VM within quota (should succeed)
4. Resize VM exceeding quota (should fail)
5. Clone VM within quota (should succeed)
6. Admin create user with GB quotas
7. Admin update user quotas
8. Check quota endpoint returns correct GB values

## Next Steps
After completion, proceed to Phase 04: Frontend UI Updates
