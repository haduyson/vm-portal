import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Link,
} from '@mui/material';
import { useAuth } from '../hooks/use-auth-context';
import apiClient from '../services/api-client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Tên đăng nhập hoặc mật khẩu không đúng');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotError('');
    setForgotSuccess('');
    setForgotLoading(true);

    try {
      const response = await apiClient.post('/auth/forgot-password', {
        username: forgotUsername,
      });
      setForgotSuccess(response.data.message);
      setForgotUsername('');
    } catch (err: any) {
      setForgotError(
        err.response?.data?.detail || 'Không thể đặt lại mật khẩu'
      );
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ minWidth: 400, maxWidth: 500 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" gutterBottom align="center">
            VM Portal - Đăng Nhập
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Tên đăng nhập"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Mật khẩu"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
            <Box sx={{ textAlign: 'center' }}>
              <Link
                component="button"
                variant="body2"
                onClick={() => setForgotPasswordOpen(true)}
                sx={{ cursor: 'pointer' }}
              >
                Quên mật khẩu?
              </Link>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Dialog
        open={forgotPasswordOpen}
        onClose={() => {
          setForgotPasswordOpen(false);
          setForgotUsername('');
          setForgotError('');
          setForgotSuccess('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Quên mật khẩu</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Nhập tên đăng nhập của bạn. Nếu tài khoản đã liên kết với Telegram, mật khẩu mới sẽ được gửi qua Telegram.
          </DialogContentText>
          {forgotError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {forgotError}
            </Alert>
          )}
          {forgotSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {forgotSuccess}
            </Alert>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Tên đăng nhập"
            type="text"
            fullWidth
            value={forgotUsername}
            onChange={(e) => setForgotUsername(e.target.value)}
            disabled={forgotLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setForgotPasswordOpen(false);
              setForgotUsername('');
              setForgotError('');
              setForgotSuccess('');
            }}
          >
            Đóng
          </Button>
          <Button
            onClick={handleForgotPassword}
            variant="contained"
            disabled={!forgotUsername || forgotLoading}
          >
            {forgotLoading ? 'Đang xử lý...' : 'Gửi'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
