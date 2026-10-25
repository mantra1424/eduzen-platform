from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth.security import hash_password
from app.errors import ConflictError
from app.users.models import User, UserRole
from app.users.schemas import UserCreate, UserUpdate


class SelfLockoutError(Exception):
    """An admin tried to deactivate themselves or remove their own admin role."""


def create_user(session: Session, admin: User, data: UserCreate) -> User:
    if session.exec(select(User).where(User.email == data.email)).first():
        raise ConflictError("An account with that email already exists.")

    user = User(
        org_id=admin.org_id,  # always the admin's own organisation
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ConflictError("An account with that email already exists.") from None
    session.refresh(user)
    return user


def update_user(session: Session, admin: User, user: User, data: UserUpdate) -> User:
    changes = data.model_dump(exclude_unset=True)  # only fields the client actually sent

    if user.id == admin.id:
        if changes.get("is_active") is False:
            raise SelfLockoutError("You can't deactivate your own account.")
        if "role" in changes and changes["role"] != UserRole.admin:
            raise SelfLockoutError("You can't remove your own admin role.")

    for field, value in changes.items():
        setattr(user, field, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
