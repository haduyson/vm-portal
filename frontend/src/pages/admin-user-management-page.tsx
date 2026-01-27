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
  TablePagination,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon, Download as DownloadIcon } from '@mui/icons-material';
import apiClient from '../services/api-client';

interface AdminUser {
  id: number;
  username: string;
  is_admin: boolean;
  telegram_chat_id: string | null;
  created_at: string;
  vm_count: number;
  max_disk_gb: number | null;
  max_ram_mb: number | null;
  max_vms: number | null;
  max_cpu_cores: number | null;
}

export default function AdminUserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    telegram_chat_id: '',
    is_admin: false,
    max_disk_gb: 0,
    max_ram_mb: 0,
    max_vms: 0,
    max_cpu_cores: 0,
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
        max_disk_gb: newUser.max_disk_gb > 0 ? newUser.max_disk_gb : null,
        max_ram_mb: newUser.max_ram_mb > 0 ? newUser.max_ram_mb : null,
        max_vms: newUser.max_vms > 0 ? newUser.max_vms : null,
        max_cpu_cores: newUser.max_cpu_cores > 0 ? newUser.max_cpu_cores : null,
      };
      if (newUser.telegram_chat_id) {
        payload.telegram_chat_id = newUser.telegram_chat_id;
      }
      const response = await apiClient.post('/admin/users', payload);
      setUsers((prev) => [response.data, ...prev]);
      setCreateDialog(false);
      setNewUser({ username: '', password: '', telegram_chat_id: '', is_admin: false, max_disk_gb: 0, max_ram_mb: 0, max_vms: 0, max_cpu_cores: 0 });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể tạo người dùng');
    }
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedUsers = filteredUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Tên đăng nhập', 'Quyền Admin', 'Telegram', 'Số VM', 'Ngày tạo'];
    const csvData = filteredUsers.map(user => [
      user.id,
      user.username,
      user.is_admin ? 'Có' : 'Không',
      user.telegram_chat_id || '-',
      user.vm_count,
      new Date(user.created_at).toLocaleDateString('vi-VN'),
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          Quản Lý Người Dùng
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
          >
            Xuất CSV
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialog(true)}
          >
            Thêm người dùng
          </Button>
        </Box>
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
            {paginatedUsers.map((user) => (
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
        <TablePagination
          component="div"
          count={filteredUsers.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Số hàng mỗi trang:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} của ${count}`}
        />
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
          <TextField
            margin="dense"
            label="Giới hạn số VM (0 = Không giới hạn)"
            type="number"
            fullWidth
            value={newUser.max_vms}
            onChange={(e) => setNewUser({ ...newUser, max_vms: parseInt(e.target.value) || 0 })}
            inputProps={{ min: 0 }}
          />
          <TextField
            margin="dense"
            label="Giới hạn ổ cứng GB (0 = Không giới hạn)"
            type="number"
            fullWidth
            value={newUser.max_disk_gb}
            onChange={(e) => setNewUser({ ...newUser, max_disk_gb: parseInt(e.target.value) || 0 })}
            inputProps={{ min: 0 }}
          />
          <TextField
            margin="dense"
            label="Giới hạn RAM MB (0 = Không giới hạn)"
            type="number"
            fullWidth
            value={newUser.max_ram_mb}
            onChange={(e) => setNewUser({ ...newUser, max_ram_mb: parseInt(e.target.value) || 0 })}
            inputProps={{ min: 0 }}
          />
          <TextField
            margin="dense"
            label="Giới hạn CPU cores (0 = Không giới hạn)"
            type="number"
            fullWidth
            value={newUser.max_cpu_cores}
            onChange={(e) => setNewUser({ ...newUser, max_cpu_cores: parseInt(e.target.value) || 0 })}
            inputProps={{ min: 0 }}
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
