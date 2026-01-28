import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface VMSSHConsoleModalProps {
  open: boolean;
  onClose: () => void;
  vmId: number;
  vmName: string;
  vmIpAddress: string | null;
}

export default function VMSSHConsoleModal({
  open,
  onClose,
  vmId,
  vmName,
  vmIpAddress,
}: VMSSHConsoleModalProps) {
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (open && !vmIpAddress) {
      setError('VM chưa có địa chỉ IP');
    }
  }, [open, vmIpAddress]);

  useEffect(() => {
    if (open && isConnected && terminalRef.current && !xtermRef.current) {
      // Khởi tạo xterm.js
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#ffffff',
        },
        rows: 24,
        cols: 80,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Xử lý input từ terminal
      term.onData((data) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'input',
            data: data,
          }));
        }
      });

      // Xử lý resize
      const handleResize = () => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'resize',
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            }));
          }
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        term.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      };
    }
  }, [open, isConnected]);

  const handleConnect = () => {
    if (!password) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }

    setIsConnecting(true);
    setError(null);

    // Kết nối WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/vm/${vmId}/console`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Gửi credentials
      ws.send(JSON.stringify({
        type: 'auth',
        username: username,
        password: password,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'auth_result') {
          setIsConnecting(false);
          if (msg.success) {
            setIsConnected(true);
            setPassword(''); // Xóa password khỏi state
          } else {
            setError(msg.message || 'Xác thực thất bại');
            ws.close();
            wsRef.current = null;
          }
        } else if (msg.type === 'output') {
          if (xtermRef.current) {
            xtermRef.current.write(msg.data);
          }
        } else if (msg.type === 'error') {
          setError(msg.message);
          setIsConnecting(false);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Lỗi kết nối WebSocket');
      setIsConnecting(false);
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnecting(false);
      setIsConnected(false);
      if (xtermRef.current) {
        xtermRef.current.write('\r\n\n[Đã ngắt kết nối]\r\n');
      }
    };
  };

  const handleClose = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    setPassword('');
    onClose();
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !isConnecting && !isConnected) {
      handleConnect();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          maxHeight: '80vh',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>SSH Console - {vmName}</span>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {!isConnected ? (
          <Box sx={{ p: 3 }}>
            {!vmIpAddress ? (
              <Alert severity="error">VM chưa có địa chỉ IP. Vui lòng đợi VM khởi động xong.</Alert>
            ) : (
              <>
                <Alert severity="info" sx={{ mb: 3 }}>
                  Kết nối SSH đến {vmName} ({vmIpAddress})
                </Alert>

                {error && (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                  </Alert>
                )}

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Tên đăng nhập"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isConnecting}
                    fullWidth
                    autoFocus
                    onKeyPress={handleKeyPress}
                  />

                  <TextField
                    label="Mật khẩu"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isConnecting}
                    fullWidth
                    onKeyPress={handleKeyPress}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            size="small"
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />

                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleConnect}
                    disabled={isConnecting || !password}
                    fullWidth
                    size="large"
                    startIcon={isConnecting ? <CircularProgress size={20} /> : null}
                  >
                    {isConnecting ? 'Đang kết nối...' : 'Kết nối'}
                  </Button>
                </Box>
              </>
            )}
          </Box>
        ) : (
          <Box
            ref={terminalRef}
            sx={{
              flex: 1,
              backgroundColor: '#1e1e1e',
              p: 1,
              overflow: 'hidden',
            }}
          />
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          Đóng
        </Button>
      </DialogActions>
    </Dialog>
  );
}
