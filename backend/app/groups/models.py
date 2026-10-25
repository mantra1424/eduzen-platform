from datetime import UTC, datetime

from sqlalchemy import DateTime, UniqueConstraint
from sqlmodel import Field, SQLModel


class Group(SQLModel, table=True):
    """A classroom (college) or team (company)."""

    __tablename__ = "groups"
    # Names are unique per organisation: two colleges may both have "CE Sem 5".
    __table_args__ = (UniqueConstraint("org_id", "name"),)  # named uq_groups_org_id_name

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

    # CASCADE: deleting a group deletes its membership rows too.
    group_id: int = Field(foreign_key="groups.id", primary_key=True, ondelete="CASCADE")
    # Indexed so "which groups is this user in?" is fast too.
    user_id: int = Field(foreign_key="users.id", primary_key=True, index=True)
