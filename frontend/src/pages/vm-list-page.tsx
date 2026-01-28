import { useEffect, useState, useRef } from 'react';
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
  Button,
  IconButton,
  Tooltip,
  Alert,
  Snackbar,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Card,
  CardContent,
  CardActions,
  Stack,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AddCircle as AddCircleIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';

interface VM {
  id: number;
  name: string;
  status: string;
  cores: number;
  memory_mb: number;
  ip_address: string | null;
  ssh_domain: string | null;
  created_at: string;
}

export default function VMListPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; vmId: number | null; vmName: string }>({ open: false, vmId: null, vmName: '' });
  const vmsRef = useRef<VM[]>([]);

  const fetchVMs = async () => {
    try {
      const response = await apiClient.get('/vms');
      const fetchedVms = response.data.vms || [];
      setVms(fetchedVms);
      vmsRef.current = fetchedVms;
    } catch (error) {
      console.error('Error fetching VMs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVMAction = async (vmId: number, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(vmId);
    try {
      await apiClient.post(`/vms/${vmId}/${action}`);
      setSnackbar({ open: true, message: `VM ${action === 'start' ? 'đã khởi động' : action === 'stop' ? 'đã dừng' : 'đã khởi động lại'} thành công`, severity: 'success' });
      await fetchVMs();
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
      await apiClient.delete(`/vms/${deleteDialog.vmId}`);
      setSnackbar({ open: true, message: 'VM đã được xóa thành công', severity: 'success' });
      setDeleteDialog({ open: false, vmId: null, vmName: '' });
      await fetchVMs();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.detail || 'Có lỗi xảy ra', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchVMs();

    // Auto-refresh every 10 seconds if there are VMs in creating/installing status
    const interval = setInterval(() => {
      if (vmsRef.current.some(vm => ['creating', 'installing'].includes(vm.status))) {
        fetchVMs();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Box>
        <Typography variant="h4">Danh Sách Máy Ảo</Typography>
        <Typography sx={{ mt: 2 }}>Đang tải...</Typography>
      </Box>
    );
  }

  if (vms.length === 0) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Danh Sách Máy Ảo
        </Typography>
        <Paper sx={{ p: 4, mt: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" paragraph>
            Chưa có máy ảo nào. Bấm 'Tạo máy ảo mới' để bắt đầu.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddCircleIcon />}
            onClick={() => navigate('/vms/create')}
          >
            Tạo máy ảo mới
          </Button>
        </Paper>
      </Box>
    );
  }

  // Render action buttons for a VM
  const renderVMActions = (vm: VM) => (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: isMobile ? 'flex-start' : 'center' }}>
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
      <Tooltip title="Khởi động lại">
        <span>
          <IconButton
            color="primary"
            size="small"
            disabled={vm.status !== 'running' || actionLoading === vm.id}
            onClick={() => handleVMAction(vm.id, 'restart')}
          >
            <RefreshIcon />
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
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Typography variant="h4">Danh Sách Máy Ảo</Typography>
        <Button
          variant="contained"
          startIcon={<AddCircleIcon />}
          onClick={() => navigate('/vms/create')}
        >
          Tạo máy ảo
        </Button>
      </Box>

      {/* Mobile: Card view */}
      {isMobile ? (
        <Stack spacing={2}>
          {vms.map((vm) => (
            <Card key={vm.id}>
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Link
                    component="button"
                    variant="h6"
                    onClick={() => navigate(`/vms/${vm.id}`)}
                    sx={{ textAlign: 'left', cursor: 'pointer' }}
                  >
                    {vm.name}
                  </Link>
                  <VMStatusChip status={vm.status} />
                </Box>
                <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
                  <Chip label={`${vm.cores} CPU`} size="small" variant="outlined" />
                  <Chip label={`${Math.round(vm.memory_mb / 1024)} GB RAM`} size="small" variant="outlined" />
                </Stack>
                {vm.ip_address && (
                  <Typography variant="body2" color="text.secondary">
                    IP: {vm.ip_address}
                  </Typography>
                )}
                {vm.ssh_domain && (
                  <Typography variant="body2" color="text.secondary">
                    SSH: {vm.ssh_domain}
                  </Typography>
                )}
              </CardContent>
              <CardActions sx={{ pt: 0 }}>
                {renderVMActions(vm)}
              </CardActions>
            </Card>
          ))}
        </Stack>
      ) : (
        /* Desktop: Table view */
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Tên VM</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="right">CPU</TableCell>
                <TableCell align="right">RAM</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>SSH Domain</TableCell>
                <TableCell>Ngày tạo</TableCell>
                <TableCell align="center">Hành động</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vms.map((vm) => (
                <TableRow key={vm.id} hover>
                  <TableCell>
                    <Link
                      component="button"
                      variant="body1"
                      onClick={() => navigate(`/vms/${vm.id}`)}
                      sx={{ textAlign: 'left', cursor: 'pointer' }}
                    >
                      {vm.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <VMStatusChip status={vm.status} />
                  </TableCell>
                  <TableCell align="right">{vm.cores} cores</TableCell>
                  <TableCell align="right">{Math.round(vm.memory_mb / 1024)} GB</TableCell>
                  <TableCell>{vm.ip_address || '-'}</TableCell>
                  <TableCell>{vm.ssh_domain || '-'}</TableCell>
                  <TableCell>
                    {new Date(vm.created_at).toLocaleDateString('vi-VN')}
                  </TableCell>
                  <TableCell align="center">
                    {renderVMActions(vm)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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
