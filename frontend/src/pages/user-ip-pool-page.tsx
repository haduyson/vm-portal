import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import apiClient from '../services/api-client';

interface UserIpAddress {
  id: number;
  ip_address: string;
  subnet_mask: string;
  gateway: string | null;
  network_bridge_id: number;
  bridge_name: string | null;
  vm_id: number | null;
  vm_name: string | null;
  is_retained: boolean;
  acquired_at: string;
}

interface IpPoolSummary {
  total: number;
  available: number;
  in_use: number;
  retained: number;
}

export default function UserIpPoolPage() {
  const [ips, setIps] = useState<UserIpAddress[]>([]);
  const [summary, setSummary] = useState<IpPoolSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedIp, setSelectedIp] = useState<UserIpAddress | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ipsRes, summaryRes] = await Promise.all([
        apiClient.get('/my-ips'),
        apiClient.get('/my-ips/summary'),
      ]);
      setIps(ipsRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Error fetching IP pool:', error);
      setSnackbar({ open: true, message: 'Lỗi khi tải danh sách IP', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (ip: UserIpAddress) => {
    setSelectedIp(ip);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedIp) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/my-ips/${selectedIp.id}`);
      setSnackbar({ open: true, message: `Đã xóa IP ${selectedIp.ip_address}`, severity: 'success' });
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Lỗi khi xóa IP';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setSelectedIp(null);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">IP Pool của tôi</Typography>
        <Tooltip title="Làm mới">
          <IconButton onClick={fetchData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary Cards */}
      {summary && (
        <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Chip label={`Tổng: ${summary.total}`} color="default" />
          <Chip label={`Khả dụng: ${summary.available}`} color="success" />
          <Chip label={`Đang dùng: ${summary.in_use}`} color="primary" />
          <Chip label={`Giữ lại: ${summary.retained}`} color="warning" />
        </Stack>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : ips.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center">
              Bạn chưa có IP nào trong pool. IP sẽ được tự động thêm khi bạn tạo VM trên mạng public.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow>
                <TableCell>IP Address</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Gateway</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Bridge</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>VM</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Ngày nhận</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ips.map((ip) => (
                <TableRow key={ip.id}>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {ip.ip_address}/{ip.subnet_mask === '255.255.255.0' ? '24' : ip.subnet_mask}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    <Typography variant="body2" fontFamily="monospace">
                      {ip.gateway || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{ip.bridge_name || '-'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {ip.vm_name ? (
                      <Chip label={ip.vm_name} size="small" color="primary" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {ip.vm_id ? (
                      <Chip label="Đang dùng" size="small" color="primary" />
                    ) : ip.is_retained ? (
                      <Chip label="Giữ lại" size="small" color="warning" />
                    ) : (
                      <Chip label="Khả dụng" size="small" color="success" />
                    )}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {new Date(ip.acquired_at).toLocaleDateString('vi-VN')}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={ip.vm_id ? 'Không thể xóa IP đang dùng' : 'Xóa IP'}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteClick(ip)}
                          disabled={ip.vm_id !== null}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Xác nhận xóa IP</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc muốn xóa IP <strong>{selectedIp?.ip_address}</strong> khỏi pool?
            <br />
            IP sẽ được trả về DHCP pool và có thể được cấp cho người khác.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Hủy
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={deleting}>
            {deleting ? 'Đang xóa...' : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
