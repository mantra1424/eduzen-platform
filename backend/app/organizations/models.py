from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import CheckConstraint, DateTime
from sqlmodel import Field, SQLModel


class OrgType(str, Enum):
    """Decides which labels and features an organisation sees."""

    college = "college"
    company = "company"


class Organization(SQLModel, table=True):
    """A college or company. Every other record belongs to exactly one organisation."""

    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint(
            "low_attendance_threshold BETWEEN 0 AND 100", name="low_attendance_threshold_range"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    # Short unique name used in URLs, e.g. "svmit".
    slug: str = Field(max_length=100, unique=True, index=True)
    type: OrgType
    # Attendance below this percentage is flagged. 75% is the usual minimum in Indian colleges.
    # server_default fills in existing rows when the column is added by the migration.
    low_attendance_threshold: int = Field(default=75, sa_column_kwargs={"server_default": "75"})
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_type=DateTime(timezone=True),
    )
