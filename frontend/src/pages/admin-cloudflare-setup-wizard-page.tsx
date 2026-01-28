import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  Typography,
  Button,
  TextField,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  CircularProgress,
  Stack,
  Chip,
  Paper,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CheckCircle,
  ContentCopy,
  PlayArrow,
  Refresh,
  Save,
} from '@mui/icons-material';
import apiClient from '../services/api-client';

interface WizardData {
  apiToken: string;
  accountId: string;
  domain: string;
  zoneId: string;
  tunnelId: string;
  tunnelName: string;
  proxmoxSubdomain: string;
  portalSubdomain: string;
  configPath: string;
}

const STEPS = [
  'Nhập thông tin Cloudflare',
  'Kiểm tra kết nối',
  'Cài đặt cloudflared',
  'Tạo Tunnel',
  'Cấu hình DNS',
  'Tạo file cấu hình',
  'Khởi chạy Service',
  'Hoàn tất',
];

export default function AdminCloudflareSetupWizardPage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);

  const [wizardData, setWizardData] = useState<WizardData>({
    apiToken: '',
    accountId: '',
    domain: '',
    zoneId: '',
    tunnelId: '',
    tunnelName: 'vpscloud',
    proxmoxSubdomain: 'dc',
    portalSubdomain: 'vpscloud',
    configPath: '/etc/cloudflared/config.yml',
  });

  // Step results
  const [connectionResult, setConnectionResult] = useState<any>(null);
  const [cloudflaredResult, setCloudflaredResult] = useState<any>(null);
  const [tunnelResult, setTunnelResult] = useState<any>(null);
  const [dnsResult, setDnsResult] = useState<any>(null);
  const [configResult, setConfigResult] = useState<any>(null);
  const [serviceResult, setServiceResult] = useState<any>(null);
  const [finalResult, setFinalResult] = useState<any>(null);

  const [errorMessage, setErrorMessage] = useState('');

  const updateWizardData = (updates: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Step 0: Input CF info
  const renderStep0 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Nhập thông tin Cloudflare để bắt đầu cấu hình tunnel.
      </Typography>

      <Stack spacing={2}>
        <TextField
          label="CF API Token"
          type={showApiToken ? 'text' : 'password'}
          value={wizardData.apiToken}
          onChange={(e) => updateWizardData({ apiToken: e.target.value })}
          required
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowApiToken(!showApiToken)}
                  edge="end"
                >
                  {showApiToken ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          helperText="Tạo tại: https://dash.cloudflare.com/profile/api-tokens — Cần quyền: Account:Cloudflare Tunnel:Edit + Zone:DNS:Edit"
        />

        <TextField
          label="Account ID"
          value={wizardData.accountId}
          onChange={(e) => updateWizardData({ accountId: e.target.value })}
          required
          fullWidth
          helperText="Dashboard → bất kỳ domain → Overview → cột phải → Account ID"
        />

        <TextField
          label="Domain"
          value={wizardData.domain}
          onChange={(e) => updateWizardData({ domain: e.target.value })}
          required
          fullWidth
          placeholder="hasonmedia.com"
          helperText="Domain đã được thêm vào Cloudflare"
        />
      </Stack>

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={!wizardData.apiToken || !wizardData.accountId || !wizardData.domain}
        >
          Tiếp tục
        </Button>
      </Box>
    </Box>
  );

  // Step 1: Test connection
  const handleTestConnection = async () => {
    setLoading(true);
    setErrorMessage('');
    setConnectionResult(null);

    try {
      const response = await apiClient.post('/admin/cloudflare-setup/test-connection', {
        api_token: wizardData.apiToken,
        account_id: wizardData.accountId,
        domain: wizardData.domain,
      });

      setConnectionResult(response.data);

      if (response.data.success) {
        updateWizardData({ zoneId: response.data.zone_id });
      }
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Kiểm tra kết nối với Cloudflare API và xác thực quyền truy cập.
      </Typography>

      <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
        <Typography variant="body2" fontWeight="bold">Domain:</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>{wizardData.domain}</Typography>
        <Typography variant="body2" fontWeight="bold">Account ID:</Typography>
        <Typography variant="body2">{wizardData.accountId}</Typography>
      </Paper>

      <Button
        variant="contained"
        startIcon={loading ? <CircularProgress size={16} /> : <PlayArrow />}
        onClick={handleTestConnection}
        disabled={loading}
        sx={{ mb: 2 }}
      >
        Kiểm tra kết nối
      </Button>

      {connectionResult && (
        <>
          {connectionResult.success ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Kết nối thành công!
              <br />
              Zone: {connectionResult.zone_name}
              <br />
              Account: {connectionResult.account_name}
            </Alert>
          ) : (
            <Alert severity="error" sx={{ mb: 2 }}>
              {connectionResult.error}
            </Alert>
          )}

          {/* Show detected permissions */}
          {connectionResult.permissions?.length > 0 && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                Quyền phát hiện được:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {connectionResult.permissions.map((p: string) => (
                  <Chip key={p} label={p} color="success" size="small" />
                ))}
              </Stack>
            </Paper>
          )}

          {/* Show missing permissions */}
          {connectionResult.missing_permissions?.length > 0 && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
              <Typography variant="body2" fontWeight="bold" color="error" sx={{ mb: 1 }}>
                Quyền còn thiếu:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {connectionResult.missing_permissions.map((p: string) => (
                  <Chip key={p} label={p} color="error" size="small" />
                ))}
              </Stack>
              <Alert severity="info" variant="outlined">
                Tạo API Token mới tại{' '}
                <a
                  href="https://dash.cloudflare.com/profile/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                >
                  Cloudflare Dashboard → API Tokens
                </a>
                {' '}với các quyền:
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  <li><strong>Account → Cloudflare Tunnel → Edit</strong></li>
                  <li><strong>Zone → DNS → Edit</strong></li>
                  <li><strong>Zone → Zone → Read</strong></li>
                </ul>
              </Alert>
            </Paper>
          )}
        </>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <Button onClick={handleBack}>Quay lại</Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={!connectionResult?.success}
        >
          Tiếp tục
        </Button>
      </Stack>
    </Box>
  );

  // Step 2: Check cloudflared
  const handleCheckCloudflared = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await apiClient.get('/admin/cloudflare-setup/check-cloudflared');
      setCloudflaredResult(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Lỗi kiểm tra cloudflared');
    } finally {
      setLoading(false);
    }
  };

  const renderStep2 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Kiểm tra xem cloudflared đã được cài đặt chưa.
      </Typography>

      <Button
        variant="contained"
        startIcon={loading ? <CircularProgress size={16} /> : <Refresh />}
        onClick={handleCheckCloudflared}
        disabled={loading}
        sx={{ mb: 2 }}
      >
        Kiểm tra cloudflared
      </Button>

      {cloudflaredResult && (
        <>
          {cloudflaredResult.installed ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              cloudflared đã được cài đặt (version: {cloudflaredResult.version})
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 2 }}>
              cloudflared chưa được cài đặt. Chạy lệnh này trên host:
              <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.900', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor &gt; /usr/share/keyrings/cloudflare-main.gpg
                <br />
                echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" &gt; /etc/apt/sources.list.d/cloudflared.list
                <br />
                apt-get update && apt-get install -y cloudflared
              </Paper>
              <Button
                size="small"
                startIcon={<Refresh />}
                onClick={handleCheckCloudflared}
                sx={{ mt: 1 }}
              >
                Kiểm tra lại
              </Button>
            </Alert>
          )}
        </>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <Button onClick={handleBack}>Quay lại</Button>
        <Button variant="contained" onClick={handleNext}>
          Tiếp tục
        </Button>
      </Stack>
    </Box>
  );

  // Step 3: Create tunnel
  const handleCreateTunnel = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await apiClient.post('/admin/cloudflare-setup/create-tunnel', {
        api_token: wizardData.apiToken,
        account_id: wizardData.accountId,
        tunnel_name: wizardData.tunnelName,
      });

      setTunnelResult(response.data);

      if (response.data.success) {
        updateWizardData({ tunnelId: response.data.tunnel_id });
      }
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Lỗi tạo tunnel');
    } finally {
      setLoading(false);
    }
  };

  const renderStep3 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tạo Cloudflare Tunnel mới.
      </Typography>

      <TextField
        label="Tunnel Name"
        value={wizardData.tunnelName}
        onChange={(e) => updateWizardData({ tunnelName: e.target.value })}
        fullWidth
        sx={{ mb: 2 }}
      />

      <Button
        variant="contained"
        startIcon={loading ? <CircularProgress size={16} /> : <PlayArrow />}
        onClick={handleCreateTunnel}
        disabled={loading || !wizardData.tunnelName}
        sx={{ mb: 2 }}
      >
        Tạo Tunnel
      </Button>

      {tunnelResult && (
        <>
          {tunnelResult.success ? (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>
                Tunnel đã được tạo thành công!
                <br />
                Tunnel ID: <Chip label={tunnelResult.tunnel_id} size="small" />
                <IconButton
                  size="small"
                  onClick={() => copyToClipboard(tunnelResult.tunnel_id)}
                >
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Alert>

              {!tunnelResult.credentials_file_written && tunnelResult.credentials_content && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Không thể ghi file credentials. Vui lòng lưu nội dung sau vào <code>/etc/cloudflared/{tunnelResult.tunnel_id}.json</code>:
                  <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.900', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem', maxHeight: 200, overflow: 'auto' }}>
                    {tunnelResult.credentials_content}
                  </Paper>
                  <Button
                    size="small"
                    startIcon={<ContentCopy />}
                    onClick={() => copyToClipboard(tunnelResult.credentials_content)}
                    sx={{ mt: 1 }}
                  >
                    Copy
                  </Button>
                </Alert>
              )}
            </>
          ) : (
            <Alert severity="error" sx={{ mb: 2 }}>
              {tunnelResult.error}
            </Alert>
          )}
        </>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <Button onClick={handleBack}>Quay lại</Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={!tunnelResult?.success}
        >
          Tiếp tục
        </Button>
      </Stack>
    </Box>
  );

  // Step 4: Create DNS
  const handleCreateDNS = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await apiClient.post('/admin/cloudflare-setup/create-dns', {
        api_token: wizardData.apiToken,
        zone_id: wizardData.zoneId,
        tunnel_id: wizardData.tunnelId,
        domain: wizardData.domain,
        proxmox_subdomain: wizardData.proxmoxSubdomain,
        portal_subdomain: wizardData.portalSubdomain,
      });

      setDnsResult(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Lỗi tạo DNS records');
    } finally {
      setLoading(false);
    }
  };

  const renderStep4 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tạo DNS CNAME records cho Proxmox và Portal.
      </Typography>

      <Stack spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Proxmox Subdomain"
          value={wizardData.proxmoxSubdomain}
          onChange={(e) => updateWizardData({ proxmoxSubdomain: e.target.value })}
          fullWidth
        />
        <TextField
          label="Portal Subdomain"
          value={wizardData.portalSubdomain}
          onChange={(e) => updateWizardData({ portalSubdomain: e.target.value })}
          fullWidth
        />
      </Stack>

      <Paper sx={{ p: 2, mb: 2, bgcolor: 'info.light', color: 'info.contrastText' }}>
        <Typography variant="body2" fontWeight="bold">Preview:</Typography>
        <Typography variant="body2">
          {wizardData.proxmoxSubdomain}.{wizardData.domain} → Proxmox UI
        </Typography>
        <Typography variant="body2">
          {wizardData.portalSubdomain}.{wizardData.domain} → VM Portal
        </Typography>
      </Paper>

      <Button
        variant="contained"
        startIcon={loading ? <CircularProgress size={16} /> : <PlayArrow />}
        onClick={handleCreateDNS}
        disabled={loading}
        sx={{ mb: 2 }}
      >
        Tạo DNS Records
      </Button>

      {dnsResult && (
        <>
          {dnsResult.success ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              DNS records đã được tạo thành công!
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {dnsResult.records_created.map((record: string) => (
                  <Box key={record} sx={{ display: 'flex', alignItems: 'center' }}>
                    <CheckCircle fontSize="small" sx={{ mr: 1, color: 'success.main' }} />
                    <Typography variant="body2">{record}</Typography>
                  </Box>
                ))}
              </Stack>
            </Alert>
          ) : (
            <Alert severity="error" sx={{ mb: 2 }}>
              {dnsResult.errors.map((err: string, idx: number) => (
                <div key={idx}>{err}</div>
              ))}
            </Alert>
          )}
        </>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <Button onClick={handleBack}>Quay lại</Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={!dnsResult?.success}
        >
          Tiếp tục
        </Button>
      </Stack>
    </Box>
  );

  // Step 5: Generate config
  const handleGenerateConfig = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await apiClient.post('/admin/cloudflare-setup/generate-config', {
        tunnel_id: wizardData.tunnelId,
        domain: wizardData.domain,
        proxmox_subdomain: wizardData.proxmoxSubdomain,
        portal_subdomain: wizardData.portalSubdomain,
        config_path: wizardData.configPath,
      });

      setConfigResult(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Lỗi tạo config');
    } finally {
      setLoading(false);
    }
  };

  const renderStep5 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tạo file cấu hình cloudflared.
      </Typography>

      <TextField
        label="Config Path"
        value={wizardData.configPath}
        onChange={(e) => updateWizardData({ configPath: e.target.value })}
        fullWidth
        sx={{ mb: 2 }}
      />

      <Button
        variant="contained"
        startIcon={loading ? <CircularProgress size={16} /> : <PlayArrow />}
        onClick={handleGenerateConfig}
        disabled={loading}
        sx={{ mb: 2 }}
      >
        Tạo Config
      </Button>

      {configResult && (
        <>
          <Alert severity={configResult.written_to_file ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {configResult.written_to_file ? (
              <>Config đã được ghi vào {wizardData.configPath}</>
            ) : (
              <>Không thể ghi file. Vui lòng lưu nội dung sau vào {wizardData.configPath}</>
            )}
          </Alert>

          <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.900', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem', maxHeight: 300, overflow: 'auto' }}>
            {configResult.config_content}
          </Paper>

          <Button
            size="small"
            startIcon={<ContentCopy />}
            onClick={() => copyToClipboard(configResult.config_content)}
            sx={{ mb: 2 }}
          >
            Copy Config
          </Button>
        </>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <Button onClick={handleBack}>Quay lại</Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={!configResult}
        >
          Tiếp tục
        </Button>
      </Stack>
    </Box>
  );

  // Step 6: Start service
  const handleStartService = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await apiClient.post('/admin/cloudflare-setup/start-service');
      setServiceResult(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Lỗi khởi chạy service');
    } finally {
      setLoading(false);
    }
  };

  const renderStep6 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Cài đặt và khởi chạy cloudflared service.
      </Typography>

      <Button
        variant="contained"
        startIcon={loading ? <CircularProgress size={16} /> : <PlayArrow />}
        onClick={handleStartService}
        disabled={loading}
        sx={{ mb: 2 }}
      >
        Khởi chạy cloudflared
      </Button>

      {serviceResult && (
        <>
          {serviceResult.success ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Service đã được khởi chạy thành công!
              <br />
              Status: {serviceResult.status}
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {serviceResult.error}
              <br />
              Vui lòng chạy lệnh sau trên host:
              <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.900', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                cloudflared service install
                <br />
                systemctl enable cloudflared
                <br />
                systemctl start cloudflared
              </Paper>
            </Alert>
          )}
        </>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <Button onClick={handleBack}>Quay lại</Button>
        <Button variant="contained" onClick={handleNext}>
          Tiếp tục
        </Button>
      </Stack>
    </Box>
  );

  // Step 7: Finalize
  const handleFinalize = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await apiClient.post('/admin/cloudflare-setup/finalize', {
        domain: wizardData.domain,
        cf_api_token: wizardData.apiToken,
        cf_zone_id: wizardData.zoneId,
        cf_tunnel_id: wizardData.tunnelId,
        cf_tunnel_name: wizardData.tunnelName,
        cloudflared_config_path: wizardData.configPath,
      });

      setFinalResult(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Lỗi hoàn tất cấu hình');
    } finally {
      setLoading(false);
    }
  };

  const renderStep7 = () => (
    <Box>
      {!finalResult ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Lưu cấu hình vào database và hoàn tất thiết lập.
          </Typography>

          <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
            <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
              Tóm tắt cấu hình:
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <Typography variant="body2">Domain: {wizardData.domain}</Typography>
            <Typography variant="body2">Tunnel ID: {wizardData.tunnelId}</Typography>
            <Typography variant="body2">Tunnel Name: {wizardData.tunnelName}</Typography>
            <Typography variant="body2">Proxmox: {wizardData.proxmoxSubdomain}.{wizardData.domain}</Typography>
            <Typography variant="body2">Portal: {wizardData.portalSubdomain}.{wizardData.domain}</Typography>
          </Paper>

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} /> : <Save />}
            onClick={handleFinalize}
            disabled={loading}
            sx={{ mb: 2 }}
          >
            Lưu và hoàn tất
          </Button>
        </>
      ) : (
        <>
          {finalResult.success ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body1" fontWeight="bold" sx={{ mb: 1 }}>
                Hoàn tất cấu hình thành công!
              </Typography>
              <Typography variant="body2">
                Domain {finalResult.domain} đã được lưu vào hệ thống.
              </Typography>
            </Alert>
          ) : (
            <Alert severity="error" sx={{ mb: 2 }}>
              {finalResult.error}
            </Alert>
          )}

          <Button
            variant="contained"
            onClick={() => navigate('/admin/cloudflare-domains')}
            sx={{ mt: 2 }}
          >
            Quản lý Cloudflare Domains
          </Button>
        </>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {!finalResult && (
        <Stack direction="row" spacing={2}>
          <Button onClick={handleBack}>Quay lại</Button>
        </Stack>
      )}
    </Box>
  );

  const stepComponents = [
    renderStep0,
    renderStep1,
    renderStep2,
    renderStep3,
    renderStep4,
    renderStep5,
    renderStep6,
    renderStep7,
  ];

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Cấu hình Cloudflare Tunnel
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Wizard tự động để thiết lập Cloudflare Tunnel cho Proxmox và VM Portal.
      </Typography>

      <Card sx={{ p: 3 }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {STEPS.map((label, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
              <StepContent>{stepComponents[index]()}</StepContent>
            </Step>
          ))}
        </Stepper>
      </Card>
    </Box>
  );
}
