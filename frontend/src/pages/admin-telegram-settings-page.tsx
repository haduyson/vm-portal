import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  IconButton,
  InputAdornment,
  Chip,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Send as SendIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface TelegramSettings {
  bot_token_masked: string;
  default_chat_id: string | null;
  source: string;
}

export default function AdminTelegramSettingsPage() {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [currentSettings, setCurrentSettings] = useState<TelegramSettings | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API_URL}/api/admin/settings/telegram`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCurrentSettings(response.data);
      setChatId(response.data.default_chat_id || '');
    } catch (error) {
      console.error('Failed to load settings:', error);
      setErrorMessage('Không thể tải cấu hình');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const token = localStorage.getItem('access_token');
      const payload: { bot_token?: string; default_chat_id?: string } = {};

      if (botToken.trim()) {
        payload.bot_token = botToken.trim();
      }
      if (chatId.trim()) {
        payload.default_chat_id = chatId.trim();
      }

      if (Object.keys(payload).length === 0) {
        setErrorMessage('Vui lòng nhập ít nhất một giá trị để cập nhật');
        setLoading(false);
        return;
      }

      await axios.put(`${API_URL}/api/admin/settings/telegram`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccessMessage('Đã lưu cấu hình thành công');
      setBotToken('');
      await loadSettings();
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      setErrorMessage(
        error.response?.data?.detail || 'Không thể lưu cấu hình'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTestLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${API_URL}/api/admin/settings/telegram/test`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccessMessage(response.data.message || 'Đã gửi tin nhắn thử thành công');
    } catch (error: any) {
      console.error('Failed to test settings:', error);
      setErrorMessage(
        error.response?.data?.detail || 'Không thể gửi tin nhắn thử'
      );
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Cấu hình Telegram Bot
      </Typography>

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack spacing={3}>
            {currentSettings && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Nguồn cấu hình hiện tại:{' '}
                  <Chip
                    label={
                      currentSettings.source === 'database'
                        ? 'Cơ sở dữ liệu'
                        : 'Biến môi trường'
                    }
                    size="small"
                    color={currentSettings.source === 'database' ? 'primary' : 'default'}
                  />
                </Typography>
                {currentSettings.source === 'environment' && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Hiện đang sử dụng cấu hình từ biến môi trường. Cập nhật ở đây để
                    lưu vào cơ sở dữ liệu.
                  </Alert>
                )}
              </Box>
            )}

            <TextField
              label="Bot Token"
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={
                currentSettings?.bot_token_masked
                  ? `Hiện tại: ${currentSettings.bot_token_masked}`
                  : 'Nhập bot token mới'
              }
              fullWidth
              helperText="Nhập token mới để cập nhật, để trống nếu không muốn thay đổi"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowToken(!showToken)}
                      edge="end"
                    >
                      {showToken ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              label="Default Chat ID"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Nhập chat ID mặc định"
              fullWidth
              helperText="Chat ID để nhận thông báo mặc định"
            />

            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? 'Đang lưu...' : 'Lưu'}
              </Button>

              <Button
                variant="outlined"
                startIcon={<SendIcon />}
                onClick={handleTest}
                disabled={testLoading || !currentSettings?.default_chat_id}
              >
                {testLoading ? 'Đang gửi...' : 'Gửi tin nhắn thử'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Hướng dẫn
          </Typography>
          <Typography variant="body2" component="div">
            <ol>
              <li>Tạo bot mới trên Telegram bằng @BotFather</li>
              <li>Sao chép Bot Token và dán vào ô trên</li>
              <li>Lấy Chat ID bằng cách:
                <ul>
                  <li>Gửi tin nhắn cho bot của bạn</li>
                  <li>
                    Truy cập:{' '}
                    <code>https://api.telegram.org/bot{'<YOUR_BOT_TOKEN>'}/getUpdates</code>
                  </li>
                  <li>Tìm giá trị "id" trong "chat" object</li>
                </ul>
              </li>
              <li>Nhập Chat ID vào ô trên</li>
              <li>Nhấn "Lưu" để lưu cấu hình</li>
              <li>Nhấn "Gửi tin nhắn thử" để kiểm tra</li>
            </ol>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
