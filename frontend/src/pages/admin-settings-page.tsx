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
  Switch,
  FormControlLabel,
  Divider,
  IconButton,
  InputAdornment,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Send as SendIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';

interface AllSettings {
  feature_novnc_console: string;
  feature_2fa_required: string;
  refresh_token_expiry_days: string;
  temp_password_expiry_minutes: string;
  auto_assign_ip_subdomain: string;
  telegram_bot_token: string | null;
  telegram_bot_token_masked: string;
  telegram_default_chat_id: string | null;
  telegram_source: string;
}

interface OsTemplate {
  id: number;
  label: string;
  os_type_key: string;
  description: string | null;
  is_enabled: boolean;
  sort_order: number;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AllSettings | null>(null);
  const [featureNoVNC, setFeatureNoVNC] = useState(false);
  const [feature2FA, setFeature2FA] = useState(false);
  const [autoAssignIpSubdomain, setAutoAssignIpSubdomain] = useState(false);
  const [refreshExpiry, setRefreshExpiry] = useState('7');
  const [tempPasswordExpiry, setTempPasswordExpiry] = useState('60');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [osTemplates, setOsTemplates] = useState<OsTemplate[]>([]);

  useEffect(() => {
    loadSettings();
    loadOsTemplates();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await apiClient.get('/admin/settings');
      const data: AllSettings = response.data;
      setSettings(data);
      setFeatureNoVNC(data.feature_novnc_console === 'true');
      setFeature2FA(data.feature_2fa_required === 'true');
      setAutoAssignIpSubdomain(data.auto_assign_ip_subdomain === 'true');
      setRefreshExpiry(data.refresh_token_expiry_days || '7');
      setTempPasswordExpiry(data.temp_password_expiry_minutes || '60');
      setChatId(data.telegram_default_chat_id || '');
    } catch {
      setErrorMessage('Không thể tải cấu hình');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const payload: Record<string, string> = {
        feature_novnc_console: featureNoVNC ? 'true' : 'false',
        feature_2fa_required: feature2FA ? 'true' : 'false',
        auto_assign_ip_subdomain: autoAssignIpSubdomain ? 'true' : 'false',
        refresh_token_expiry_days: refreshExpiry,
        temp_password_expiry_minutes: tempPasswordExpiry,
      };

      if (botToken.trim()) {
        payload.telegram_bot_token = botToken.trim();
      }
      if (chatId.trim()) {
        payload.telegram_default_chat_id = chatId.trim();
      }

      await apiClient.put('/admin/settings', payload);
      setSuccessMessage('Đã lưu cài đặt thành công');
      setBotToken('');
      await loadSettings();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể lưu cài đặt');
    } finally {
      setLoading(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const response = await apiClient.post('/admin/settings/telegram/test', {});
      setSuccessMessage(response.data.message || 'Đã gửi tin nhắn thử thành công');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể gửi tin nhắn thử');
    } finally {
      setTestLoading(false);
    }
  };

  const loadOsTemplates = async () => {
    try {
      const response = await apiClient.get('/admin/os-templates');
      setOsTemplates(response.data);
    } catch {
      // OS templates not loaded - non-critical
    }
  };

  const toggleOsTemplate = async (templateId: number, enabled: boolean) => {
    try {
      await apiClient.put(`/admin/os-templates/${templateId}`, { is_enabled: enabled });
      setOsTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, is_enabled: enabled } : t))
      );
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể cập nhật OS template');
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Cài đặt hệ thống
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

      {/* Feature Toggles */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Tính năng</Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch checked={featureNoVNC} onChange={(e) => setFeatureNoVNC(e.target.checked)} />
              }
              label="Bật Console VM (noVNC)"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Cho phép người dùng truy cập console VM qua trình duyệt
            </Typography>

            <FormControlLabel
              control={
                <Switch checked={feature2FA} onChange={(e) => setFeature2FA(e.target.checked)} />
              }
              label="Yêu cầu xác thực hai yếu tố (2FA)"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Khi bật, người dùng sẽ được khuyến khích thiết lập 2FA
            </Typography>

            <FormControlLabel
              control={
                <Switch checked={autoAssignIpSubdomain} onChange={(e) => setAutoAssignIpSubdomain(e.target.checked)} />
              }
              label="Tự động gán IP & Subdomain cho VM mới"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Khi bật, mỗi VM mới sẽ tự động được gán IP tĩnh ngẫu nhiên và subdomain từ tên VM
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Token Settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Phiên đăng nhập</Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={3}>
            <TextField
              label="Thời hạn refresh token (ngày)"
              type="number"
              value={refreshExpiry}
              onChange={(e) => setRefreshExpiry(e.target.value)}
              fullWidth
              inputProps={{ min: 1, max: 90 }}
              helperText="Số ngày refresh token hợp lệ (1-90). Mặc định: 7 ngày"
            />
            <TextField
              label="Thời hạn mật khẩu tạm thời (phút)"
              type="number"
              value={tempPasswordExpiry}
              onChange={(e) => setTempPasswordExpiry(e.target.value)}
              fullWidth
              inputProps={{ min: 1, max: 10080 }}
              helperText="Mật khẩu tạm thời (đặt lại) hết hạn sau bao nhiêu phút. Mặc định: 60 phút"
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Telegram Settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Cấu hình Telegram</Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={3}>
            {settings && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Nguồn cấu hình:{' '}
                  <Chip
                    label={settings.telegram_source === 'database' ? 'Cơ sở dữ liệu' : 'Biến môi trường'}
                    size="small"
                    color={settings.telegram_source === 'database' ? 'primary' : 'default'}
                  />
                </Typography>
              </Box>
            )}

            <TextField
              label="Bot Token"
              type={showToken ? 'text' : 'password'}
              value={botToken || settings?.telegram_bot_token || ''}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="Nhập bot token"
              fullWidth
              helperText="Nhập token mới để cập nhật, để trống nếu không muốn thay đổi"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowToken(!showToken)} edge="end">
                      {showToken ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              label="Default Chat ID"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Nhập chat ID mặc định"
              fullWidth
              helperText="Chat ID để nhận thông báo mặc định"
            />

            <Button
              variant="outlined"
              startIcon={<SendIcon />}
              onClick={handleTestTelegram}
              disabled={testLoading || !settings?.telegram_default_chat_id}
              sx={{ alignSelf: 'flex-start' }}
            >
              {testLoading ? 'Đang gửi...' : 'Gửi tin nhắn thử'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* OS Templates */}
      {osTemplates.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Hệ điều hành</Typography>
            <Divider sx={{ mb: 2 }} />
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tên hiển thị</TableCell>
                    <TableCell>Mã OS</TableCell>
                    <TableCell align="center">Bật/Tắt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {osTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>{template.label}</TableCell>
                      <TableCell>
                        <Chip label={template.os_type_key} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={template.is_enabled}
                          onChange={(e) => toggleOsTemplate(template.id, e.target.checked)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <Button
        variant="contained"
        size="large"
        onClick={handleSave}
        disabled={loading}
        fullWidth
        sx={{ mb: 4 }}
      >
        {loading ? 'Đang lưu...' : 'Lưu tất cả cài đặt'}
      </Button>
    </Box>
  );
}
