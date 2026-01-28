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

interface AdminStats {
  total_users: number;
  total_vms: number;
  running_vms: number;
  creating_vms: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, running: 0, installing: 0 });
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await apiClient.get('/vms');
        const vms = response.data.vms || [];

        setStats({
          total: response.data.total || vms.length,
          running: vms.filter((vm: any) => vm.status === 'running').length,
          installing: vms.filter((vm: any) => vm.status === 'installing' || vm.status === 'creating').length,
        });

        // Fetch admin stats if user is admin
        if (user?.is_admin) {
          const adminResponse = await apiClient.get('/admin/stats');
          setAdminStats(adminResponse.data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user]);

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

      {user?.is_admin && adminStats && (
        <>
          <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
            Thống kê hệ thống
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'primary.light' }}>
                <CardContent>
                  <Typography color="white" gutterBottom>
                    Tổng người dùng
                  </Typography>
                  <Typography variant="h4" color="white">
                    {adminStats.total_users}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'secondary.light' }}>
                <CardContent>
                  <Typography color="white" gutterBottom>
                    Tổng VM (hệ thống)
                  </Typography>
                  <Typography variant="h4" color="white">
                    {adminStats.total_vms}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'success.light' }}>
                <CardContent>
                  <Typography color="white" gutterBottom>
                    VM đang chạy (hệ thống)
                  </Typography>
                  <Typography variant="h4" color="white">
                    {adminStats.running_vms}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'warning.light' }}>
                <CardContent>
                  <Typography color="white" gutterBottom>
                    VM đang tạo (hệ thống)
                  </Typography>
                  <Typography variant="h4" color="white">
                    {adminStats.creating_vms}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

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
