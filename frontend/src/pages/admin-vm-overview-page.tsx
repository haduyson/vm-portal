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
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  TablePagination,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const vmsRef = useRef<AdminVM[]>([]);

  const fetchData = async () => {
    try {
      const [vmsRes, statsRes] = await Promise.all([
        apiClient.get('/admin/vms'),
        apiClient.get('/admin/stats'),
      ]);
      setVms(vmsRes.data);
      vmsRef.current = vmsRes.data;
      setStats(statsRes.data);
      setError('');
    } catch {
      setError('Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const filteredVMs = vms.filter(vm => {
    const matchesSearch =
      vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vm.ip_address && vm.ip_address.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || vm.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const paginatedVMs = filteredVMs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExportCSV = () => {
    const headers = ['VMID', 'Tên VM', 'Người dùng', 'Trạng thái', 'CPU', 'RAM (GB)', 'Disk (GB)', 'IP', 'Ngày tạo'];
    const csvData = filteredVMs.map(vm => [
      vm.vmid,
      vm.name,
      vm.username,
      vm.status,
      `${vm.cores} cores`,
      Math.round(vm.memory_mb / 1024),
      vm.disk_gb,
      vm.ip_address || '-',
      new Date(vm.created_at).toLocaleDateString('vi-VN'),
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vms_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 10 seconds if there are VMs in creating/installing status
    const interval = setInterval(() => {
      if (vmsRef.current.some(vm => ['creating', 'installing'].includes(vm.status))) {
        fetchData();
      }
    }, 10000);

    return () => clearInterval(interval);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          Tất Cả Máy Ảo
        </Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExportCSV}
        >
          Xuất CSV
        </Button>
      </Box>

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

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField
          label="Tìm kiếm theo tên VM, người dùng hoặc IP"
          variant="outlined"
          size="small"
          fullWidth
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Trạng thái</InputLabel>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            label="Trạng thái"
          >
            <MenuItem value="all">Tất cả</MenuItem>
            <MenuItem value="running">Đang chạy</MenuItem>
            <MenuItem value="stopped">Đã dừng</MenuItem>
            <MenuItem value="creating">Đang tạo</MenuItem>
            <MenuItem value="installing">Đang cài đặt</MenuItem>
            <MenuItem value="error">Lỗi</MenuItem>
          </Select>
        </FormControl>
      </Box>

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
            {paginatedVMs.map((vm) => (
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
            {filteredVMs.length === 0 && vms.length > 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  Không tìm thấy VM nào phù hợp.
                </TableCell>
              </TableRow>
            )}
            {vms.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  Chưa có máy ảo nào trong hệ thống.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredVMs.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Số hàng mỗi trang:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} của ${count}`}
        />
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
