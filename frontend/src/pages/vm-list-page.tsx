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
  Collapse,
  Grid,
} from '@mui/material';
import {
  AddCircle as AddCircleIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  ContentCopy as ContentCopyIcon,
  Language as LanguageIcon,
  Computer as ComputerIcon,
  VpnKey as VpnKeyIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';

interface VM {
  id: number;
  name: string;
  status: string;
  cores: number;
  memory_gb: number;
  disk_gb: number;
  os_type: string;
  ip_address: string | null;
  tailscale_ip: string | null;
  web_domain: string | null;
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
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const vmsRef = useRef<VM[]>([]);

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
                  <Chip label={`${vm.memory_gb} GB RAM`} size="small" variant="outlined" />
                </Stack>
                {vm.ip_address && (
                  <Typography variant="body2" color="text.secondary">
                    IP: {vm.ip_address}
                  </Typography>
                )}
                {vm.tailscale_ip && (
                  <Typography variant="body2" color="text.secondary">
                    Tailscale: {vm.tailscale_ip}
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
                <TableCell padding="checkbox" />
                <TableCell>Tên VM</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="right">CPU</TableCell>
                <TableCell align="right">RAM</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Tailscale IP</TableCell>
                <TableCell>Ngày tạo</TableCell>
                <TableCell align="center">Hành động</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vms.map((vm) => (
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
                    <TableCell>
                      <Link
                        component="button"
                        variant="body1"
                        onClick={(e) => { e.stopPropagation(); navigate(`/vms/${vm.id}`); }}
                        sx={{ textAlign: 'left', cursor: 'pointer' }}
                      >
                        {vm.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <VMStatusChip status={vm.status} />
                    </TableCell>
                    <TableCell align="right">{vm.cores} cores</TableCell>
                    <TableCell align="right">{vm.memory_gb} GB</TableCell>
                    <TableCell>{vm.ip_address || '-'}</TableCell>
                    <TableCell>{vm.tailscale_ip || '-'}</TableCell>
                    <TableCell>
                      {new Date(vm.created_at).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      {renderVMActions(vm)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} sx={{ py: 0, bgcolor: 'action.hover' }}>
                      <Collapse in={expandedRows.has(vm.id)} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 3 }}>
                          <Grid container spacing={3}>
                            {/* Web Domain & Tailscale */}
                            <Grid item xs={12} md={4}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <LanguageIcon fontSize="small" color="primary" />
                                <Typography variant="subtitle2" color="text.secondary">
                                  Kết nối
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="body2" sx={{ minWidth: 80 }}>Web Domain:</Typography>
                                  {vm.web_domain ? (
                                    <>
                                      <Chip
                                        label={vm.web_domain}
                                        size="small"
                                        color="success"
                                        variant="outlined"
                                        component="a"
                                        href={`https://${vm.web_domain}`}
                                        target="_blank"
                                        clickable
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <IconButton
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); copyToClipboard(vm.web_domain!, 'Web domain'); }}
                                      >
                                        <ContentCopyIcon fontSize="small" />
                                      </IconButton>
                                    </>
                                  ) : (
                                    <Typography variant="body2" color="text.disabled">-</Typography>
                                  )}
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="body2" sx={{ minWidth: 80 }}>Tailscale:</Typography>
                                  {vm.tailscale_ip ? (
                                    <>
                                      <Chip label={vm.tailscale_ip} size="small" color="primary" variant="outlined" />
                                      <IconButton
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); copyToClipboard(vm.tailscale_ip!, 'Tailscale IP'); }}
                                      >
                                        <ContentCopyIcon fontSize="small" />
                                      </IconButton>
                                    </>
                                  ) : (
                                    <Typography variant="body2" color="text.disabled">Đang kết nối...</Typography>
                                  )}
                                </Box>
                              </Box>
                            </Grid>

                            {/* OS & System Info */}
                            <Grid item xs={12} md={4}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <ComputerIcon fontSize="small" color="primary" />
                                <Typography variant="subtitle2" color="text.secondary">
                                  Hệ thống
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2">
                                  OS: <strong>{vm.os_type}</strong>
                                </Typography>
                                <Typography variant="body2">
                                  Disk: <strong>{vm.disk_gb} GB</strong>
                                </Typography>
                              </Box>
                            </Grid>

                            {/* Quick SSH */}
                            <Grid item xs={12} md={4}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <VpnKeyIcon fontSize="small" color="primary" />
                                <Typography variant="subtitle2" color="text.secondary">
                                  Truy cập nhanh
                                </Typography>
                              </Box>
                              {vm.tailscale_ip && vm.status === 'running' ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<ContentCopyIcon />}
                                  onClick={(e) => { e.stopPropagation(); copyToClipboard(`ssh root@${vm.tailscale_ip}`, 'SSH command'); }}
                                >
                                  Copy SSH Command
                                </Button>
                              ) : (
                                <Typography variant="body2" color="text.disabled">
                                  {vm.status !== 'running' ? 'VM chưa chạy' : 'Chưa có Tailscale IP'}
                                </Typography>
                              )}
                            </Grid>
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
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
