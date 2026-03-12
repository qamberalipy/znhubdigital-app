import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
from dotenv import load_dotenv  # Required to read .env

# ------------------------------------------------------------------------
# 1. SETUP PATH AND ENV
# ------------------------------------------------------------------------
# Add the project root directory to python path so we can import 'app'
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Load variables from .env file
load_dotenv()

# ------------------------------------------------------------------------
# 2. IMPORT MODELS
# ------------------------------------------------------------------------
# Import your Base (where metadata lives)
from app.core.db.session import Base

# MUST Import all your models here so Alembic can "see" the tables
# If you create new model files later, add them here!
import app.user.models 
import app.task.models
import app.signature.models
import app.announcement.models
import app.model_invoice.models
import app.notification.models
# import app.order.models  <-- Example for future modules

# ------------------------------------------------------------------------
# 3. CONFIGURATION
# ------------------------------------------------------------------------
config = context.config

# Overwrite the sqlalchemy.url in alembic.ini with the one from .env
# This keeps your password secure and not hardcoded in ini files.
database_url = os.getenv("DATABASE_URL")

# Fix for some postgres drivers that fail with the "postgres://" prefix (they prefer "postgresql://")
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

config.set_main_option("sqlalchemy.url", database_url)


# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Link the metadata for autogeneration support
target_metadata = Base.metadata

# ------------------------------------------------------------------------
# 4. MIGRATION FUNCTIONS (Standard Boilerplate)
# ------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    
    # We use the config section to create the engine
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()