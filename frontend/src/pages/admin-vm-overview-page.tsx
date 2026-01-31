import { useEffect, useState, useRef, Fragment } from 'react';
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
  Collapse,
  Grid,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  ContentCopy as ContentCopyIcon,
  Language as LanguageIcon,
  Computer as ComputerIcon,
  Storage as StorageIcon,
  SwapHoriz as TransferIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';

interface AdminVM {
  id: number;
  user_id: number;
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
  web_domain: string | null;
  ssh_username: string | null;
  ssh_password: string | null;
  proxmox_node: string;
  storage: string;
  created_at: string;
  updated_at: string;
}

interface AdminUser {
  id: number;
  username: string;
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
  const [transferDialog, setTransferDialog] = useState<{ open: boolean; vm: AdminVM | null }>({ open: false, vm: null });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const vmsRef = useRef<AdminVM[]>([]);

  const toggleRowExpand = (vmId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vmId)) {
        newSet.delete(vmId);
      } else {
        newSet.add(vmId);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar({ open: true, message: `Đã sao chép ${label}`, severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Không thể sao chép', severity: 'error' });
    }
  };

  const fetchData = async () => {
    try {
      const [vmsRes, statsRes, usersRes] = await Promise.all([
        apiClient.get('/admin/vms'),
        apiClient.get('/admin/stats'),
        apiClient.get('/admin/users'),
      ]);
      setVms(vmsRes.data);
      vmsRef.current = vmsRes.data;
      setStats(statsRes.data);
      setUsers(usersRes.data.map((u: any) => ({ id: u.id, username: u.username })));
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

  const handleTransferVM = async () => {
    if (!transferDialog.vm || !selectedUserId) return;
    setActionLoading(transferDialog.vm.id);
    try {
      await apiClient.post(`/admin/vms/${transferDialog.vm.id}/transfer`, { new_user_id: selectedUserId });
      const newOwner = users.find(u => u.id === selectedUserId);
      setSnackbar({ open: true, message: `VM đã chuyển cho ${newOwner?.username || 'người dùng mới'}`, severity: 'success' });
      setTransferDialog({ open: false, vm: null });
      setSelectedUserId('');
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
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 2 }}>
        <Typography variant="h4">
          Tất Cả Máy Ảo
        </Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExportCSV}
          size="small"
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
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Tổng người dùng
                </Typography>
                <Typography variant="h5">{stats.total_users}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Tổng VM
                </Typography>
                <Typography variant="h5">{stats.total_vms}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Đang chạy
                </Typography>
                <Typography variant="h5" color="success.main">
                  {stats.running_vms}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Đang tạo
                </Typography>
                <Typography variant="h5" color="warning.main">
                  {stats.creating_vms}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
        <TextField
          label="Tìm kiếm theo tên VM, người dùng hoặc IP"
          variant="outlined"
          size="small"
          fullWidth
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
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

      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>VMID</TableCell>
              <TableCell>Tên VM</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Người dùng</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>CPU</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>RAM</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Disk</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>IP</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Ngày tạo</TableCell>
              <TableCell align="center">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedVMs.map((vm) => (
              <Fragment key={vm.id}>
                <TableRow
                  hover
                  sx={{
                    '& > *': { borderBottom: expandedRows.has(vm.id) ? 'unset' : undefined },
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleRowExpand(vm.id)}
                >
                  <TableCell padding="checkbox">
                    <IconButton size="small">
                      {expandedRows.has(vm.id) ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{vm.vmid}</TableCell>
                  <TableCell>{vm.name}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{vm.username}</TableCell>
                  <TableCell>
                    <VMStatusChip status={vm.status} />
                  </TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>{vm.cores} cores</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {Math.round(vm.memory_mb / 1024)} GB
                  </TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{vm.disk_gb} GB</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{vm.ip_address || '-'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {new Date(vm.created_at).toLocaleDateString('vi-VN')}
                  </TableCell>
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
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
                      <Tooltip title="Chuyển chủ sở hữu">
                        <span>
                          <IconButton
                            color="primary"
                            size="small"
                            disabled={actionLoading === vm.id}
                            onClick={() => { setTransferDialog({ open: true, vm }); setSelectedUserId(''); }}
                          >
                            <TransferIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={11} sx={{ py: 0, bgcolor: 'action.hover' }}>
                    <Collapse in={expandedRows.has(vm.id)} timeout="auto" unmountOnExit>
                      <Box sx={{ py: 2, px: 3 }}>
                        <Grid container spacing={3}>
                          {/* Domains */}
                          <Grid item xs={12} md={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <LanguageIcon fontSize="small" color="primary" />
                              <Typography variant="subtitle2" color="text.secondary">
                                Domains
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" sx={{ minWidth: 40 }}>SSH:</Typography>
                                {vm.ssh_domain ? (
                                  <>
                                    <Chip label={vm.ssh_domain} size="small" color="primary" variant="outlined" />
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); copyToClipboard(vm.ssh_domain!, 'SSH domain'); }}>
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </>
                                ) : <Typography variant="body2" color="text.disabled">-</Typography>}
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" sx={{ minWidth: 40 }}>Web:</Typography>
                                {vm.web_domain ? (
                                  <>
                                    <Chip label={vm.web_domain} size="small" color="success" variant="outlined" component="a" href={`https://${vm.web_domain}`} target="_blank" clickable />
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); copyToClipboard(vm.web_domain!, 'Web domain'); }}>
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </>
                                ) : <Typography variant="body2" color="text.disabled">-</Typography>}
                              </Box>
                            </Box>
                          </Grid>

                          {/* SSH Credentials */}
                          <Grid item xs={12} md={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <ComputerIcon fontSize="small" color="primary" />
                              <Typography variant="subtitle2" color="text.secondary">
                                Thông tin SSH
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">
                                  User: <strong>{vm.ssh_username || '-'}</strong>
                                </Typography>
                                {vm.ssh_username && (
                                  <Tooltip title="Sao chép">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => { e.stopPropagation(); copyToClipboard(vm.ssh_username!, 'username'); }}
                                    >
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">
                                  Pass: <strong>{vm.ssh_password ? '••••••••' : '-'}</strong>
                                </Typography>
                                {vm.ssh_password && (
                                  <Tooltip title="Sao chép mật khẩu">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => { e.stopPropagation(); copyToClipboard(vm.ssh_password!, 'mật khẩu'); }}
                                    >
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </Box>
                          </Grid>

                          {/* Infrastructure Info */}
                          <Grid item xs={12} md={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <StorageIcon fontSize="small" color="primary" />
                              <Typography variant="subtitle2" color="text.secondary">
                                Hạ tầng
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Typography variant="body2">
                                OS: <strong>{vm.os_type}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Node: <strong>{vm.proxmox_node}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Storage: <strong>{vm.storage}</strong>
                              </Typography>
                            </Box>
                          </Grid>
                        </Grid>

                        {/* Timestamps */}
                        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary">
                            Tạo: {new Date(vm.created_at).toLocaleString('vi-VN')} |
                            Cập nhật: {new Date(vm.updated_at).toLocaleString('vi-VN')}
                          </Typography>
                        </Box>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
            {filteredVMs.length === 0 && vms.length > 0 && (
              <TableRow>
                <TableCell colSpan={11} align="center">
                  Không tìm thấy VM nào phù hợp.
                </TableCell>
              </TableRow>
            )}
            {vms.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} align="center">
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

      <Dialog open={deleteDialog.open} onClose={() => !actionLoading && setDeleteDialog({ open: false, vmId: null, vmName: '' })}>
        <DialogTitle>Xác nhận xóa VM</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc chắn muốn xóa VM "{deleteDialog.vmName}"? Hành động này không thể hoàn tác.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, vmId: null, vmName: '' })} disabled={!!actionLoading}>Hủy</Button>
          <Button onClick={handleDeleteVM} color="error" variant="contained" disabled={!!actionLoading}>
            {actionLoading === deleteDialog.vmId ? <><CircularProgress size={16} color="inherit" sx={{ mr: 1 }} /> Đang xóa...</> : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={transferDialog.open} onClose={() => setTransferDialog({ open: false, vm: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Chuyển VM cho người dùng khác</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Chuyển VM "{transferDialog.vm?.name}" (hiện tại thuộc về <strong>{transferDialog.vm?.username}</strong>) cho người dùng khác.
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Chọn người dùng mới</InputLabel>
            <Select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value as number)}
              label="Chọn người dùng mới"
            >
              {users
                .filter(u => u.id !== transferDialog.vm?.user_id)
                .map(u => (
                  <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
                ))
              }
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferDialog({ open: false, vm: null })}>Hủy</Button>
          <Button onClick={handleTransferVM} color="primary" variant="contained" disabled={!selectedUserId}>
            Chuyển
          </Button>
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
