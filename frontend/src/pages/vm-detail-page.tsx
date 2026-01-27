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
} from '@mui/icons-material';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';
import VmResourceCharts from '../components/vm-resource-metrics-recharts-display';
import VMConsoleViewer from '../components/vm-console-viewer';
import VmNetworkPanel from '../components/vm-network-panel';

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

  // Clone state
  const [cloneDialog, setCloneDialog] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneLoading, setCloneLoading] = useState(false);

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
      await apiClient.delete(`/vms/${id}`);
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
        <VMConsoleViewer vmId={vm.id} vmStatus={vm.status} proxmoxNode={vm.proxmox_node} />
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Hủy</Button>
          <Button onClick={handleDeleteVM} color="error" variant="contained">Xóa</Button>
        </DialogActions>
      </Dialog>

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
