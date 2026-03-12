"""enums update task_status

Revision ID: 08c3d328603a
Revises: cc2dac2105a4
Create Date: 2026-01-15 01:46:04.237160

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '08c3d328603a'
down_revision: Union[str, None] = 'cc2dac2105a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Rename existing enum to a temporary name
    op.execute("ALTER TYPE task_status_enum RENAME TO _old_task_status_enum")

    # 2. Create the NEW enum with the updated Title Case values
    # We are removing 'in_progress' and 'review', and adding 'Missed'
    op.execute("CREATE TYPE task_status_enum AS ENUM('To Do', 'Blocked', 'Completed', 'Missed')")

    # 3. Update the column to use the NEW type with explicit mapping
    op.execute("""
        ALTER TABLE task 
        ALTER COLUMN status TYPE task_status_enum 
        USING (
            CASE 
                -- Direct mapping (lowercase -> Title Case)
                WHEN status::text = 'todo' THEN 'To Do'::task_status_enum
                WHEN status::text = 'completed' THEN 'Completed'::task_status_enum
                WHEN status::text = 'blocked' THEN 'Blocked'::task_status_enum
                
                -- Handle removed statuses (Map to 'To Do')
                WHEN status::text = 'in_progress' THEN 'To Do'::task_status_enum
                WHEN status::text = 'review' THEN 'To Do'::task_status_enum
                
                -- Fallback (just in case)
                ELSE 'To Do'::task_status_enum 
            END
        )
    """)

    # 4. Drop the old enum type
    op.execute("DROP TYPE _old_task_status_enum")


def downgrade() -> None:
    # 1. Rename current (new) enum to temporary
    op.execute("ALTER TYPE task_status_enum RENAME TO _new_task_status_enum")

    # 2. Re-create the OLD enum definition (lowercase values as seen in your DB)
    op.execute("CREATE TYPE task_status_enum AS ENUM('todo', 'in_progress', 'review', 'blocked', 'completed')")

    # 3. Revert column type (Map Title Case back to lowercase)
    op.execute("""
        ALTER TABLE task 
        ALTER COLUMN status TYPE task_status_enum 
        USING (
            CASE 
                WHEN status::text = 'To Do' THEN 'todo'::task_status_enum
                WHEN status::text = 'Completed' THEN 'completed'::task_status_enum
                WHEN status::text = 'Blocked' THEN 'blocked'::task_status_enum
                WHEN status::text = 'Missed' THEN 'blocked'::task_status_enum -- Map 'Missed' to 'blocked'
                ELSE 'todo'::task_status_enum 
            END
        )
    """)

    # 4. Drop the temp enum
    op.execute("DROP TYPE _new_task_status_enum")