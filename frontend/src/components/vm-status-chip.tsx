import { Chip } from '@mui/material';

interface VMStatusChipProps {
  status: string;
}

export default function VMStatusChip({ status }: VMStatusChipProps) {
  const statusConfig: Record<string, { label: string; color: 'warning' | 'info' | 'success' | 'default' | 'error' }> = {
    creating: { label: 'Đang tạo', color: 'warning' },
    installing: { label: 'Đang cài đặt', color: 'info' },
    running: { label: 'Hoàn tất', color: 'success' },
    stopped: { label: 'Đã dừng', color: 'default' },
    error: { label: 'Lỗi', color: 'error' },
  };

  const config = statusConfig[status] || { label: status, color: 'default' as const };

  return <Chip label={config.label} color={config.color} size="small" />;
}
