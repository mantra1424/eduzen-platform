from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth.security import hash_password
from app.errors import ConflictError
from app.organizations.models import Organization
from app.organizations.schemas import OrganizationSignup
from app.users.models import User, UserRole


def signup_organization(session: Session, data: OrganizationSignup) -> tuple[Organization, User]:
    """Create an organisation and its first admin together: both are saved, or neither."""
    # Friendly checks first, so the error says which value is taken.
    if session.exec(select(Organization).where(Organization.slug == data.slug)).first():
        raise ConflictError("That organisation URL is already taken.")
    if session.exec(select(User).where(User.email == data.admin_email)).first():
        raise ConflictError("An account with that email already exists.")

    org = Organization(name=data.org_name, slug=data.slug, type=data.type)
    session.add(org)
    session.flush()  # sends the INSERT so org.id exists, but doesn't commit yet

    admin = User(
        org_id=org.id,
        email=data.admin_email,
        name=data.admin_name,
        password_hash=hash_password(data.admin_password),
        role=UserRole.admin,
    )
    session.add(admin)
    try:
        session.commit()  # one commit for both rows
    except IntegrityError:
        # Backstop for two signups racing with the same slug or email:
        # the unique constraints catch it, and rollback undoes both rows.
        session.rollback()
        raise ConflictError("That organisation URL or email is already taken.") from None

    session.refresh(org)
    session.refresh(admin)
    return org, admin
