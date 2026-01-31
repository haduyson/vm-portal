import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Typography,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  IconButton,
  Chip,
  LinearProgress,
  Stack,
  InputAdornment,
} from '@mui/material';
import {
  Edit,
  Delete,
  Storage,
  Add,
  Refresh,
  Visibility,
  VisibilityOff,
  Lan,
} from '@mui/icons-material';
import apiClient from '../services/api-client';

interface ProxmoxServer {
  id: number;
  name: string;
  host: string;
  port: number;
  user: string;
  token_name: string;
  node: string;
  excluded_storages: string[];
  cloud_init_template_vmid: number | null;
  reserve_cpu_percent: number | null;
  reserve_ram_percent: number | null;
  reserve_disk_percent: number | null;
  is_active: boolean;
}

interface ProxmoxStorageItem {
  storage: string;
  type: string;
  content: string;
  total_gb: number;
  used_gb: number;
  available_gb: number;
  allocated_gb: number;
  active: boolean;
}

interface ResourceData {
  id: number;
  name: string;
  cpu_model: string;
  cpu_sockets: number;
  cpu_cores_per_socket: number;
  cpu_total_cores: number;
  cpu_percent: number;
  cpu_allocated_cores: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_allocated_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_allocated_gb: number;
}

interface NetworkBridge {
  id: number;
  proxmox_server_id: number;
  bridge_name: string;
  display_name: string | null;
  vlan_min: number | null;
  vlan_max: number | null;
  is_public_network: boolean;
  is_enabled: boolean;
  created_at: string;
}

export default function AdminProxmoxServersPage() {
  const [servers, setServers] = useState<ProxmoxServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentServerId, setCurrentServerId] = useState<number | null>(null);
  const [resourceData, setResourceData] = useState<ResourceData | null>(null);
  const [storageData, setStorageData] = useState<ProxmoxStorageItem[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [loadingStorages, setLoadingStorages] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showTokenValue, setShowTokenValue] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(8006);
  const [user, setUser] = useState('root@pam');
  const [tokenName, setTokenName] = useState('');
  const [tokenValue, setTokenValue] = useState('');
  const [node, setNode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [detectedNode, setDetectedNode] = useState('');
  const [cloudInitTemplateVmid, setCloudInitTemplateVmid] = useState<string>('');
  const [reserveCpuPercent, setReserveCpuPercent] = useState<string>('');
  const [reserveRamPercent, setReserveRamPercent] = useState<string>('');
  const [reserveDiskPercent, setReserveDiskPercent] = useState<string>('');

  // Alerts
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/proxmox-servers');
      setServers(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể tải danh sách server');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setHost('');
    setPort(8006);
    setUser('root@pam');
    setTokenName('');
    setTokenValue('');
    setNode('');
    setIsActive(true);
    setShowTokenValue(false);
    setDetectedNode('');
    setCloudInitTemplateVmid('');
    setReserveCpuPercent('');
    setReserveRamPercent('');
    setReserveDiskPercent('');
  };

  const handleOpenAddDialog = () => {
    resetForm();
    setEditMode(false);
    setCurrentServerId(null);
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (server: ProxmoxServer) => {
    setName(server.name);
    setHost(server.host);
    setPort(server.port);
    setUser(server.user);
    setTokenName(server.token_name);
    setTokenValue('');
    setNode(server.node);
    setIsActive(server.is_active);
    setCloudInitTemplateVmid(server.cloud_init_template_vmid?.toString() || '');
    setReserveCpuPercent(server.reserve_cpu_percent?.toString() || '');
    setReserveRamPercent(server.reserve_ram_percent?.toString() || '');
    setReserveDiskPercent(server.reserve_disk_percent?.toString() || '');
    setEditMode(true);
    setCurrentServerId(server.id);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleTestConnection = async () => {
    if (!host || !tokenName || !tokenValue) {
      setErrorMessage('Vui lòng điền đầy đủ host, token name và token value');
      return;
    }

    try {
      setTestingConnection(true);
      setErrorMessage('');
      const response = await apiClient.post('/admin/proxmox-servers/test-connection', {
        host,
        port,
        user,
        token_name: tokenName,
        token_value: tokenValue,
      });

      if (response.data.success) {
        setDetectedNode(response.data.node);
        setSuccessMessage(`Kết nối thành công! Node được phát hiện: ${response.data.node}`);
      } else {
        setErrorMessage(`Kết nối thất bại: ${response.data.error}`);
      }
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể kết nối Proxmox');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    if (!name || !host || !tokenName) {
      setErrorMessage('Vui lòng điền đầy đủ các trường bắt buộc');
      return;
    }

    if (!editMode && !tokenValue) {
      setErrorMessage('Token value là bắt buộc khi thêm server mới');
      return;
    }

    try {
      setLoading(true);
      setSuccessMessage('');
      setErrorMessage('');

      const templateVmid = cloudInitTemplateVmid.trim() ? parseInt(cloudInitTemplateVmid) : null;
      const cpuReserve = reserveCpuPercent.trim() ? parseFloat(reserveCpuPercent) : null;
      const ramReserve = reserveRamPercent.trim() ? parseFloat(reserveRamPercent) : null;
      const diskReserve = reserveDiskPercent.trim() ? parseFloat(reserveDiskPercent) : null;

      if (editMode && currentServerId) {
        const payload: Record<string, unknown> = {
          name,
          host,
          port,
          user,
          token_name: tokenName,
          is_active: isActive,
          cloud_init_template_vmid: templateVmid,
          reserve_cpu_percent: cpuReserve,
          reserve_ram_percent: ramReserve,
          reserve_disk_percent: diskReserve,
        };
        if (tokenValue.trim()) {
          payload.token_value = tokenValue;
        }
        if (node.trim()) {
          payload.node = node;
        }
        await apiClient.put(`/admin/proxmox-servers/${currentServerId}`, payload);
        setSuccessMessage('Đã cập nhật server thành công');
      } else {
        const payload: Record<string, unknown> = {
          name,
          host,
          port,
          user,
          token_name: tokenName,
          token_value: tokenValue,
          cloud_init_template_vmid: templateVmid,
          reserve_cpu_percent: cpuReserve,
          reserve_ram_percent: ramReserve,
          reserve_disk_percent: diskReserve,
        };
        await apiClient.post('/admin/proxmox-servers', payload);
        setSuccessMessage('Đã thêm server thành công');
      }

      handleCloseDialog();
      await loadServers();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể lưu server');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteDialog = (serverId: number) => {
    setCurrentServerId(serverId);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setCurrentServerId(null);
  };

  const handleDelete = async () => {
    if (!currentServerId) return;

    try {
      setLoading(true);
      await apiClient.delete(`/admin/proxmox-servers/${currentServerId}`);
      setSuccessMessage('Đã xóa server thành công');
      handleCloseDeleteDialog();
      await loadServers();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể xóa server');
    } finally {
      setLoading(false);
    }
  };

  const handleViewResources = async (serverId: number) => {
    setCurrentServerId(serverId);
    setResourceDialogOpen(true);
    setLoadingResources(true);
    setResourceData(null);

    try {
      const response = await apiClient.get(`/admin/proxmox-servers/${serverId}/resources`);
      setResourceData(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể tải thông tin tài nguyên');
      setResourceDialogOpen(false);
    } finally {
      setLoadingResources(false);
    }
  };

  const handleCloseResourceDialog = () => {
    setResourceDialogOpen(false);
    setResourceData(null);
    setCurrentServerId(null);
  };

  const [excludedStorages, setExcludedStorages] = useState<string[]>([]);
  const [savingExclusion, setSavingExclusion] = useState(false);

  // Bridge management state
  const [bridgeDialogOpen, setBridgeDialogOpen] = useState(false);
  const [bridges, setBridges] = useState<NetworkBridge[]>([]);
  const [loadingBridges, setLoadingBridges] = useState(false);
  const [syncingBridges, setSyncingBridges] = useState(false);
  const [savingBridge, setSavingBridge] = useState(false);

  const handleViewStorages = async (serverId: number) => {
    setCurrentServerId(serverId);
    setStorageDialogOpen(true);
    setLoadingStorages(true);
    setStorageData([]);

    // Load current excluded storages from server data
    const server = servers.find((s) => s.id === serverId);
    setExcludedStorages(server?.excluded_storages || []);

    try {
      const response = await apiClient.get(`/admin/proxmox-servers/${serverId}/storages`);
      setStorageData(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể tải danh sách storage');
      setStorageDialogOpen(false);
    } finally {
      setLoadingStorages(false);
    }
  };

  const handleToggleExcludeStorage = async (storageName: string) => {
    if (!currentServerId) return;
    setSavingExclusion(true);

    const isCurrentlyExcluded = excludedStorages.includes(storageName);
    const newExcluded = isCurrentlyExcluded
      ? excludedStorages.filter((s) => s !== storageName)
      : [...excludedStorages, storageName];

    try {
      await apiClient.put(`/admin/proxmox-servers/${currentServerId}`, {
        excluded_storages: newExcluded,
      });
      setExcludedStorages(newExcluded);
      // Update local servers state
      setServers((prev) =>
        prev.map((s) =>
          s.id === currentServerId ? { ...s, excluded_storages: newExcluded } : s
        )
      );
      setSuccessMessage(
        isCurrentlyExcluded
          ? `Đã cho phép người dùng tạo VM trên "${storageName}"`
          : `Đã chặn người dùng tạo VM trên "${storageName}"`
      );
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể cập nhật');
    } finally {
      setSavingExclusion(false);
    }
  };

  const handleCloseStorageDialog = () => {
    setStorageDialogOpen(false);
    setStorageData([]);
    setCurrentServerId(null);
    setExcludedStorages([]);
  };

  // Bridge management handlers
  const handleViewBridges = async (serverId: number) => {
    setCurrentServerId(serverId);
    setBridgeDialogOpen(true);
    setLoadingBridges(true);
    setBridges([]);

    try {
      const response = await apiClient.get(`/admin/proxmox-servers/${serverId}/bridges`);
      setBridges(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể tải danh sách bridges');
      setBridgeDialogOpen(false);
    } finally {
      setLoadingBridges(false);
    }
  };

  const handleSyncBridges = async () => {
    if (!currentServerId) return;
    setSyncingBridges(true);

    try {
      const response = await apiClient.post(`/admin/proxmox-servers/${currentServerId}/bridges/sync`);
      setSuccessMessage(`Đã đồng bộ: ${response.data.added} bridge mới, tổng ${response.data.total} bridges`);
      // Reload bridges
      const bridgesResponse = await apiClient.get(`/admin/proxmox-servers/${currentServerId}/bridges`);
      setBridges(bridgesResponse.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể đồng bộ bridges');
    } finally {
      setSyncingBridges(false);
    }
  };

  const handleToggleBridgeEnabled = async (bridge: NetworkBridge) => {
    if (!currentServerId) return;
    setSavingBridge(true);

    try {
      await apiClient.put(`/admin/proxmox-servers/${currentServerId}/bridges/${bridge.id}`, {
        is_enabled: !bridge.is_enabled,
      });
      setBridges((prev) =>
        prev.map((b) => (b.id === bridge.id ? { ...b, is_enabled: !b.is_enabled } : b))
      );
      setSuccessMessage(
        bridge.is_enabled
          ? `Đã tắt bridge "${bridge.bridge_name}"`
          : `Đã bật bridge "${bridge.bridge_name}"`
      );
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể cập nhật bridge');
    } finally {
      setSavingBridge(false);
    }
  };

  const handleToggleBridgePublic = async (bridge: NetworkBridge) => {
    if (!currentServerId) return;
    setSavingBridge(true);

    try {
      await apiClient.put(`/admin/proxmox-servers/${currentServerId}/bridges/${bridge.id}`, {
        is_public_network: !bridge.is_public_network,
      });
      setBridges((prev) =>
        prev.map((b) => (b.id === bridge.id ? { ...b, is_public_network: !b.is_public_network } : b))
      );
      setSuccessMessage(
        bridge.is_public_network
          ? `Đã bỏ đánh dấu "${bridge.bridge_name}" là mạng public`
          : `Đã đánh dấu "${bridge.bridge_name}" là mạng public`
      );
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể cập nhật bridge');
    } finally {
      setSavingBridge(false);
    }
  };

  const handleUpdateBridgeVlan = async (bridge: NetworkBridge, vlanMin: number | null, vlanMax: number | null) => {
    if (!currentServerId) return;
    setSavingBridge(true);

    try {
      await apiClient.put(`/admin/proxmox-servers/${currentServerId}/bridges/${bridge.id}`, {
        vlan_min: vlanMin,
        vlan_max: vlanMax,
      });
      setBridges((prev) =>
        prev.map((b) => (b.id === bridge.id ? { ...b, vlan_min: vlanMin, vlan_max: vlanMax } : b))
      );
      setSuccessMessage(`Đã cập nhật VLAN range cho "${bridge.bridge_name}"`);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Không thể cập nhật VLAN range');
    } finally {
      setSavingBridge(false);
    }
  };

  const handleCloseBridgeDialog = () => {
    setBridgeDialogOpen(false);
    setBridges([]);
    setCurrentServerId(null);
  };

  const calculatePercentage = (used: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((used / total) * 100);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Quản lý Server Proxmox</Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadServers}
            disabled={loading}
            sx={{ mr: 2 }}
          >
            Làm mới
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpenAddDialog}
            disabled={loading}
          >
            Thêm server
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!errorMessage}
        autoHideDuration={6000}
        onClose={() => setErrorMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      </Snackbar>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tên</TableCell>
              <TableCell>Host</TableCell>
              <TableCell>Node</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="center">Tài nguyên</TableCell>
              <TableCell align="center">Storages</TableCell>
              <TableCell align="center">Bridges</TableCell>
              <TableCell align="right">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {servers.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography color="text.secondary">Chưa có server nào</Typography>
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography color="text.secondary">Đang tải...</Typography>
                </TableCell>
              </TableRow>
            )}
            {servers.map((server) => (
              <TableRow key={server.id}>
                <TableCell>
                  <Typography variant="body1" fontWeight="medium">
                    {server.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {server.host}:{server.port}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={server.node} size="small" />
                  {server.cloud_init_template_vmid && (
                    <Chip
                      label={`CI: ${server.cloud_init_template_vmid}`}
                      size="small"
                      color="info"
                      sx={{ ml: 1 }}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={server.is_active ? 'Hoạt động' : 'Vô hiệu'}
                    color={server.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    icon={<Storage fontSize="small" />}
                    label="Xem"
                    size="small"
                    color="primary"
                    variant="outlined"
                    onClick={() => handleViewResources(server.id)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label="Xem"
                    size="small"
                    color="info"
                    variant="outlined"
                    onClick={() => handleViewStorages(server.id)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    icon={<Lan fontSize="small" />}
                    label="Xem"
                    size="small"
                    color="secondary"
                    variant="outlined"
                    onClick={() => handleViewBridges(server.id)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => handleOpenEditDialog(server)}
                    title="Chỉnh sửa"
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleOpenDeleteDialog(server.id)}
                    title="Xóa"
                    color="error"
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editMode ? 'Chỉnh sửa server' : 'Thêm server mới'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              fullWidth
              helperText="IP hoặc hostname của Proxmox server"
            />
            <TextField
              label="Port"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
              fullWidth
              inputProps={{ min: 1, max: 65535 }}
            />
            <TextField
              label="User"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Token Name"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Token Value"
              type={showTokenValue ? 'text' : 'password'}
              value={tokenValue}
              onChange={(e) => setTokenValue(e.target.value)}
              required={!editMode}
              fullWidth
              placeholder={editMode ? 'Để trống nếu không đổi' : ''}
              helperText={editMode ? 'Chỉ nhập nếu muốn thay đổi token' : 'Bắt buộc'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowTokenValue(!showTokenValue)}
                      edge="end"
                    >
                      {showTokenValue ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {!editMode && (
              <>
                <Button
                  variant="outlined"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !host || !tokenName || !tokenValue}
                  fullWidth
                >
                  {testingConnection ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                </Button>
                {detectedNode && (
                  <Alert severity="success">
                    Node được phát hiện: <strong>{detectedNode}</strong>
                  </Alert>
                )}
              </>
            )}

            {editMode && (
              <>
                <TextField
                  label="Node"
                  value={node}
                  onChange={(e) => setNode(e.target.value)}
                  fullWidth
                  helperText="Tên node (tự động phát hiện, chỉ thay đổi nếu cần)"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                  }
                  label="Kích hoạt server"
                />
              </>
            )}

            <TextField
              label="Cloud-Init Template VM ID"
              type="number"
              value={cloudInitTemplateVmid}
              onChange={(e) => setCloudInitTemplateVmid(e.target.value)}
              fullWidth
              helperText="VM ID của template cloud-init (VD: 9000). Để trống nếu không dùng cloud-init."
            />

            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Dự trữ tài nguyên hệ thống (%)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Để trống = không giới hạn (0-50%)
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label="CPU dự trữ"
                  type="number"
                  value={reserveCpuPercent}
                  onChange={(e) => setReserveCpuPercent(e.target.value)}
                  inputProps={{ min: 0, max: 50, step: 1 }}
                  size="small"
                  fullWidth
                  InputProps={{ endAdornment: <Typography variant="body2">%</Typography> }}
                />
                <TextField
                  label="RAM dự trữ"
                  type="number"
                  value={reserveRamPercent}
                  onChange={(e) => setReserveRamPercent(e.target.value)}
                  inputProps={{ min: 0, max: 50, step: 1 }}
                  size="small"
                  fullWidth
                  InputProps={{ endAdornment: <Typography variant="body2">%</Typography> }}
                />
                <TextField
                  label="Disk dự trữ"
                  type="number"
                  value={reserveDiskPercent}
                  onChange={(e) => setReserveDiskPercent(e.target.value)}
                  inputProps={{ min: 0, max: 50, step: 1 }}
                  size="small"
                  fullWidth
                  InputProps={{ endAdornment: <Typography variant="body2">%</Typography> }}
                />
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={loading}>
            {loading ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <Typography>Bạn có chắc chắn muốn xóa server này không?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={loading}>
            {loading ? 'Đang xóa...' : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resources Dialog */}
      <Dialog open={resourceDialogOpen} onClose={handleCloseResourceDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Tài nguyên Server</DialogTitle>
        <DialogContent>
          {loadingResources && (
            <Box py={3} textAlign="center">
              <Typography color="text.secondary">Đang tải thông tin tài nguyên...</Typography>
            </Box>
          )}
          {!loadingResources && resourceData && (
            <Stack spacing={3} sx={{ mt: 2 }}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Server: {resourceData.name}
                </Typography>
              </Box>

              {/* CPU Info */}
              <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {resourceData.cpu_model}
                </Typography>
                <Typography variant="body2">
                  {resourceData.cpu_sockets} Socket × {resourceData.cpu_cores_per_socket} Cores = <strong>{resourceData.cpu_total_cores} Physical Cores</strong>
                </Typography>
              </Box>

              {/* CPU Usage */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight="medium">
                    CPU Usage (thực tế)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {resourceData.cpu_percent.toFixed(1)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={resourceData.cpu_percent}
                  sx={{ height: 8, borderRadius: 1 }}
                />
              </Box>

              {/* vCPU Allocation */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight="medium">
                    vCPU đã cấp phát
                  </Typography>
                  <Typography variant="body2" color={
                    resourceData.cpu_allocated_cores > resourceData.cpu_total_cores * 3 ? 'error.main' :
                    resourceData.cpu_allocated_cores > resourceData.cpu_total_cores * 2 ? 'warning.main' : 'text.secondary'
                  }>
                    {resourceData.cpu_allocated_cores} / {resourceData.cpu_total_cores * 3} vCPU (khuyến nghị tối đa 3:1)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min((resourceData.cpu_allocated_cores / (resourceData.cpu_total_cores * 3)) * 100, 100)}
                  sx={{ height: 8, borderRadius: 1 }}
                  color={
                    resourceData.cpu_allocated_cores > resourceData.cpu_total_cores * 3 ? 'error' :
                    resourceData.cpu_allocated_cores > resourceData.cpu_total_cores * 2 ? 'warning' : 'primary'
                  }
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Tỷ lệ: {(resourceData.cpu_allocated_cores / resourceData.cpu_total_cores).toFixed(1)}:1 |
                  Còn có thể cấp: {Math.max(0, resourceData.cpu_total_cores * 3 - resourceData.cpu_allocated_cores)} vCPU
                </Typography>
              </Box>

              {/* Memory */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight="medium">
                    RAM
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {resourceData.memory_used_mb.toFixed(0)} / {resourceData.memory_total_mb.toFixed(0)} MB
                    ({calculatePercentage(resourceData.memory_used_mb, resourceData.memory_total_mb)}%)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={calculatePercentage(resourceData.memory_used_mb, resourceData.memory_total_mb)}
                  sx={{ height: 8, borderRadius: 1 }}
                  color="secondary"
                />
              </Box>

              {/* Disk */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight="medium">
                    Disk
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {resourceData.disk_used_gb.toFixed(1)} / {resourceData.disk_total_gb.toFixed(1)} GB
                    ({calculatePercentage(resourceData.disk_used_gb, resourceData.disk_total_gb)}%)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={calculatePercentage(resourceData.disk_used_gb, resourceData.disk_total_gb)}
                  sx={{ height: 8, borderRadius: 1 }}
                  color="warning"
                />
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseResourceDialog}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Storage Dialog */}
      <Dialog open={storageDialogOpen} onClose={handleCloseStorageDialog} maxWidth="md" fullWidth>
        <DialogTitle>Danh sách Storage</DialogTitle>
        <DialogContent>
          {loadingStorages && (
            <Box py={3} textAlign="center">
              <Typography color="text.secondary">Đang tải danh sách storage...</Typography>
            </Box>
          )}
          {!loadingStorages && storageData.length > 0 && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Tắt "Cho phép tạo VM" để chặn người dùng tạo VM trên storage đó. Admin vẫn có thể tạo VM trên mọi storage.
              </Alert>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Storage</TableCell>
                    <TableCell>Loại</TableCell>
                    <TableCell>Content</TableCell>
                    <TableCell align="right">Tổng (GB)</TableCell>
                    <TableCell align="right">Đã cấp phát (GB)</TableCell>
                    <TableCell align="right">Còn lại (GB)</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell align="center">Cho phép tạo VM</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {storageData.map((storage, index) => {
                    const isExcluded = excludedStorages.includes(storage.storage);
                    return (
                      <TableRow
                        key={index}
                        sx={{ opacity: isExcluded ? 0.6 : 1 }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {storage.storage}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={storage.type} size="small" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {storage.content}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{storage.total_gb.toFixed(2)}</TableCell>
                        <TableCell align="right">{storage.allocated_gb.toFixed(2)}</TableCell>
                        <TableCell align="right">{storage.available_gb.toFixed(2)}</TableCell>
                        <TableCell>
                          <Chip
                            label={storage.active ? 'Hoạt động' : 'Không hoạt động'}
                            color={storage.active ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Switch
                            checked={!isExcluded}
                            onChange={() => handleToggleExcludeStorage(storage.storage)}
                            disabled={savingExclusion}
                            color="primary"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
          {!loadingStorages && storageData.length === 0 && (
            <Box py={3} textAlign="center">
              <Typography color="text.secondary">Không có storage nào</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseStorageDialog}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Bridge Management Dialog */}
      <Dialog open={bridgeDialogOpen} onClose={handleCloseBridgeDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Quản lý Network Bridges</Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Refresh />}
              onClick={handleSyncBridges}
              disabled={syncingBridges}
            >
              {syncingBridges ? 'Đang đồng bộ...' : 'Sync từ Proxmox'}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingBridges && (
            <Box py={3} textAlign="center">
              <Typography color="text.secondary">Đang tải danh sách bridges...</Typography>
            </Box>
          )}
          {!loadingBridges && bridges.length > 0 && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Bật/tắt "Cho phép tạo VM" để kiểm soát bridge nào người dùng có thể chọn khi tạo VM.
                Đánh dấu "Public" cho mạng có IP public (dùng cho IP Pool).
              </Alert>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Bridge</TableCell>
                    <TableCell>Display Name</TableCell>
                    <TableCell align="center">VLAN Range</TableCell>
                    <TableCell align="center">Public Network</TableCell>
                    <TableCell align="center">Cho phép tạo VM</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bridges.map((bridge) => (
                    <TableRow
                      key={bridge.id}
                      sx={{ opacity: bridge.is_enabled ? 1 : 0.6 }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {bridge.bridge_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {bridge.display_name || bridge.bridge_name}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                          <TextField
                            size="small"
                            type="number"
                            placeholder="Min"
                            value={bridge.vlan_min ?? ''}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value) : null;
                              setBridges((prev) =>
                                prev.map((b) => (b.id === bridge.id ? { ...b, vlan_min: val } : b))
                              );
                            }}
                            onBlur={() => handleUpdateBridgeVlan(bridge, bridge.vlan_min, bridge.vlan_max)}
                            sx={{ width: 70 }}
                            inputProps={{ min: 1, max: 4094 }}
                          />
                          <Typography variant="body2">-</Typography>
                          <TextField
                            size="small"
                            type="number"
                            placeholder="Max"
                            value={bridge.vlan_max ?? ''}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value) : null;
                              setBridges((prev) =>
                                prev.map((b) => (b.id === bridge.id ? { ...b, vlan_max: val } : b))
                              );
                            }}
                            onBlur={() => handleUpdateBridgeVlan(bridge, bridge.vlan_min, bridge.vlan_max)}
                            sx={{ width: 70 }}
                            inputProps={{ min: 1, max: 4094 }}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={bridge.is_public_network}
                          onChange={() => handleToggleBridgePublic(bridge)}
                          disabled={savingBridge}
                          color="warning"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={bridge.is_enabled}
                          onChange={() => handleToggleBridgeEnabled(bridge)}
                          disabled={savingBridge}
                          color="primary"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
          {!loadingBridges && bridges.length === 0 && (
            <Box py={3} textAlign="center">
              <Typography color="text.secondary" gutterBottom>
                Chưa có bridge nào được cấu hình
              </Typography>
              <Button
                variant="contained"
                onClick={handleSyncBridges}
                disabled={syncingBridges}
                sx={{ mt: 2 }}
              >
                {syncingBridges ? 'Đang đồng bộ...' : 'Sync bridges từ Proxmox'}
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBridgeDialog}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
