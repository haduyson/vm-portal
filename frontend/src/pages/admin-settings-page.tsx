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
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Send as SendIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
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
  telegram_portal_url: string | null;
  telegram_source: string;
}

interface EmailSettings {
  provider: string;
  smtp_host: string | null;
  smtp_port: number;
  smtp_user: string | null;
  smtp_password_masked: string;
  smtp_use_tls: boolean;
  api_key_masked: string;
  from_email: string;
  from_name: string;
  is_configured: boolean;
}

interface OsTemplate {
  id: number;
  label: string;
  os_type_key: string;
  description: string | null;
  is_enabled: boolean;
  sort_order: number;
}

interface ProxmoxTemplate {
  vmid: number;
  name: string;
  status: string;
  cores: number;
  memory_mb: number;
  disk_gb: number;
  type: 'template';
}

interface ProxmoxIso {
  volid: string;
  name: string;
  size_gb: number;
  type: 'iso';
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
  const [portalUrl, setPortalUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [osTemplates, setOsTemplates] = useState<OsTemplate[]>([]);

  // Email settings state
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [emailProvider, setEmailProvider] = useState('smtp');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [emailApiKey, setEmailApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [emailTestLoading, setEmailTestLoading] = useState(false);

  // Global feature flags state
  interface FeatureFlags {
    cloudflare_tunnel_enabled: boolean;
    public_ip_enabled: boolean;
    email_notifications_enabled: boolean;
    telegram_notifications_enabled: boolean;
  }
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({
    cloudflare_tunnel_enabled: true,
    public_ip_enabled: true,
    email_notifications_enabled: true,
    telegram_notifications_enabled: true,
  });
  const [testEmailAddress, setTestEmailAddress] = useState('');

  useEffect(() => {
    loadSettings();
    loadOsTemplates();
    loadEmailSettings();
    loadFeatureFlags();
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
      setPortalUrl(data.telegram_portal_url || '');
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
      if (portalUrl.trim()) {
        payload.telegram_portal_url = portalUrl.trim();
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

  const loadEmailSettings = async () => {
    try {
      const response = await apiClient.get('/admin/settings/email');
      const data: EmailSettings = response.data;
      setEmailSettings(data);
      setEmailProvider(data.provider || 'smtp');
      setSmtpHost(data.smtp_host || '');
      setSmtpPort(data.smtp_port || 587);
      setSmtpUser(data.smtp_user || '');
      setSmtpUseTls(data.smtp_use_tls);
      setFromEmail(data.from_email || '');
      setFromName(data.from_name || '');
    } catch {
      // Email settings not loaded - non-critical
    }
  };

  const handleSaveEmailSettings = async () => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const payload: Record<string, string | number | boolean> = {
        provider: emailProvider,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_use_tls: smtpUseTls,
        from_email: fromEmail,
        from_name: fromName,
      };

      if (smtpPassword.trim()) {
        payload.smtp_password = smtpPassword.trim();
      }
      if (emailApiKey.trim()) {
        payload.api_key = emailApiKey.trim();
      }

      await apiClient.put('/admin/settings/email', payload);
      setSuccessMessage('Đã lưu cài đặt email thành công');
      setSmtpPassword('');
      setEmailApiKey('');
      await loadEmailSettings();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể lưu cài đặt email');
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmailAddress.trim()) {
      setErrorMessage('Vui lòng nhập địa chỉ email để test');
      return;
    }

    setEmailTestLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const response = await apiClient.post('/admin/settings/email/test', {
        to_email: testEmailAddress.trim(),
      });
      setSuccessMessage(response.data.message || 'Đã gửi email thử thành công');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể gửi email thử');
    } finally {
      setEmailTestLoading(false);
    }
  };

  const loadFeatureFlags = async () => {
    try {
      const response = await apiClient.get('/admin/feature-flags/global');
      setFeatureFlags(response.data.flags);
    } catch {
      // Feature flags not loaded - non-critical
    }
  };

  const handleUpdateFeatureFlag = async (key: string, value: boolean) => {
    try {
      await apiClient.put('/admin/feature-flags/global', { [key]: value });
      setFeatureFlags((prev) => ({ ...prev, [key]: value }));
      setSuccessMessage('Đã cập nhật tính năng');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể cập nhật tính năng');
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

  // OS Template management
  const [addOsDialog, setAddOsDialog] = useState(false);
  const [scanDialog, setScanDialog] = useState(false);
  const [newOs, setNewOs] = useState({ label: '', os_type_key: '', description: '' });
  const [proxmoxTemplates, setProxmoxTemplates] = useState<ProxmoxTemplate[]>([]);
  const [proxmoxIsos, setProxmoxIsos] = useState<ProxmoxIso[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<number[]>([]);
  const [selectedIsos, setSelectedIsos] = useState<string[]>([]);
  const [scanLoading, setScanLoading] = useState(false);

  const handleAddOsTemplate = async () => {
    if (!newOs.label.trim() || !newOs.os_type_key.trim()) {
      setErrorMessage('Vui lòng nhập đủ thông tin');
      return;
    }
    try {
      const response = await apiClient.post('/admin/os-templates', {
        label: newOs.label.trim(),
        os_type_key: newOs.os_type_key.trim(),
        description: newOs.description.trim() || null,
        is_enabled: true,
      });
      setOsTemplates((prev) => [...prev, response.data]);
      setAddOsDialog(false);
      setNewOs({ label: '', os_type_key: '', description: '' });
      setSuccessMessage('Đã thêm hệ điều hành');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể thêm OS template');
    }
  };

  const handleDeleteOsTemplate = async (templateId: number) => {
    if (!confirm('Bạn có chắc muốn xóa hệ điều hành này?')) return;
    try {
      await apiClient.delete(`/admin/os-templates/${templateId}`);
      setOsTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setSuccessMessage('Đã xóa hệ điều hành');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể xóa OS template');
    }
  };

  const handleScanProxmoxTemplates = async () => {
    setScanLoading(true);
    setErrorMessage('');
    try {
      const response = await apiClient.get('/admin/proxmox-templates');
      setProxmoxTemplates(response.data.templates || []);
      setProxmoxIsos(response.data.isos || []);
      setSelectedTemplates([]);
      setSelectedIsos([]);
      setScanDialog(true);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể quét từ Proxmox');
    } finally {
      setScanLoading(false);
    }
  };

  const handleAddSelectedItems = async () => {
    if (selectedTemplates.length === 0 && selectedIsos.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 item');
      return;
    }

    let addedCount = 0;

    // Add selected templates
    for (const vmid of selectedTemplates) {
      const template = proxmoxTemplates.find((t) => t.vmid === vmid);
      if (!template) continue;
      try {
        const response = await apiClient.post('/admin/os-templates', {
          label: template.name,
          os_type_key: `template-${vmid}`,
          description: `VM Template - VMID: ${vmid}, Cores: ${template.cores}, RAM: ${template.memory_mb}MB`,
          is_enabled: true,
        });
        setOsTemplates((prev) => [...prev, response.data]);
        addedCount++;
      } catch { /* skip duplicates */ }
    }

    // Add selected ISOs
    for (const volid of selectedIsos) {
      const iso = proxmoxIsos.find((i) => i.volid === volid);
      if (!iso) continue;
      try {
        const response = await apiClient.post('/admin/os-templates', {
          label: iso.name.replace('.iso', ''),
          os_type_key: volid,
          description: `ISO Image - ${iso.size_gb} GB`,
          is_enabled: true,
        });
        setOsTemplates((prev) => [...prev, response.data]);
        addedCount++;
      } catch { /* skip duplicates */ }
    }

    setScanDialog(false);
    setSelectedTemplates([]);
    setSelectedIsos([]);
    if (addedCount > 0) {
      setSuccessMessage(`Đã thêm ${addedCount} item(s)`);
    }
  };

  const handleToggleTemplate = (vmid: number) => {
    setSelectedTemplates((prev) =>
      prev.includes(vmid) ? prev.filter((id) => id !== vmid) : [...prev, vmid]
    );
  };

  const handleToggleIso = (volid: string) => {
    setSelectedIsos((prev) =>
      prev.includes(volid) ? prev.filter((id) => id !== volid) : [...prev, volid]
    );
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
              label="Tự động gán Subdomain cho VM mới"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Khi bật, mỗi VM mới sẽ tự động được tạo SSH/Web subdomain từ tên VM (qua Cloudflare Tunnel)
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Global Feature Flags (3-level hierarchy) */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Tính năng toàn cục (Global Flags)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Cấu hình ở đây áp dụng cho tất cả users/VMs. Có thể override ở cấp User hoặc VM.
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={featureFlags.cloudflare_tunnel_enabled}
                  onChange={(e) => handleUpdateFeatureFlag('cloudflare_tunnel_enabled', e.target.checked)}
                />
              }
              label="Cloudflare Tunnel"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Cho phép tạo SSH subdomain qua Cloudflare Tunnel
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={featureFlags.public_ip_enabled}
                  onChange={(e) => handleUpdateFeatureFlag('public_ip_enabled', e.target.checked)}
                />
              }
              label="Public IP"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Cho phép gán và giữ lại IP public
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={featureFlags.email_notifications_enabled}
                  onChange={(e) => handleUpdateFeatureFlag('email_notifications_enabled', e.target.checked)}
                />
              }
              label="Thông báo Email"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Gửi thông báo qua email (VM ready, password reset, etc.)
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={featureFlags.telegram_notifications_enabled}
                  onChange={(e) => handleUpdateFeatureFlag('telegram_notifications_enabled', e.target.checked)}
                />
              }
              label="Thông báo Telegram"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
              Gửi thông báo qua Telegram
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

      {/* Telegram Settings - Only show when telegram notifications enabled */}
      {featureFlags.telegram_notifications_enabled && (
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

              <TextField
                label="URL Portal thông báo"
                value={portalUrl}
                onChange={(e) => setPortalUrl(e.target.value)}
                placeholder="https://vm.example.com"
                fullWidth
                helperText="URL hiển thị trong thông báo Telegram (tạo user, reset password, VM sẵn sàng)"
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
      )}

      {/* Email Settings - Only show when email notifications enabled */}
      {featureFlags.email_notifications_enabled && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Cấu hình Email</Typography>
              {emailSettings && (
                <Chip
                  label={emailSettings.is_configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
                  size="small"
                  color={emailSettings.is_configured ? 'success' : 'default'}
                />
              )}
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={3}>
              <FormControl fullWidth>
                <InputLabel>Nhà cung cấp</InputLabel>
                <Select
                  value={emailProvider}
                  label="Nhà cung cấp"
                  onChange={(e) => setEmailProvider(e.target.value)}
                >
                  <MenuItem value="smtp">SMTP</MenuItem>
                  <MenuItem value="sendgrid">SendGrid</MenuItem>
                  <MenuItem value="resend">Resend</MenuItem>
                </Select>
              </FormControl>

              {emailProvider === 'smtp' && (
                <>
                  <TextField
                    label="SMTP Host"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    fullWidth
                  />
                  <TextField
                    label="SMTP Port"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                    fullWidth
                    inputProps={{ min: 1, max: 65535 }}
                  />
                  <TextField
                    label="SMTP Username"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="your-email@gmail.com"
                    fullWidth
                  />
                  <TextField
                    label="SMTP Password"
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={emailSettings?.smtp_password_masked || 'Nhập mật khẩu SMTP'}
                    fullWidth
                    helperText="Nhập mật khẩu mới để cập nhật, để trống nếu không muốn thay đổi"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowSmtpPassword(!showSmtpPassword)} edge="end">
                            {showSmtpPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <FormControlLabel
                    control={
                      <Switch checked={smtpUseTls} onChange={(e) => setSmtpUseTls(e.target.checked)} />
                    }
                    label="Sử dụng TLS"
                  />
                </>
              )}

              {(emailProvider === 'sendgrid' || emailProvider === 'resend') && (
                <TextField
                  label="API Key"
                  type={showApiKey ? 'text' : 'password'}
                  value={emailApiKey}
                  onChange={(e) => setEmailApiKey(e.target.value)}
                  placeholder={emailSettings?.api_key_masked || 'Nhập API key'}
                  fullWidth
                  helperText="Nhập API key mới để cập nhật, để trống nếu không muốn thay đổi"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowApiKey(!showApiKey)} edge="end">
                          {showApiKey ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}

              <Divider />

              <TextField
                label="Email gửi đi (From)"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="noreply@example.com"
                fullWidth
              />
              <TextField
                label="Tên hiển thị (From Name)"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="VM Portal"
                fullWidth
              />

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  onClick={handleSaveEmailSettings}
                  disabled={loading}
                >
                  {loading ? 'Đang lưu...' : 'Lưu cài đặt Email'}
                </Button>

                <TextField
                  label="Email test"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="test@example.com"
                  size="small"
                  sx={{ minWidth: 250 }}
                />
                <Button
                  variant="outlined"
                  startIcon={<EmailIcon />}
                  onClick={handleTestEmail}
                  disabled={emailTestLoading || !emailSettings?.is_configured}
                >
                  {emailTestLoading ? 'Đang gửi...' : 'Gửi email thử'}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* OS Templates */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Hệ điều hành</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<SearchIcon />}
                onClick={handleScanProxmoxTemplates}
                disabled={scanLoading}
              >
                {scanLoading ? 'Đang quét...' : 'Quét từ Proxmox'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setAddOsDialog(true)}
              >
                Thêm OS
              </Button>
            </Box>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {osTemplates.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tên hiển thị</TableCell>
                    <TableCell>Mã OS</TableCell>
                    <TableCell align="center">Bật/Tắt</TableCell>
                    <TableCell align="center">Xóa</TableCell>
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
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteOsTemplate(template.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary">Chưa có hệ điều hành nào. Bấm "Thêm OS" để thêm mới.</Typography>
          )}
        </CardContent>
      </Card>

      {/* Add OS Dialog */}
      <Dialog open={addOsDialog} onClose={() => setAddOsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm hệ điều hành</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên hiển thị"
              value={newOs.label}
              onChange={(e) => setNewOs({ ...newOs, label: e.target.value })}
              placeholder="Ubuntu 24.04 LTS"
              fullWidth
              required
            />
            <TextField
              label="Mã OS (os_type_key)"
              value={newOs.os_type_key}
              onChange={(e) => setNewOs({ ...newOs, os_type_key: e.target.value })}
              placeholder="ubuntu-2404"
              fullWidth
              required
              helperText="Mã định danh duy nhất, phải trùng với tên template trong Proxmox"
            />
            <TextField
              label="Mô tả (tùy chọn)"
              value={newOs.description}
              onChange={(e) => setNewOs({ ...newOs, description: e.target.value })}
              placeholder="Ubuntu Server 24.04 với QEMU Guest Agent"
              fullWidth
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOsDialog(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleAddOsTemplate}>Thêm</Button>
        </DialogActions>
      </Dialog>

      {/* Scan Proxmox Dialog */}
      <Dialog open={scanDialog} onClose={() => setScanDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Quét từ Proxmox</DialogTitle>
        <DialogContent>
          {/* VM Templates Section */}
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mt: 1 }}>
            VM Templates ({proxmoxTemplates.length})
          </Typography>
          {proxmoxTemplates.length > 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1, mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedTemplates.length === proxmoxTemplates.length && proxmoxTemplates.length > 0}
                        indeterminate={selectedTemplates.length > 0 && selectedTemplates.length < proxmoxTemplates.length}
                        onChange={(e) => setSelectedTemplates(e.target.checked ? proxmoxTemplates.map((t) => t.vmid) : [])}
                      />
                    </TableCell>
                    <TableCell>VMID</TableCell>
                    <TableCell>Tên</TableCell>
                    <TableCell>Cores</TableCell>
                    <TableCell>RAM</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {proxmoxTemplates.map((t) => (
                    <TableRow key={t.vmid} hover onClick={() => handleToggleTemplate(t.vmid)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={selectedTemplates.includes(t.vmid)} />
                      </TableCell>
                      <TableCell>{t.vmid}</TableCell>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.cores}</TableCell>
                      <TableCell>{t.memory_mb} MB</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 2 }}>Không có VM template nào</Typography>
          )}

          {/* ISO Images Section */}
          <Typography variant="subtitle1" fontWeight="bold">
            ISO Images ({proxmoxIsos.length})
          </Typography>
          {proxmoxIsos.length > 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedIsos.length === proxmoxIsos.length && proxmoxIsos.length > 0}
                        indeterminate={selectedIsos.length > 0 && selectedIsos.length < proxmoxIsos.length}
                        onChange={(e) => setSelectedIsos(e.target.checked ? proxmoxIsos.map((i) => i.volid) : [])}
                      />
                    </TableCell>
                    <TableCell>Tên file</TableCell>
                    <TableCell>Kích thước</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {proxmoxIsos.map((iso) => (
                    <TableRow key={iso.volid} hover onClick={() => handleToggleIso(iso.volid)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={selectedIsos.includes(iso.volid)} />
                      </TableCell>
                      <TableCell>{iso.name}</TableCell>
                      <TableCell>{iso.size_gb} GB</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary">Không có ISO nào</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScanDialog(false)}>Hủy</Button>
          <Button
            variant="contained"
            onClick={handleAddSelectedItems}
            disabled={selectedTemplates.length === 0 && selectedIsos.length === 0}
          >
            Thêm ({selectedTemplates.length + selectedIsos.length})
          </Button>
        </DialogActions>
      </Dialog>

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
