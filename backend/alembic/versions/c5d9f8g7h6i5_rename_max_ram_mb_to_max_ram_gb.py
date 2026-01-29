"""rename_max_ram_mb_to_max_ram_gb

Revision ID: c5d9f8g7h6i5
Revises: b9d8e7f6a5c4
Create Date: 2026-01-29 11:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d9f8g7h6i5'
down_revision: Union[str, None] = 'b9d8e7f6a5c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new column max_ram_gb
    op.add_column('users', sa.Column('max_ram_gb', sa.Integer(), nullable=True))

    # Convert existing data: GB = MB / 1024 (integer division)
    op.execute("""
        UPDATE users
        SET max_ram_gb = FLOOR(max_ram_mb / 1024.0)
        WHERE max_ram_mb IS NOT NULL
    """)

    # Drop old column
    op.drop_column('users', 'max_ram_mb')


def downgrade() -> None:
    # Add back old column
    op.add_column('users', sa.Column('max_ram_mb', sa.Integer(), nullable=True))

    # Convert back: MB = GB * 1024
    op.execute("""
        UPDATE users
        SET max_ram_mb = max_ram_gb * 1024
        WHERE max_ram_gb IS NOT NULL
    """)

    # Drop new column
    op.drop_column('users', 'max_ram_gb')
