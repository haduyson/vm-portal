"""add_network_bridges_ip_pool_email_features

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-31 08:00:00.000000

Add database schema for:
- network_bridges table (bridges per Proxmox server)
- user_ip_addresses table (user-owned IPs)
- User model: email, is_email_verified, notification_preference, feature_flags
- VirtualMachine model: network_bridge_id, vlan_tags, feature_flags
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6g7"
down_revision: Union[str, None] = "c5d9f8g7h6i5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create network_bridges table
    op.create_table(
        "network_bridges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("proxmox_server_id", sa.Integer(), nullable=False),
        sa.Column("bridge_name", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("vlan_min", sa.Integer(), nullable=True),
        sa.Column("vlan_max", sa.Integer(), nullable=True),
        sa.Column("is_public_network", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["proxmox_server_id"],
            ["proxmox_servers.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("proxmox_server_id", "bridge_name", name="uq_server_bridge_name"),
    )
    op.create_index(op.f("ix_network_bridges_id"), "network_bridges", ["id"], unique=False)

    # 2. Add columns to users table
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column(
        "users",
        sa.Column("is_email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users",
        sa.Column("notification_preference", sa.String(20), nullable=False, server_default="telegram"),
    )
    op.add_column("users", sa.Column("feature_flags", postgresql.JSON(astext_type=sa.Text()), nullable=True))

    # 3. Add columns to virtual_machines table
    op.add_column("virtual_machines", sa.Column("network_bridge_id", sa.Integer(), nullable=True))
    op.add_column(
        "virtual_machines",
        sa.Column("vlan_tags", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "virtual_machines",
        sa.Column("feature_flags", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "fk_vm_network_bridge",
        "virtual_machines",
        "network_bridges",
        ["network_bridge_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_virtual_machines_network_bridge_id"),
        "virtual_machines",
        ["network_bridge_id"],
        unique=False,
    )

    # 4. Create user_ip_addresses table (depends on network_bridges and virtual_machines)
    op.create_table(
        "user_ip_addresses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("network_bridge_id", sa.Integer(), nullable=False),
        sa.Column("vm_id", sa.Integer(), nullable=True),
        sa.Column("subnet_mask", sa.String(20), nullable=False, server_default="255.255.255.0"),
        sa.Column("gateway", sa.String(45), nullable=True),
        sa.Column("is_retained", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("acquired_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["network_bridge_id"], ["network_bridges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vm_id"], ["virtual_machines.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("ip_address", name="uq_ip_address"),
    )
    op.create_index(op.f("ix_user_ip_addresses_id"), "user_ip_addresses", ["id"], unique=False)
    op.create_index(op.f("ix_user_ip_addresses_user_id"), "user_ip_addresses", ["user_id"], unique=False)


def downgrade() -> None:
    # Drop user_ip_addresses table
    op.drop_index(op.f("ix_user_ip_addresses_user_id"), table_name="user_ip_addresses")
    op.drop_index(op.f("ix_user_ip_addresses_id"), table_name="user_ip_addresses")
    op.drop_table("user_ip_addresses")

    # Drop virtual_machines columns
    op.drop_index(op.f("ix_virtual_machines_network_bridge_id"), table_name="virtual_machines")
    op.drop_constraint("fk_vm_network_bridge", "virtual_machines", type_="foreignkey")
    op.drop_column("virtual_machines", "feature_flags")
    op.drop_column("virtual_machines", "vlan_tags")
    op.drop_column("virtual_machines", "network_bridge_id")

    # Drop users columns
    op.drop_column("users", "feature_flags")
    op.drop_column("users", "notification_preference")
    op.drop_column("users", "is_email_verified")
    op.drop_column("users", "email")

    # Drop network_bridges table
    op.drop_index(op.f("ix_network_bridges_id"), table_name="network_bridges")
    op.drop_table("network_bridges")
