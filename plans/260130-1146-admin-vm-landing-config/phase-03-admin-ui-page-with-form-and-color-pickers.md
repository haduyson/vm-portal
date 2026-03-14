# Phase 3: Admin UI Page with Form and Color Pickers

## Overview

- **Priority:** P1 (main deliverable)
- **Status:** pending
- **Effort:** 2h

Create admin page "Cau hinh trang VM" with form fields, color pickers, logo upload, and live preview.

## Requirements

1. New admin menu item: "Cau hinh trang VM"
2. Form fields for all config options
3. Color pickers for primary/background colors
4. Logo: URL input OR file upload button
5. Live preview in iframe before save
6. Vietnamese labels

## UI Layout

```
+------------------------------------------+
| Cau hinh trang VM                        |
+------------------------------------------+
| [Thong tin co ban]                       |
| Tieu de:        [__________________]     |
| Ten cong ty:    [__________________]     |
| Dia chi:        [__________________]     |
| Dien thoai:     [__________________]     |
| Email:          [__________________]     |
| Website:        [__________________]     |
|                                          |
| [Logo]                                   |
| URL Logo:       [__________________]     |
| HOAC            [Tai len logo]           |
|                                          |
| [Mau sac]                                |
| Mau chinh:      [#667eea] [  ]           |
| Mau nen:        [#ffffff] [  ]           |
|                                          |
| [Noi dung tuy chinh] (optional)          |
| [Rich text editor...]                    |
|                                          |
+------------------------------------------+
| [Xem truoc]              [Luu cau hinh]  |
+------------------------------------------+

+------------------------------------------+
| XEM TRUOC                                |
| +--------------------------------------+ |
| | [iframe with preview HTML]           | |
| +--------------------------------------+ |
+------------------------------------------+
```

## Implementation Steps

### Step 1: Create admin page component

File: `/frontend/src/pages/admin-vm-landing-config-page.tsx`

Key components:
- Form with MUI TextField for text inputs
- MUI color input (type="color") with hex preview
- File upload button using `<input type="file">`
- Preview button triggers API call, renders in iframe
- Save button calls PUT API

```tsx
import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Stack, Alert, Divider, Grid, Paper
} from '@mui/material';
import { Save, Visibility, Upload } from '@mui/icons-material';
import apiClient from '../services/api-client';

interface LandingConfig {
  title: string;
  logo_url: string;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  primary_color: string;
  background_color: string;
  custom_content: string | null;
}

export default function AdminVmLandingConfigPage() {
  const [config, setConfig] = useState<LandingConfig | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    try {
      const res = await apiClient.get('/admin/vm-landing-config');
      setConfig(res.data);
    } catch {
      setErrorMsg('Khong the tai cau hinh');
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setLoading(true);
    try {
      await apiClient.put('/admin/vm-landing-config', config);
      setSuccessMsg('Da luu cau hinh thanh cong');
    } catch {
      setErrorMsg('Khong the luu cau hinh');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    try {
      const res = await apiClient.get('/admin/vm-landing-config/preview');
      setPreviewHtml(res.data.html);
    } catch {
      setErrorMsg('Khong the tao xem truoc');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiClient.post('/admin/vm-landing-config/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setConfig(prev => prev ? { ...prev, logo_url: res.data.logo_url } : prev);
      setSuccessMsg('Da tai len logo thanh cong');
    } catch {
      setErrorMsg('Khong the tai len logo');
    }
  };

  // ... render form with all fields
}
```

### Step 2: Add route to App.tsx

File: `/frontend/src/app.tsx`

```tsx
import AdminVmLandingConfigPage from './pages/admin-vm-landing-config-page';

// In routes:
<Route path="/admin/vm-landing-config" element={<AdminVmLandingConfigPage />} />
```

### Step 3: Add menu item to sidebar/navigation

Find existing admin navigation component and add:
```tsx
{ label: 'Cau hinh trang VM', path: '/admin/vm-landing-config', icon: <WebIcon /> }
```

## Color Picker Implementation

Use native HTML color input with MUI styling:

```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
  <TextField
    label="Mau chinh"
    value={config.primary_color}
    onChange={(e) => setConfig({...config, primary_color: e.target.value})}
    size="small"
    sx={{ width: 120 }}
  />
  <input
    type="color"
    value={config.primary_color}
    onChange={(e) => setConfig({...config, primary_color: e.target.value})}
    style={{ width: 40, height: 40, border: 'none', cursor: 'pointer' }}
  />
</Box>
```

## Preview Implementation

Use iframe with srcdoc for security:

```tsx
{previewHtml && (
  <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
    <Typography variant="h6" gutterBottom>Xem truoc</Typography>
    <Box sx={{ border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
      <iframe
        srcDoc={previewHtml}
        style={{ width: '100%', height: 500, border: 'none' }}
        title="Landing Page Preview"
      />
    </Box>
  </Paper>
)}
```

## Related Files

| Action | File |
|--------|------|
| Create | `/frontend/src/pages/admin-vm-landing-config-page.tsx` |
| Modify | `/frontend/src/app.tsx` (add route) |
| Modify | Sidebar/navigation component (add menu item) |

## Todo

- [ ] Create admin-vm-landing-config-page.tsx
- [ ] Implement form with all text fields
- [ ] Add color picker inputs for primary/background
- [ ] Add logo URL field + file upload button
- [ ] Implement preview button -> iframe
- [ ] Implement save button -> PUT API
- [ ] Add route in app.tsx
- [ ] Add menu item in admin sidebar

## Success Criteria

- Page accessible at /admin/vm-landing-config
- All fields editable with proper Vietnamese labels
- Color pickers show color preview
- Logo upload works and updates preview
- Preview shows rendered HTML in iframe
- Save persists to database

## Notes

- Use existing admin page patterns from admin-settings-page.tsx
- Keep UI consistent with other admin pages
- Vietnamese text without diacritics for simplicity (or with if preferred)
