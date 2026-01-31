import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Snackbar,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
} from '@mui/material';
import { useAuth } from '../hooks/use-auth-context';
import apiClient from '../services/api-client';
import { authService } from '../services/auth-service';

export default function UserProfileSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [telegramChatId, setTelegramChatId] = useState(user?.telegram_chat_id || '');
  const [email, setEmail] = useState(user?.email || '');
  const [notificationPreference, setNotificationPreference] = useState(user?.notification_preference || 'telegram');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  // 2FA disable dialog state
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [disableTotpCode, setDisableTotpCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updateData: Record<string, string> = {};

      if (telegramChatId !== (user?.telegram_chat_id || '')) {
        updateData.telegram_chat_id = telegramChatId;
      }

      if (email !== (user?.email || '')) {
        updateData.email = email;
      }

      if (notificationPreference !== (user?.notification_preference || 'telegram')) {
        updateData.notification_preference = notificationPreference;
      }

      if (newPassword) {
        if (!currentPassword) {
          setSnackbar({ open: true, message: 'Cần nhập mật khẩu hiện tại để đổi mật khẩu', severity: 'error' });
          setLoading(false);
          return;
        }
        updateData.current_password = currentPassword;
        updateData.new_password = newPassword;
      }

      await apiClient.patch('/auth/profile', updateData);
      setSnackbar({ open: true, message: 'Cập nhật thông tin thành công', severity: 'success' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Có lỗi xảy ra';
      setSnackbar({
        open: true,
        message: Array.isArray(errorMessage) ? errorMessage[0]?.msg : errorMessage,
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setDisableLoading(true);
    try {
      await authService.disable2FA(disableTotpCode);
      setSnackbar({ open: true, message: 'Đã tắt xác thực hai yếu tố', severity: 'success' });
      setDisableDialogOpen(false);
      setDisableTotpCode('');
      // Reload page to update user info
      window.location.reload();
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: error.response?.data?.detail || 'Mã xác thực không đúng',
        severity: 'error',
      });
    } finally {
      setDisableLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Cài đặt tài khoản
      </Typography>

      <Paper sx={{ p: 4, mt: 3, maxWidth: 600 }}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            <TextField
              label="Tên đăng nhập"
              value={user?.username || ''}
              disabled
              fullWidth
              helperText="Không thể thay đổi tên đăng nhập"
            />

            <Typography variant="h6" sx={{ mt: 2 }}>
              Thông báo
            </Typography>

            <TextField
              label="Telegram Chat ID"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              fullWidth
              helperText="ID chat Telegram để nhận thông báo"
            />

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              helperText="Địa chỉ email để nhận thông báo"
            />

            <FormControl fullWidth>
              <InputLabel>Phương thức thông báo</InputLabel>
              <Select
                value={notificationPreference}
                label="Phương thức thông báo"
                onChange={(e) => setNotificationPreference(e.target.value)}
              >
                <MenuItem value="telegram">Telegram</MenuItem>
                <MenuItem value="email">Email</MenuItem>
                <MenuItem value="both">Cả hai (Telegram + Email)</MenuItem>
              </Select>
            </FormControl>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" sx={{ mt: 2 }}>
              Đổi mật khẩu
            </Typography>

            <TextField
              label="Mật khẩu hiện tại"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
              helperText="Bỏ trống nếu không muốn đổi mật khẩu"
            />

            <TextField
              label="Mật khẩu mới"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
              helperText="Ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số"
            />

            <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* 2FA Section */}
      <Paper sx={{ p: 4, mt: 3, maxWidth: 600 }}>
        <Typography variant="h6" gutterBottom>
          Xác thực hai yếu tố (2FA)
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="body1">Trạng thái:</Typography>
          <Chip
            label={user?.has_2fa ? 'Đã bật' : 'Chưa bật'}
            color={user?.has_2fa ? 'success' : 'default'}
            size="small"
          />
        </Box>

        {user?.has_2fa ? (
          <Button
            variant="outlined"
            color="error"
            onClick={() => setDisableDialogOpen(true)}
          >
            Tắt 2FA
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={() => navigate('/2fa/setup')}
          >
            Thiết lập 2FA
          </Button>
        )}
      </Paper>

      {/* Disable 2FA Dialog */}
      <Dialog
        open={disableDialogOpen}
        onClose={() => { setDisableDialogOpen(false); setDisableTotpCode(''); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Tắt xác thực hai yếu tố</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Nhập mã xác thực từ ứng dụng để xác nhận tắt 2FA.
          </Typography>
          <TextField
            label="Mã xác thực (6 số)"
            value={disableTotpCode}
            onChange={(e) => setDisableTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            fullWidth
            autoFocus
            inputProps={{ maxLength: 6, inputMode: 'numeric' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDisableDialogOpen(false); setDisableTotpCode(''); }}>
            Hủy
          </Button>
          <Button
            onClick={handleDisable2FA}
            color="error"
            variant="contained"
            disabled={disableLoading || disableTotpCode.length !== 6}
          >
            {disableLoading ? 'Đang xử lý...' : 'Xác nhận tắt'}
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
