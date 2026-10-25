from datetime import datetime

from sqlmodel import SQLModel

from app.fields import Name


class GroupCreate(SQLModel):
    name: Name


class GroupUpdate(SQLModel):
    name: Name | None = None


class GroupPublic(SQLModel):
    id: int
    name: str
    created_at: datetime
    member_count: int


class MemberAdd(SQLModel):
    user_id: int
