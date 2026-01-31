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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  DesktopWindows as ConsoleIcon,
  Terminal as TerminalIcon,
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  Apple as AppleIcon,
  Computer as WindowsIcon,
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
  onOpenSSHConsole?: () => void;
  sshDomain?: string | null;
  sshUsername?: string | null;
  sshPassword?: string | null;
}

export default function VMConsoleViewer({ vmId, vmStatus, proxmoxNode, onOpenSSHConsole, sshDomain, sshUsername, sshPassword }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consoleInfo, setConsoleInfo] = useState<ConsoleInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

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
      // Validate VM is running and console is enabled
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

          // SEC-001: Get JWT token for WebSocket authentication
          const accessToken = localStorage.getItem('token');
          if (!accessToken) {
            setError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
            setLoading(false);
            return;
          }

          // Backend handles full VNC setup (PVE ticket, proxy, WebSocket)
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${wsProtocol}//${window.location.host}/vnc-ws?vmid=${info.vmid}&token=${encodeURIComponent(accessToken)}`;

          const rfb = new RFB(canvasRef.current, wsUrl, {
            wsProtocols: ['binary'],
          });

          rfb.viewOnly = false;
          rfb.scaleViewport = true;
          rfb.resizeSession = true;
          rfb.clipViewport = true;
          rfb.qualityLevel = 6;
          rfb.compressionLevel = 2;

          rfb.addEventListener('connect', () => {
            setConnected(true);
            setLoading(false);
          });

          rfb.addEventListener('disconnect', (e: any) => {
            setConnected(false);
            if (!e.detail.clean) {
              setError('Kết nối VNC bị ngắt. Nếu bạn đang truy cập từ ngoài mạng LAN, vui lòng sử dụng SSH Terminal trong mục Điều Khiển thay thế.');
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

  // Code snippets for SSH guide
  const sshCommand = sshDomain ? `ssh -o ProxyCommand="cloudflared access ssh --hostname %h" ${sshUsername || 'root'}@${sshDomain}` : '';
  const sshConfigSnippet = sshDomain ? `Host ${sshDomain}
    ProxyCommand cloudflared access ssh --hostname %h
    User ${sshUsername || 'root'}` : '';

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>VNC Console</Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          VNC Console chỉ hoạt động khi truy cập từ mạng LAN. Nếu bạn ở ngoài mạng LAN, vui lòng sử dụng <strong>SSH Console</strong> bên dưới.
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mở giao diện đồ họa (GUI) của VM. Yêu cầu truy cập từ mạng nội bộ.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<ConsoleIcon />}
            onClick={handleOpen}
            disabled={loading}
          >
            Mở VNC Console
          </Button>
          {onOpenSSHConsole && (
            <Button
              variant="outlined"
              color="info"
              startIcon={<TerminalIcon />}
              onClick={onOpenSSHConsole}
            >
              SSH Console
            </Button>
          )}
        </Box>
      </Paper>

      {/* SSH Terminal Guide */}
      {sshDomain && (
        <Accordion sx={{ mt: 2 }} defaultExpanded={false}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TerminalIcon color="primary" />
              <Typography variant="h6">Hướng dẫn SSH từ Terminal (bên ngoài mạng LAN)</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Alert severity="info" sx={{ mb: 3 }}>
              Sử dụng <strong>Cloudflare Tunnel</strong> để kết nối SSH an toàn từ bất kỳ đâu mà không cần mở port.
            </Alert>

            {/* SSH Info */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" gutterBottom>Thông tin kết nối:</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>SSH Domain:</Typography>
                  <Chip label={sshDomain} size="small" />
                  <Tooltip title={copiedText === 'domain' ? 'Đã sao chép!' : 'Sao chép'}>
                    <IconButton size="small" onClick={() => handleCopy(sshDomain, 'domain')}>
                      {copiedText === 'domain' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>Username:</Typography>
                  <Chip label={sshUsername || 'root'} size="small" />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>Password:</Typography>
                  <Chip label={sshPassword ? '••••••••' : 'Xem ở tab Thông tin'} size="small" />
                </Box>
              </Box>
            </Paper>

            <Stepper activeStep={activeStep} orientation="vertical">
              {/* Step 1: Install cloudflared */}
              <Step>
                <StepLabel
                  onClick={() => setActiveStep(0)}
                  sx={{ cursor: 'pointer' }}
                >
                  <Typography variant="subtitle1">Cài đặt Cloudflared CLI</Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Cài đặt <code>cloudflared</code> trên máy tính của bạn (chỉ cần làm 1 lần).
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <Chip icon={<AppleIcon />} label="macOS" size="small" variant="outlined" />
                    <Chip icon={<WindowsIcon />} label="Windows" size="small" variant="outlined" />
                    <Chip label="Linux" size="small" variant="outlined" />
                  </Box>

                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>macOS (Homebrew):</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="code" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        brew install cloudflared
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy('brew install cloudflared', 'brew')}>
                        {copiedText === 'brew' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>Windows (Winget):</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="code" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        winget install cloudflare.cloudflared
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy('winget install cloudflare.cloudflared', 'winget')}>
                        {copiedText === 'winget' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>Ubuntu/Debian:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="code" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                        curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg && sudo apt update && sudo apt install cloudflared
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy('curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg && sudo apt update && sudo apt install cloudflared', 'apt')}>
                        {copiedText === 'apt' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>

                  <Button size="small" variant="contained" onClick={() => setActiveStep(1)}>
                    Tiếp tục
                  </Button>
                </StepContent>
              </Step>

              {/* Step 2: SSH Command */}
              <Step>
                <StepLabel
                  onClick={() => setActiveStep(1)}
                  sx={{ cursor: 'pointer' }}
                >
                  <Typography variant="subtitle1">Kết nối SSH</Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Chạy lệnh sau trong Terminal để kết nối SSH:
                  </Typography>

                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>Lệnh SSH:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Typography component="code" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                        {sshCommand}
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy(sshCommand, 'ssh')}>
                        {copiedText === 'ssh' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>

                  <Alert severity="info" sx={{ mb: 2 }}>
                    Khi được hỏi password, nhập mật khẩu SSH (xem ở tab <strong>Thông tin</strong>).
                  </Alert>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" onClick={() => setActiveStep(0)}>Quay lại</Button>
                    <Button size="small" variant="contained" onClick={() => setActiveStep(2)}>Tiếp tục</Button>
                  </Box>
                </StepContent>
              </Step>

              {/* Step 3: SSH Config (Optional) */}
              <Step>
                <StepLabel
                  onClick={() => setActiveStep(2)}
                  sx={{ cursor: 'pointer' }}
                  optional={<Typography variant="caption">Tùy chọn</Typography>}
                >
                  <Typography variant="subtitle1">Cấu hình SSH Config (tiện lợi hơn)</Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Thêm vào file <code>~/.ssh/config</code> để kết nối nhanh hơn:
                  </Typography>

                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>~/.ssh/config:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Typography component="pre" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', m: 0 }}>
                        {sshConfigSnippet}
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy(sshConfigSnippet, 'config')}>
                        {copiedText === 'config' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Sau đó chỉ cần gõ:
                  </Typography>

                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="code" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        ssh {sshDomain}
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy(`ssh ${sshDomain}`, 'simple')}>
                        {copiedText === 'simple' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>

                  <Alert severity="success" icon={<CheckIcon />}>
                    Hoàn tất! Bạn đã có thể SSH vào VM từ bất kỳ đâu.
                  </Alert>

                  <Box sx={{ mt: 2 }}>
                    <Button size="small" onClick={() => setActiveStep(1)}>Quay lại</Button>
                  </Box>
                </StepContent>
              </Step>
            </Stepper>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Termius Guide */}
      {sshDomain && (
        <Accordion sx={{ mt: 2 }} defaultExpanded={false}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TerminalIcon color="secondary" />
              <Typography variant="h6">Hướng dẫn SSH bằng Termius / PuTTY</Typography>
              <Chip label="GUI Apps" size="small" variant="outlined" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Alert severity="info" sx={{ mb: 3 }}>
              Termius và PuTTY không hỗ trợ ProxyCommand trực tiếp. Bạn cần chạy <strong>cloudflared proxy</strong> trên máy local trước.
            </Alert>

            <Stepper activeStep={-1} orientation="vertical">
              {/* Step 1: Install cloudflared */}
              <Step active>
                <StepLabel>
                  <Typography variant="subtitle1">Cài đặt Cloudflared CLI</Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Tương tự hướng dẫn Terminal ở trên. Cài <code>cloudflared</code> trên máy tính (1 lần duy nhất).
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>macOS:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="code" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        brew install cloudflared
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy('brew install cloudflared', 'termius-brew')}>
                        {copiedText === 'termius-brew' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900' }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>Windows:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="code" sx={{ color: 'success.light', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        winget install cloudflare.cloudflared
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy('winget install cloudflare.cloudflared', 'termius-winget')}>
                        {copiedText === 'termius-winget' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>
                </StepContent>
              </Step>

              {/* Step 2: Run proxy */}
              <Step active>
                <StepLabel>
                  <Typography variant="subtitle1">Chạy Cloudflared Proxy (giữ Terminal mở)</Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Mở Terminal/PowerShell và chạy lệnh sau. <strong>Giữ cửa sổ này mở</strong> trong khi dùng Termius.
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', mb: 2 }}>
                    <Typography variant="caption" color="grey.500" display="block" gutterBottom>Lệnh chạy proxy:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Typography component="code" sx={{ color: 'warning.light', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                        cloudflared access tcp --hostname {sshDomain} --url localhost:2222
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy(`cloudflared access tcp --hostname ${sshDomain} --url localhost:2222`, 'proxy')}>
                        {copiedText === 'proxy' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                      </IconButton>
                    </Box>
                  </Paper>
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Proxy sẽ chạy ở <code>localhost:2222</code>. Bạn có thể đổi port khác nếu cần.
                  </Alert>
                </StepContent>
              </Step>

              {/* Step 3: Connect Termius */}
              <Step active>
                <StepLabel>
                  <Typography variant="subtitle1">Kết nối từ Termius</Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Trong Termius, tạo Host mới với thông tin sau:
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>Host:</Typography>
                        <Chip label="localhost" size="small" color="primary" />
                        <IconButton size="small" onClick={() => handleCopy('localhost', 'termius-host')}>
                          {copiedText === 'termius-host' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
                        </IconButton>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>Port:</Typography>
                        <Chip label="2222" size="small" color="primary" />
                        <IconButton size="small" onClick={() => handleCopy('2222', 'termius-port')}>
                          {copiedText === 'termius-port' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
                        </IconButton>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>Username:</Typography>
                        <Chip label={sshUsername || 'root'} size="small" color="primary" />
                        <IconButton size="small" onClick={() => handleCopy(sshUsername || 'root', 'termius-user')}>
                          {copiedText === 'termius-user' ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
                        </IconButton>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>Password:</Typography>
                        <Chip label="Xem ở tab Thông tin" size="small" variant="outlined" />
                      </Box>
                    </Box>
                  </Paper>
                  <Alert severity="success" icon={<CheckIcon />}>
                    Kết nối thành công! Lưu ý: Phải giữ Terminal proxy chạy trong khi sử dụng.
                  </Alert>
                </StepContent>
              </Step>
            </Stepper>
          </AccordionDetails>
        </Accordion>
      )}

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
