import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Typography,
} from '@mui/material';
import { AddCircle as AddCircleIcon } from '@mui/icons-material';
import { useAuth } from '../hooks/use-auth-context';
import apiClient from '../services/api-client';

interface Stats {
  total: number;
  running: number;
  installing: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, running: 0, installing: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await apiClient.get('/vms/');
        const vms = response.data.vms || [];

        setStats({
          total: response.data.total || vms.length,
          running: vms.filter((vm: any) => vm.status === 'running').length,
          installing: vms.filter((vm: any) => vm.status === 'installing' || vm.status === 'creating').length,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Xin chào, {user?.username}!
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Tổng số VM
              </Typography>
              <Typography variant="h3">
                {loading ? '...' : stats.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Đang chạy
              </Typography>
              <Typography variant="h3" color="success.main">
                {loading ? '...' : stats.running}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Đang cài đặt
              </Typography>
              <Typography variant="h3" color="info.main">
                {loading ? '...' : stats.installing}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddCircleIcon />}
          onClick={() => navigate('/vms/create')}
        >
          Tạo máy ảo mới
        </Button>
      </Box>
    </Box>
  );
}
