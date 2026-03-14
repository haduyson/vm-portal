# Phase 3: Frontend Component & Display Updates

## Priority: High
## Status: Pending
## Depends On: Phase 2 (API Schemas & Endpoint Updates)

## Overview

Update all frontend components to use `memory_gb` directly from API without conversion. Remove all `Math.round(vm.memory_mb / 1024)` conversion logic.

## Key Insights

- Frontend already displays GB to users
- Current approach: API returns MB, frontend converts to GB
- New approach: API returns GB, frontend displays directly
- Simplifies code, removes potential rounding inconsistencies

## Requirements

### Functional
- All TypeScript interfaces use `memory_gb`
- Remove all MB to GB conversion logic
- Display GB values directly
- Forms already use GB input (no change needed for input)

### Non-Functional
- Consistent display formatting
- No visual changes to user (still sees GB)

## Related Code Files

### Files to Modify

| File | Line(s) | Change |
|------|---------|--------|
| `frontend/src/pages/vm-create-page.tsx` | 50-52, 290, 336-337, 412 | Interface & conversion removal |
| `frontend/src/pages/vm-detail-page.tsx` | 227, 399, 565-566, 723, 760, 849 | Interface & conversion removal |
| `frontend/src/pages/vm-list-page.tsx` | 235, 287 | Interface & conversion removal |
| `frontend/src/pages/admin-vm-overview-page.tsx` | 59, 171, 394 | Interface & conversion removal |
| `frontend/src/pages/admin-settings-page.tsx` | 64, 274, 596 | Template display |
| `frontend/src/services/api-client.ts` | VM interfaces | Update types |

## Implementation Steps

### Step 1: Update TypeScript Interfaces

```typescript
// frontend/src/services/api-client.ts or relevant type files

// VM interface - change:
interface VM {
  // From:
  memory_mb: number;

  // To:
  memory_gb: number;
}

// Server resources interface - change:
interface ServerResources {
  // From:
  memory_total_mb: number;
  memory_used_mb: number;
  memory_allocated_mb: number;

  // To:
  memory_total_gb: number;
  memory_used_gb: number;
  memory_allocated_gb: number;
}

// VM resource response - change:
interface VMResourceResponse {
  // From:
  memory_used_mb: number;
  memory_total_mb: number;

  // To:
  memory_used_gb: number;
  memory_total_gb: number;
}
```

### Step 2: Update VM Create Page

```typescript
// frontend/src/pages/vm-create-page.tsx

// Lines 50-52 - ServerResources interface
// Change to use _gb suffix

// Line 290 - Form submission
// Change from:
const payload = {
  memory_mb: formData.ram_gb * 1024,
  // ...
};

// To:
const payload = {
  memory_gb: formData.ram_gb,
  // ...
};


// Lines 336-337 - Memory allocation percentage
// Change from:
const memAllocPercent = (s.memory_total_mb > 0)
  ? (s.memory_allocated_mb / s.memory_total_mb) * 100
  : 0;

// To:
const memAllocPercent = (s.memory_total_gb > 0)
  ? (s.memory_allocated_gb / s.memory_total_gb) * 100
  : 0;


// Line 412 - Display allocated RAM
// Change from:
RAM: {memory_allocated_mb / 1024} / {memory_total_mb / 1024} GB

// To:
RAM: {memory_allocated_gb} / {memory_total_gb} GB
```

### Step 3: Update VM Detail Page

```typescript
// frontend/src/pages/vm-detail-page.tsx

// Line 227 - Set resize RAM state
// Change from:
setResizeRamGb(Math.round(vm.memory_mb / 1024));

// To:
setResizeRamGb(vm.memory_gb);


// Line 399 - Display current RAM
// Change from:
{Math.round(vm.memory_mb / 1024)} GB

// To:
{vm.memory_gb} GB


// Lines 565-566 - Resource usage display
// Change from:
{resources.memory_used_mb.toFixed(0)} MB / {resources.memory_total_mb.toFixed(0)} MB

// To:
{resources.memory_used_gb.toFixed(2)} GB / {resources.memory_total_gb.toFixed(2)} GB


// Line 723 - Resize dialog RAM display
// Change from:
RAM (GB): {resizeRamGb} (current: {Math.round(vm.memory_mb / 1024)} GB)

// To:
RAM (GB): {resizeRamGb} (current: {vm.memory_gb} GB)


// Line 760 - Disable resize condition
// Change from:
resizeRamGb === Math.round(vm.memory_mb / 1024)

// To:
resizeRamGb === vm.memory_gb


// Line 849 - Clone confirmation
// Change from:
{Math.round(vm.memory_mb / 1024)} GB RAM

// To:
{vm.memory_gb} GB RAM
```

### Step 4: Update VM List Page

```typescript
// frontend/src/pages/vm-list-page.tsx

// Line 235 - Chip display
// Change from:
{Math.round(vm.memory_mb / 1024)} GB RAM

// To:
{vm.memory_gb} GB RAM


// Line 287 - Table cell
// Change from:
{Math.round(vm.memory_mb / 1024)} GB

// To:
{vm.memory_gb} GB
```

### Step 5: Update Admin VM Overview Page

```typescript
// frontend/src/pages/admin-vm-overview-page.tsx

// Line 59 - Interface
// Change from:
memory_mb: number;

// To:
memory_gb: number;


// Line 171 - Conversion (remove)
// Change from:
Math.round(vm.memory_mb / 1024)

// To:
vm.memory_gb


// Line 394 - Table display
// Change from:
{Math.round(vm.memory_mb / 1024)} GB

// To:
{vm.memory_gb} GB
```

### Step 6: Update Admin Settings Page (Templates)

```typescript
// frontend/src/pages/admin-settings-page.tsx

// Line 64 - Template interface
// Change from:
memory_mb: number;

// To:
memory_gb: number;


// Line 274 - Template description
// Change from:
RAM: ${template.memory_mb}MB

// To:
RAM: ${template.memory_gb}GB


// Line 596 - Template table display
// Change from:
{t.memory_mb} MB

// To:
{t.memory_gb} GB
```

## Todo List

- [ ] Update VM interface (memory_mb → memory_gb)
- [ ] Update ServerResources interface (all _mb fields → _gb)
- [ ] Update VMResourceResponse interface
- [ ] Update vm-create-page.tsx (remove conversions)
- [ ] Update vm-detail-page.tsx (remove conversions)
- [ ] Update vm-list-page.tsx (remove conversions)
- [ ] Update admin-vm-overview-page.tsx (remove conversions)
- [ ] Update admin-settings-page.tsx (template display)
- [ ] Run TypeScript compiler to check for errors
- [ ] Test all pages visually

## Success Criteria

- [ ] No `memory_mb` references in frontend code
- [ ] No `/1024` or `* 1024` conversions for memory
- [ ] All pages display GB correctly
- [ ] TypeScript compiles without errors
- [ ] Visual appearance unchanged for users

## Security Considerations

- No security impact (display only changes)

## Next Steps

After Phase 3 complete, proceed to Phase 4 (Testing & Validation) to ensure all changes work correctly end-to-end.
