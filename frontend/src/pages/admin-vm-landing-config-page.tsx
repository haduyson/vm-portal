import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  Divider,
  Grid,
  Paper,
} from '@mui/material';
import {
  Upload as UploadIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';

interface VmLandingConfig {
  title: string;
  logo_url: string;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  primary_color: string;
  bg_color: string;
  message: string;
}

export default function AdminVmLandingConfigPage() {
  const [config, setConfig] = useState<VmLandingConfig>({
    title: 'VM CLOUD - HASONTECH',
    logo_url: '/static/logo-hasontech.png',
    company_name: 'CÔNG TY TNHH MỘT THÀNH VIÊN CÔNG NGHỆ HÀ SƠN',
    address: '300 Xô Viết Nghệ Tĩnh, P. Cẩm Lệ, TP. Đà Nẵng',
    phone: '(0236) 3.507.507',
    email: 'lienhe@hasontech.vn',
    website: 'hasontech.vn',
    primary_color: '#667eea',
    bg_color: '#ffffff',
    message: '',
  });

  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await apiClient.get('/admin/vm-landing-config');
      setConfig(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể tải cấu hình');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      await apiClient.put('/admin/vm-landing-config', config);
      setSuccessMessage('Đã lưu cấu hình thành công');
      setPreviewKey((prev) => prev + 1);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể lưu cấu hình');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Định dạng file không hợp lệ. Chỉ chấp nhận: PNG, JPG, GIF, SVG');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Kích thước file phải nhỏ hơn 5MB');
      return;
    }

    setUploadLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post('/admin/vm-landing-config/upload-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setConfig({ ...config, logo_url: response.data.logo_url });
      setSuccessMessage('Đã upload logo thành công');
      setPreviewKey((prev) => prev + 1);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể upload logo');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleRefreshPreview = () => {
    setPreviewKey((prev) => prev + 1);
  };

  // Generate preview HTML
  const generatePreviewHtml = () => {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.title}</title>
    <link rel="icon" href="${config.logo_url}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: ${config.bg_color};
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .logo { max-width: 200px; margin-bottom: 20px; }
        h1 { color: #1a202c; font-size: 24px; margin-bottom: 10px; }
        .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #d4edda;
            color: #155724;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 500;
            margin-bottom: 20px;
        }
        .status::before {
            content: "";
            width: 10px;
            height: 10px;
            background: #28a745;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .info {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            text-align: left;
        }
        .info h3 { color: #495057; font-size: 13px; margin-bottom: 15px; }
        .info-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
            color: #495057;
            font-size: 14px;
        }
        .info-row svg { width: 18px; height: 18px; flex-shrink: 0; }
        a { color: ${config.primary_color}; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .footer { margin-top: 20px; font-size: 12px; color: #6c757d; }
        .message {
            background: #fff3cd;
            color: #856404;
            padding: 12px 16px;
            border-radius: 10px;
            margin: 15px 0;
            font-size: 14px;
            line-height: 1.5;
            border-left: 4px solid #ffc107;
        }
    </style>
</head>
<body>
    <div class="container">
        <img src="${config.logo_url}" alt="Logo" class="logo" onerror="this.style.display='none'">
        <h1>${config.title}</h1>
        <div class="status">Máy chủ đang hoạt động</div>
        ${config.message ? `<div class="message">${config.message}</div>` : ''}
        <div class="info">
            <h3>${config.company_name}</h3>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>${config.address}</span>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                <a href="tel:${config.phone.replace(/[\s().]/g, '')}">${config.phone}</a>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <a href="mailto:${config.email}">${config.email}</a>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <a href="https://${config.website}" target="_blank">${config.website}</a>
            </div>
        </div>
        <div class="footer">Powered by <a href="https://hasontech.vn" target="_blank">Hason Tech</a></div>
    </div>
</body>
</html>`;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Cấu hình Landing Page VM
      </Typography>

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Configuration Form */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Thông tin cấu hình
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Stack spacing={3}>
                <TextField
                  label="Tiêu đề trang"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  fullWidth
                  helperText="Hiển thị trên tab trình duyệt và tiêu đề chính"
                />

                <TextField
                  label="Thông điệp / Thông báo"
                  value={config.message}
                  onChange={(e) => setConfig({ ...config, message: e.target.value })}
                  fullWidth
                  multiline
                  rows={3}
                  helperText="Thông điệp hiển thị dưới trạng thái 'Máy chủ đang hoạt động' (để trống nếu không cần)"
                />

                <Box>
                  <TextField
                    label="URL Logo"
                    value={config.logo_url}
                    onChange={(e) => setConfig({ ...config, logo_url: e.target.value })}
                    fullWidth
                    helperText="URL của logo (cũng dùng làm favicon)"
                  />
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<UploadIcon />}
                    disabled={uploadLoading}
                    sx={{ mt: 1 }}
                  >
                    {uploadLoading ? 'Đang upload...' : 'Upload Logo'}
                    <input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                  </Button>
                </Box>

                <TextField
                  label="Tên công ty"
                  value={config.company_name}
                  onChange={(e) => setConfig({ ...config, company_name: e.target.value })}
                  fullWidth
                  multiline
                  rows={2}
                />

                <TextField
                  label="Địa chỉ"
                  value={config.address}
                  onChange={(e) => setConfig({ ...config, address: e.target.value })}
                  fullWidth
                  multiline
                  rows={2}
                />

                <TextField
                  label="Số điện thoại"
                  value={config.phone}
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  fullWidth
                />

                <TextField
                  label="Email"
                  type="email"
                  value={config.email}
                  onChange={(e) => setConfig({ ...config, email: e.target.value })}
                  fullWidth
                />

                <TextField
                  label="Website"
                  value={config.website}
                  onChange={(e) => setConfig({ ...config, website: e.target.value })}
                  fullWidth
                  helperText="Chỉ nhập tên miền (vd: hasontech.vn)"
                />

                <TextField
                  label="Màu chủ đạo (Primary Color)"
                  type="color"
                  value={config.primary_color}
                  onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Màu của liên kết và điểm nhấn"
                />

                <TextField
                  label="Màu nền (Background Color)"
                  type="color"
                  value={config.bg_color}
                  onChange={(e) => setConfig({ ...config, bg_color: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Màu nền của toàn bộ trang"
                />
              </Stack>
            </CardContent>
          </Card>

          <Button
            variant="contained"
            size="large"
            onClick={handleSave}
            disabled={loading}
            fullWidth
            startIcon={<SaveIcon />}
            sx={{ mt: 3 }}
          >
            {loading ? 'Đang lưu...' : 'Lưu cấu hình'}
          </Button>
        </Grid>

        {/* Preview */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Xem trước</Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={handleRefreshPreview}
                >
                  Làm mới
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />

              <Paper
                variant="outlined"
                sx={{
                  height: 600,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <iframe
                  key={previewKey}
                  srcDoc={generatePreviewHtml()}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  title="Preview"
                />
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
