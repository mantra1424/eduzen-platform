"""App settings, read from environment variables or the .env file in the repo root."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    app_name: str = "EduZen API"
    database_url: str
    test_database_url: str | None = None


settings = Settings()
