"""Some changes In task table - Fixed Enums and NotNulls

Revision ID: 17f3b4581ba7
Revises: c737f6401f0d
Create Date: 2026-01-10 03:02:18.917840

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '17f3b4581ba7'
down_revision: Union[str, None] = 'c737f6401f0d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------
    # 1. CLEANUP OLD COLUMNS
    # -----------------------------------------------------------
    # Drop constraint if it exists (using a try/catch block approach via naming convention logic)
    # Since we know the name from the previous error, we drop it directly.
    try:
        op.drop_constraint('content_vault_approved_by_fkey', 'content_vault', type_='foreignkey')
    except Exception:
        pass # Ignore if already dropped
        
    op.drop_column('content_vault', 'approved_by')
    op.drop_column('content_vault', 'approved_at')
    op.drop_column('content_vault', 'is_face_visible')

    # -----------------------------------------------------------
    # 2. ADD NEW COLUMNS (SAFE MODE)
    # -----------------------------------------------------------
    # Add 'req_quantity' as NULLABLE first to avoid IntegrityError
    op.add_column('task', sa.Column('req_quantity', sa.Integer(), nullable=True))
    
    # Fill existing rows with a default value (1)
    op.execute("UPDATE task SET req_quantity = 1")
    
    # Now enforce NOT NULL
    op.alter_column('task', 'req_quantity', nullable=False)

    # Add other simple columns
    op.add_column('task', sa.Column('req_duration_min', sa.Integer(), nullable=True))
    op.drop_column('task', 'req_length')

    # -----------------------------------------------------------
    # 3. FIX ENUMS (Postgres Specific)
    # -----------------------------------------------------------
    # We must explicitly CREATE the new Enum types in the DB before using them
    
    # Define the new Enum objects
    new_status_enum = postgresql.ENUM('todo', 'in_progress', 'review', 'blocked', 'completed', name='task_status_enum')
    new_priority_enum = postgresql.ENUM('low', 'medium', 'high', name='task_priority_enum')
    
    # Create them
    new_status_enum.create(op.get_bind(), checkfirst=True)
    new_priority_enum.create(op.get_bind(), checkfirst=True)

    # Execute conversion using PostgreSQL's USING clause
    # We cast the old value to text, then to the new type
    op.execute('ALTER TABLE task ALTER COLUMN status TYPE task_status_enum USING status::text::task_status_enum')
    op.execute('ALTER TABLE task ALTER COLUMN priority TYPE task_priority_enum USING priority::text::task_priority_enum')

    # Drop the old Enum types to clean up
    op.execute('DROP TYPE IF EXISTS task_status')
    op.execute('DROP TYPE IF EXISTS task_priority')

    # -----------------------------------------------------------
    # 4. MODIFY OTHER COLUMNS
    # -----------------------------------------------------------
    op.alter_column('task', 'req_outfit_tags',
               existing_type=sa.VARCHAR(length=255),
               type_=sa.String(length=500),
               existing_nullable=True)


def downgrade() -> None:
    # -----------------------------------------------------------
    # REVERT STEPS
    # -----------------------------------------------------------
    
    # 1. Revert Columns
    op.add_column('task', sa.Column('req_length', sa.VARCHAR(length=50), autoincrement=False, nullable=True))
    op.drop_column('task', 'req_duration_min')
    op.drop_column('task', 'req_quantity')

    # 2. Revert Enums (Create Old -> Convert -> Drop New)
    old_status_enum = postgresql.ENUM('todo', 'in_progress', 'review', 'blocked', 'completed', name='task_status')
    old_priority_enum = postgresql.ENUM('low', 'medium', 'high', name='task_priority')
    
    old_status_enum.create(op.get_bind(), checkfirst=True)
    old_priority_enum.create(op.get_bind(), checkfirst=True)

    op.execute('ALTER TABLE task ALTER COLUMN status TYPE task_status USING status::text::task_status')
    op.execute('ALTER TABLE task ALTER COLUMN priority TYPE task_priority USING priority::text::task_priority')

    op.execute('DROP TYPE IF EXISTS task_status_enum')
    op.execute('DROP TYPE IF EXISTS task_priority_enum')

    # 3. Revert Content Vault
    op.add_column('content_vault', sa.Column('is_face_visible', sa.BOOLEAN(), autoincrement=False, nullable=True))
    op.add_column('content_vault', sa.Column('approved_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True))
    op.add_column('content_vault', sa.Column('approved_by', sa.INTEGER(), autoincrement=False, nullable=True))
    op.create_foreign_key('content_vault_approved_by_fkey', 'content_vault', 'user', ['approved_by'], ['id'])