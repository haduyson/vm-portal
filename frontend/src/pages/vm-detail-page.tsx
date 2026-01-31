import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  IconButton,
  Alert,
  Snackbar,
  Divider,
  InputAdornment,
  TextField,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tabs,
  Tab,
  Slider,
  Chip,
  Stack,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  ArrowBack as ArrowBackIcon,
  Visibility,
  VisibilityOff,
  Delete as DeleteIcon,
  ContentCopy as CloneIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';
import VmResourceCharts from '../components/vm-resource-metrics-recharts-display';
import VMConsoleViewer from '../components/vm-console-viewer';
import VmNetworkPanel from '../components/vm-network-panel';
import VMSSHConsoleModal from '../components/vm-ssh-terminal-console-modal';

interface VMDetail {
  id: number;
  vmid: number;
  name: string;
  status: string;
  cores: number;
  memory_mb: number;
  disk_gb: number;
  os_type: string;
  ip_address: string | null;
  ssh_domain: string | null;
  web_domain: string | null;
  ssh_username: string | null;
  ssh_password: string | null;
  proxmox_node: string;
  storage: string;
  created_at: string;
  updated_at: string;
}

interface VMResources {
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

interface FeatureFlagsData {
  flags: Record<string, boolean>;
  sources: Record<string, string>;
}

export default function VMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vm, setVm] = useState<VMDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resources, setResources] = useState<VMResources | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const vmRef = useRef<VMDetail | null>(null);

  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Clone state
  const [cloneDialog, setCloneDialog] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneLoading, setCloneLoading] = useState(false);

  // Delete state
  const [retainIp, setRetainIp] = useState(false);

  // SSH Console state
  const [sshConsoleOpen, setSshConsoleOpen] = useState(false);

  // Resize state
  const [resizeCores, setResizeCores] = useState(1);
  const [resizeRamGb, setResizeRamGb] = useState(1);
  const [resizeDiskGb, setResizeDiskGb] = useState(10);
  const [resizeLoading, setResizeLoading] = useState(false);

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsData | null>(null);
  const [featureFlagsLoading, setFeatureFlagsLoading] = useState(false);
  const [quota, setQuota] = useState<{
    max_vms: number | null; used_vms: number;
    max_disk_gb: number | null; used_disk_gb: number;
    max_ram_gb: number | null; used_ram_gb: number;
    max_cpu_cores: number | null; used_cpu_cores: number;
  } | null>(null);

  const fetchVMDetail = async () => {
    try {
      const response = await apiClient.get(`/vms/${id}`);
      setVm(response.data);
      vmRef.current = response.data;
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Không thể tải thông tin VM', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchVMResources = async () => {
    if (!vm || vm.status !== 'running') return;
    try {
      const response = await apiClient.get(`/vms/${id}/resources`);
      setResources(response.data);
    } catch (error) {
      console.error('Error fetching resources:', error);
    }
  };

  useEffect(() => {
    fetchVMDetail();
    const interval = setInterval(() => {
      if (vmRef.current && ['creating', 'installing'].includes(vmRef.current.status)) {
        fetchVMDetail();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (vm && vm.status === 'running') {
      fetchVMResources();
      const resourceInterval = setInterval(() => { fetchVMResources(); }, 15000);
      return () => clearInterval(resourceInterval);
    }
  }, [vm?.status]);

  const handleVMAction = async (action: 'start' | 'stop' | 'restart') => {
    setActionLoading(true);
    try {
      await apiClient.post(`/vms/${id}/${action}`);
      setSnackbar({
        open: true,
        message: `VM ${action === 'start' ? 'đã khởi động' : action === 'stop' ? 'đã dừng' : 'đã khởi động lại'} thành công`,
        severity: 'success',
      });
      await fetchVMDetail();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Có lỗi xảy ra', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteVM = async () => {
    setActionLoading(true);
    try {
      await apiClient.delete(`/vms/${id}`, { params: { retain_ip: retainIp } });
      setSnackbar({ open: true, message: 'VM đã được xóa thành công', severity: 'success' });
      setTimeout(() => navigate('/vms'), 1500);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Có lỗi xảy ra', severity: 'error' });
      setActionLoading(false);
    }
  };

  const handleCloneVM = async () => {
    if (!cloneName.trim()) return;
    setCloneLoading(true);
    try {
      const response = await apiClient.post(`/vms/${id}/clone`, { name: cloneName.trim() });
      setSnackbar({ open: true, message: 'Đã tạo bản sao VM thành công', severity: 'success' });
      setCloneDialog(false);
      setCloneName('');
      setTimeout(() => navigate(`/vms/${response.data.id}`), 1500);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Không thể nhân bản VM', severity: 'error' });
    } finally {
      setCloneLoading(false);
    }
  };

  const fetchQuota = async () => {
    try {
      const response = await apiClient.get('/auth/quota');
      setQuota(response.data);
    } catch (error) {
      console.error('Error fetching quota:', error);
    }
  };

  // Initialize resize values when VM loads and fetch quota on resize tab
  useEffect(() => {
    if (vm) {
      setResizeCores(vm.cores);
      setResizeRamGb(Math.round(vm.memory_mb / 1024));
      setResizeDiskGb(vm.disk_gb);
    }
  }, [vm?.id, vm?.cores, vm?.memory_mb, vm?.disk_gb]);

  useEffect(() => {
    if (tabIndex === 5) {
      fetchQuota();
    }
    if (tabIndex === 6 && vm) {
      fetchFeatureFlags();
    }
  }, [tabIndex, vm?.id]);

  const fetchFeatureFlags = async () => {
    if (!vm) return;
    setFeatureFlagsLoading(true);
    try {
      const response = await apiClient.get(`/vms/${vm.id}/feature-flags`);
      setFeatureFlags(response.data);
    } catch (error: any) {
      setSnackbar({ open: true, message: 'Không thể tải feature flags', severity: 'error' });
    } finally {
      setFeatureFlagsLoading(false);
    }
  };

  const handleUpdateFeatureFlag = async (key: string, value: boolean) => {
    if (!vm) return;
    try {
      const response = await apiClient.put(`/vms/${vm.id}/feature-flags`, { [key]: value });
      setFeatureFlags(response.data);
      setSnackbar({ open: true, message: 'Đã cập nhật feature flag', severity: 'success' });
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Lỗi cập nhật', severity: 'error' });
    }
  };

  const handleResetFeatureFlag = async (key: string) => {
    if (!vm) return;
    try {
      await apiClient.delete(`/vms/${vm.id}/feature-flags/${key}`);
      await fetchFeatureFlags();
      setSnackbar({ open: true, message: 'Đã reset về kế thừa', severity: 'success' });
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Lỗi reset', severity: 'error' });
    }
  };

  const handleResize = async () => {
    if (!vm) return;
    setResizeLoading(true);
    try {
      const payload: Record<string, number> = {};
      if (resizeCores !== vm.cores) payload.cores = resizeCores;
      if (resizeRamGb * 1024 !== vm.memory_mb) payload.memory_mb = resizeRamGb * 1024;
      if (resizeDiskGb !== vm.disk_gb) payload.disk_gb = resizeDiskGb;

      if (Object.keys(payload).length === 0) {
        setSnackbar({ open: true, message: 'Không có thay đổi nào', severity: 'error' });
        setResizeLoading(false);
        return;
      }

      await apiClient.put(`/vms/${vm.id}/resize`, payload);
      setSnackbar({ open: true, message: 'Đã thay đổi cấu hình VM thành công', severity: 'success' });
      await fetchVMDetail();
      fetchQuota();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Lỗi khi thay đổi cấu hình', severity: 'error' });
    } finally {
      setResizeLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!vm) return;
    if (newPassword.length < 6) {
      setSnackbar({ open: true, message: 'Mật khẩu phải có ít nhất 6 ký tự', severity: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSnackbar({ open: true, message: 'Mật khẩu xác nhận không khớp', severity: 'error' });
      return;
    }

    setResetPasswordLoading(true);
    try {
      await apiClient.post(`/vms/${vm.id}/reset-password`, { new_password: newPassword });
      setSnackbar({ open: true, message: 'Đã đổi mật khẩu root thành công', severity: 'success' });
      setNewPassword('');
      setConfirmPassword('');
      await fetchVMDetail();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Lỗi khi đổi mật khẩu', severity: 'error' });
    } finally {
      setResetPasswordLoading(false);
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4">Chi Tiết Máy Ảo</Typography>
        <Typography sx={{ mt: 2 }}>Đang tải...</Typography>
      </Box>
    );
  }

  if (!vm) {
    return (
      <Box>
        <Typography variant="h4">Không tìm thấy VM</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/vms')}>Quay lại danh sách</Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/vms')} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">Chi Tiết Máy Ảo</Typography>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">{vm.name}</Typography>
            <VMStatusChip status={vm.status} />
          </Box>
          <Typography variant="body2" color="text.secondary">VMID: {vm.vmid}</Typography>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} variant="scrollable" scrollButtons="auto">
          <Tab label="Thông tin" />
          <Tab label="Tài nguyên" />
          <Tab label="Mạng & Firewall" />
          <Tab label="Console" />
          <Tab label="Điều khiển" />
          <Tab label="Nâng cấp" />
          <Tab label="Feature Flags" />
        </Tabs>
      </Paper>

      {/* Tab 0: Info */}
      {tabIndex === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Thông tin chung</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Tên</Typography>
                  <Typography variant="body1">{vm.name}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Hệ điều hành</Typography>
                  <Typography variant="body1">{vm.os_type}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">CPU</Typography>
                  <Typography variant="body1">{vm.cores} cores</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">RAM</Typography>
                  <Typography variant="body1">{Math.round(vm.memory_mb / 1024)} GB</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Disk</Typography>
                  <Typography variant="body1">{vm.disk_gb} GB</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Ngày tạo</Typography>
                  <Typography variant="body1">{new Date(vm.created_at).toLocaleString('vi-VN')}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Cập nhật lần cuối</Typography>
                  <Typography variant="body1">{new Date(vm.updated_at).toLocaleString('vi-VN')}</Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Thông tin kết nối</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">IP Address</Typography>
                  <Typography variant="body1">{vm.ip_address || 'Chưa có'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">SSH Domain</Typography>
                  <Typography variant="body1">{vm.ssh_domain || 'Chưa có'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Web Domain</Typography>
                  {vm.web_domain ? (
                    <Typography
                      variant="body1"
                      component="a"
                      href={`https://${vm.web_domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                      {vm.web_domain}
                    </Typography>
                  ) : (
                    <Typography variant="body1">Chưa có</Typography>
                  )}
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">SSH Username</Typography>
                  <Typography variant="body1">{vm.ssh_username || 'Chưa có'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">SSH Password</Typography>
                  <TextField
                    type={showPassword ? 'text' : 'password'}
                    value={vm.ssh_password || 'Chưa có'}
                    InputProps={{
                      readOnly: true,
                      endAdornment: vm.ssh_password ? (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ) : null,
                    }}
                    size="small"
                    fullWidth
                  />
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Proxmox Node</Typography>
                  <Typography variant="body1">{vm.proxmox_node}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Storage</Typography>
                  <Typography variant="body1">{vm.storage}</Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Đổi mật khẩu root</Typography>
              <Divider sx={{ mb: 2 }} />
              {vm.status !== 'running' ? (
                <Alert severity="info">VM phải đang chạy để đổi mật khẩu.</Alert>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Mật khẩu mới"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowNewPassword(!showNewPassword)} edge="end" size="small">
                            {showNewPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    label="Xác nhận mật khẩu"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" size="small">
                            {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleResetPassword}
                    disabled={resetPasswordLoading || !newPassword || !confirmPassword}
                  >
                    {resetPasswordLoading ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu root'}
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Lưu ý: QEMU Guest Agent phải được cài đặt và đang chạy trong VM
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Tab 1: Resources */}
      {tabIndex === 1 && (
        <Grid container spacing={3}>
          {vm.status === 'running' && resources ? (
            <>
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>Tài nguyên hiện tại</Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2">CPU</Typography>
                        <Typography variant="body2" fontWeight="bold">{resources.cpu_percent}%</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(resources.cpu_percent, 100)}
                        color={resources.cpu_percent > 80 ? 'error' : resources.cpu_percent > 60 ? 'warning' : 'primary'}
                      />
                    </Box>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2">RAM</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {resources.memory_used_mb.toFixed(0)} MB / {resources.memory_total_mb.toFixed(0)} MB
                          ({((resources.memory_used_mb / resources.memory_total_mb) * 100).toFixed(1)}%)
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={(resources.memory_used_mb / resources.memory_total_mb) * 100}
                        color={(resources.memory_used_mb / resources.memory_total_mb) > 0.8 ? 'error' : (resources.memory_used_mb / resources.memory_total_mb) > 0.6 ? 'warning' : 'primary'}
                      />
                    </Box>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2">Disk</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {resources.disk_used_gb.toFixed(2)} GB / {resources.disk_total_gb.toFixed(2)} GB
                          ({((resources.disk_used_gb / resources.disk_total_gb) * 100).toFixed(1)}%)
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={(resources.disk_used_gb / resources.disk_total_gb) * 100}
                        color={(resources.disk_used_gb / resources.disk_total_gb) > 0.8 ? 'error' : (resources.disk_used_gb / resources.disk_total_gb) > 0.6 ? 'warning' : 'primary'}
                      />
                    </Box>
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12}>
                <VmResourceCharts vmId={vm.id} />
              </Grid>
            </>
          ) : (
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Alert severity="info">VM phải đang chạy để xem tài nguyên.</Alert>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}

      {/* Tab 2: Network & Firewall */}
      {tabIndex === 2 && (
        <VmNetworkPanel vmId={vm.id} vmStatus={vm.status} />
      )}

      {/* Tab 3: Console */}
      {tabIndex === 3 && (
        <VMConsoleViewer
          vmId={vm.id}
          vmStatus={vm.status}
          proxmoxNode={vm.proxmox_node}
          onOpenSSHConsole={() => setSshConsoleOpen(true)}
          sshDomain={vm.ssh_domain}
          sshUsername={vm.ssh_username}
          sshPassword={vm.ssh_password}
        />
      )}

      {/* Tab 4: Controls */}
      {tabIndex === 4 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Điều khiển</Typography>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained" color="success" startIcon={<PlayArrowIcon />}
              disabled={vm.status !== 'stopped' || actionLoading}
              onClick={() => handleVMAction('start')}
            >
              Khởi động
            </Button>
            <Button
              variant="contained" color="error" startIcon={<StopIcon />}
              disabled={vm.status !== 'running' || actionLoading}
              onClick={() => handleVMAction('stop')}
            >
              Dừng
            </Button>
            <Button
              variant="contained" color="primary" startIcon={<RefreshIcon />}
              disabled={vm.status !== 'running' || actionLoading}
              onClick={() => handleVMAction('restart')}
            >
              Khởi động lại
            </Button>
            <Button
              variant="outlined" color="info" startIcon={<TerminalIcon />}
              disabled={vm.status !== 'running'}
              onClick={() => setSshConsoleOpen(true)}
            >
              SSH Console
            </Button>
            <Button
              variant="outlined" color="primary" startIcon={<CloneIcon />}
              disabled={actionLoading}
              onClick={() => { setCloneName(`${vm.name}-clone`); setCloneDialog(true); }}
            >
              Nhân bản
            </Button>
            <Button
              variant="contained" color="error" startIcon={<DeleteIcon />}
              disabled={actionLoading}
              onClick={() => setDeleteDialog(true)}
            >
              Xóa VM
            </Button>
          </Box>
        </Paper>
      )}

      {/* Tab 5: Resize */}
      {tabIndex === 5 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Thay đổi cấu hình</Typography>
          <Divider sx={{ mb: 2 }} />

          {vm.status !== 'stopped' ? (
            <Alert severity="warning">VM phải ở trạng thái đã dừng để thay đổi cấu hình. Vui lòng tắt VM trước.</Alert>
          ) : (
            <>
              {quota && (
                <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
                  <Chip
                    label={`CPU: ${quota.used_cpu_cores}${quota.max_cpu_cores !== null ? `/${quota.max_cpu_cores}` : ''} cores${quota.max_cpu_cores === null ? ' (Không giới hạn)' : ''}`}
                    size="small"
                    color={quota.max_cpu_cores !== null && quota.used_cpu_cores >= quota.max_cpu_cores ? 'error' : 'default'}
                  />
                  <Chip
                    label={`RAM: ${quota.used_ram_gb.toFixed(2)}${quota.max_ram_gb !== null ? `/${quota.max_ram_gb}` : ''} GB${quota.max_ram_gb === null ? ' (Không giới hạn)' : ''}`}
                    size="small"
                    color={quota.max_ram_gb !== null && quota.used_ram_gb >= quota.max_ram_gb ? 'error' : 'default'}
                  />
                  <Chip
                    label={`Disk: ${quota.used_disk_gb}${quota.max_disk_gb !== null ? `/${quota.max_disk_gb}` : ''} GB${quota.max_disk_gb === null ? ' (Không giới hạn)' : ''}`}
                    size="small"
                    color={quota.max_disk_gb !== null && quota.used_disk_gb >= quota.max_disk_gb ? 'error' : 'default'}
                  />
                </Stack>
              )}

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  CPU (Cores): {resizeCores} {resizeCores !== vm.cores && <Chip label={`hiện tại: ${vm.cores}`} size="small" sx={{ ml: 1 }} />}
                </Typography>
                <Slider
                  value={resizeCores}
                  onChange={(_, value) => setResizeCores(value as number)}
                  min={1}
                  max={16}
                  step={1}
                  marks
                  valueLabelDisplay="auto"
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  RAM (GB): {resizeRamGb} {resizeRamGb !== Math.round(vm.memory_mb / 1024) && <Chip label={`hiện tại: ${Math.round(vm.memory_mb / 1024)} GB`} size="small" sx={{ ml: 1 }} />}
                </Typography>
                <Slider
                  value={resizeRamGb}
                  onChange={(_, value) => setResizeRamGb(value as number)}
                  min={1}
                  max={64}
                  step={1}
                  marks={[
                    { value: 1, label: '1GB' },
                    { value: 16, label: '16GB' },
                    { value: 32, label: '32GB' },
                    { value: 64, label: '64GB' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  type="number"
                  label={`Ổ cứng (GB) — Hiện tại: ${vm.disk_gb} GB (chỉ tăng)`}
                  value={resizeDiskGb}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || vm.disk_gb;
                    setResizeDiskGb(Math.max(val, vm.disk_gb));
                  }}
                  inputProps={{ min: vm.disk_gb, max: 1000 }}
                  helperText="Không thể giảm dung lượng ổ cứng (giới hạn Proxmox)"
                />
              </Box>

              <Button
                variant="contained"
                color="primary"
                onClick={handleResize}
                disabled={resizeLoading || (resizeCores === vm.cores && resizeRamGb === Math.round(vm.memory_mb / 1024) && resizeDiskGb === vm.disk_gb)}
                fullWidth
                size="large"
              >
                {resizeLoading ? 'Đang thay đổi...' : 'Áp dụng thay đổi'}
              </Button>
            </>
          )}
        </Paper>
      )}

      {/* Tab 6: Feature Flags */}
      {tabIndex === 6 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Feature Flags</Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Các tính năng có thể bật/tắt cho VM này. Nếu không ghi đè, sẽ kế thừa từ cấp user hoặc global.
          </Typography>

          {featureFlagsLoading ? (
            <LinearProgress />
          ) : featureFlags ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { key: 'cloudflare_tunnel_enabled', label: 'Cloudflare Tunnel', desc: 'Cho phép tạo SSH subdomain qua CF Tunnel' },
                { key: 'public_ip_enabled', label: 'IP Public', desc: 'Cho phép sử dụng mạng IP public' },
                { key: 'email_notifications_enabled', label: 'Thông báo Email', desc: 'Gửi thông báo qua email' },
                { key: 'telegram_notifications_enabled', label: 'Thông báo Telegram', desc: 'Gửi thông báo qua Telegram' },
              ].map((feature) => (
                <Box
                  key={feature.key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Box>
                    <Typography variant="body1">{feature.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{feature.desc}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={featureFlags.sources[feature.key] === 'vm' ? 'VM' :
                             featureFlags.sources[feature.key] === 'user' ? 'User' :
                             featureFlags.sources[feature.key] === 'global' ? 'Global' : 'Default'}
                      size="small"
                      color={featureFlags.sources[feature.key] === 'vm' ? 'primary' : 'default'}
                      variant={featureFlags.sources[feature.key] === 'vm' ? 'filled' : 'outlined'}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={featureFlags.flags[feature.key]}
                          onChange={(e) => handleUpdateFeatureFlag(feature.key, e.target.checked)}
                        />
                      }
                      label={featureFlags.flags[feature.key] ? 'Bật' : 'Tắt'}
                      sx={{ ml: 1 }}
                    />
                    {featureFlags.sources[feature.key] === 'vm' && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => handleResetFeatureFlag(feature.key)}
                      >
                        Reset
                      </Button>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Alert severity="info">Không thể tải feature flags</Alert>
          )}
        </Paper>
      )}

      {/* Clone Dialog */}
      <Dialog open={cloneDialog} onClose={() => setCloneDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nhân bản VM</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Nhập tên cho bản sao VM mới. VM sẽ được tạo với cùng cấu hình ({vm.cores} CPU, {Math.round(vm.memory_mb / 1024)} GB RAM, {vm.disk_gb} GB Disk).
          </DialogContentText>
          <TextField
            autoFocus margin="dense" label="Tên VM mới" fullWidth
            value={cloneName} onChange={(e) => setCloneName(e.target.value)}
            disabled={cloneLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloneDialog(false)}>Hủy</Button>
          <Button onClick={handleCloneVM} variant="contained" disabled={!cloneName.trim() || cloneLoading}>
            {cloneLoading ? 'Đang nhân bản...' : 'Nhân bản'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Xác nhận xóa VM</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc chắn muốn xóa VM "{vm.name}"? Hành động này không thể hoàn tác.
          </DialogContentText>
          {vm.ip_address && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={retainIp}
                  onChange={(e) => setRetainIp(e.target.checked)}
                />
              }
              label={`Giữ lại IP ${vm.ip_address} trong pool của tôi`}
              sx={{ mt: 2 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialog(false); setRetainIp(false); }} disabled={actionLoading}>Hủy</Button>
          <Button onClick={handleDeleteVM} color="error" variant="contained" disabled={actionLoading}>
            {actionLoading ? 'Đang xóa...' : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* SSH Console Modal */}
      <VMSSHConsoleModal
        open={sshConsoleOpen}
        onClose={() => setSshConsoleOpen(false)}
        vmId={vm.id}
        vmName={vm.name}
        vmIpAddress={vm.ip_address}
      />

      <Snackbar
        open={snackbar.open} autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
