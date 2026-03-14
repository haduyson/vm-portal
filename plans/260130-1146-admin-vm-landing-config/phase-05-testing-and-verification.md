# Phase 5: Testing and Verification

## Overview

- **Priority:** P2
- **Status:** pending
- **Effort:** 0.5h

Verify all components work together end-to-end.

## Test Cases

### 1. API Tests

| Test | Expected Result |
|------|-----------------|
| GET /admin/vm-landing-config (no DB entry) | Returns default config |
| PUT /admin/vm-landing-config | Updates and returns new config |
| POST /admin/vm-landing-config/logo | Uploads file, returns URL |
| GET /admin/vm-landing-config/preview | Returns valid HTML |
| Non-admin access | 401/403 error |

### 2. UI Tests

| Test | Expected Result |
|------|-----------------|
| Load page | Form populated with current config |
| Edit fields | Values update in state |
| Color picker | Updates hex value |
| Upload logo | File uploads, URL updates |
| Preview button | Shows HTML in iframe |
| Save button | Persists to DB, shows success |

### 3. Integration Tests

| Test | Expected Result |
|------|-----------------|
| Create new VM after config change | VM landing page uses new config |
| Logo displays in preview | Image loads correctly |
| Logo displays in actual VM | Image loads on VM nginx |
| Custom content renders | HTML content shown |

## Manual Test Procedure

### Test 1: Basic Config Update

1. Login as admin
2. Navigate to "Cau hinh trang VM"
3. Change company name to "Test Company"
4. Click "Luu cau hinh"
5. Refresh page
6. Verify company name persisted

### Test 2: Logo Upload

1. Prepare test image (PNG, <2MB)
2. Click upload button
3. Select file
4. Verify success message
5. Verify logo_url updated
6. Click Preview, verify logo displays

### Test 3: Color Customization

1. Change primary color to #ff0000
2. Change background to #f0f0f0
3. Click Preview
4. Verify colors applied in preview HTML

### Test 4: VM Provisioning

1. Save custom config
2. Create new test VM
3. Wait for provisioning
4. Access VM's web interface
5. Verify landing page shows custom config

## Verification Checklist

- [ ] API endpoints respond correctly
- [ ] Admin page loads without errors
- [ ] Form saves and loads config
- [ ] Color pickers work
- [ ] Logo upload works
- [ ] Preview renders correctly
- [ ] New VMs use custom landing page
- [ ] Audit logs record changes

## Cleanup

After testing:
- Delete test VMs
- Optionally reset config to defaults

## Notes

- Logo files persist in nginx/html/static
- Old logos not auto-deleted (manual cleanup if needed)
- Test with both URL and uploaded logos
