from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser
from app.auth.security import create_access_token
from app.db import SessionDep
from app.organizations.models import Organization
from app.organizations.schemas import OrganizationPublic, OrganizationSignup, SignupResponse
from app.organizations.service import signup_organization
from app.users.schemas import UserPublic

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", status_code=status.HTTP_201_CREATED)
def signup(data: OrganizationSignup, session: SessionDep) -> SignupResponse:
    """Public: create a new organisation and its first admin, and log the admin in."""
    org, admin = signup_organization(session, data)

    token = create_access_token(user_id=admin.id, org_id=org.id, role=admin.role)
    return SignupResponse(
        organization=OrganizationPublic.model_validate(org),
        user=UserPublic.model_validate(admin),
        access_token=token,
    )


@router.get("/me")
def my_organization(user: CurrentUser, session: SessionDep) -> OrganizationPublic:
    """The caller's organisation. The frontend uses `type` to pick labels (Student vs Employee)."""
    return OrganizationPublic.model_validate(session.get(Organization, user.org_id))
