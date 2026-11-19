import math

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.auth.dependencies import CurrentUser
from app.auth.schemas import LoginRequest, TokenResponse
from app.auth.security import create_access_token, verify_dummy_password, verify_password
from app.auth.throttle import login_throttle
from app.db import SessionDep
from app.users.models import User
from app.users.schemas import UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(credentials: LoginRequest, session: SessionDep) -> TokenResponse:
    # Checked before the password, so even the right password is refused while
    # locked; otherwise an attacker could keep guessing during the lock.
    wait = login_throttle.seconds_locked(credentials.email)
    if wait:
        minutes = math.ceil(wait / 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Too many failed login attempts. "
                f"Try again in {minutes} minute{'s' if minutes != 1 else ''}."
            ),
            headers={"Retry-After": str(wait)},
        )

    user = session.exec(select(User).where(User.email == credentials.email)).first()

    if user is None:
        verify_dummy_password(credentials.password)  # same timing as a real check
        valid = False
    else:
        valid = verify_password(credentials.password, user.password_hash)

    # Same message whether the email is unknown, the password is wrong, or the
    # account is deactivated, so the response doesn't reveal which emails exist.
    if not valid or not user.is_active:
        login_throttle.record_failure(credentials.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    login_throttle.record_success(credentials.email)
    token = create_access_token(user_id=user.id, org_id=user.org_id, role=user.role)
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))


@router.get("/me")
def me(user: CurrentUser) -> UserPublic:
    """Who am I? The frontend calls this on page load to check the saved token still works."""
    return UserPublic.model_validate(user)
