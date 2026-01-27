import { useState, FormEvent } from 'react';
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
} from '@mui/material';
import apiClient from '../services/api-client';

export default function VMCreatePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const [formData, setFormData] = useState({
    name: '',
    cores: 2,
    ram_gb: 4,
    disk_gb: 50,
    os_type: 'ubuntu-24.04',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convert RAM from GB to MB for backend API
      const payload = {
        name: formData.name,
        cores: formData.cores,
        memory_mb: formData.ram_gb * 1024,
        disk_gb: formData.disk_gb,
        os_type: formData.os_type,
      };
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

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tạo Máy Ảo Mới
      </Typography>

      <Card sx={{ maxWidth: 600, mt: 3 }}>
        <CardContent>
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
              >
                <MenuItem value="ubuntu-server-24.04">Ubuntu Server 24.04</MenuItem>
              </Select>
            </FormControl>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3 }}
              disabled={loading || !formData.name.trim()}
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
