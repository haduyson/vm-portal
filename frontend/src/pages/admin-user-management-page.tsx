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
  TextField,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
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
  const [createDialog, setCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    telegram_chat_id: '',
    is_admin: false,
  });

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

  const handleCreateUser = async () => {
    try {
      setError('');
      const payload: any = {
        username: newUser.username,
        password: newUser.password,
        is_admin: newUser.is_admin,
      };
      if (newUser.telegram_chat_id) {
        payload.telegram_chat_id = newUser.telegram_chat_id;
      }
      const response = await apiClient.post('/admin/users', payload);
      setUsers((prev) => [response.data, ...prev]);
      setCreateDialog(false);
      setNewUser({ username: '', password: '', telegram_chat_id: '', is_admin: false });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể tạo người dùng');
    }
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          Quản Lý Người Dùng
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialog(true)}
        >
          Thêm người dùng
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <TextField
        label="Tìm kiếm theo tên đăng nhập"
        variant="outlined"
        size="small"
        fullWidth
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ mb: 2 }}
      />

      <TableContainer component={Paper}>
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
            {filteredUsers.map((user) => (
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

      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tạo người dùng mới</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Tên đăng nhập"
            type="text"
            fullWidth
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Mật khẩu"
            type="password"
            fullWidth
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            helperText="Tối thiểu 8 ký tự, có chữ hoa, chữ thường và số"
          />
          <TextField
            margin="dense"
            label="Telegram Chat ID (tùy chọn)"
            type="text"
            fullWidth
            value={newUser.telegram_chat_id}
            onChange={(e) => setNewUser({ ...newUser, telegram_chat_id: e.target.value })}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={newUser.is_admin}
                onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
              />
            }
            label="Quyền quản trị"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)}>Hủy</Button>
          <Button
            onClick={handleCreateUser}
            variant="contained"
            disabled={!newUser.username || !newUser.password}
          >
            Tạo
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
