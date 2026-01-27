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
} from '@mui/material';
import { authService } from '../services/auth-service';

export default function TwoFactorSetupPage() {
  const navigate = useNavigate();
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const handleGenerateQR = async () => {
    setSetupLoading(true);
    setError('');
    try {
      const data = await authService.setup2FA();
      setSecret(data.secret);
      setQrCode(data.qr_code_base64);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể tạo mã QR');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    setError('');
    try {
      await authService.enable2FA(secret, totpCode);
      setSnackbar({ open: true, message: 'Đã bật xác thực hai yếu tố thành công!', severity: 'success' });
      setTimeout(() => navigate('/profile'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Mã xác thực không đúng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Thiết lập xác thực hai yếu tố (2FA)
      </Typography>

      <Paper sx={{ p: 4, mt: 3, maxWidth: 600 }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

          {!qrCode ? (
            <>
              <Typography variant="body1">
                Xác thực hai yếu tố giúp bảo vệ tài khoản của bạn bằng cách yêu cầu mã xác thực
                từ ứng dụng (Google Authenticator, Authy, ...) mỗi khi đăng nhập.
              </Typography>
              <Button
                variant="contained"
                onClick={handleGenerateQR}
                disabled={setupLoading}
              >
                {setupLoading ? 'Đang tạo...' : 'Bắt đầu thiết lập'}
              </Button>
            </>
          ) : (
            <>
              <Typography variant="body1">
                1. Quét mã QR bên dưới bằng ứng dụng xác thực (Google Authenticator, Authy, ...):
              </Typography>

              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                <img
                  src={`data:image/png;base64,${qrCode}`}
                  alt="QR Code for 2FA"
                  style={{ width: 200, height: 200 }}
                />
              </Box>

              <Typography variant="body2" color="text.secondary">
                Hoặc nhập mã thủ công: <strong>{secret}</strong>
              </Typography>

              <Typography variant="body1" sx={{ mt: 2 }}>
                2. Nhập mã 6 số từ ứng dụng xác thực để xác nhận:
              </Typography>

              <TextField
                label="Mã xác thực (6 số)"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                fullWidth
                inputProps={{ maxLength: 6, inputMode: 'numeric' }}
              />

              <Button
                variant="contained"
                onClick={handleEnable}
                disabled={loading || totpCode.length !== 6}
              >
                {loading ? 'Đang xác nhận...' : 'Xác nhận và bật 2FA'}
              </Button>
            </>
          )}
        </Stack>
      </Paper>

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
