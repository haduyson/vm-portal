# Phase 5: Tailscale IP Integration (Replace SSH Domain)

## Priority: High
## Status: Pending
## Depends On: Phase 4 (Testing & Validation)

## Overview

Replace SSH Domain with Tailscale IP for external VM access. SSH Domain cannot be used for external SSH access, so Tailscale will provide secure external connectivity.

## Key Insights

- **Current state**: SSH Domain exists but cannot be used for external SSH access
- **New approach**: Use Tailscale IP for external access instead
- **Benefits**:
  - Direct SSH access from anywhere via Tailscale network
  - No need for port forwarding or Cloudflare Tunnel for SSH
  - Secure, encrypted connection
  - Simpler user experience

## Requirements

### Functional
- Remove or deprecate `ssh_domain` field
- Add `tailscale_ip` field to VM model
- Display Tailscale IP in VM details for external access
- Integrate Tailscale installation in cloud-init
- Auto-join VMs to Tailscale network on creation

### Non-Functional
- Tailscale setup should be automated (no manual user action)
- IP should be available within minutes of VM creation
- Clear documentation for users on how to use Tailscale access

## Architecture

### VM Access Methods After Change
| Method | Use Case |
|--------|----------|
| Internal IP | Access from same network/Proxmox host |
| Tailscale IP | Access from anywhere (external) |
| Web Domain | HTTP/HTTPS access via Cloudflare Tunnel |
| VNC Console | Browser-based console access |

### Data Flow
```
VM Created → Cloud-init installs Tailscale → Tailscale joins with Auth Key
→ Get Tailscale IP → Store in DB → Display to user
```

## Related Code Files

### Files to Modify

| File | Change |
|------|--------|
| `backend/app/models/virtual_machine_model.py` | Remove `ssh_domain`, add `tailscale_ip` |
| `backend/app/schemas/vm_schemas.py` | Update VMResponse schema |
| `backend/app/schemas/admin_schemas.py` | Update AdminVMResponse |
| `backend/app/services/cloud_init_generator.py` | Add Tailscale installation |
| `backend/app/services/vm_provisioning_service.py` | Fetch Tailscale IP post-provision |
| `backend/app/api/vm_endpoints.py` | Return tailscale_ip |
| `frontend/src/pages/vm-detail-page.tsx` | Display Tailscale IP |
| `frontend/src/pages/vm-list-page.tsx` | Update VM card display |

### Files to Create

| File | Purpose |
|------|---------|
| `backend/alembic/versions/XXXX_add_tailscale_ip_remove_ssh_domain.py` | DB migration |

## Implementation Steps

### Step 1: Database Migration

```python
# Add tailscale_ip, remove ssh_domain
def upgrade():
    op.add_column('virtual_machines',
        sa.Column('tailscale_ip', sa.String(45), nullable=True))
    op.drop_column('virtual_machines', 'ssh_domain')

def downgrade():
    op.add_column('virtual_machines',
        sa.Column('ssh_domain', sa.String(255), nullable=True))
    op.drop_column('virtual_machines', 'tailscale_ip')
```

### Step 2: Update VM Model

```python
# backend/app/models/virtual_machine_model.py

# Remove:
ssh_domain = Column(String(255), nullable=True)

# Add:
tailscale_ip = Column(String(45), nullable=True)  # IPv4 or IPv6
```

### Step 3: Admin Settings for Tailscale

Add to admin settings or .env:
- `TAILSCALE_AUTH_KEY`: Reusable auth key for auto-join
- `TAILSCALE_TAGS`: Tags to apply to VMs (optional)

### Step 4: Update Cloud-init Generator

```python
# backend/app/services/cloud_init_generator.py

def generate_cloud_init(vm_name, ...):
    # Add Tailscale installation
    tailscale_setup = """
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Join Tailscale network with auth key
tailscale up --authkey={auth_key} --hostname={vm_name} --ssh
"""
    # Include in cloud-init user-data
```

### Step 5: Post-Provision Tailscale IP Fetch

```python
# backend/app/services/vm_provisioning_service.py

async def fetch_tailscale_ip(vm):
    """Fetch Tailscale IP after VM joins network"""
    # Option A: Query Tailscale API
    # Option B: SSH into VM and run `tailscale ip -4`
    # Option C: Wait for cloud-init to report back

    # Store IP
    vm.tailscale_ip = tailscale_ip
    await session.commit()
```

### Step 6: Update Schemas

```python
# backend/app/schemas/vm_schemas.py

class VMResponse(BaseModel):
    # Remove:
    # ssh_domain: Optional[str]

    # Add:
    tailscale_ip: Optional[str]

# backend/app/schemas/admin_schemas.py - same changes
```

### Step 7: Update Frontend Display

```typescript
// frontend/src/pages/vm-detail-page.tsx

// Replace SSH Domain display with:
<InfoRow label="Tailscale IP" value={vm.tailscale_ip || "Đang kết nối..."} />
<InfoRow label="SSH Command" value={`ssh ${vm.ssh_username}@${vm.tailscale_ip}`} />

// Add copy button for easy SSH command copy
```

### Step 8: Update Telegram Notifications

```python
# Update VM creation notification to include Tailscale IP
message = f"""
🖥 VM Created: {vm.name}
📍 Internal IP: {vm.ip_address}
🔗 Tailscale IP: {vm.tailscale_ip}
🌐 Web: {vm.web_domain}
👤 SSH: ssh {vm.ssh_username}@{vm.tailscale_ip}
🔑 Password: {vm.ssh_password}
"""
```

## Todo List

- [ ] Create database migration (add tailscale_ip, remove ssh_domain)
- [ ] Update VirtualMachine model
- [ ] Add Tailscale admin settings (auth key)
- [ ] Update cloud-init generator with Tailscale install
- [ ] Implement post-provision Tailscale IP fetch
- [ ] Update VMResponse schema
- [ ] Update AdminVMResponse schema
- [ ] Update vm-detail-page.tsx display
- [ ] Update vm-list-page.tsx display
- [ ] Update Telegram notification template
- [ ] Test end-to-end VM creation with Tailscale
- [ ] Verify external SSH access works

## Success Criteria

- [ ] ssh_domain removed from system
- [ ] tailscale_ip field added and populated
- [ ] VMs auto-join Tailscale on creation
- [ ] Tailscale IP displayed in UI
- [ ] External SSH access works via Tailscale IP
- [ ] Telegram notifications show Tailscale info

## Security Considerations

- Tailscale Auth Key should be stored securely (env var or encrypted DB)
- Use reusable but expiring auth keys
- Apply appropriate Tailscale ACL tags to VMs
- Consider Tailscale SSH (tailscale ssh) for additional security

## Next Steps

After implementation:
- Update user documentation on accessing VMs
- Consider adding Tailscale MagicDNS names as alternative
- Monitor Tailscale network for orphaned devices
