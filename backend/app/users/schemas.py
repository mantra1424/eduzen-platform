"""Shapes the API sends and receives for users. Kept apart from the table model."""

from sqlmodel import SQLModel

from app.users.models import UserRole


class UserPublic(SQLModel):
    """What clients may see about a user. password_hash is deliberately not here."""

    id: int
    org_id: int
    email: str
    name: str
    role: UserRole
