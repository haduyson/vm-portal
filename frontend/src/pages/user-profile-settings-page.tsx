import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Snackbar,
  Stack,
} from '@mui/material';
import { useAuth } from '../hooks/use-auth-context';
import apiClient from '../services/api-client';

export default function UserProfileSettingsPage() {
  const { user } = useAuth();
  const [telegramChatId, setTelegramChatId] = useState(user?.telegram_chat_id || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updateData: any = {};

      // Only include telegram_chat_id if changed
      if (telegramChatId !== (user?.telegram_chat_id || '')) {
        updateData.telegram_chat_id = telegramChatId;
      }

      // Only include password fields if new password is provided
      if (newPassword) {
        if (!currentPassword) {
          setSnackbar({
            open: true,
            message: 'Cần nhập mật khẩu hiện tại để đổi mật khẩu',
            severity: 'error'
          });
          setLoading(false);
          return;
        }
        updateData.current_password = currentPassword;
        updateData.new_password = newPassword;
      }

      await apiClient.patch('/auth/profile', updateData);

      setSnackbar({
        open: true,
        message: 'Cập nhật thông tin thành công',
        severity: 'success'
      });

      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Có lỗi xảy ra';
      setSnackbar({
        open: true,
        message: Array.isArray(errorMessage) ? errorMessage[0]?.msg : errorMessage,
        severity: 'error'
      });
    } finally {
      setLoading(false);
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

            <TextField
              label="Telegram Chat ID"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              fullWidth
              helperText="ID chat Telegram để nhận thông báo"
            />

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

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              fullWidth
            >
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </Stack>
        </form>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
