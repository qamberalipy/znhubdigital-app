"""Added media fields to task attachment

Revision ID: 457b3512e751
Revises: d7bee6531f95
Create Date: 2026-03-26 20:42:28.393425

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '457b3512e751'
down_revision: Union[str, None] = 'd7bee6531f95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the new tables first
    op.create_table('task_attachment',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=False),
    sa.Column('uploader_id', sa.Integer(), nullable=False),
    sa.Column('file_url', sa.String(length=500), nullable=False),
    sa.Column('thumbnail_url', sa.String(length=500), nullable=True),
    sa.Column('file_name', sa.String(length=255), nullable=True),
    sa.Column('file_size_mb', sa.Float(), nullable=True),
    sa.Column('mime_type', sa.String(length=50), nullable=True),
    sa.Column('duration_seconds', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['task_id'], ['task.id'], ),
    sa.ForeignKeyConstraint(['uploader_id'], ['user.id'], ), # Assuming uploader_id maps to user.id
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_task_attachment_id'), 'task_attachment', ['id'], unique=False)
    
    op.create_table('task_comment',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('comment', sa.Text(), nullable=False),
    sa.Column('is_system_log', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['task_id'], ['task.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_task_comment_id'), 'task_comment', ['id'], unique=False)

    # 2. MANUALLY ADDED: Migrate existing data to prevent data loss
    op.execute("""
        INSERT INTO task_comment (task_id, user_id, comment, is_system_log, created_at)
        SELECT task_id, user_id, message, is_system_log, created_at FROM task_chat;
    """)
    
    op.execute("""
        INSERT INTO task_attachment (task_id, uploader_id, file_url, thumbnail_url, file_size_mb, mime_type, duration_seconds, created_at)
        SELECT task_id, uploader_id, file_url, thumbnail_url, file_size_mb, mime_type, duration_seconds, created_at FROM content_vault
        WHERE task_id IS NOT NULL;
    """)

    # 3. Safely drop the old tables and indexes
    op.drop_index('ix_content_vault_id', table_name='content_vault')
    op.drop_table('content_vault')
    op.drop_index('ix_task_chat_id', table_name='task_chat')
    op.drop_table('task_chat')

    # 4. Update the Task table
    # ADDED: explicit foreign key for lead_id. Adjust 'user.id' if it points to a 'lead' table instead.
    op.add_column('task', sa.Column('lead_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=True))
    
    op.alter_column('task', 'due_date',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)
               
    op.drop_column('task', 'req_duration_min')
    op.drop_column('task', 'req_quantity')
    op.drop_column('task', 'req_outfit_tags')
    op.drop_column('task', 'req_face_visible')
    op.drop_column('task', 'req_watermark')
    op.drop_column('task', 'completed_at')
    op.drop_column('task', 'req_content_type')
    op.drop_column('task', 'context')


def downgrade() -> None:
    # 1. Add columns back as nullable=True FIRST to avoid IntegrityError on existing rows
    op.add_column('task', sa.Column('context', sa.VARCHAR(length=100), autoincrement=False, nullable=True))
    op.add_column('task', sa.Column('req_content_type', sa.VARCHAR(), autoincrement=False, nullable=True))
    op.add_column('task', sa.Column('completed_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True))
    op.add_column('task', sa.Column('req_watermark', sa.BOOLEAN(), autoincrement=False, nullable=True))
    op.add_column('task', sa.Column('req_face_visible', sa.BOOLEAN(), autoincrement=False, nullable=True))
    op.add_column('task', sa.Column('req_outfit_tags', sa.VARCHAR(length=500), autoincrement=False, nullable=True))
    op.add_column('task', sa.Column('req_quantity', sa.INTEGER(), autoincrement=False, nullable=True))
    op.add_column('task', sa.Column('req_duration_min', sa.INTEGER(), autoincrement=False, nullable=True))

    # 2. MANUALLY ADDED: Fill required fields with default data before enforcing NOT NULL
    op.execute("UPDATE task SET req_content_type = 'default_type' WHERE req_content_type IS NULL")
    op.execute("UPDATE task SET req_quantity = 1 WHERE req_quantity IS NULL")

    # 3. Enforce the NOT NULL constraints
    op.alter_column('task', 'req_content_type', existing_type=sa.VARCHAR(), nullable=False)
    op.alter_column('task', 'req_quantity', existing_type=sa.INTEGER(), nullable=False)

    op.alter_column('task', 'due_date',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)
               
    # 4. Drop the lead_id column and its foreign key
    op.drop_constraint(None, 'task', type_='foreignkey') # Adjust name if you explicitly named the FK
    op.drop_column('task', 'lead_id')

    # 5. Recreate the old tables
    op.create_table('task_chat',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('task_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('message', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('is_system_log', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['task_id'], ['task.id'], name='task_chat_task_id_fkey'),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='task_chat_user_id_fkey'),
    sa.PrimaryKeyConstraint('id', name='task_chat_pkey')
    )
    op.create_index('ix_task_chat_id', 'task_chat', ['id'], unique=False)
    
    op.create_table('content_vault',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('uploader_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('task_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('file_url', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('thumbnail_url', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('file_size_mb', sa.DOUBLE_PRECISION(precision=53), autoincrement=False, nullable=True),
    sa.Column('mime_type', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('duration_seconds', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('content_type', sa.VARCHAR(), autoincrement=False, nullable=True), # Changed to nullable=True for data import
    sa.Column('tags', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('status', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['task_id'], ['task.id'], name='content_vault_task_id_fkey'),
    sa.ForeignKeyConstraint(['uploader_id'], ['user.id'], name='content_vault_uploader_id_fkey'),
    sa.PrimaryKeyConstraint('id', name='content_vault_pkey')
    )
    op.create_index('ix_content_vault_id', 'content_vault', ['id'], unique=False)

    # 6. MANUALLY ADDED: Migrate data back to the original tables
    op.execute("""
        INSERT INTO task_chat (task_id, user_id, message, is_system_log, created_at)
        SELECT task_id, user_id, comment, is_system_log, created_at FROM task_comment;
    """)
    
    op.execute("""
        INSERT INTO content_vault (task_id, uploader_id, file_url, thumbnail_url, file_size_mb, mime_type, duration_seconds, created_at, content_type)
        SELECT task_id, uploader_id, file_url, thumbnail_url, file_size_mb, mime_type, duration_seconds, created_at, 'default' FROM task_attachment;
    """)
    op.execute("UPDATE content_vault SET content_type = 'attachment' WHERE content_type IS NULL")
    op.alter_column('content_vault', 'content_type', existing_type=sa.VARCHAR(), nullable=False)

    # 7. Drop the new tables
    op.drop_index(op.f('ix_task_comment_id'), table_name='task_comment')
    op.drop_table('task_comment')
    op.drop_index(op.f('ix_task_attachment_id'), table_name='task_attachment')
    op.drop_table('task_attachment')