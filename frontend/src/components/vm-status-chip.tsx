import { Chip } from '@mui/material';

interface VMStatusChipProps {
  status: string;
  proxmoxStatus?: string | null;
}

export default function VMStatusChip({ status, proxmoxStatus }: VMStatusChipProps) {
  // Provisioning states take priority (DB status)
  const provisioningStates: Record<string, { label: string; color: 'warning' | 'info' | 'error' }> = {
    creating: { label: 'Đang tạo', color: 'warning' },
    installing: { label: 'Đang cài đặt', color: 'info' },
    error: { label: 'Lỗi', color: 'error' },
  };

  if (provisioningStates[status]) {
    const config = provisioningStates[status];
    return <Chip label={config.label} color={config.color} size="small" />;
  }

  // For completed VMs, show realtime Proxmox status
  const effectiveStatus = proxmoxStatus || status;
  const proxmoxConfig: Record<string, { label: string; color: 'success' | 'default' | 'secondary' | 'warning' }> = {
    running: { label: 'Đang chạy', color: 'success' },
    stopped: { label: 'Đã dừng', color: 'default' },
    paused: { label: 'Tạm dừng', color: 'warning' },
  };

  const config = proxmoxConfig[effectiveStatus] || { label: effectiveStatus, color: 'default' as const };

  return <Chip label={config.label} color={config.color} size="small" />;
}
