import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import {
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  DesktopWindows as ConsoleIcon,
} from '@mui/icons-material';
import apiClient from '../services/api-client';

interface ConsoleInfo {
  ticket: string;
  port: number;
  node: string;
  vmid: number;
}

interface Props {
  vmId: number;
  vmStatus: string;
  proxmoxNode: string;
}

export default function VMConsoleViewer({ vmId, vmStatus, proxmoxNode }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consoleInfo, setConsoleInfo] = useState<ConsoleInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);

  const cleanup = useCallback(() => {
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch {
        // ignore disconnect errors
      }
      rfbRef.current = null;
    }
    setConnected(false);
    setConsoleInfo(null);
    setError(null);
  }, []);

  const connectConsole = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/vms/${vmId}/console`);
      const info: ConsoleInfo = response.data;
      setConsoleInfo(info);

      // Wait for dialog to render the canvas container
      setTimeout(async () => {
        if (!canvasRef.current) {
          setError('Không thể khởi tạo console');
          setLoading(false);
          return;
        }

        try {
          // Dynamic import noVNC RFB
          const { default: RFB } = await import('@novnc/novnc/lib/rfb.js');

          // Build WebSocket URL through nginx proxy to backend
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${wsProtocol}//${window.location.host}/vnc-ws?node=${encodeURIComponent(info.node)}&vmid=${info.vmid}&port=${info.port}&vncticket=${encodeURIComponent(info.ticket)}`;

          const rfb = new RFB(canvasRef.current, wsUrl, {
            credentials: { password: info.ticket },
          });

          rfb.viewOnly = false;
          rfb.scaleViewport = true;
          rfb.resizeSession = true;

          rfb.addEventListener('connect', () => {
            setConnected(true);
            setLoading(false);
          });

          rfb.addEventListener('disconnect', (e: any) => {
            setConnected(false);
            if (!e.detail.clean) {
              setError('Kết nối console bị ngắt');
            }
            setLoading(false);
          });

          rfb.addEventListener('securityfailure', () => {
            setError('Xác thực console thất bại');
            setLoading(false);
          });

          rfbRef.current = rfb;
        } catch (importErr) {
          setError('Không thể tải module noVNC');
          setLoading(false);
        }
      }, 300);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể kết nối console');
      setLoading(false);
    }
  }, [vmId]);

  const handleOpen = () => {
    setOpen(true);
    connectConsole();
  };

  const handleClose = () => {
    cleanup();
    setOpen(false);
    setLoading(false);
  };

  const handleFullscreen = () => {
    canvasRef.current?.requestFullscreen?.();
  };

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  if (vmStatus !== 'running') {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="info">VM phải đang chạy để mở console.</Alert>
      </Paper>
    );
  }

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Console</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mở giao diện console để truy cập trực tiếp vào VM qua trình duyệt.
        </Typography>
        <Button
          variant="contained"
          startIcon={<ConsoleIcon />}
          onClick={handleOpen}
          disabled={loading}
        >
          Mở Console
        </Button>
      </Paper>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: { width: '90vw', height: '85vh', maxWidth: '1400px' },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
          <Typography variant="h6">
            Console — {proxmoxNode} / VMID {consoleInfo?.vmid ?? '...'}
          </Typography>
          <Box>
            {connected && (
              <IconButton onClick={handleFullscreen} size="small" sx={{ mr: 1 }}>
                <FullscreenIcon />
              </IconButton>
            )}
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress sx={{ mr: 2 }} />
              <Typography>Đang kết nối console...</Typography>
            </Box>
          )}
          {error && (
            <Box sx={{ p: 3 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}
          <Box
            ref={canvasRef}
            sx={{
              flex: 1,
              bgcolor: 'black',
              display: loading && !connected ? 'none' : 'flex',
              '& canvas': { width: '100%', height: '100%' },
            }}
          />
        </DialogContent>
        {connected && (
          <DialogActions sx={{ py: 0.5, px: 2 }}>
            <Typography variant="caption" color="success.main">Đã kết nối</Typography>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
}
