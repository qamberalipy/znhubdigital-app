import os
import sqlalchemy as _sql
import sqlalchemy.orm as _orm
import sqlalchemy.ext.declarative as _declarative
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = _sql.create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=True  # turn off in production
)

SessionLocal = _orm.sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = _declarative.declarative_base()
