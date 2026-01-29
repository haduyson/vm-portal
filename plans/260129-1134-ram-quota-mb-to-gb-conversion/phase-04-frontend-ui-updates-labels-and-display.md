# Phase 04: Frontend UI Updates - Labels and Display Logic

## Context
Update frontend components to display RAM quotas in GB instead of MB, including labels, form inputs, and quota displays.

## Priority
**HIGH** - User-facing changes for consistency.

## Current Status
⏳ Pending

## Dependencies
- Phase 01 (Database Migration) must be completed
- Phase 02 (Schema Updates) must be completed
- Phase 03 (API Endpoints) must be completed

## Related Files
- `frontend/src/pages/admin-user-management-page.tsx`
- `frontend/src/pages/vm-create-page.tsx`
- `frontend/src/pages/vm-detail-page.tsx`

## File Ownership
- `frontend/src/pages/admin-user-management-page.tsx`
- `frontend/src/pages/vm-create-page.tsx`
- `frontend/src/pages/vm-detail-page.tsx`

## Implementation Steps

### 1. Update admin-user-management-page.tsx - Interface

**File:** `frontend/src/pages/admin-user-management-page.tsx`

**Line 53:** Update interface field name
```typescript
// FROM:
max_ram_mb: number | null;

// TO:
max_ram_gb: number | null;
```

**Line 63:** Update UserResourceUsage interface
```typescript
// FROM:
ram_used_mb: number;
ram_max_mb: number | null;

// TO:
ram_used_gb: number;
ram_max_gb: number | null;
```

### 2. Update admin-user-management-page.tsx - State

**File:** `frontend/src/pages/admin-user-management-page.tsx`

**Line 94:** Update newUser state field name
```typescript
// FROM:
max_ram_mb: 0,

// TO:
max_ram_gb: 0,
```

### 3. Update admin-user-management-page.tsx - Form Labels

**File:** `frontend/src/pages/admin-user-management-page.tsx`

Find the TextField for RAM quota in create dialog and update:
```tsx
// FROM:
<TextField
  label="Giới hạn RAM MB"
  type="number"
  value={newUser.max_ram_mb}
  onChange={(e) => setNewUser({...newUser, max_ram_mb: parseInt(e.target.value) || 0})}
/>

// TO:
<TextField
  label="Giới hạn RAM GB"
  type="number"
  value={newUser.max_ram_gb}
  onChange={(e) => setNewUser({...newUser, max_ram_gb: parseInt(e.target.value) || 0})}
/>
```

### 4. Update admin-user-management-page.tsx - Edit Dialog

**File:** `frontend/src/pages/admin-user-management-page.tsx`

Find the edit dialog TextField for RAM and update:
```tsx
// FROM:
<TextField
  label="Giới hạn RAM MB"
  type="number"
  value={editUser.max_ram_mb || ''}
  onChange={(e) => setEditUser({...editUser, max_ram_mb: parseInt(e.target.value) || null})}
/>

// TO:
<TextField
  label="Giới hạn RAM GB"
  type="number"
  value={editUser.max_ram_gb || ''}
  onChange={(e) => setEditUser({...editUser, max_ram_gb: parseInt(e.target.value) || null})}
/>
```

### 5. Update admin-user-management-page.tsx - Table Display

**File:** `frontend/src/pages/admin-user-management-page.tsx`

Find TableCell displaying RAM quota and update:
```tsx
// FROM:
<TableCell>{user.max_ram_mb || 'Unlimited'} MB</TableCell>

// TO:
<TableCell>{user.max_ram_gb || 'Unlimited'} GB</TableCell>
```

### 6. Update admin-user-management-page.tsx - Resource Usage Display

**File:** `frontend/src/pages/admin-user-management-page.tsx`

Find the resource usage display in expanded row and update:
```tsx
// FROM:
<Typography variant="body2">
  RAM: {usage.ram_used_mb} / {usage.ram_max_mb || '∞'} MB
</Typography>

// TO:
<Typography variant="body2">
  RAM: {usage.ram_used_gb.toFixed(2)} / {usage.ram_max_gb || '∞'} GB
</Typography>
```

**Note:** Use `.toFixed(2)` for decimal precision since VMs use MB but quota is in GB.

### 7. Update vm-create-page.tsx - Interface

**File:** `frontend/src/pages/vm-create-page.tsx`

**Line 33:** Update Quota interface field name
```typescript
// FROM:
max_ram_mb: number | null;
used_ram_mb: number;

// TO:
max_ram_gb: number | null;
used_ram_gb: number;
```

### 8. Update vm-create-page.tsx - Quota Display

**File:** `frontend/src/pages/vm-create-page.tsx`

Find quota display section for RAM and update:
```tsx
// FROM:
<Typography variant="body2">
  RAM: {quota.used_ram_mb} / {quota.max_ram_mb || '∞'} MB
</Typography>

// TO:
<Typography variant="body2">
  RAM: {(quota.used_ram_gb).toFixed(2)} / {quota.max_ram_gb || '∞'} GB
</Typography>
```

### 9. Update vm-create-page.tsx - Validation Warning

**File:** `frontend/src/pages/vm-create-page.tsx`

Find RAM quota validation warning and update:
```tsx
// FROM (if exists):
if (quota.max_ram_mb && quota.used_ram_mb + formData.memory_mb > quota.max_ram_mb) {
  // Show warning about exceeding quota
}

// TO:
if (quota.max_ram_gb && (quota.used_ram_gb + formData.memory_mb / 1024) > quota.max_ram_gb) {
  // Show warning about exceeding quota
}
```

**Note:** Convert VM memory_mb to GB for comparison with quota.

### 10. Update vm-detail-page.tsx - Quota Display

**File:** `frontend/src/pages/vm-detail-page.tsx`

Search for any quota display sections and update RAM labels from MB to GB:
```tsx
// FROM:
RAM Quota: {quota.used_ram_mb} / {quota.max_ram_mb || '∞'} MB

// TO:
RAM Quota: {quota.used_ram_gb.toFixed(2)} / {quota.max_ram_gb || '∞'} GB
```

**Note:** This file may not have direct quota display, but check for any references.

## Success Criteria
- [x] All labels changed from "MB" to "GB"
- [x] Form inputs accept GB values
- [x] Table displays show GB units
- [x] Resource usage displays show GB with decimal precision
- [x] No references to `max_ram_mb` or `used_ram_mb` in quota contexts
- [x] Validation logic converts MB to GB correctly

## Code Quality Checklist
- [x] TypeScript interfaces updated
- [x] All type errors resolved
- [x] Decimal precision handled appropriately (.toFixed(2))
- [x] User-facing text in Vietnamese
- [x] Consistent formatting across all pages

## UI/UX Considerations
- Use `.toFixed(2)` for displaying GB values (e.g., "1.50 GB")
- Keep "Unlimited" or "∞" for null quotas
- Ensure form validation still works with GB inputs
- Consider adding helper text like "(1 GB = 1024 MB)" if needed

## Risk Assessment
**Medium Risk:**
- TypeScript compilation errors if interfaces not updated correctly
- Display inconsistencies if some fields missed
- User confusion if units mixed (MB/GB)

**Mitigation:**
- Run `npm run typecheck` after changes
- Test all quota-related UI components
- Verify no MB references remain in quota displays

## Testing Requirements
1. Admin create user with GB quotas → verify form accepts GB
2. Admin edit user quotas → verify form displays/accepts GB
3. Admin view user list → verify table shows GB
4. Admin expand user row → verify resource usage shows GB
5. User view VM create page → verify quota display shows GB
6. User view VM detail page → verify quota display shows GB (if exists)
7. Verify decimal values display correctly (e.g., 1.50 GB, not 1.5 GB)

## Next Steps
After completion, proceed to Phase 05: Testing & Verification
