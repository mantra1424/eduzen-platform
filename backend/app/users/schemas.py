"""Shapes the API sends and receives for users. Kept apart from the table model."""

from datetime import datetime

from sqlmodel import SQLModel

from app.fields import Name, NormalizedEmail, Password
from app.users.models import UserRole


class UserPublic(SQLModel):
    """What clients may see about a user. password_hash is deliberately not here."""

    id: int
    org_id: int
    email: str
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class UserCreate(SQLModel):
    """Admin creates a user in their own organisation. org_id is never taken from the client."""

    email: NormalizedEmail
    name: Name
    password: Password
    role: UserRole = UserRole.learner


class UserUpdate(SQLModel):
    """Every field is optional: only the fields sent are changed."""

    name: Name | None = None
    role: UserRole | None = None
    is_active: bool | None = None
