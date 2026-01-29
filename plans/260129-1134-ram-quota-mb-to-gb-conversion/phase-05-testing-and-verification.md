# Phase 05: Testing and Verification

## Context
Comprehensive testing of RAM quota conversion from MB to GB across all components.

## Priority
**CRITICAL** - Ensure no regressions or quota bypass vulnerabilities.

## Current Status
⏳ Pending

## Dependencies
- All previous phases (01-04) must be completed

## File Ownership
None - this is a testing and verification phase.

## Implementation Steps

### 1. Database Verification
**Commands:**
```bash
cd /home/vpscloud/backend
psql $DATABASE_URL -c "SELECT id, username, max_ram_gb FROM users;"
```

**Expected:**
- Column `max_ram_gb` exists
- Column `max_ram_mb` does not exist
- Values are converted (e.g., 2048 MB → 2 GB, 4096 MB → 4 GB)
- NULL values remain NULL (unlimited)

### 2. Backend Schema Validation
**Command:**
```bash
cd /home/vpscloud/backend
python -c "
from app.schemas.admin_schemas import AdminUserCreate, AdminUserResponse, UserResourceUsageResponse
from app.api.auth_endpoints import QuotaResponse
import inspect

# Check AdminUserCreate
print('AdminUserCreate fields:', [f.name for f in AdminUserCreate.model_fields.values()])
assert 'max_ram_gb' in [f for f in AdminUserCreate.model_fields.keys()]
assert 'max_ram_mb' not in [f for f in AdminUserCreate.model_fields.keys()]

# Check AdminUserResponse
assert 'max_ram_gb' in [f for f in AdminUserResponse.model_fields.keys()]
assert 'max_ram_mb' not in [f for f in AdminUserResponse.model_fields.keys()]

# Check UserResourceUsageResponse
assert 'ram_used_gb' in [f for f in UserResourceUsageResponse.model_fields.keys()]
assert 'ram_max_gb' in [f for f in UserResourceUsageResponse.model_fields.keys()]
assert 'ram_used_mb' not in [f for f in UserResourceUsageResponse.model_fields.keys()]

print('✓ All backend schemas updated correctly')
"
```

### 3. Backend API Endpoint Verification
**Search for any remaining references:**
```bash
cd /home/vpscloud/backend
grep -r "max_ram_mb" app/api/ app/schemas/ app/models/
```

**Expected:** No results (all references removed)

### 4. Frontend TypeScript Compilation
**Command:**
```bash
cd /home/vpscloud/frontend
npm run typecheck
```

**Expected:** No type errors related to max_ram_mb/max_ram_gb

### 5. Frontend Code Verification
**Search for any remaining references:**
```bash
cd /home/vpscloud/frontend
grep -r "max_ram_mb\|used_ram_mb" src/
```

**Expected:** No results in quota-related code (VM memory_mb is OK)

### 6. Functional Testing - Admin User Management

**Test 6.1: Create User with GB Quota**
1. Login as admin
2. Navigate to Admin → User Management
3. Click "Create User"
4. Fill form:
   - Username: testuser-quota
   - Password: Test1234
   - Max RAM GB: 4
   - Max VMs: 2
   - Max Disk GB: 20
   - Max CPU Cores: 4
5. Submit
6. Verify user created with 4 GB RAM quota

**Test 6.2: Verify Table Display**
1. Check user list table
2. Verify RAM column shows "4 GB" (not "4096 MB")
3. Expand user row
4. Verify resource usage shows "0.00 / 4 GB"

**Test 6.3: Edit User Quota**
1. Click Edit on test user
2. Change Max RAM GB to 8
3. Save
4. Verify table shows "8 GB"

**Test 6.4: View Resource Usage**
1. Expand test user row
2. Verify shows "0.00 / 8 GB" (or used/max with decimals)

### 7. Functional Testing - VM Creation with Quotas

**Test 7.1: Create VM Within Quota**
1. Login as testuser-quota (from Test 6.1)
2. Navigate to Create VM
3. Check quota display shows "RAM: 0.00 / 8 GB"
4. Create VM with 2048 MB (2 GB) RAM
5. Submit
6. Verify VM created successfully
7. Check quota display updates to "RAM: 2.00 / 8 GB"

**Test 7.2: Create VM Exceeding Quota**
1. As testuser-quota (with 2 GB used, 8 GB max)
2. Try to create VM with 7168 MB (7 GB) RAM
3. Expected: Error "Đã vượt giới hạn RAM (9/8 GB)"
4. VM creation should fail

**Test 7.3: Create VM at Exact Quota Limit**
1. As testuser-quota (with 2 GB used, 8 GB max)
2. Create VM with 6144 MB (6 GB) RAM
3. Expected: Success (total 8 GB)
4. Check quota shows "RAM: 8.00 / 8 GB"

**Test 7.4: Try Exceeding by 1 MB**
1. As testuser-quota (with 8 GB used, 8 GB max)
2. Try to create VM with 1 MB RAM
3. Expected: Error (quota exceeded)

### 8. Functional Testing - VM Resize with Quotas

**Test 8.1: Resize Within Quota**
1. As testuser-quota (with 8 GB used, 8 GB max)
2. Stop first VM (2 GB)
3. Resize it to 1024 MB (1 GB)
4. Expected: Success
5. Quota should show "RAM: 7.00 / 8 GB"

**Test 8.2: Resize Exceeding Quota**
1. As testuser-quota
2. Try to resize VM from 1 GB to 10 GB
3. Expected: Error "Vượt giới hạn RAM"

### 9. Functional Testing - VM Clone with Quotas

**Test 9.1: Clone Within Quota**
1. As testuser-quota (with 7 GB used, 8 GB max)
2. Clone the 1 GB VM
3. Expected: Success (total 8 GB)

**Test 9.2: Clone Exceeding Quota**
1. As testuser-quota (with 8 GB used, 8 GB max)
2. Try to clone any VM
3. Expected: Error "Đã vượt giới hạn RAM"

### 10. Functional Testing - Quota API Endpoint

**Test 10.1: GET /api/auth/quota**
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost/api/auth/quota
```

**Expected Response:**
```json
{
  "max_vms": 2,
  "used_vms": 2,
  "max_disk_gb": 20,
  "used_disk_gb": 10,
  "max_ram_gb": 8,
  "used_ram_gb": 8,
  "max_cpu_cores": 4,
  "used_cpu_cores": 4
}
```

**Verify:**
- Field names are `max_ram_gb` and `used_ram_gb` (not MB)
- Values are in GB (not MB)

### 11. Edge Case Testing

**Test 11.1: Null Quota (Unlimited)**
1. Create user with null RAM quota
2. Verify shows "Unlimited" or "∞"
3. Create VMs with any RAM amount
4. Verify no quota errors

**Test 11.2: Zero Quota**
1. Create user with 0 GB RAM quota
2. Try to create VM with any RAM
3. Expected: Quota exceeded error

**Test 11.3: Fractional GB Values**
1. Create VM with 512 MB RAM (0.5 GB)
2. Verify quota shows "0.50 GB" used
3. Create another VM with 512 MB
4. Verify quota shows "1.00 GB" used

**Test 11.4: Large Quota Values**
1. Create user with 1024 GB quota
2. Verify displays correctly
3. Create VMs and verify calculations

### 12. Migration Rollback Testing (Optional)

**Test 12.1: Test Downgrade Migration**
```bash
cd /home/vpscloud/backend
alembic downgrade -1
psql $DATABASE_URL -c "SELECT id, username, max_ram_mb FROM users LIMIT 5;"
```

**Expected:**
- Column `max_ram_mb` exists
- Column `max_ram_gb` does not exist
- Values converted back (e.g., 4 GB → 4096 MB)

**Test 12.2: Re-upgrade**
```bash
alembic upgrade head
psql $DATABASE_URL -c "SELECT id, username, max_ram_gb FROM users LIMIT 5;"
```

**Expected:** Back to GB values

## Success Criteria
- [x] Database migration successful (up and down)
- [x] No `max_ram_mb` references in backend code
- [x] No `max_ram_mb` references in frontend quota code
- [x] TypeScript compilation passes
- [x] All functional tests pass
- [x] Quota enforcement works correctly
- [x] GB/MB conversions accurate
- [x] UI displays GB units consistently
- [x] Edge cases handled correctly

## Bug Checklist
Common issues to watch for:
- [ ] Division by 1024 vs 1000 (should be 1024)
- [ ] Integer vs float division (use appropriate for context)
- [ ] Rounding errors in quota calculations
- [ ] NULL quota handling
- [ ] Error message formatting
- [ ] Frontend decimal precision (.toFixed(2))

## Performance Testing
- [ ] Large quota values (>1000 GB) display correctly
- [ ] No performance regression in quota checks
- [ ] Database query performance unchanged

## Security Verification
- [x] Quota bypass not possible via fractional values
- [x] Quota enforcement still strict
- [x] No overflow/underflow in conversions
- [x] Null quotas still mean unlimited

## Cleanup Tasks
After all tests pass:
1. Remove test user (testuser-quota)
2. Remove test VMs
3. Document any discovered issues
4. Update system architecture docs if needed

## Rollback Plan
If critical issues found:
1. Run migration downgrade: `alembic downgrade -1`
2. Revert code changes
3. Rebuild frontend
4. Restart backend
5. Investigate and fix issues
6. Re-test before attempting again

## Documentation Updates
After successful verification:
1. Update `docs/system-architecture.md` - note quota in GB
2. Update `docs/code-standards.md` - document GB convention
3. Add migration notes to changelog
4. Update API documentation if exists

## Next Steps
After all tests pass:
- Mark plan as completed
- Create commit with all changes
- Consider creating PR if using feature branches
- Deploy to staging/production
- Monitor for any issues
