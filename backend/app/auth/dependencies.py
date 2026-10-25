"""FastAPI dependencies: who is making this request, and are they allowed to?"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.security import InvalidTokenError, decode_access_token
from app.db import SessionDep
from app.users.models import User, UserRole

# Reads "Authorization: Bearer <token>". auto_error=False so we send our own 401 below.
# It also adds the "Authorize" button to the /docs page.
_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    # One generic message for every failure: don't tell attackers what was wrong.
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise _unauthorized()
    try:
        token = decode_access_token(credentials.credentials)
    except InvalidTokenError:
        raise _unauthorized() from None

    # Load the user on every request instead of trusting the token alone, so that
    # deactivated or deleted users are locked out immediately, not when the token expires.
    user = session.get(User, token.user_id)
    if user is None or not user.is_active or user.org_id != token.org_id:
        raise _unauthorized()
    return user


# Use as a route parameter: `def route(user: CurrentUser)`.
CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    """
    Route dependency that only lets the given roles through.
    Example: `user: Annotated[User, Depends(require_roles(UserRole.admin))]`
    """

    def check_role(user: CurrentUser) -> User:
        # Use the role from the database, not the token, so role changes apply at once.
        if user.role not in roles:
            # 403, not 401: we know who you are, you just aren't allowed to do this.
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        return user

    return check_role


AdminUser = Annotated[User, Depends(require_roles(UserRole.admin))]
