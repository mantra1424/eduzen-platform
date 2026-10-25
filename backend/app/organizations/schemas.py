from datetime import datetime

from sqlmodel import SQLModel

from app.fields import Name, NormalizedEmail, Password, Slug
from app.organizations.models import OrgType
from app.users.schemas import UserPublic


class OrganizationSignup(SQLModel):
    """Everything needed to create an organisation and its first admin in one step."""

    org_name: Name
    slug: Slug
    type: OrgType
    admin_name: Name
    admin_email: NormalizedEmail
    admin_password: Password


class OrganizationPublic(SQLModel):
    id: int
    name: str
    slug: str
    type: OrgType
    low_attendance_threshold: int
    created_at: datetime


class SignupResponse(SQLModel):
    organization: OrganizationPublic
    user: UserPublic
    access_token: str
    token_type: str = "bearer"
