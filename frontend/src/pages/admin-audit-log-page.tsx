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
  Chip,
  TablePagination,
} from '@mui/material';
import apiClient from '../services/api-client';

interface AuditLog {
  id: number;
  admin_username: string;
  action: string;
  target_type: string;
  target_id: number | null;
  details: string | null;
  created_at: string;
}

const getActionColor = (action: string) => {
  if (action.includes('create')) return 'success';
  if (action.includes('delete')) return 'error';
  if (action.includes('toggle') || action.includes('start') || action.includes('stop')) return 'warning';
  return 'default';
};

const getActionLabel = (action: string) => {
  const labels: { [key: string]: string } = {
    create_user: 'Tạo người dùng',
    delete_user: 'Xóa người dùng',
    toggle_admin: 'Thay đổi quyền admin',
    start_vm: 'Khởi động VM',
    stop_vm: 'Dừng VM',
    delete_vm: 'Xóa VM',
  };
  return labels[action] || action;
};

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchLogs = async () => {
    try {
      const response = await apiClient.get('/admin/audit-logs');
      setLogs(response.data);
    } catch {
      setError('Không thể tải nhật ký hoạt động');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const paginatedLogs = logs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4">Nhật Ký Hoạt Động</Typography>
        <Typography sx={{ mt: 2 }}>Đang tải...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Nhật Ký Hoạt Động
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ mt: 2, overflowX: 'auto' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>ID</TableCell>
              <TableCell>Admin</TableCell>
              <TableCell>Hành động</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Loại đối tượng</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>ID đối tượng</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Chi tiết</TableCell>
              <TableCell>Thời gian</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedLogs.map((log) => (
              <TableRow key={log.id} hover>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{log.id}</TableCell>
                <TableCell>{log.admin_username}</TableCell>
                <TableCell>
                  <Chip
                    label={getActionLabel(log.action)}
                    color={getActionColor(log.action)}
                    size="small"
                  />
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{log.target_type}</TableCell>
                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{log.target_id || '-'}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{log.details || '-'}</TableCell>
                <TableCell>
                  {new Date(log.created_at).toLocaleString('vi-VN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  Chưa có hoạt động nào được ghi lại.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={logs.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Số hàng mỗi trang:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} của ${count}`}
        />
      </TableContainer>
    </Box>
  );
}
