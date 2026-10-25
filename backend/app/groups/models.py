from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class Group(SQLModel, table=True):
    """A classroom (college) or team (company)."""

    __tablename__ = "groups"

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organizations.id", index=True)
    name: str = Field(max_length=200)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_type=DateTime(timezone=True),
    )


class GroupMember(SQLModel, table=True):
    """Links users to groups. The two-column primary key stops duplicate memberships."""

    __tablename__ = "group_members"

    group_id: int = Field(foreign_key="groups.id", primary_key=True)
    # Indexed so "which groups is this user in?" is fast too.
    user_id: int = Field(foreign_key="users.id", primary_key=True, index=True)
