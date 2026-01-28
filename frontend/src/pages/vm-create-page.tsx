import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Alert,
  TextField,
  Typography,
  Slider,
  Stack,
  Chip,
  LinearProgress,
  Radio,
  RadioGroup,
  FormControlLabel,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import apiClient from '../services/api-client';

interface Quota {
  max_vms: number | null;
  used_vms: number;
  max_disk_gb: number | null;
  used_disk_gb: number;
  max_ram_mb: number | null;
  used_ram_mb: number;
  max_cpu_cores: number | null;
  used_cpu_cores: number;
}

interface ServerResource {
  id: number;
  name: string;
  // CPU
  cpu_model: string;
  cpu_sockets: number;
  cpu_cores_per_socket: number;
  cpu_total_cores: number;
  cpu_percent: number;
  cpu_allocated_cores: number;
  // RAM
  memory_total_mb: number;
  memory_used_mb: number;
  memory_allocated_mb: number;
  // Disk
  disk_total_gb: number;
  disk_used_gb: number;
  disk_allocated_gb: number;
}

interface StorageItem {
  storage: string;
  type: string;
  content: string;
  total_gb: number;
  used_gb: number;
  available_gb: number;
  allocated_gb: number;
  active: boolean;
}

interface OsTemplateOption {
  id: number;
  label: string;
  os_type_key: string;
  description: string | null;
  is_enabled: boolean;
  sort_order: number;
}

export default function VMCreatePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [quota, setQuota] = useState<Quota | null>(null);
  const [servers, setServers] = useState<ServerResource[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [storages, setStorages] = useState<StorageItem[]>([]);
  const [storagesLoading, setStoragesLoading] = useState(false);
  const [selectedStorage, setSelectedStorage] = useState<string>('');
  const [osTemplates, setOsTemplates] = useState<OsTemplateOption[]>([]);
  const [osTemplatesLoading, setOsTemplatesLoading] = useState(false);
  const [sshSubdomain, setSshSubdomain] = useState('');
  const [subdomainStatus, setSubdomainStatus] = useState<{ available?: boolean; reason?: string; domain?: string } | null>(null);
  const [subdomainChecking, setSubdomainChecking] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    cores: 2,
    ram_gb: 4,
    disk_gb: 50,
    os_type: 'ubuntu-24.04-cloudinit',
  });

  useEffect(() => {
    fetchQuota();
    fetchServers();
    fetchOsTemplates();
  }, []);

  const fetchQuota = async () => {
    try {
      const response = await apiClient.get('/auth/quota');
      setQuota(response.data);
    } catch (error) {
      console.error('Error fetching quota:', error);
    }
  };

  const fetchServers = async () => {
    setServersLoading(true);
    try {
      const response = await apiClient.get('/proxmox-servers/available');
      const data: ServerResource[] = response.data;
      setServers(data);
      // Pre-select server with most available memory
      if (data.length > 0) {
        const best = data.reduce((prev, curr) => {
          const prevFree = prev.memory_total_mb - prev.memory_used_mb;
          const currFree = curr.memory_total_mb - curr.memory_used_mb;
          return currFree > prevFree ? curr : prev;
        });
        setSelectedServerId(best.id);
        fetchStorages(best.id);
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
    } finally {
      setServersLoading(false);
    }
  };

  const fetchOsTemplates = async () => {
    setOsTemplatesLoading(true);
    try {
      const response = await apiClient.get('/os-templates/available');
      const data: OsTemplateOption[] = response.data;
      setOsTemplates(data);
      if (data.length > 0) {
        setFormData((prev) => ({ ...prev, os_type: data[0].os_type_key }));
      }
    } catch (error) {
      console.error('Error fetching OS templates:', error);
    } finally {
      setOsTemplatesLoading(false);
    }
  };

  const fetchStorages = async (serverId: number) => {
    setStoragesLoading(true);
    setStorages([]);
    setSelectedStorage('');
    try {
      const response = await apiClient.get(`/proxmox-servers/${serverId}/storages`);
      const data: StorageItem[] = response.data;
      setStorages(data);
      // Auto-select first storage with most available space
      if (data.length > 0) {
        const best = data.reduce((prev, curr) =>
          curr.available_gb > prev.available_gb ? curr : prev
        );
        setSelectedStorage(best.storage);
      }
    } catch (error) {
      console.error('Error fetching storages:', error);
    } finally {
      setStoragesLoading(false);
    }
  };

  const handleServerChange = (serverId: number) => {
    setSelectedServerId(serverId);
    fetchStorages(serverId);
  };

  const checkSubdomain = async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    setSshSubdomain(trimmed);
    setSubdomainStatus(null);
    if (!trimmed || trimmed.length < 3) return;
    setSubdomainChecking(true);
    try {
      const response = await apiClient.get(`/vms/check-subdomain/${trimmed}`);
      setSubdomainStatus(response.data);
    } catch {
      setSubdomainStatus(null);
    } finally {
      setSubdomainChecking(false);
    }
  };

  const applyPreset = (preset: 'small' | 'medium' | 'large') => {
    const presets = {
      small: { cores: 1, ram_gb: 1, disk_gb: 20 },
      medium: { cores: 2, ram_gb: 4, disk_gb: 50 },
      large: { cores: 4, ram_gb: 8, disk_gb: 100 },
    };
    setFormData({ ...formData, ...presets[preset] });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        cores: formData.cores,
        memory_mb: formData.ram_gb * 1024,
        disk_gb: formData.disk_gb,
        os_type: formData.os_type,
      };
      if (selectedServerId) {
        payload.server_id = selectedServerId;
      }
      if (selectedStorage) {
        payload.storage = selectedStorage;
      }
      if (sshSubdomain.trim()) {
        payload.ssh_subdomain = sshSubdomain.trim().toLowerCase();
      }
      await apiClient.post('/vms/', payload);
      setSnackbar({ open: true, message: 'Đã khởi tạo máy ảo thành công!', severity: 'success' });
      setTimeout(() => navigate('/vms'), 1500);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Có lỗi xảy ra khi tạo máy ảo';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const cpuAllocPercent = (s: ServerResource) =>
    s.cpu_total_cores > 0 ? Math.round((s.cpu_allocated_cores / s.cpu_total_cores) * 100) : 0;

  const memAllocPercent = (s: ServerResource) =>
    s.memory_total_mb > 0 ? Math.round((s.memory_allocated_mb / s.memory_total_mb) * 100) : 0;

  const diskAllocPercent = (s: ServerResource) =>
    s.disk_total_gb > 0 ? Math.round((s.disk_allocated_gb / s.disk_total_gb) * 100) : 0;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tạo Máy Ảo Mới
      </Typography>

      {quota && (
        <Card sx={{ maxWidth: 600, mt: 2, mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Giới hạn tài nguyên</Typography>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Chip
                label={`VM: ${quota.used_vms}${quota.max_vms !== null ? `/${quota.max_vms}` : ' (Không giới hạn)'}`}
                color={quota.max_vms !== null && quota.used_vms >= quota.max_vms ? 'error' : 'default'}
              />
              <Chip
                label={`Disk: ${quota.used_disk_gb}${quota.max_disk_gb !== null ? `/${quota.max_disk_gb}` : ''} GB${quota.max_disk_gb === null ? ' (Không giới hạn)' : ''}`}
                color={quota.max_disk_gb !== null && quota.used_disk_gb >= quota.max_disk_gb ? 'error' : 'default'}
              />
              <Chip
                label={`RAM: ${Math.round(quota.used_ram_mb / 1024)}${quota.max_ram_mb !== null ? `/${Math.round(quota.max_ram_mb / 1024)}` : ''} GB${quota.max_ram_mb === null ? ' (Không giới hạn)' : ''}`}
                color={quota.max_ram_mb !== null && quota.used_ram_mb >= quota.max_ram_mb ? 'error' : 'default'}
              />
              <Chip
                label={`CPU: ${quota.used_cpu_cores}${quota.max_cpu_cores !== null ? `/${quota.max_cpu_cores}` : ''} cores${quota.max_cpu_cores === null ? ' (Không giới hạn)' : ''}`}
                color={quota.max_cpu_cores !== null && quota.used_cpu_cores >= quota.max_cpu_cores ? 'error' : 'default'}
              />
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Server Selection */}
      {serversLoading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 2 }}>
          <CircularProgress size={20} />
          <Typography>Đang tải danh sách server...</Typography>
        </Box>
      ) : servers.length > 0 ? (
        <Card sx={{ maxWidth: 600, mt: 2, mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Chọn Server</Typography>
            <RadioGroup
              value={selectedServerId ?? ''}
              onChange={(e) => handleServerChange(Number(e.target.value))}
            >
              {servers.map((server) => (
                <Card
                  key={server.id}
                  variant="outlined"
                  sx={{
                    mb: 1,
                    p: 1.5,
                    cursor: 'pointer',
                    border: selectedServerId === server.id ? 2 : 1,
                    borderColor: selectedServerId === server.id ? 'primary.main' : 'divider',
                  }}
                  onClick={() => handleServerChange(server.id)}
                >
                  <FormControlLabel
                    value={server.id}
                    control={<Radio />}
                    label={
                      <Box sx={{ width: '100%' }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {server.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {server.cpu_model} | {server.cpu_sockets} Socket × {server.cpu_cores_per_socket} Cores ({server.cpu_total_cores} Threads)
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              CPU: {server.cpu_allocated_cores} / {server.cpu_total_cores} cores đã cấp phát ({cpuAllocPercent(server)}%) — Sử dụng: {server.cpu_percent}%
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(cpuAllocPercent(server), 100)}
                              color={cpuAllocPercent(server) > 80 ? 'error' : cpuAllocPercent(server) > 60 ? 'warning' : 'primary'}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </Box>
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              RAM: {Math.round(server.memory_allocated_mb / 1024)} / {Math.round(server.memory_total_mb / 1024)} GB đã cấp phát ({memAllocPercent(server)}%)
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(memAllocPercent(server), 100)}
                              color={memAllocPercent(server) > 80 ? 'error' : memAllocPercent(server) > 60 ? 'warning' : 'primary'}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </Box>
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              Disk: {server.disk_allocated_gb.toFixed(1)} / {server.disk_total_gb.toFixed(1)} GB đã cấp phát ({diskAllocPercent(server)}%)
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(diskAllocPercent(server), 100)}
                              color={diskAllocPercent(server) > 80 ? 'error' : diskAllocPercent(server) > 60 ? 'warning' : 'primary'}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </Box>
                        </Stack>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start', width: '100%', m: 0 }}
                  />
                </Card>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      ) : null}

      {/* Storage Selection */}
      {storagesLoading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 2 }}>
          <CircularProgress size={20} />
          <Typography>Đang tải danh sách storage...</Typography>
        </Box>
      ) : storages.length > 0 ? (
        <Card sx={{ maxWidth: 600, mt: 2, mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Chọn Storage</Typography>
            <FormControl fullWidth>
              <InputLabel>Storage</InputLabel>
              <Select
                value={selectedStorage}
                label="Storage"
                onChange={(e) => setSelectedStorage(e.target.value)}
              >
                {storages.map((storage) => (
                  <MenuItem key={storage.storage} value={storage.storage}>
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body1">
                        {storage.storage} ({storage.type})
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Tổng: {storage.total_gb.toFixed(2)} GB | Đã cấp phát: {storage.allocated_gb.toFixed(2)} GB | Trống: {Math.max(storage.total_gb - storage.allocated_gb, 0).toFixed(2)} GB
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </Card>
      ) : null}

      <Card sx={{ maxWidth: 600, mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Cấu hình mẫu</Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Button variant="outlined" onClick={() => applyPreset('small')}>
              Nhỏ (1 CPU, 1GB RAM, 20GB)
            </Button>
            <Button variant="outlined" onClick={() => applyPreset('medium')}>
              Trung bình (2 CPU, 4GB RAM, 50GB)
            </Button>
            <Button variant="outlined" onClick={() => applyPreset('large')}>
              Lớn (4 CPU, 8GB RAM, 100GB)
            </Button>
          </Stack>

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Tên máy ảo"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              helperText="Tên duy nhất để nhận diện máy ảo"
            />

            <Box sx={{ mt: 3 }}>
              <Typography gutterBottom>CPU (Cores): {formData.cores}</Typography>
              <Slider
                value={formData.cores}
                onChange={(_, value) => setFormData({ ...formData, cores: value as number })}
                min={1}
                max={16}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography gutterBottom>RAM (GB): {formData.ram_gb}</Typography>
              <Slider
                value={formData.ram_gb}
                onChange={(_, value) => setFormData({ ...formData, ram_gb: value as number })}
                min={1}
                max={64}
                step={1}
                marks={[
                  { value: 1, label: '1GB' },
                  { value: 16, label: '16GB' },
                  { value: 32, label: '32GB' },
                  { value: 64, label: '64GB' },
                ]}
                valueLabelDisplay="auto"
              />
            </Box>

            <TextField
              margin="normal"
              required
              fullWidth
              type="number"
              label="Ổ cứng (GB)"
              value={formData.disk_gb}
              onChange={(e) => setFormData({ ...formData, disk_gb: parseInt(e.target.value) || 50 })}
              inputProps={{ min: 10, max: 500 }}
            />

            <FormControl fullWidth margin="normal">
              <InputLabel>Hệ điều hành</InputLabel>
              <Select
                value={formData.os_type}
                label="Hệ điều hành"
                onChange={(e) => setFormData({ ...formData, os_type: e.target.value })}
                disabled={osTemplatesLoading}
              >
                {osTemplates.length > 0 ? (
                  osTemplates.map((tpl) => (
                    <MenuItem key={tpl.os_type_key} value={tpl.os_type_key}>
                      {tpl.label}
                    </MenuItem>
                  ))
                ) : (
                  <>
                    <MenuItem value="ubuntu-24.04-cloudinit">Ubuntu 24.04 (Cloud-Init) — Nhanh</MenuItem>
                    <MenuItem value="ubuntu-server-24.04">Ubuntu Server 24.04 (ISO)</MenuItem>
                  </>
                )}
              </Select>
            </FormControl>

            <TextField
              margin="normal"
              fullWidth
              label="SSH Subdomain (tùy chọn)"
              value={sshSubdomain}
              onChange={(e) => checkSubdomain(e.target.value)}
              InputProps={{
                endAdornment: <InputAdornment position="end">.hasonmedia.com</InputAdornment>,
              }}
              helperText={
                subdomainChecking
                  ? 'Đang kiểm tra...'
                  : subdomainStatus
                    ? subdomainStatus.available
                      ? `✓ ${subdomainStatus.domain} khả dụng`
                      : `✗ ${subdomainStatus.reason}`
                    : 'VD: myvm → myvm.hasonmedia.com (3-30 ký tự, chữ thường, số, gạch ngang)'
              }
              error={subdomainStatus !== null && !subdomainStatus.available}
              color={subdomainStatus?.available ? 'success' : undefined}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3 }}
              disabled={loading || !formData.name.trim() || (sshSubdomain.trim() !== '' && subdomainStatus !== null && !subdomainStatus.available)}
            >
              {loading ? 'Đang khởi tạo...' : 'Khởi tạo máy'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
