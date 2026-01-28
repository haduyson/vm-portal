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
  is_active: boolean;
}

interface ProxmoxServerCreate {
  name: string;
  host: string;
  port: number;
  user: string;
  token_name: string;
  token_value: string;
}

interface ProxmoxServerUpdate {
  name: string;
  host: string;
  port: number;
  user: string;
  token_name: string;
  token_value?: string;
  node?: string;
  is_active: boolean;
}

interface ProxmoxStorageItem {
  storage: string;
  type: string;
  content: string;
  total_gb: number;
  used_gb: number;
  available_gb: number;
  active: boolean;
}

interface ResourceData {
  id: number;
  name: string;
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
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

      if (editMode && currentServerId) {
        const payload: ProxmoxServerUpdate = {
          name,
          host,
          port,
          user,
          token_name: tokenName,
          is_active: isActive,
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
        const payload: ProxmoxServerCreate = {
          name,
          host,
          port,
          user,
          token_name: tokenName,
          token_value: tokenValue,
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
              <TableCell align="right">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {servers.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary">Chưa có server nào</Typography>
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={5} align="center">
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
                </TableCell>
                <TableCell>
                  <Chip
                    label={server.is_active ? 'Hoạt động' : 'Vô hiệu'}
                    color={server.is_active ? 'success' : 'default'}
                    size="small"
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
                    onClick={() => handleViewResources(server.id)}
                    title="Xem tài nguyên"
                    color="primary"
                  >
                    <Storage fontSize="small" />
                  </IconButton>
                  <Button
                    size="small"
                    onClick={() => handleViewStorages(server.id)}
                    variant="text"
                  >
                    Storages
                  </Button>
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

              {/* CPU */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight="medium">
                    CPU
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
    </Box>
  );
}
