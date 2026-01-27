import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import apiClient from '../services/api-client';

interface MetricsDataPoint {
  time: number;
  cpu: number | null;
  mem: number | null;
  maxmem: number | null;
  netin: number | null;
  netout: number | null;
  disk: number | null;
  maxdisk: number | null;
}

interface VmResourceChartsProps {
  vmId: number;
}

type Timeframe = 'hour' | 'day' | 'week' | 'month' | 'year';

const VmResourceCharts = ({ vmId }: VmResourceChartsProps) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('hour');
  const [metrics, setMetrics] = useState<MetricsDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ timeframe: string; data: MetricsDataPoint[] }>(
        `/vms/${vmId}/metrics?timeframe=${timeframe}`
      );
      setMetrics(response.data.data);
    } catch (err) {
      setError('Không thể tải dữ liệu biểu đồ');
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [vmId, timeframe]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-refresh every 60s for hour timeframe
  useEffect(() => {
    if (timeframe === 'hour') {
      const interval = setInterval(fetchMetrics, 60000);
      return () => clearInterval(interval);
    }
  }, [timeframe, fetchMetrics]);

  const handleTimeframeChange = (_: React.MouseEvent<HTMLElement>, value: Timeframe | null) => {
    if (value) setTimeframe(value);
  };

  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    if (timeframe === 'hour' || timeframe === 'day') {
      return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' });
  };

  const formatTooltipLabel = (label: any) => formatXAxis(Number(label));

  const formatCpuData = () =>
    metrics.map((m) => ({
      time: m.time,
      cpu: m.cpu !== null ? m.cpu * 100 : null,
    }));

  const formatMemData = () =>
    metrics.map((m) => ({
      time: m.time,
      mem: m.mem !== null ? m.mem / (1024 * 1024) : null,
      maxmem: m.maxmem !== null ? m.maxmem / (1024 * 1024) : null,
    }));

  const formatNetData = () =>
    metrics.map((m) => ({
      time: m.time,
      netin: m.netin !== null ? m.netin / 1024 : null,
      netout: m.netout !== null ? m.netout / 1024 : null,
    }));

  const cpuData = formatCpuData();
  const memData = formatMemData();
  const netData = formatNetData();
  const maxMemValue = memData[0]?.maxmem || 0;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (metrics.length === 0) {
    return <Alert severity="info">Chưa có dữ liệu biểu đồ</Alert>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Biểu đồ tài nguyên</Typography>
        <ToggleButtonGroup value={timeframe} exclusive onChange={handleTimeframeChange} size="small">
          <ToggleButton value="hour">Giờ</ToggleButton>
          <ToggleButton value="day">Ngày</ToggleButton>
          <ToggleButton value="week">Tuần</ToggleButton>
          <ToggleButton value="month">Tháng</ToggleButton>
          <ToggleButton value="year">Năm</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Sử dụng CPU (%)
        </Typography>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={cpuData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tickFormatter={formatXAxis} />
            <YAxis domain={[0, 100]} />
            <Tooltip labelFormatter={formatTooltipLabel} />
            <Legend />
            <Line type="monotone" dataKey="cpu" stroke="#1976D2" name="CPU" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Sử dụng bộ nhớ (MB)
        </Typography>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={memData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tickFormatter={formatXAxis} />
            <YAxis />
            <Tooltip labelFormatter={formatTooltipLabel} />
            <Legend />
            <Line type="monotone" dataKey="mem" stroke="#2E7D32" name="Bộ nhớ" dot={false} />
            {maxMemValue > 0 && (
              <ReferenceLine y={maxMemValue} stroke="#999" strokeDasharray="3 3" label="Max" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Lưu lượng mạng (KB/s)
        </Typography>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={netData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tickFormatter={formatXAxis} />
            <YAxis />
            <Tooltip labelFormatter={formatTooltipLabel} />
            <Legend />
            <Line type="monotone" dataKey="netin" stroke="#ED6C02" name="Tải về" dot={false} />
            <Line type="monotone" dataKey="netout" stroke="#9C27B0" name="Tải lên" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Paper>
    </Box>
  );
};

export default VmResourceCharts;
