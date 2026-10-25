from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator
from sqlmodel import SQLModel

from app.attendance.models import AttendanceStatus

Topic = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class SessionCreate(SQLModel):
    held_on: date | None = None  # defaults to today
    topic: Topic | None = None

    @field_validator("topic")
    @classmethod
    def blank_topic_is_none(cls, value: str | None) -> str | None:
        return value or None


class SessionSummary(SQLModel):
    """A row in a group's session list, with counts for each status."""

    id: int
    group_id: int
    held_on: date
    topic: str | None
    closed: bool
    present: int
    absent: int
    late: int
    excused: int
    unmarked: int  # current learner members with no mark yet


class RosterEntry(SQLModel):
    user_id: int
    name: str
    email: str
    # False for someone marked here who has since left the group; their mark still counts.
    is_member: bool
    status: AttendanceStatus | None  # None = not marked yet
    marked_at: datetime | None


class SessionDetail(SQLModel):
    id: int
    group_id: int
    group_name: str
    held_on: date
    topic: str | None
    created_at: datetime
    closed_at: datetime | None
    # Worked out by the same rules the endpoints enforce, so the UI never guesses.
    can_edit: bool
    can_close: bool
    can_reopen: bool
    can_delete: bool
    read_only_reason: str | None  # shown when can_edit is false
    roster: list[RosterEntry]


class RecordIn(SQLModel):
    user_id: int
    status: AttendanceStatus


class RecordsUpdate(SQLModel):
    # A whole class in one request. 1000 is far above any real class size.
    records: list[RecordIn] = Field(min_length=1, max_length=1000)
