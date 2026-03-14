import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Stack, Alert,
  Switch, FormControlLabel, Divider, Tabs, Tab, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, InputAdornment, Chip,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  Visibility, VisibilityOff, Send as SendIcon, Preview as PreviewIcon,
  Restore as RestoreIcon, Email as EmailIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';

// Default templates
const DEFAULT_TEMPLATES = {
  telegram: {
    vm_ready: `🎉 *VM Đã Sẵn Sàng!*

📦 *Tên VM:* {{vm_name}}
🌐 *IP Nội Bộ:* \`{{ip_address}}\`
🔗 *Tailscale IP:* \`{{tailscale_ip}}\`
🌍 *Web Domain:* {{web_domain}}

👤 *Username:* \`{{username}}\`
🔐 *Password:* \`{{password}}\`

🔗 *Portal:* {{portal_url}}`,
    vm_error: `❌ *Lỗi Tạo VM*

📦 *Tên VM:* {{vm_name}}
⚠️ *Lỗi:* {{error}}

Vui lòng liên hệ quản trị viên.`,
    password_reset: `🔑 *Mật Khẩu Đã Được Đặt Lại*

👤 *Username:* {{username}}
🔐 *Mật khẩu mới:* \`{{password}}\`
⏰ *Hết hạn sau:* {{expiry_minutes}} phút

🔗 *Đăng nhập:* {{portal_url}}`,
  },
  email: {
    vm_ready: {
      subject: 'VM {{vm_name}} Đã Sẵn Sàng',
      body: `<h2>VM Của Bạn Đã Sẵn Sàng!</h2>
<p><strong>Tên VM:</strong> {{vm_name}}</p>
<p><strong>IP Nội Bộ:</strong> {{ip_address}}</p>
<p><strong>Tailscale IP:</strong> {{tailscale_ip}}</p>
<p><strong>Web Domain:</strong> {{web_domain}}</p>
<hr/>
<p><strong>Thông tin đăng nhập:</strong></p>
<p>Username: <code>{{username}}</code></p>
<p>Password: <code>{{password}}</code></p>
<p><a href="{{portal_url}}">Truy cập Portal</a></p>`,
    },
    vm_error: {
      subject: 'Lỗi Tạo VM {{vm_name}}',
      body: `<h2>Lỗi Tạo VM</h2>
<p><strong>Tên VM:</strong> {{vm_name}}</p>
<p><strong>Lỗi:</strong> {{error}}</p>
<p>Vui lòng liên hệ quản trị viên để được hỗ trợ.</p>`,
    },
    password_reset: {
      subject: 'Đặt Lại Mật Khẩu - VM Portal',
      body: `<h2>Mật Khẩu Đã Được Đặt Lại</h2>
<p><strong>Username:</strong> {{username}}</p>
<p><strong>Mật khẩu mới:</strong> <code>{{password}}</code></p>
<p><strong>Hết hạn sau:</strong> {{expiry_minutes}} phút</p>
<p>Vui lòng đổi mật khẩu sau khi đăng nhập.</p>
<p><a href="{{portal_url}}">Đăng nhập ngay</a></p>`,
    },
  },
};

// Sample data for preview
const SAMPLE_DATA = {
  vm_name: 'my-test-vm',
  ip_address: '192.168.1.100',
  tailscale_ip: '100.64.0.10',
  web_domain: 'my-test-vm.example.com',
  username: 'root',
  password: 'SecurePass123',
  error: 'Không đủ tài nguyên trên server',
  expiry_minutes: '60',
  portal_url: 'https://portal.example.com',
};

export default function AdminNotificationConfigPage() {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Telegram state
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [telegramTemplates, setTelegramTemplates] = useState(DEFAULT_TEMPLATES.telegram);
  const [telegramConfig, setTelegramConfig] = useState({ botToken: '', chatId: '', portalUrl: '' });
  const [showToken, setShowToken] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  // Email state
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailTemplates, setEmailTemplates] = useState(DEFAULT_TEMPLATES.email);
  const [emailConfig, setEmailConfig] = useState({
    provider: 'smtp', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPassword: '',
    smtpUseTls: true, apiKey: '', fromEmail: '', fromName: '',
  });
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [emailConfigured, setEmailConfigured] = useState(false);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState({ title: '', content: '' });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load feature flags
      const flagsRes = await apiClient.get('/admin/feature-flags/global');
      setTelegramEnabled(flagsRes.data.flags.telegram_notifications_enabled);
      setEmailEnabled(flagsRes.data.flags.email_notifications_enabled);

      // Load telegram config
      const settingsRes = await apiClient.get('/admin/settings');
      setTelegramConfig({
        botToken: '',
        chatId: settingsRes.data.telegram_default_chat_id || '',
        portalUrl: settingsRes.data.telegram_portal_url || '',
      });

      // Load email config
      try {
        const emailRes = await apiClient.get('/admin/settings/email');
        setEmailConfig({
          provider: emailRes.data.provider || 'smtp',
          smtpHost: emailRes.data.smtp_host || '',
          smtpPort: emailRes.data.smtp_port || 587,
          smtpUser: emailRes.data.smtp_user || '',
          smtpPassword: '',
          smtpUseTls: emailRes.data.smtp_use_tls ?? true,
          apiKey: '',
          fromEmail: emailRes.data.from_email || '',
          fromName: emailRes.data.from_name || '',
        });
        setEmailConfigured(emailRes.data.is_configured);
      } catch { /* ignore */ }

      // Load notification templates
      try {
        const templatesRes = await apiClient.get('/admin/settings/notification-templates');
        if (templatesRes.data.telegram_templates) {
          setTelegramTemplates({ ...DEFAULT_TEMPLATES.telegram, ...templatesRes.data.telegram_templates });
        }
        if (templatesRes.data.email_templates) {
          setEmailTemplates({ ...DEFAULT_TEMPLATES.email, ...templatesRes.data.email_templates });
        }
      } catch { /* use defaults */ }
    } catch {
      setErrorMsg('Không thể tải cấu hình');
    }
  };

  const handleToggleTelegram = async (enabled: boolean) => {
    try {
      await apiClient.put('/admin/feature-flags/global', { telegram_notifications_enabled: enabled });
      setTelegramEnabled(enabled);
      setSuccessMsg(enabled ? 'Đã bật thông báo Telegram' : 'Đã tắt thông báo Telegram');
    } catch {
      setErrorMsg('Không thể cập nhật');
    }
  };

  const handleToggleEmail = async (enabled: boolean) => {
    try {
      await apiClient.put('/admin/feature-flags/global', { email_notifications_enabled: enabled });
      setEmailEnabled(enabled);
      setSuccessMsg(enabled ? 'Đã bật thông báo Email' : 'Đã tắt thông báo Email');
    } catch {
      setErrorMsg('Không thể cập nhật');
    }
  };

  const handleSaveTelegramConfig = async () => {
    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      if (telegramConfig.botToken) payload.telegram_bot_token = telegramConfig.botToken;
      if (telegramConfig.chatId) payload.telegram_default_chat_id = telegramConfig.chatId;
      if (telegramConfig.portalUrl) payload.telegram_portal_url = telegramConfig.portalUrl;
      await apiClient.put('/admin/settings', payload);
      setSuccessMsg('Đã lưu cấu hình Telegram');
      setTelegramConfig({ ...telegramConfig, botToken: '' });
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || 'Lỗi lưu cấu hình');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmailConfig = async () => {
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        provider: emailConfig.provider,
        smtp_host: emailConfig.smtpHost,
        smtp_port: emailConfig.smtpPort,
        smtp_user: emailConfig.smtpUser,
        smtp_use_tls: emailConfig.smtpUseTls,
        from_email: emailConfig.fromEmail,
        from_name: emailConfig.fromName,
      };
      if (emailConfig.smtpPassword) payload.smtp_password = emailConfig.smtpPassword;
      if (emailConfig.apiKey) payload.api_key = emailConfig.apiKey;
      await apiClient.put('/admin/settings/email', payload);
      setSuccessMsg('Đã lưu cấu hình Email');
      setEmailConfig({ ...emailConfig, smtpPassword: '', apiKey: '' });
      await loadSettings();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || 'Lỗi lưu cấu hình');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplates = async () => {
    setLoading(true);
    try {
      await apiClient.put('/admin/settings/notification-templates', {
        telegram_templates: telegramTemplates,
        email_templates: emailTemplates,
      });
      setSuccessMsg('Đã lưu mẫu thông báo');
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || 'Lỗi lưu mẫu');
    } finally {
      setLoading(false);
    }
  };

  const handleResetTelegramTemplate = (key: keyof typeof DEFAULT_TEMPLATES.telegram) => {
    setTelegramTemplates({ ...telegramTemplates, [key]: DEFAULT_TEMPLATES.telegram[key] });
  };

  const handleResetEmailTemplate = (key: keyof typeof DEFAULT_TEMPLATES.email) => {
    setEmailTemplates({ ...emailTemplates, [key]: DEFAULT_TEMPLATES.email[key] });
  };

  const replaceVariables = (template: string) => {
    let result = template;
    Object.entries(SAMPLE_DATA).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return result;
  };

  const handlePreview = (title: string, content: string) => {
    setPreviewContent({ title, content: replaceVariables(content) });
    setPreviewOpen(true);
  };

  const handleTestTelegram = async () => {
    setTestLoading(true);
    try {
      await apiClient.post('/admin/settings/telegram/test');
      setSuccessMsg('Đã gửi tin nhắn thử');
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || 'Không thể gửi');
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmailAddress) { setErrorMsg('Nhập email test'); return; }
    setEmailTestLoading(true);
    try {
      await apiClient.post('/admin/settings/email/test', { to_email: testEmailAddress });
      setSuccessMsg('Đã gửi email thử');
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || 'Không thể gửi');
    } finally {
      setEmailTestLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Cấu hình Thông Báo</Typography>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg('')}>{errorMsg}</Alert>}

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label="Telegram" />
          <Tab label="Email" />
        </Tabs>
      </Paper>

      {/* Tab Telegram */}
      {tabIndex === 0 && (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <FormControlLabel
                control={<Switch checked={telegramEnabled} onChange={(e) => handleToggleTelegram(e.target.checked)} />}
                label={<Typography variant="h6">Bật thông báo Telegram</Typography>}
              />
            </CardContent>
          </Card>

          {telegramEnabled && (
            <>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Cấu hình Bot</Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={2}>
                    <TextField
                      label="Bot Token" fullWidth
                      type={showToken ? 'text' : 'password'}
                      value={telegramConfig.botToken}
                      onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                      placeholder="Nhập token mới để cập nhật"
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowToken(!showToken)}>{showToken ? <VisibilityOff /> : <Visibility />}</IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                    <TextField label="Default Chat ID" fullWidth value={telegramConfig.chatId}
                      onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })} />
                    <TextField label="Portal URL" fullWidth value={telegramConfig.portalUrl}
                      onChange={(e) => setTelegramConfig({ ...telegramConfig, portalUrl: e.target.value })} />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Button variant="contained" onClick={handleSaveTelegramConfig} disabled={loading}>Lưu cấu hình</Button>
                      <Button variant="outlined" startIcon={<SendIcon />} onClick={handleTestTelegram}
                        disabled={testLoading || !telegramConfig.chatId}>{testLoading ? 'Đang gửi...' : 'Gửi thử'}</Button>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Mẫu Thông Báo Telegram</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Biến: {'{{vm_name}}, {{ip_address}}, {{tailscale_ip}}, {{web_domain}}, {{username}}, {{password}}, {{error}}, {{expiry_minutes}}, {{portal_url}}'}
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={3}>
                    {(['vm_ready', 'vm_error', 'password_reset'] as const).map((key) => (
                      <Box key={key}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {key === 'vm_ready' ? 'VM Sẵn Sàng' : key === 'vm_error' ? 'Lỗi VM' : 'Đặt Lại Mật Khẩu'}
                          </Typography>
                          <Box>
                            <Button size="small" startIcon={<PreviewIcon />} onClick={() => handlePreview(key, telegramTemplates[key])}>Xem trước</Button>
                            <Button size="small" startIcon={<RestoreIcon />} onClick={() => handleResetTelegramTemplate(key)}>Reset</Button>
                          </Box>
                        </Box>
                        <TextField fullWidth multiline rows={6} value={telegramTemplates[key]}
                          onChange={(e) => setTelegramTemplates({ ...telegramTemplates, [key]: e.target.value })} />
                      </Box>
                    ))}
                    <Button variant="contained" onClick={handleSaveTemplates} disabled={loading}>Lưu mẫu thông báo</Button>
                  </Stack>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      )}

      {/* Tab Email */}
      {tabIndex === 1 && (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FormControlLabel
                  control={<Switch checked={emailEnabled} onChange={(e) => handleToggleEmail(e.target.checked)} />}
                  label={<Typography variant="h6">Bật thông báo Email</Typography>}
                />
                {emailConfigured && <Chip label="Đã cấu hình" color="success" size="small" />}
              </Box>
            </CardContent>
          </Card>

          {emailEnabled && (
            <>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Cấu hình Email</Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={2}>
                    <FormControl fullWidth>
                      <InputLabel>Nhà cung cấp</InputLabel>
                      <Select value={emailConfig.provider} label="Nhà cung cấp"
                        onChange={(e) => setEmailConfig({ ...emailConfig, provider: e.target.value })}>
                        <MenuItem value="smtp">SMTP</MenuItem>
                        <MenuItem value="sendgrid">SendGrid</MenuItem>
                        <MenuItem value="resend">Resend</MenuItem>
                      </Select>
                    </FormControl>

                    {emailConfig.provider === 'smtp' && (
                      <>
                        <TextField label="SMTP Host" fullWidth value={emailConfig.smtpHost}
                          onChange={(e) => setEmailConfig({ ...emailConfig, smtpHost: e.target.value })} />
                        <TextField label="SMTP Port" type="number" fullWidth value={emailConfig.smtpPort}
                          onChange={(e) => setEmailConfig({ ...emailConfig, smtpPort: parseInt(e.target.value) || 587 })} />
                        <TextField label="SMTP Username" fullWidth value={emailConfig.smtpUser}
                          onChange={(e) => setEmailConfig({ ...emailConfig, smtpUser: e.target.value })} />
                        <TextField label="SMTP Password" fullWidth type={showSmtpPassword ? 'text' : 'password'}
                          value={emailConfig.smtpPassword} placeholder="Nhập mới để cập nhật"
                          onChange={(e) => setEmailConfig({ ...emailConfig, smtpPassword: e.target.value })}
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton onClick={() => setShowSmtpPassword(!showSmtpPassword)}>{showSmtpPassword ? <VisibilityOff /> : <Visibility />}</IconButton>
                              </InputAdornment>
                            ),
                          }}
                        />
                        <FormControlLabel control={<Switch checked={emailConfig.smtpUseTls}
                          onChange={(e) => setEmailConfig({ ...emailConfig, smtpUseTls: e.target.checked })} />} label="Sử dụng TLS" />
                      </>
                    )}

                    {(emailConfig.provider === 'sendgrid' || emailConfig.provider === 'resend') && (
                      <TextField label="API Key" fullWidth type={showApiKey ? 'text' : 'password'}
                        value={emailConfig.apiKey} placeholder="Nhập mới để cập nhật"
                        onChange={(e) => setEmailConfig({ ...emailConfig, apiKey: e.target.value })}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? <VisibilityOff /> : <Visibility />}</IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}

                    <Divider />
                    <TextField label="Email gửi đi (From)" fullWidth value={emailConfig.fromEmail}
                      onChange={(e) => setEmailConfig({ ...emailConfig, fromEmail: e.target.value })} />
                    <TextField label="Tên hiển thị (From Name)" fullWidth value={emailConfig.fromName}
                      onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })} />

                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Button variant="contained" onClick={handleSaveEmailConfig} disabled={loading}>Lưu cấu hình</Button>
                      <TextField label="Email test" size="small" value={testEmailAddress} sx={{ minWidth: 200 }}
                        onChange={(e) => setTestEmailAddress(e.target.value)} />
                      <Button variant="outlined" startIcon={<EmailIcon />} onClick={handleTestEmail}
                        disabled={emailTestLoading || !emailConfigured}>{emailTestLoading ? 'Đang gửi...' : 'Gửi thử'}</Button>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Mẫu Thông Báo Email</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Biến: {'{{vm_name}}, {{ip_address}}, {{tailscale_ip}}, {{web_domain}}, {{username}}, {{password}}, {{error}}, {{expiry_minutes}}, {{portal_url}}'}
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={3}>
                    {(['vm_ready', 'vm_error', 'password_reset'] as const).map((key) => (
                      <Box key={key}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {key === 'vm_ready' ? 'VM Sẵn Sàng' : key === 'vm_error' ? 'Lỗi VM' : 'Đặt Lại Mật Khẩu'}
                          </Typography>
                          <Box>
                            <Button size="small" startIcon={<PreviewIcon />}
                              onClick={() => handlePreview(emailTemplates[key].subject, emailTemplates[key].body)}>Xem trước</Button>
                            <Button size="small" startIcon={<RestoreIcon />} onClick={() => handleResetEmailTemplate(key)}>Reset</Button>
                          </Box>
                        </Box>
                        <TextField label="Tiêu đề" fullWidth sx={{ mb: 1 }} value={emailTemplates[key].subject}
                          onChange={(e) => setEmailTemplates({ ...emailTemplates, [key]: { ...emailTemplates[key], subject: e.target.value } })} />
                        <TextField label="Nội dung (HTML)" fullWidth multiline rows={6} value={emailTemplates[key].body}
                          onChange={(e) => setEmailTemplates({ ...emailTemplates, [key]: { ...emailTemplates[key], body: e.target.value } })} />
                      </Box>
                    ))}
                    <Button variant="contained" onClick={handleSaveTemplates} disabled={loading}>Lưu mẫu thông báo</Button>
                  </Stack>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Xem trước: {previewContent.title}</DialogTitle>
        <DialogContent>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
            <div dangerouslySetInnerHTML={{ __html: previewContent.content.replace(/\n/g, '<br/>') }} />
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
