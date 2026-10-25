"""Attendance: a session is one class meeting; a record is one person's mark in it."""

from datetime import UTC, date, datetime
from enum import Enum

from sqlalchemy import DateTime, Index
from sqlmodel import Field, SQLModel


class AttendanceStatus(str, Enum):
    present = "present"
    absent = "absent"
    late = "late"  # counts as attended
    excused = "excused"  # e.g. medical leave: left out of the percentage entirely


class AttendanceSession(SQLModel, table=True):
    """One meeting of a group (a lecture, a training session) on a given day."""

    __tablename__ = "attendance_sessions"
    # Sessions are listed per group, newest first.
    __table_args__ = (Index("ix_attendance_sessions_group_id_held_on", "group_id", "held_on"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organizations.id", index=True)
    # RESTRICT: the database refuses to delete a group that has attendance,
    # so history can't be wiped by accident (even if application code forgets to check).
    group_id: int = Field(foreign_key="groups.id", ondelete="RESTRICT")
    held_on: date
    topic: str | None = Field(default=None, max_length=200)
    created_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_type=DateTime(timezone=True),
    )
    # Set when the teacher closes the session (only allowed once everyone is marked).
    closed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


class AttendanceRecord(SQLModel, table=True):
    """One person's mark in one session. No row means "not marked yet"."""

    __tablename__ = "attendance_records"

    # CASCADE: deleting a session (e.g. started by mistake) removes its marks too.
    session_id: int = Field(
        foreign_key="attendance_sessions.id", primary_key=True, ondelete="CASCADE"
    )
    # Indexed for "my attendance" (all records for one person).
    user_id: int = Field(foreign_key="users.id", primary_key=True, index=True)
    status: AttendanceStatus
    marked_by: int = Field(foreign_key="users.id")
    marked_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_type=DateTime(timezone=True),
    )
