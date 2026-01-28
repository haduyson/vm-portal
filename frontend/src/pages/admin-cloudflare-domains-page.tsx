import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Typography,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Snackbar,
  IconButton,
  Chip,
  Stack,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Refresh,
  Visibility,
  VisibilityOff,
  ExpandMore,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';

interface CloudflareDomain {
  id: number;
  domain: string;
  tunnel_name: string;
  cf_api_token: string;
  cf_zone_id: string;
  cf_tunnel_id: string;
  cloudflared_config_path: string;
  setup_notes: string | null;
  is_active: boolean;
}

export default function AdminCloudflareDomainsPage() {
  const [domains, setDomains] = useState<CloudflareDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentDomainId, setCurrentDomainId] = useState<number | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);

  // Form fields
  const [domain, setDomain] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [cfZoneId, setCfZoneId] = useState('');
  const [cfTunnelId, setCfTunnelId] = useState('');
  const [tunnelName, setTunnelName] = useState('vpscloud');
  const [cloudflaredConfigPath, setCloudflaredConfigPath] = useState('/etc/cloudflared/config.yml');
  const [setupNotes, setSetupNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Alerts
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/cloudflare-domains');
      setDomains(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể tải danh sách domain');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDomain('');
    setCfApiToken('');
    setCfZoneId('');
    setCfTunnelId('');
    setTunnelName('vpscloud');
    setCloudflaredConfigPath('/etc/cloudflared/config.yml');
    setSetupNotes('');
    setIsActive(true);
    setShowApiToken(false);
  };

  const handleOpenAddDialog = () => {
    resetForm();
    setEditMode(false);
    setCurrentDomainId(null);
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (domainItem: CloudflareDomain) => {
    setDomain(domainItem.domain);
    setCfApiToken('');
    setCfZoneId(domainItem.cf_zone_id);
    setCfTunnelId(domainItem.cf_tunnel_id);
    setTunnelName(domainItem.tunnel_name);
    setCloudflaredConfigPath(domainItem.cloudflared_config_path);
    setSetupNotes(domainItem.setup_notes || '');
    setIsActive(domainItem.is_active);
    setEditMode(true);
    setCurrentDomainId(domainItem.id);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleTestConnection = async () => {
    if (!cfApiToken || !cfZoneId) {
      setErrorMessage('Vui lòng điền CF API Token và Zone ID');
      return;
    }

    try {
      setTestingConnection(true);
      setErrorMessage('');
      const response = await apiClient.post('/admin/cloudflare-domains/test-connection', {
        cf_api_token: cfApiToken,
        cf_zone_id: cfZoneId,
      });

      if (response.data.success) {
        setSuccessMessage(`Kết nối thành công! Zone: ${response.data.zone_name || cfZoneId}`);
      } else {
        setErrorMessage(`Kết nối thất bại: ${response.data.message}`);
      }
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể kết nối Cloudflare');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    if (!domain || !cfZoneId || !cfTunnelId || !tunnelName) {
      setErrorMessage('Vui lòng điền đầy đủ các trường bắt buộc');
      return;
    }

    if (!editMode && !cfApiToken) {
      setErrorMessage('CF API Token là bắt buộc khi thêm domain mới');
      return;
    }

    try {
      setLoading(true);
      setSuccessMessage('');
      setErrorMessage('');

      if (editMode && currentDomainId) {
        const payload: Record<string, unknown> = {
          domain,
          cf_zone_id: cfZoneId,
          cf_tunnel_id: cfTunnelId,
          tunnel_name: tunnelName,
          cloudflared_config_path: cloudflaredConfigPath,
          setup_notes: setupNotes.trim() || null,
          is_active: isActive,
        };
        if (cfApiToken.trim()) {
          payload.cf_api_token = cfApiToken;
        }
        await apiClient.put(`/admin/cloudflare-domains/${currentDomainId}`, payload);
        setSuccessMessage('Đã cập nhật domain thành công');
      } else {
        await apiClient.post('/admin/cloudflare-domains', {
          domain,
          cf_api_token: cfApiToken,
          cf_zone_id: cfZoneId,
          cf_tunnel_id: cfTunnelId,
          tunnel_name: tunnelName,
          cloudflared_config_path: cloudflaredConfigPath,
          setup_notes: setupNotes.trim() || null,
        });
        setSuccessMessage('Đã thêm domain thành công');
      }

      handleCloseDialog();
      await loadDomains();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể lưu domain');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteDialog = (domainId: number) => {
    setCurrentDomainId(domainId);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setCurrentDomainId(null);
  };

  const handleDelete = async () => {
    if (!currentDomainId) return;

    try {
      setLoading(true);
      await apiClient.delete(`/admin/cloudflare-domains/${currentDomainId}`);
      setSuccessMessage('Đã xóa domain thành công');
      handleCloseDeleteDialog();
      await loadDomains();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể xóa domain');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (domainItem: CloudflareDomain) => {
    try {
      setLoading(true);
      await apiClient.put(`/admin/cloudflare-domains/${domainItem.id}`, {
        is_active: !domainItem.is_active,
      });
      setSuccessMessage(
        domainItem.is_active
          ? `Đã vô hiệu hóa domain "${domainItem.domain}"`
          : `Đã kích hoạt domain "${domainItem.domain}"`
      );
      await loadDomains();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể cập nhật trạng thái');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Quản lý Domain Cloudflare</Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadDomains}
            disabled={loading}
            sx={{ mr: 2 }}
          >
            Làm mới
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpenAddDialog}
            disabled={loading}
          >
            Thêm domain
          </Button>
        </Box>
      </Box>

      {/* Setup Guide */}
      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">📚 Hướng dẫn cấu hình Cloudflare Tunnel</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
              <strong>1. Cài đặt cloudflared trên máy chủ:</strong>
              {'\n'}curl -L https://pkg.cloudflare.com/cloudflare-release.key | gpg --dearmor {'>'} /usr/share/keyrings/cloudflare-release.gpg
              {'\n'}apt update {'&&'} apt install cloudflared
              {'\n\n'}
              <strong>2. Đăng nhập Cloudflare:</strong>
              {'\n'}cloudflared tunnel login
              {'\n\n'}
              <strong>3. Tạo tunnel:</strong>
              {'\n'}cloudflared tunnel create {'<tên-tunnel>'}
              {'\n'}→ Ghi lại Tunnel ID
              {'\n\n'}
              <strong>4. Cấu hình DNS:</strong>
              {'\n'}cloudflared tunnel route dns {'<tên-tunnel>'} {'<tên-miền>'}
              {'\n\n'}
              <strong>5. Tạo file config: /etc/cloudflared/config.yml</strong>
              {'\n'}tunnel: {'<TUNNEL_ID>'}
              {'\n'}credentials-file: /root/.cloudflared/{'<TUNNEL_ID>'}.json
              {'\n'}ingress:
              {'\n'}  - hostname: dc.{'<domain>'}
              {'\n'}    service: https://localhost:8006
              {'\n'}    originRequest:
              {'\n'}      noTLSVerify: true
              {'\n'}  - hostname: vpscloud.{'<domain>'}
              {'\n'}    service: http://localhost:80
              {'\n'}  - service: http_status:404
              {'\n\n'}
              <strong>6. Cài đặt service:</strong>
              {'\n'}cloudflared service install
              {'\n'}systemctl enable cloudflared
              {'\n'}systemctl start cloudflared
              {'\n\n'}
              <strong>7. Lấy thông tin cần thiết:</strong>
              {'\n'}• CF API Token: Tạo tại https://dash.cloudflare.com/profile/api-tokens (cần quyền Zone:DNS:Edit)
              {'\n'}• CF Zone ID: Dashboard → chọn domain → Overview → bên phải thấy Zone ID
              {'\n'}• CF Tunnel ID: cloudflared tunnel list
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!errorMessage}
        autoHideDuration={6000}
        onClose={() => setErrorMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      </Snackbar>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Domain</TableCell>
              <TableCell>Tunnel Name</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="right">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {domains.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography color="text.secondary">Chưa có domain nào</Typography>
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography color="text.secondary">Đang tải...</Typography>
                </TableCell>
              </TableRow>
            )}
            {domains.map((domainItem) => (
              <TableRow key={domainItem.id}>
                <TableCell>
                  <Typography variant="body1" fontWeight="medium">
                    {domainItem.domain}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={domainItem.tunnel_name} size="small" />
                </TableCell>
                <TableCell>
                  <Chip
                    label={domainItem.is_active ? 'Hoạt động' : 'Vô hiệu'}
                    color={domainItem.is_active ? 'success' : 'default'}
                    size="small"
                    icon={domainItem.is_active ? <CheckCircle /> : <ErrorIcon />}
                    onClick={() => handleToggleActive(domainItem)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => handleOpenEditDialog(domainItem)}
                    title="Chỉnh sửa"
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleOpenDeleteDialog(domainItem.id)}
                    title="Xóa"
                    color="error"
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editMode ? 'Chỉnh sửa domain' : 'Thêm domain mới'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              fullWidth
              helperText="VD: hasonmedia.com"
            />
            <TextField
              label="CF API Token"
              type={showApiToken ? 'text' : 'password'}
              value={cfApiToken}
              onChange={(e) => setCfApiToken(e.target.value)}
              required={!editMode}
              fullWidth
              placeholder={editMode ? 'Để trống nếu không đổi' : ''}
              helperText={editMode ? 'Chỉ nhập nếu muốn thay đổi token' : 'Bắt buộc'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowApiToken(!showApiToken)}
                      edge="end"
                    >
                      {showApiToken ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="CF Zone ID"
              value={cfZoneId}
              onChange={(e) => setCfZoneId(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="CF Tunnel ID"
              value={cfTunnelId}
              onChange={(e) => setCfTunnelId(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Tunnel Name"
              value={tunnelName}
              onChange={(e) => setTunnelName(e.target.value)}
              required
              fullWidth
              helperText="Tên tunnel trong Cloudflare"
            />
            <TextField
              label="Cloudflared Config Path"
              value={cloudflaredConfigPath}
              onChange={(e) => setCloudflaredConfigPath(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Setup Notes"
              value={setupNotes}
              onChange={(e) => setSetupNotes(e.target.value)}
              fullWidth
              multiline
              rows={3}
              helperText="Ghi chú về cấu hình (tùy chọn)"
            />

            {!editMode && (
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={testingConnection || !cfApiToken || !cfZoneId}
                fullWidth
                startIcon={testingConnection && <CircularProgress size={16} />}
              >
                {testingConnection ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={loading}>
            {loading ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <Typography>Bạn có chắc chắn muốn xóa domain này không?</Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Cảnh báo: Nếu có VM đang sử dụng domain này, các subdomain sẽ không còn hoạt động.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={loading}>
            {loading ? 'Đang xóa...' : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
