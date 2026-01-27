import React, { useEffect, useState } from 'react';
import {
  Paper,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';
import apiClient from '../services/api-client';

interface NetworkInterface {
  name: string;
  hardware_address: string | null;
  ip_addresses: { ip_address: string; ip_address_type: string; prefix: number | null }[];
}

interface VmNetworkInterfacesSectionProps {
  vmId: number;
  vmStatus: string;
}

const VmNetworkInterfacesSection: React.FC<VmNetworkInterfacesSectionProps> = ({ vmId, vmStatus }) => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNetworkInterfaces = async () => {
    if (vmStatus !== 'running') {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/vms/${vmId}/network`);
      setInterfaces(response.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể tải giao diện mạng';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworkInterfaces();
  }, [vmId, vmStatus]);

  const formatIpAddresses = (ipAddresses: NetworkInterface['ip_addresses']) => {
    return ipAddresses
      .map((ip) => `${ip.ip_address}${ip.prefix ? `/${ip.prefix}` : ''}`)
      .join(', ');
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Giao diện mạng
      </Typography>

      {vmStatus !== 'running' ? (
        <Alert severity="info">VM phải đang chạy để xem thông tin mạng</Alert>
      ) : loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : interfaces.length === 0 ? (
        <Alert severity="info">Không có giao diện mạng nào</Alert>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tên</TableCell>
              <TableCell>Địa chỉ MAC</TableCell>
              <TableCell>Địa chỉ IP</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {interfaces.map((iface, index) => (
              <TableRow key={index}>
                <TableCell>{iface.name}</TableCell>
                <TableCell>{iface.hardware_address || 'N/A'}</TableCell>
                <TableCell>
                  {iface.ip_addresses.length > 0 ? formatIpAddresses(iface.ip_addresses) : 'N/A'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
};

export default VmNetworkInterfacesSection;
