from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    """Neutral role names; the frontend shows them as Teacher/Trainer, Student/Employee."""

    admin = "admin"
    instructor = "instructor"
    learner = "learner"


class User(SQLModel, table=True):
    # "user" is a reserved word in Postgres, so the table is "users".
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    # Indexed because almost every query filters by organisation.
    org_id: int = Field(foreign_key="organizations.id", index=True)
    email: str = Field(max_length=254, unique=True, index=True)
    name: str = Field(max_length=200)
    password_hash: str = Field(max_length=255)
    role: UserRole
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_type=DateTime(timezone=True),
    )
