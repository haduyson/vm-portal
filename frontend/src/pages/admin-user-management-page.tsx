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
  Switch,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Alert,
  Chip,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import apiClient from '../services/api-client';

interface AdminUser {
  id: number;
  username: string;
  is_admin: boolean;
  telegram_chat_id: string | null;
  created_at: string;
  vm_count: number;
}

export default function AdminUserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const fetchUsers = async () => {
    try {
      const response = await apiClient.get('/admin/users');
      setUsers(response.data);
    } catch {
      setError('Không thể tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleAdmin = async (user: AdminUser) => {
    try {
      setError('');
      await apiClient.patch(`/admin/users/${user.id}`, {
        is_admin: !user.is_admin,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, is_admin: !u.is_admin } : u
        )
      );
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 'Không thể cập nhật quyền quản trị'
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setError('');
      await apiClient.delete(`/admin/users/${deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể xóa người dùng');
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4">Quản Lý Người Dùng</Typography>
        <Typography sx={{ mt: 2 }}>Đang tải...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Quản Lý Người Dùng
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Tên đăng nhập</TableCell>
              <TableCell>Quyền Admin</TableCell>
              <TableCell>Telegram</TableCell>
              <TableCell align="right">Số VM</TableCell>
              <TableCell>Ngày tạo</TableCell>
              <TableCell align="center">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>{user.id}</TableCell>
                <TableCell>
                  {user.username}
                  {user.is_admin && (
                    <Chip
                      label="Admin"
                      color="primary"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={user.is_admin}
                    onChange={() => handleToggleAdmin(user)}
                    size="small"
                  />
                </TableCell>
                <TableCell>{user.telegram_chat_id || '-'}</TableCell>
                <TableCell align="right">{user.vm_count}</TableCell>
                <TableCell>
                  {new Date(user.created_at).toLocaleDateString('vi-VN')}
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    color="error"
                    size="small"
                    onClick={() => setDeleteTarget(user)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc muốn xóa người dùng "{deleteTarget?.username}"? Tất cả
            VM của họ cũng sẽ bị xóa.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Hủy</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
