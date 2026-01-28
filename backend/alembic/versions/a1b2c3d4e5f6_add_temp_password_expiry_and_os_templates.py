"""add_temp_password_expiry_and_os_templates

Revision ID: a1b2c3d4e5f6
Revises: 2c9c6129ebb0
Create Date: 2026-01-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '2c9c6129ebb0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Feature 1: temp password expiry column on users
    op.add_column('users', sa.Column('temp_password_expires_at', sa.DateTime(), nullable=True))

    # Feature 2: os_templates table
    op.create_table(
        'os_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('os_type_key', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_os_templates_id'), 'os_templates', ['id'], unique=False)
    op.create_index(op.f('ix_os_templates_os_type_key'), 'os_templates', ['os_type_key'], unique=True)

    # Seed data
    op.execute(
        "INSERT INTO os_templates (label, os_type_key, description, is_enabled, sort_order) "
        "VALUES ('Ubuntu 24.04 (Cloud-Init) — Nhanh', 'ubuntu-24.04-cloudinit', NULL, true, 0)"
    )
    op.execute(
        "INSERT INTO os_templates (label, os_type_key, description, is_enabled, sort_order) "
        "VALUES ('Ubuntu Server 24.04 (ISO)', 'ubuntu-server-24.04', NULL, true, 1)"
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_os_templates_os_type_key'), table_name='os_templates')
    op.drop_index(op.f('ix_os_templates_id'), table_name='os_templates')
    op.drop_table('os_templates')
    op.drop_column('users', 'temp_password_expires_at')
