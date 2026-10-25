"""App settings, read from environment variables or the .env file in the repo root."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    app_name: str = "EduZen API"
    database_url: str
    test_database_url: str | None = None

    # Secret used to sign login tokens. Anyone who knows it can forge a token,
    # so it lives only in .env and must be long and random.
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = Field(default=720, gt=0)  # 12 hours


settings = Settings()
