from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class OrgType(str, Enum):
    """Decides which labels and features an organisation sees."""

    college = "college"
    company = "company"


class Organization(SQLModel, table=True):
    """A college or company. Every other record belongs to exactly one organisation."""

    __tablename__ = "organizations"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    # Short unique name used in URLs, e.g. "svmit".
    slug: str = Field(max_length=100, unique=True, index=True)
    type: OrgType
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_type=DateTime(timezone=True),
    )
