"""
Test setup.

Tests run against the separate `eduzen_test` database, never your dev data:
- once per test run, the schema is rebuilt by running the real Alembic migrations;
- each test runs inside a transaction that is rolled back afterwards,
  so every test starts with empty tables.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config import settings

# Must happen before app.db is imported, because app.db builds the engine at import time.
if not settings.test_database_url:
    raise RuntimeError("Set TEST_DATABASE_URL in .env to run the tests.")
settings.database_url = settings.test_database_url

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db import engine, get_session
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Start from an empty schema and apply all migrations, like a real deploy."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", settings.test_database_url.replace("%", "%%"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")


@pytest.fixture
def session() -> Iterator[Session]:
    """A database session whose changes are thrown away when the test ends."""
    connection = engine.connect()
    transaction = connection.begin()
    # Commits inside the test only release a savepoint; the outer transaction is rolled back.
    with Session(bind=connection, join_transaction_mode="create_savepoint") as db_session:
        yield db_session
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """API client whose requests use the same rolled-back session as the test."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
