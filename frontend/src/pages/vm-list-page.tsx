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
  Button,
} from '@mui/material';
import { AddCircle as AddCircleIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api-client';
import VMStatusChip from '../components/vm-status-chip';

interface VM {
  id: number;
  name: string;
  status: string;
  cores: number;
  memory_mb: number;
  ip_address: string | null;
  ssh_domain: string | null;
  created_at: string;
}

export default function VMListPage() {
  const navigate = useNavigate();
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVMs = async () => {
    try {
      const response = await apiClient.get('/vms/');
      setVms(response.data.vms || []);
    } catch (error) {
      console.error('Error fetching VMs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVMs();

    // Auto-refresh every 10 seconds if there are VMs in creating/installing status
    const interval = setInterval(() => {
      if (vms.some(vm => ['creating', 'installing'].includes(vm.status))) {
        fetchVMs();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [vms]);

  if (loading) {
    return (
      <Box>
        <Typography variant="h4">Danh Sách Máy Ảo</Typography>
        <Typography sx={{ mt: 2 }}>Đang tải...</Typography>
      </Box>
    );
  }

  if (vms.length === 0) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Danh Sách Máy Ảo
        </Typography>
        <Paper sx={{ p: 4, mt: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" paragraph>
            Chưa có máy ảo nào. Bấm 'Tạo máy ảo mới' để bắt đầu.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddCircleIcon />}
            onClick={() => navigate('/vms/create')}
          >
            Tạo máy ảo mới
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Danh Sách Máy Ảo
      </Typography>

      <TableContainer component={Paper} sx={{ mt: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tên VM</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="right">CPU</TableCell>
              <TableCell align="right">RAM</TableCell>
              <TableCell>IP</TableCell>
              <TableCell>SSH Domain</TableCell>
              <TableCell>Ngày tạo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vms.map((vm) => (
              <TableRow key={vm.id} hover>
                <TableCell>{vm.name}</TableCell>
                <TableCell>
                  <VMStatusChip status={vm.status} />
                </TableCell>
                <TableCell align="right">{vm.cores} cores</TableCell>
                <TableCell align="right">{Math.round(vm.memory_mb / 1024)} GB</TableCell>
                <TableCell>{vm.ip_address || '-'}</TableCell>
                <TableCell>{vm.ssh_domain || '-'}</TableCell>
                <TableCell>
                  {new Date(vm.created_at).toLocaleDateString('vi-VN')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
