# Phase 02: Backend Schema Updates - Admin and Auth Schemas

## Context
Update Pydantic schemas to use `max_ram_gb` instead of `max_ram_mb` for all admin and user-facing responses.

## Priority
**HIGH** - Required before API endpoints can work correctly.

## Current Status
⏳ Pending

## Dependencies
- Phase 01 (Database Migration) must be completed

## Related Files
- `backend/app/schemas/admin_schemas.py`
- `backend/app/schemas/auth_schemas.py` (QuotaResponse inline)

## File Ownership
- `backend/app/schemas/admin_schemas.py`
- `backend/app/api/auth_endpoints.py` (QuotaResponse class)

## Implementation Steps

### 1. Update AdminUserCreate Schema
**File:** `backend/app/schemas/admin_schemas.py`

**Line 16:** Change field name
```python
# FROM:
max_ram_mb: Optional[int] = None

# TO:
max_ram_gb: Optional[int] = None
```

### 2. Update AdminUserResponse Schema
**File:** `backend/app/schemas/admin_schemas.py`

**Line 44:** Change field name
```python
# FROM:
max_ram_mb: Optional[int]

# TO:
max_ram_gb: Optional[int]
```

### 3. Update AdminUserUpdate Schema
**File:** `backend/app/schemas/admin_schemas.py`

**Line 58:** Change field name
```python
# FROM:
max_ram_mb: Optional[int] = None

# TO:
max_ram_gb: Optional[int] = None
```

### 4. Update UserResourceUsageResponse Schema
**File:** `backend/app/schemas/admin_schemas.py`

**Lines 96-97:** Change field names and types
```python
# FROM:
ram_used_mb: float
ram_max_mb: Optional[int]

# TO:
ram_used_gb: float
ram_max_gb: Optional[int]
```

**Note:** Change `ram_used_mb` to `ram_used_gb` for consistency.

### 5. Update QuotaResponse Schema in auth_endpoints.py
**File:** `backend/app/api/auth_endpoints.py`

**Lines 222-223:** Update QuotaResponse class
```python
# FROM (lines 222-223):
max_ram_mb: Optional[int]
used_ram_mb: int

# TO:
max_ram_gb: Optional[int]
used_ram_gb: int
```

## Success Criteria
- [x] All schema classes updated to use `max_ram_gb`
- [x] No references to `max_ram_mb` in schema files
- [x] Type hints remain correct (Optional[int])
- [x] Pydantic validation still works
- [x] No breaking changes to other fields

## Code Quality Checklist
- [x] Field names follow snake_case convention
- [x] Types remain consistent (Optional[int])
- [x] Comments updated if present
- [x] All imports still valid

## Risk Assessment
**Low Risk:**
- Simple field name changes in Pydantic schemas
- No complex logic involved
- Will cause API errors until endpoints are updated (Phase 03)

**Mitigation:**
- Complete Phase 03 immediately after this phase
- Test API endpoints after Phase 03 completion

## Security Considerations
- No security impact
- Data validation rules remain the same
- No exposure of sensitive information

## Next Steps
After completion, proceed to Phase 03: Backend API Endpoint Updates
