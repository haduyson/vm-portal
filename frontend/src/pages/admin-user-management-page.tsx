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
  Collapse,
  LinearProgress,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Download as DownloadIcon,
  Key as KeyIcon,
  Visibility,
  VisibilityOff,
  Casino as RandomIcon,
  Edit as EditIcon,
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
} from '@mui/icons-material';
import InputAdornment from '@mui/material/InputAdornment';
import apiClient from '../services/api-client';

interface FeatureFlags {
  cloudflare_tunnel_enabled?: boolean;
  public_ip_enabled?: boolean;
  email_notifications_enabled?: boolean;
  telegram_notifications_enabled?: boolean;
}

interface AdminUser {
  id: number;
  username: string;
  is_admin: boolean;
  is_suspended: boolean;
  telegram_chat_id: string | null;
  created_at: string;
  vm_count: number;
  max_disk_gb: number | null;
  max_ram_gb: number | null;
  max_vms: number | null;
  max_cpu_cores: number | null;
  feature_flags?: FeatureFlags | null;
}

interface UserResourceUsage {
  vms_used: number;
  vms_max: number | null;
  disk_used_gb: number;
  disk_max_gb: number | null;
  ram_used_gb: number;
  ram_max_gb: number | null;
  cpu_used_cores: number;
  cpu_max_cores: number | null;
}

export default function AdminUserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState<{
    username: string;
    password: string;
    telegram_sent: boolean;
  } | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [resourceUsage, setResourceUsage] = useState<Record<number, UserResourceUsage>>({});
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    telegram_chat_id: '',
    is_admin: false,
    max_disk_gb: 0,
    max_ram_gb: 0,
    max_vms: 0,
    max_cpu_cores: 0,
  });
  const [showPassword, setShowPassword] = useState(false);

  const generatePassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const all = upper + lower + digits;
    let pwd = upper[Math.floor(Math.random() * upper.length)] +
              lower[Math.floor(Math.random() * lower.length)] +
              digits[Math.floor(Math.random() * digits.length)];
    for (let i = 0; i < 9; i++) pwd += all[Math.floor(Math.random() * all.length)];
    pwd = pwd.split('').sort(() => Math.random() - 0.5).join('');
    setNewUser({ ...newUser, password: pwd });
    setShowPassword(true);
  };

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

  const handleToggleSuspend = async (user: AdminUser) => {
    try {
      setError('');
      await apiClient.patch(`/admin/users/${user.id}`, {
        is_suspended: !user.is_suspended,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, is_suspended: !u.is_suspended } : u
        )
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể cập nhật trạng thái tài khoản');
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
        max_ram_gb: newUser.max_ram_gb > 0 ? newUser.max_ram_gb : null,
        max_vms: newUser.max_vms > 0 ? newUser.max_vms : null,
        max_cpu_cores: newUser.max_cpu_cores > 0 ? newUser.max_cpu_cores : null,
      };
      if (newUser.telegram_chat_id) {
        payload.telegram_chat_id = newUser.telegram_chat_id;
      }
      const response = await apiClient.post('/admin/users', payload);
      setUsers((prev) => [response.data, ...prev]);
      setCreateDialog(false);
      setNewUser({ username: '', password: '', telegram_chat_id: '', is_admin: false, max_disk_gb: 0, max_ram_gb: 0, max_vms: 0, max_cpu_cores: 0 });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể tạo người dùng');
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    try {
      setError('');
      const response = await apiClient.post(`/admin/users/${user.id}/reset-password`);
      setResetPasswordData({
        username: user.username,
        password: response.data.new_password,
        telegram_sent: response.data.telegram_sent,
      });
      setResetPasswordDialog(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể đặt lại mật khẩu');
    }
  };

  const handleEditUser = (user: AdminUser) => {
    setEditUser(user);
    setEditDialog(true);
  };

  const handleSaveEditUser = async () => {
    if (!editUser) return;
    try {
      setError('');
      const payload: any = {};
      if (editUser.username) payload.username = editUser.username;
      payload.is_admin = editUser.is_admin;
      payload.is_suspended = editUser.is_suspended;
      if (editUser.telegram_chat_id !== null) payload.telegram_chat_id = editUser.telegram_chat_id;
      payload.max_disk_gb = editUser.max_disk_gb || null;
      payload.max_ram_gb = editUser.max_ram_gb || null;
      payload.max_vms = editUser.max_vms || null;
      payload.max_cpu_cores = editUser.max_cpu_cores || null;
      payload.feature_flags = editUser.feature_flags || null;

      const response = await apiClient.patch(`/admin/users/${editUser.id}`, payload);
      setUsers((prev) => prev.map((u) => (u.id === editUser.id ? response.data : u)));
      setEditDialog(false);
      setEditUser(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể cập nhật người dùng');
    }
  };

  const handleFeatureFlagChange = (key: keyof FeatureFlags, value: boolean | undefined) => {
    if (!editUser) return;
    const currentFlags = editUser.feature_flags || {};
    const newFlags = { ...currentFlags };
    if (value === undefined) {
      delete newFlags[key];
    } else {
      newFlags[key] = value;
    }
    setEditUser({ ...editUser, feature_flags: Object.keys(newFlags).length > 0 ? newFlags : null });
  };

  const handleExpandRow = async (userId: number) => {
    if (expandedRow === userId) {
      setExpandedRow(null);
    } else {
      setExpandedRow(userId);
      if (!resourceUsage[userId]) {
        try {
          const response = await apiClient.get(`/admin/users/${userId}/resource-usage`);
          setResourceUsage((prev) => ({ ...prev, [userId]: response.data }));
        } catch (err) {
          console.error('Failed to fetch resource usage', err);
        }
      }
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
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 2 }}>
        <Typography variant="h4">
          Quản Lý Người Dùng
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            size="small"
          >
            Xuất CSV
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialog(true)}
            size="small"
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

      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>ID</TableCell>
              <TableCell>Tên đăng nhập</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Trạng thái</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Telegram</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Số VM</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Ngày tạo</TableCell>
              <TableCell align="center">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedUsers.map((user) => (
              <>
                <TableRow key={user.id} hover>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleExpandRow(user.id)}>
                      {expandedRow === user.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>
                    <Box>
                      {user.username}
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {user.is_admin && (
                          <Chip label="Admin" color="primary" size="small" />
                        )}
                        {user.is_suspended && (
                          <Chip label="Bị khóa" color="error" size="small" />
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    <Switch
                      checked={!user.is_suspended}
                      onChange={() => handleToggleSuspend(user)}
                      size="small"
                      color={user.is_suspended ? 'error' : 'success'}
                      title={user.is_suspended ? 'Tài khoản đang bị khóa' : 'Tài khoản đang hoạt động'}
                    />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{user.telegram_chat_id || '-'}</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{user.vm_count}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{new Date(user.created_at).toLocaleDateString('vi-VN')}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      color="info"
                      size="small"
                      onClick={() => handleEditUser(user)}
                      title="Chỉnh sửa"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="primary"
                      size="small"
                      onClick={() => handleResetPassword(user)}
                      title="Đặt lại mật khẩu"
                    >
                      <KeyIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      size="small"
                      onClick={() => setDeleteTarget(user)}
                      title="Xóa người dùng"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                    <Collapse in={expandedRow === user.id} timeout="auto" unmountOnExit>
                      <Box sx={{ margin: 2 }}>
                        <Typography variant="h6" gutterBottom>
                          Thông tin hạn mức tài nguyên
                        </Typography>
                        {resourceUsage[user.id] ? (
                          <Box sx={{ mb: 2 }}>
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="body2" color="text.secondary">
                                VMs: {resourceUsage[user.id].vms_used} / {resourceUsage[user.id].vms_max || '∞'}
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={
                                  resourceUsage[user.id].vms_max
                                    ? (resourceUsage[user.id].vms_used / resourceUsage[user.id].vms_max!) * 100
                                    : 0
                                }
                                sx={{ height: 8, borderRadius: 1 }}
                              />
                            </Box>
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="body2" color="text.secondary">
                                Disk: {resourceUsage[user.id].disk_used_gb.toFixed(2)} GB / {resourceUsage[user.id].disk_max_gb || '∞'} GB
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={
                                  resourceUsage[user.id].disk_max_gb
                                    ? (resourceUsage[user.id].disk_used_gb / resourceUsage[user.id].disk_max_gb!) * 100
                                    : 0
                                }
                                sx={{ height: 8, borderRadius: 1 }}
                              />
                            </Box>
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="body2" color="text.secondary">
                                RAM: {resourceUsage[user.id].ram_used_gb.toFixed(2)} GB / {resourceUsage[user.id].ram_max_gb || '∞'} GB
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={
                                  resourceUsage[user.id].ram_max_gb
                                    ? (resourceUsage[user.id].ram_used_gb / resourceUsage[user.id].ram_max_gb!) * 100
                                    : 0
                                }
                                sx={{ height: 8, borderRadius: 1 }}
                              />
                            </Box>
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="body2" color="text.secondary">
                                CPU: {resourceUsage[user.id].cpu_used_cores} cores / {resourceUsage[user.id].cpu_max_cores || '∞'} cores
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={
                                  resourceUsage[user.id].cpu_max_cores
                                    ? (resourceUsage[user.id].cpu_used_cores / resourceUsage[user.id].cpu_max_cores!) * 100
                                    : 0
                                }
                                sx={{ height: 8, borderRadius: 1 }}
                              />
                            </Box>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Đang tải...
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </>
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

      <Dialog
        open={resetPasswordDialog}
        onClose={() => {
          setResetPasswordDialog(false);
          setResetPasswordData(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Mật khẩu mới</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Mật khẩu đã được đặt lại cho người dùng <strong>{resetPasswordData?.username}</strong>.
          </DialogContentText>
          <Alert severity={resetPasswordData?.telegram_sent ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {resetPasswordData?.telegram_sent
              ? 'Mật khẩu đã được gửi qua Telegram.'
              : 'Người dùng chưa có Telegram. Vui lòng chia sẻ mật khẩu thủ công.'}
          </Alert>
          <TextField
            label="Mật khẩu mới"
            value={resetPasswordData?.password || ''}
            fullWidth
            InputProps={{
              readOnly: true,
            }}
            onClick={(e) => {
              const target = e.target as HTMLInputElement;
              target.select();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (resetPasswordData?.password) {
                navigator.clipboard.writeText(resetPasswordData.password);
              }
            }}
            variant="outlined"
          >
            Sao chép
          </Button>
          <Button
            onClick={() => {
              setResetPasswordDialog(false);
              setResetPasswordData(null);
            }}
            variant="contained"
          >
            Đóng
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
            type={showPassword ? 'text' : 'password'}
            fullWidth
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            helperText="Tối thiểu 8 ký tự, có chữ hoa, chữ thường và số"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                  <IconButton onClick={generatePassword} edge="end" size="small" title="Tạo mật khẩu ngẫu nhiên">
                    <RandomIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
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
            label="Giới hạn RAM GB (0 = Không giới hạn)"
            type="number"
            fullWidth
            value={newUser.max_ram_gb}
            onChange={(e) => setNewUser({ ...newUser, max_ram_gb: parseInt(e.target.value) || 0 })}
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

      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Chỉnh sửa người dùng</DialogTitle>
        <DialogContent>
          {editUser && (
            <>
              <TextField
                autoFocus
                margin="dense"
                label="Tên đăng nhập"
                type="text"
                fullWidth
                value={editUser.username}
                onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
              />
              <TextField
                margin="dense"
                label="Telegram Chat ID"
                type="text"
                fullWidth
                value={editUser.telegram_chat_id || ''}
                onChange={(e) => setEditUser({ ...editUser, telegram_chat_id: e.target.value || null })}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editUser.is_admin}
                    onChange={(e) => setEditUser({ ...editUser, is_admin: e.target.checked })}
                  />
                }
                label="Quyền quản trị"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editUser.is_suspended}
                    onChange={(e) => setEditUser({ ...editUser, is_suspended: e.target.checked })}
                  />
                }
                label="Khóa tài khoản"
              />
              <TextField
                margin="dense"
                label="Giới hạn số VM (0 = Không giới hạn)"
                type="number"
                fullWidth
                value={editUser.max_vms || 0}
                onChange={(e) => setEditUser({ ...editUser, max_vms: parseInt(e.target.value) || null })}
                inputProps={{ min: 0 }}
              />
              <TextField
                margin="dense"
                label="Giới hạn ổ cứng GB (0 = Không giới hạn)"
                type="number"
                fullWidth
                value={editUser.max_disk_gb || 0}
                onChange={(e) => setEditUser({ ...editUser, max_disk_gb: parseInt(e.target.value) || null })}
                inputProps={{ min: 0 }}
              />
              <TextField
                margin="dense"
                label="Giới hạn RAM GB (0 = Không giới hạn)"
                type="number"
                fullWidth
                value={editUser.max_ram_gb || 0}
                onChange={(e) => setEditUser({ ...editUser, max_ram_gb: parseInt(e.target.value) || null })}
                inputProps={{ min: 0 }}
              />
              <TextField
                margin="dense"
                label="Giới hạn CPU cores (0 = Không giới hạn)"
                type="number"
                fullWidth
                value={editUser.max_cpu_cores || 0}
                onChange={(e) => setEditUser({ ...editUser, max_cpu_cores: parseInt(e.target.value) || null })}
                inputProps={{ min: 0 }}
              />

              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Feature Flags (Ghi đè cấp user)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Bỏ chọn để kế thừa từ cài đặt global. Tích để bật, bỏ tích để tắt.
              </Typography>

              {[
                { key: 'cloudflare_tunnel_enabled' as const, label: 'Cloudflare Tunnel' },
                { key: 'public_ip_enabled' as const, label: 'IP Public' },
                { key: 'email_notifications_enabled' as const, label: 'Thông báo Email' },
                { key: 'telegram_notifications_enabled' as const, label: 'Thông báo Telegram' },
              ].map((feature) => (
                <Box key={feature.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Checkbox
                    size="small"
                    checked={editUser.feature_flags?.[feature.key] !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleFeatureFlagChange(feature.key, true);
                      } else {
                        handleFeatureFlagChange(feature.key, undefined);
                      }
                    }}
                  />
                  <Typography variant="body2" sx={{ minWidth: 150 }}>{feature.label}</Typography>
                  {editUser.feature_flags?.[feature.key] !== undefined && (
                    <Switch
                      size="small"
                      checked={editUser.feature_flags?.[feature.key] ?? true}
                      onChange={(e) => handleFeatureFlagChange(feature.key, e.target.checked)}
                    />
                  )}
                  {editUser.feature_flags?.[feature.key] === undefined && (
                    <Chip label="Kế thừa" size="small" variant="outlined" />
                  )}
                </Box>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Hủy</Button>
          <Button onClick={handleSaveEditUser} variant="contained">
            Lưu
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
