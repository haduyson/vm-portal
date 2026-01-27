import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
  Card,
  CardContent,
  Stack,
} from '@mui/material';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';

interface AdminVM {
  id: number;
  vmid: number;
  name: string;
  username: string;
  status: string;
  cores: number;
  memory_mb: number;
  disk_gb: number;
  os_type: string;
  ip_address: string | null;
  ssh_domain: string | null;
  created_at: string;
}

interface AdminStats {
  total_users: number;
  total_vms: number;
  running_vms: number;
  creating_vms: number;
}

export default function AdminVmOverviewPage() {
  const [vms, setVms] = useState<AdminVM[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vmsRes, statsRes] = await Promise.all([
          apiClient.get('/admin/vms'),
          apiClient.get('/admin/stats'),
        ]);
        setVms(vmsRes.data);
        setStats(statsRes.data);
      } catch {
        setError('Không thể tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Box>
        <Typography variant="h4">Tất Cả Máy Ảo</Typography>
        <Typography sx={{ mt: 2 }}>Đang tải...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tất Cả Máy Ảo
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {stats && (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Tổng người dùng
              </Typography>
              <Typography variant="h5">{stats.total_users}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Tổng VM
              </Typography>
              <Typography variant="h5">{stats.total_vms}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Đang chạy
              </Typography>
              <Typography variant="h5" color="success.main">
                {stats.running_vms}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Đang tạo
              </Typography>
              <Typography variant="h5" color="warning.main">
                {stats.creating_vms}
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>VMID</TableCell>
              <TableCell>Tên VM</TableCell>
              <TableCell>Người dùng</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="right">CPU</TableCell>
              <TableCell align="right">RAM</TableCell>
              <TableCell align="right">Disk</TableCell>
              <TableCell>IP</TableCell>
              <TableCell>Ngày tạo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vms.map((vm) => (
              <TableRow key={vm.id} hover>
                <TableCell>{vm.vmid}</TableCell>
                <TableCell>{vm.name}</TableCell>
                <TableCell>{vm.username}</TableCell>
                <TableCell>
                  <VMStatusChip status={vm.status} />
                </TableCell>
                <TableCell align="right">{vm.cores} cores</TableCell>
                <TableCell align="right">
                  {Math.round(vm.memory_mb / 1024)} GB
                </TableCell>
                <TableCell align="right">{vm.disk_gb} GB</TableCell>
                <TableCell>{vm.ip_address || '-'}</TableCell>
                <TableCell>
                  {new Date(vm.created_at).toLocaleDateString('vi-VN')}
                </TableCell>
              </TableRow>
            ))}
            {vms.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  Chưa có máy ảo nào trong hệ thống.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
