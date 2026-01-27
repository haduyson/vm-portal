import React, { useEffect, useState } from 'react';
import {
  Paper,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Switch,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  IconButton,
  Snackbar,
  Alert,
  CircularProgress,
  Divider,
  Box,
  FormControlLabel,
} from '@mui/material';
import { Delete, Add, Security } from '@mui/icons-material';
import apiClient from '../services/api-client';

interface FirewallRule {
  pos: number;
  type: string;
  action: string;
  enabled: number | null;
  comment: string | null;
  source: string | null;
  dest: string | null;
  sport: string | null;
  dport: string | null;
  proto: string | null;
  macro: string | null;
}

interface FirewallOptions {
  enable: boolean;
  dhcp: boolean;
  log_level_in: string;
  log_level_out: string;
  policy_in: string;
  policy_out: string;
}

interface VmFirewallManagementSectionProps {
  vmId: number;
}

const VmFirewallManagementSection: React.FC<VmFirewallManagementSectionProps> = ({ vmId }) => {
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [options, setOptions] = useState<FirewallOptions>({
    enable: false,
    dhcp: false,
    log_level_in: 'nolog',
    log_level_out: 'nolog',
    policy_in: 'DROP',
    policy_out: 'ACCEPT',
  });
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRulePos, setSelectedRulePos] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const [newRule, setNewRule] = useState({
    type: 'in',
    action: 'ACCEPT',
    proto: '',
    source: '',
    dport: '',
    comment: '',
  });

  const fetchFirewallData = async () => {
    setLoading(true);
    try {
      const [rulesRes, optionsRes] = await Promise.all([
        apiClient.get(`/vms/${vmId}/firewall/rules`),
        apiClient.get(`/vms/${vmId}/firewall/options`),
      ]);
      setRules(rulesRes.data);
      setOptions(optionsRes.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể tải dữ liệu firewall';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFirewallData();
  }, [vmId]);

  const handleSaveOptions = async () => {
    try {
      await apiClient.put(`/vms/${vmId}/firewall/options`, options);
      setSnackbar({ open: true, message: 'Đã lưu tùy chọn firewall', severity: 'success' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể lưu tùy chọn';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  const handleAddRule = async () => {
    try {
      await apiClient.post(`/vms/${vmId}/firewall/rules`, newRule);
      setSnackbar({ open: true, message: 'Đã thêm luật firewall', severity: 'success' });
      setAddDialogOpen(false);
      setNewRule({ type: 'in', action: 'ACCEPT', proto: '', source: '', dport: '', comment: '' });
      fetchFirewallData();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể thêm luật';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  const handleDeleteRule = async () => {
    if (selectedRulePos === null) return;
    try {
      await apiClient.delete(`/vms/${vmId}/firewall/rules/${selectedRulePos}`);
      setSnackbar({ open: true, message: 'Đã xóa luật firewall', severity: 'success' });
      setDeleteDialogOpen(false);
      setSelectedRulePos(null);
      fetchFirewallData();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể xóa luật';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'ACCEPT':
        return 'success';
      case 'DROP':
        return 'error';
      case 'REJECT':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Security />
          <Typography variant="h6">Tùy chọn Firewall</Typography>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Box display="flex" flexDirection="column" gap={2} mb={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={options.enable}
                    onChange={(e) => setOptions({ ...options, enable: e.target.checked })}
                  />
                }
                label="Bật Firewall"
              />
              <FormControl fullWidth>
                <InputLabel>Chính sách vào</InputLabel>
                <Select
                  value={options.policy_in}
                  label="Chính sách vào"
                  onChange={(e) => setOptions({ ...options, policy_in: e.target.value })}
                >
                  <MenuItem value="ACCEPT">ACCEPT</MenuItem>
                  <MenuItem value="DROP">DROP</MenuItem>
                  <MenuItem value="REJECT">REJECT</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Chính sách ra</InputLabel>
                <Select
                  value={options.policy_out}
                  label="Chính sách ra"
                  onChange={(e) => setOptions({ ...options, policy_out: e.target.value })}
                >
                  <MenuItem value="ACCEPT">ACCEPT</MenuItem>
                  <MenuItem value="DROP">DROP</MenuItem>
                  <MenuItem value="REJECT">REJECT</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Button variant="contained" onClick={handleSaveOptions}>
              Lưu
            </Button>
          </>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Luật Firewall</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddDialogOpen(true)}>
            Thêm luật
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : rules.length === 0 ? (
          <Alert severity="info">Không có luật firewall nào</Alert>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell>Hành động</TableCell>
                <TableCell>Giao thức</TableCell>
                <TableCell>Nguồn</TableCell>
                <TableCell>Đích</TableCell>
                <TableCell>Cổng</TableCell>
                <TableCell>Ghi chú</TableCell>
                <TableCell>Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.pos}>
                  <TableCell>{rule.pos}</TableCell>
                  <TableCell>
                    <Chip label={rule.type.toUpperCase()} color={rule.type === 'in' ? 'primary' : 'secondary'} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip label={rule.action} color={getActionColor(rule.action)} size="small" />
                  </TableCell>
                  <TableCell>{rule.proto || '-'}</TableCell>
                  <TableCell>{rule.source || '-'}</TableCell>
                  <TableCell>{rule.dest || '-'}</TableCell>
                  <TableCell>{rule.dport || rule.sport || '-'}</TableCell>
                  <TableCell>{rule.comment || '-'}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        setSelectedRulePos(rule.pos);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Add Rule Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm luật Firewall</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <FormControl fullWidth>
              <InputLabel>Loại</InputLabel>
              <Select
                value={newRule.type}
                label="Loại"
                onChange={(e) => setNewRule({ ...newRule, type: e.target.value })}
              >
                <MenuItem value="in">IN</MenuItem>
                <MenuItem value="out">OUT</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Hành động</InputLabel>
              <Select
                value={newRule.action}
                label="Hành động"
                onChange={(e) => setNewRule({ ...newRule, action: e.target.value })}
              >
                <MenuItem value="ACCEPT">ACCEPT</MenuItem>
                <MenuItem value="DROP">DROP</MenuItem>
                <MenuItem value="REJECT">REJECT</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Giao thức</InputLabel>
              <Select
                value={newRule.proto}
                label="Giao thức"
                onChange={(e) => setNewRule({ ...newRule, proto: e.target.value })}
              >
                <MenuItem value="">Tất cả</MenuItem>
                <MenuItem value="tcp">TCP</MenuItem>
                <MenuItem value="udp">UDP</MenuItem>
                <MenuItem value="icmp">ICMP</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Nguồn"
              value={newRule.source}
              onChange={(e) => setNewRule({ ...newRule, source: e.target.value })}
              placeholder="0.0.0.0/0"
            />
            <TextField
              fullWidth
              label="Cổng đích"
              value={newRule.dport}
              onChange={(e) => setNewRule({ ...newRule, dport: e.target.value })}
              placeholder="80, 443, 8000-9000"
            />
            <TextField
              fullWidth
              label="Ghi chú"
              value={newRule.comment}
              onChange={(e) => setNewRule({ ...newRule, comment: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleAddRule}>
            Thêm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <Typography>Bạn có chắc chắn muốn xóa luật này không?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Hủy</Button>
          <Button variant="contained" color="error" onClick={handleDeleteRule}>
            Xóa
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default VmFirewallManagementSection;
