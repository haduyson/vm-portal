import React from 'react';
import { Box } from '@mui/material';
import VmNetworkInterfacesSection from './vm-network-interfaces-section';
import VmFirewallManagementSection from './vm-firewall-management-section';

interface VmNetworkPanelProps {
  vmId: number;
  vmStatus: string;
}

const VmNetworkPanel: React.FC<VmNetworkPanelProps> = ({ vmId, vmStatus }) => {
  return (
    <Box>
      <VmNetworkInterfacesSection vmId={vmId} vmStatus={vmStatus} />
      <VmFirewallManagementSection vmId={vmId} />
    </Box>
  );
};

export default VmNetworkPanel;
