from fastapi import APIRouter, HTTPException, status

from app.auth.dependencies import AdminUser
from app.db import SessionDep
from app.errors import ConflictError
from app.tenancy import get_in_org_or_404, scoped_select
from app.users.models import User, UserRole
from app.users.schemas import UserCreate, UserPublic, UserUpdate
from app.users.service import SelfLockoutError, create_user, update_user

# Every route here requires an admin, and only ever touches the admin's own organisation.
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


@router.post("", status_code=status.HTTP_201_CREATED)
def create(data: UserCreate, admin: AdminUser, session: SessionDep) -> UserPublic:
    try:
        user = create_user(session, admin, data)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    return UserPublic.model_validate(user)


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
