"""convert status to string

Revision ID: d15f30524062
Revises: 08c3d328603a
Create Date: 2026-01-15 02:28:23.461459

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd15f30524062'
down_revision: Union[str, None] = '08c3d328603a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Convert 'status' in Task table to String
    op.execute("ALTER TABLE task ALTER COLUMN status TYPE VARCHAR(50) USING status::text")
    
    # 2. Convert 'priority' in Task table to String
    op.execute("ALTER TABLE task ALTER COLUMN priority TYPE VARCHAR(50) USING priority::text")
    
    # 3. Convert 'req_content_type' in Task table to String
    op.execute("ALTER TABLE task ALTER COLUMN req_content_type TYPE VARCHAR(50) USING req_content_type::text")
    
    # 4. Convert 'content_type' & 'status' in ContentVault table
    op.execute("ALTER TABLE content_vault ALTER COLUMN content_type TYPE VARCHAR(50) USING content_type::text")
    op.execute("ALTER TABLE content_vault ALTER COLUMN status TYPE VARCHAR(50) USING status::text")

    # 5. Drop the old Enum types to clean up the database
    op.execute("DROP TYPE IF EXISTS task_status_enum")
    op.execute("DROP TYPE IF EXISTS task_priority_enum")
    op.execute("DROP TYPE IF EXISTS content_type_enum")
    op.execute("DROP TYPE IF EXISTS content_status")


def downgrade() -> None:
    # NOTE: Downgrading is complex because you would have to recreate Enums 
    # and cast data back. Since we are moving to String for stability, 
    # we usually leave downgrade empty or implement a reverse cast if strictly needed.
    pass