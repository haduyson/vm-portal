import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
  Card,
  CardContent,
  Stack,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';

interface AdminVM {
  id: number;
  vmid: number;
  name: string;
  username: string;
  status: string;
  cores: number;
  memory_mb: number;
  disk_gb: number;
  os_type: string;
  ip_address: string | null;
  ssh_domain: string | null;
  created_at: string;
}

interface AdminStats {
  total_users: number;
  total_vms: number;
  running_vms: number;
  creating_vms: number;
}

export default function AdminVmOverviewPage() {
  const [vms, setVms] = useState<AdminVM[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; vmId: number | null; vmName: string }>({ open: false, vmId: null, vmName: '' });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const fetchData = async () => {
    try {
      const [vmsRes, statsRes] = await Promise.all([
        apiClient.get('/admin/vms'),
        apiClient.get('/admin/stats'),
      ]);
      setVms(vmsRes.data);
      setStats(statsRes.data);
      setError('');
    } catch {
      setError('Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleVMAction = async (vmId: number, action: 'start' | 'stop') => {
    setActionLoading(vmId);
    try {
      await apiClient.post(`/admin/vms/${vmId}/${action}`);
      setSnackbar({ open: true, message: `VM ${action === 'start' ? 'đã khởi động' : 'đã dừng'} thành công`, severity: 'success' });
      await fetchData();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Có lỗi xảy ra', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteVM = async () => {
    if (!deleteDialog.vmId) return;
    setActionLoading(deleteDialog.vmId);
    try {
      await apiClient.delete(`/admin/vms/${deleteDialog.vmId}`);
      setSnackbar({ open: true, message: 'VM đã được xóa thành công', severity: 'success' });
      setDeleteDialog({ open: false, vmId: null, vmName: '' });
      await fetchData();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Có lỗi xảy ra', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4">Tất Cả Máy Ảo</Typography>
        <Typography sx={{ mt: 2 }}>Đang tải...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tất Cả Máy Ảo
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {stats && (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Tổng người dùng
              </Typography>
              <Typography variant="h5">{stats.total_users}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Tổng VM
              </Typography>
              <Typography variant="h5">{stats.total_vms}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Đang chạy
              </Typography>
              <Typography variant="h5" color="success.main">
                {stats.running_vms}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Đang tạo
              </Typography>
              <Typography variant="h5" color="warning.main">
                {stats.creating_vms}
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>VMID</TableCell>
              <TableCell>Tên VM</TableCell>
              <TableCell>Người dùng</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="right">CPU</TableCell>
              <TableCell align="right">RAM</TableCell>
              <TableCell align="right">Disk</TableCell>
              <TableCell>IP</TableCell>
              <TableCell>Ngày tạo</TableCell>
              <TableCell align="center">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vms.map((vm) => (
              <TableRow key={vm.id} hover>
                <TableCell>{vm.vmid}</TableCell>
                <TableCell>{vm.name}</TableCell>
                <TableCell>{vm.username}</TableCell>
                <TableCell>
                  <VMStatusChip status={vm.status} />
                </TableCell>
                <TableCell align="right">{vm.cores} cores</TableCell>
                <TableCell align="right">
                  {Math.round(vm.memory_mb / 1024)} GB
                </TableCell>
                <TableCell align="right">{vm.disk_gb} GB</TableCell>
                <TableCell>{vm.ip_address || '-'}</TableCell>
                <TableCell>
                  {new Date(vm.created_at).toLocaleDateString('vi-VN')}
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Tooltip title="Khởi động">
                      <span>
                        <IconButton
                          color="success"
                          size="small"
                          disabled={vm.status !== 'stopped' || actionLoading === vm.id}
                          onClick={() => handleVMAction(vm.id, 'start')}
                        >
                          <PlayArrowIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Dừng">
                      <span>
                        <IconButton
                          color="error"
                          size="small"
                          disabled={vm.status !== 'running' || actionLoading === vm.id}
                          onClick={() => handleVMAction(vm.id, 'stop')}
                        >
                          <StopIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Xóa">
                      <span>
                        <IconButton
                          color="error"
                          size="small"
                          disabled={actionLoading === vm.id}
                          onClick={() => setDeleteDialog({ open: true, vmId: vm.id, vmName: vm.name })}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {vms.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  Chưa có máy ảo nào trong hệ thống.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, vmId: null, vmName: '' })}>
        <DialogTitle>Xác nhận xóa VM</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc chắn muốn xóa VM "{deleteDialog.vmName}"? Hành động này không thể hoàn tác.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, vmId: null, vmName: '' })}>Hủy</Button>
          <Button onClick={handleDeleteVM} color="error" variant="contained">Xóa</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
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
