import pytest

from app.config import Settings

SECRET = "x" * 32


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        (
            "postgres://u:p@db.example.com/app?sslmode=require",
            "postgresql+psycopg://u:p@db.example.com/app?sslmode=require",
        ),
        (
            "postgresql://u:p@db.example.com:5432/app",
            "postgresql+psycopg://u:p@db.example.com:5432/app",
        ),
        (
            "postgresql+psycopg://u:p@localhost:5433/eduzen",
            "postgresql+psycopg://u:p@localhost:5433/eduzen",
        ),
    ],
)
def test_database_url_uses_psycopg_driver(given: str, expected: str):
    settings = Settings(database_url=given, jwt_secret=SECRET, _env_file=None)
    assert settings.database_url == expected


def test_test_database_url_is_optional(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    settings = Settings(database_url="postgres://u:p@h/db", jwt_secret=SECRET, _env_file=None)
    assert settings.test_database_url is None


def test_short_jwt_secret_is_rejected():
    with pytest.raises(ValueError):
        Settings(database_url="postgres://u:p@h/db", jwt_secret="too-short", _env_file=None)
