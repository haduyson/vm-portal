"""convert_vm_memory_mb_to_gb_and_add_tailscale_ip

Revision ID: d6e7f8g9h0i1
Revises: b2c3d4e5f6g7
Create Date: 2026-03-14 12:00:00.000000

Changes:
- Rename memory_mb → memory_gb in virtual_machines
- Convert existing MB values to GB (CEIL to avoid data loss)
- Remove ssh_domain (not usable for external SSH)
- Add tailscale_ip for external access
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd6e7f8g9h0i1'
down_revision: Union[str, None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Add memory_gb column
    op.add_column('virtual_machines', sa.Column('memory_gb', sa.Integer(), nullable=True))

    # Step 2: Convert MB to GB (CEIL to round up, avoid data loss)
    op.execute("""
        UPDATE virtual_machines
        SET memory_gb = CEIL(memory_mb::float / 1024)
    """)

    # Step 3: Make memory_gb NOT NULL
    op.alter_column('virtual_machines', 'memory_gb', nullable=False)

    # Step 4: Drop old memory_mb column
    op.drop_column('virtual_machines', 'memory_mb')

    # Step 5: Add tailscale_ip column
    op.add_column('virtual_machines', sa.Column('tailscale_ip', sa.String(45), nullable=True))

    # Step 6: Drop ssh_domain column (not usable for external SSH)
    op.drop_column('virtual_machines', 'ssh_domain')


def downgrade() -> None:
    # Add back ssh_domain
    op.add_column('virtual_machines', sa.Column('ssh_domain', sa.String(255), nullable=True))

    # Drop tailscale_ip
    op.drop_column('virtual_machines', 'tailscale_ip')

    # Add back memory_mb
    op.add_column('virtual_machines', sa.Column('memory_mb', sa.Integer(), nullable=True))

    # Convert GB back to MB
    op.execute("""
        UPDATE virtual_machines
        SET memory_mb = memory_gb * 1024
    """)

    # Make memory_mb NOT NULL
    op.alter_column('virtual_machines', 'memory_mb', nullable=False)

    # Drop memory_gb
    op.drop_column('virtual_machines', 'memory_gb')
