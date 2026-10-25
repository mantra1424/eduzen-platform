from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import or_

from app.auth.dependencies import AdminUser, StaffUser
from app.db import SessionDep
from app.tenancy import get_in_org_or_404, scoped_select
from app.users.models import User, UserRole
from app.users.schemas import LearnerDirectoryEntry, UserCreate, UserPublic, UserUpdate
from app.users.service import SelfLockoutError, create_user, update_user

# Every route only ever touches the caller's own organisation. All but /directory are admin-only.
router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(
    admin: AdminUser,
    session: SessionDep,
    role: UserRole | None = None,
    is_active: bool | None = None,
) -> list[UserPublic]:
    query = scoped_select(User, admin)
    if role is not None:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    users = session.exec(query.order_by(User.name, User.id)).all()
    return [UserPublic.model_validate(u) for u in users]


DIRECTORY_LIMIT = 50


def _escape_like(text: str) -> str:
    """Make % and _ (SQL LIKE wildcards) match literally, so "%" doesn't match everyone."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# Declared before "/{user_id}" so "directory" isn't read as a user ID.
@router.get("/directory")
def learner_directory(
    staff: StaffUser,
    session: SessionDep,
    q: Annotated[str, Query(max_length=100)] = "",
) -> list[LearnerDirectoryEntry]:
    """
    Active learners in the caller's organisation, for adding to groups.
    Optional search by name or email; at most 50 results, sorted by name.
    """
    query = scoped_select(User, staff).where(User.role == UserRole.learner, User.is_active == True)
    term = q.strip()
    if term:
        pattern = f"%{_escape_like(term)}%"
        query = query.where(
            or_(User.name.ilike(pattern, escape="\\"), User.email.ilike(pattern, escape="\\"))
        )
    learners = session.exec(query.order_by(User.name, User.id).limit(DIRECTORY_LIMIT)).all()
    return [LearnerDirectoryEntry.model_validate(u) for u in learners]


@router.post("", status_code=status.HTTP_201_CREATED)
def create(data: UserCreate, admin: AdminUser, session: SessionDep) -> UserPublic:
    return UserPublic.model_validate(create_user(session, admin, data))


@router.get("/{user_id}")
def get_one(user_id: int, admin: AdminUser, session: SessionDep) -> UserPublic:
    return UserPublic.model_validate(get_in_org_or_404(session, User, user_id, admin))


@router.patch("/{user_id}")
def update(user_id: int, data: UserUpdate, admin: AdminUser, session: SessionDep) -> UserPublic:
    user = get_in_org_or_404(session, User, user_id, admin)
    try:
        user = update_user(session, admin, user, data)
    except SelfLockoutError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    return UserPublic.model_validate(user)
