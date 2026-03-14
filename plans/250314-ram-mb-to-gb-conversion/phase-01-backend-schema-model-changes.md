# Phase 1: Backend Schema & Model Changes

## Priority: High
## Status: Pending

## Overview

Rename `memory_mb` column to `memory_gb` in database and update SQLAlchemy models. Convert existing data from MB to GB.

## Key Insights

- Current column: `memory_mb INTEGER NOT NULL` in `virtual_machines` table
- User quotas already use `max_ram_gb` - good consistency target
- Proxmox API expects MB, conversion needed at service layer
- Minimum VM RAM: 512MB = 0.5GB (need to handle fractional GB)

## Requirements

### Functional
- Rename column `memory_mb` → `memory_gb`
- Convert existing data: `memory_gb = CEIL(memory_mb / 1024)`
- Update SQLAlchemy model to use `memory_gb`
- Maintain data integrity during migration

### Non-Functional
- Zero downtime migration if possible
- No data loss (round up fractional GB)
- Backward compatible during transition

## Architecture

### Data Flow
```
User Input (GB) → API (GB) → DB (GB) → ProxmoxService (converts to MB) → Proxmox API (MB)
```

### Conversion Point
- Single conversion point in `ProxmoxService` when calling Proxmox API
- All internal code uses GB

## Related Code Files

### Files to Modify
| File | Line | Change |
|------|------|--------|
| `backend/app/models/virtual_machine_model.py` | 21 | `memory_mb` → `memory_gb` |
| `backend/app/services/proxmox_client.py` | 171, 185 | Accept GB, convert to MB for Proxmox |
| `backend/app/services/vm_provisioning_service.py` | 100, 211 | Use `memory_gb` |

### Files to Create
| File | Purpose |
|------|---------|
| `backend/alembic/versions/XXXX_rename_memory_mb_to_memory_gb.py` | Database migration |

## Implementation Steps

### Step 1: Create Database Migration

```python
# backend/alembic/versions/XXXX_rename_memory_mb_to_memory_gb.py
"""Rename memory_mb to memory_gb and convert values

Revision ID: XXXX
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    # Add new column
    op.add_column('virtual_machines', sa.Column('memory_gb', sa.Integer(), nullable=True))

    # Convert data: MB to GB (round up)
    op.execute("UPDATE virtual_machines SET memory_gb = CEIL(memory_mb::float / 1024)")

    # Make non-nullable
    op.alter_column('virtual_machines', 'memory_gb', nullable=False)

    # Drop old column
    op.drop_column('virtual_machines', 'memory_mb')

def downgrade():
    # Add back old column
    op.add_column('virtual_machines', sa.Column('memory_mb', sa.Integer(), nullable=True))

    # Convert back: GB to MB
    op.execute("UPDATE virtual_machines SET memory_mb = memory_gb * 1024")

    # Make non-nullable
    op.alter_column('virtual_machines', 'memory_mb', nullable=False)

    # Drop new column
    op.drop_column('virtual_machines', 'memory_gb')
```

### Step 2: Update Virtual Machine Model

```python
# backend/app/models/virtual_machine_model.py line 21
# Change from:
memory_mb = Column(Integer, nullable=False)

# To:
memory_gb = Column(Integer, nullable=False)
```

### Step 3: Update Proxmox Client

```python
# backend/app/services/proxmox_client.py
# In create_vm() method, change parameter and add conversion:

async def create_vm(
    self,
    vmid: int,
    name: str,
    cores: int,
    memory_gb: int,  # Changed from memory_mb
    # ... other params
):
    # Convert GB to MB for Proxmox API
    memory_mb = memory_gb * 1024

    config = {
        "vmid": vmid,
        "name": name,
        "cores": cores,
        "memory": memory_mb,  # Proxmox expects MB
        # ...
    }
```

### Step 4: Update VM Provisioning Service

```python
# backend/app/services/vm_provisioning_service.py
# Line 100: Change memory=vm.memory_mb to memory=vm.memory_gb
# Line 211: Change memory_mb=vm.memory_mb to memory_gb=vm.memory_gb
```

## Todo List

- [ ] Create Alembic migration file
- [ ] Update VirtualMachine model (`memory_mb` → `memory_gb`)
- [ ] Update ProxmoxService.create_vm() to accept GB
- [ ] Update ProxmoxService internal conversion (GB → MB)
- [ ] Update VMProvisioningService to use `memory_gb`
- [ ] Run migration on dev database
- [ ] Verify data integrity

## Success Criteria

- [ ] Column renamed in database
- [ ] All existing VM memory values converted correctly
- [ ] Model reflects new column name
- [ ] Proxmox operations still work (internal MB conversion)
- [ ] No application errors on startup

## Security Considerations

- Migration runs as DB user with ALTER permissions
- No sensitive data exposed
- Rollback available via downgrade()

## Next Steps

After Phase 1 complete, proceed to Phase 2 (API Endpoint Updates) to update schemas and endpoints.
