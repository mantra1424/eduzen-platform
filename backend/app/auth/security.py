"""Password hashing and login tokens. No web code here, so it's easy to test on its own."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import settings
from app.users.models import UserRole

# argon2: slow on purpose and uses lots of memory, so stolen hashes are expensive to crack.
# Each hash includes its own random salt, so equal passwords get different hashes.
_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


# Used when the email doesn't exist, so a failed login takes the same time either way.
# Otherwise an attacker could tell which emails are registered by timing the response.
_DUMMY_HASH = hash_password("dummy-password-for-timing")


def verify_dummy_password(password: str) -> None:
    _password_hash.verify(password, _DUMMY_HASH)


@dataclass(frozen=True)
class TokenData:
    user_id: int
    org_id: int
    role: UserRole


class InvalidTokenError(Exception):
    """The token is missing, expired, tampered with, or malformed."""


def create_access_token(
    user_id: int, org_id: int, role: UserRole, expires_in: timedelta | None = None
) -> str:
    now = datetime.now(UTC)
    expires_in = expires_in or timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),  # "subject": who the token is for (must be a string)
        "org_id": org_id,
        "role": role.value,
        "iat": now,  # issued at
        "exp": now + expires_in,  # PyJWT rejects the token after this time
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> TokenData:
    try:
        # Passing the algorithm list matters: it stops "alg: none" and algorithm-swap attacks.
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat"]},
        )
        return TokenData(
            user_id=int(payload["sub"]),
            org_id=int(payload["org_id"]),
            role=UserRole(payload["role"]),
        )
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise InvalidTokenError from exc
