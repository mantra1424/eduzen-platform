from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.auth.dependencies import CurrentUser
from app.auth.schemas import LoginRequest, TokenResponse
from app.auth.security import create_access_token, verify_dummy_password, verify_password
from app.db import SessionDep
from app.users.models import User
from app.users.schemas import UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(credentials: LoginRequest, session: SessionDep) -> TokenResponse:
    user = session.exec(select(User).where(User.email == credentials.email)).first()

    if user is None:
        verify_dummy_password(credentials.password)  # same timing as a real check
        valid = False
    else:
        valid = verify_password(credentials.password, user.password_hash)

    # Same message whether the email is unknown, the password is wrong, or the
    # account is deactivated, so the response doesn't reveal which emails exist.
    if not valid or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    token = create_access_token(user_id=user.id, org_id=user.org_id, role=user.role)
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))


@router.get("/me")
def me(user: CurrentUser) -> UserPublic:
    """Who am I? The frontend calls this on page load to check the saved token still works."""
    return UserPublic.model_validate(user)
