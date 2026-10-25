from pydantic import field_validator
from sqlmodel import SQLModel

from app.users.schemas import UserPublic


class LoginRequest(SQLModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        # "Asha@SVMIT.edu " and "asha@svmit.edu" are the same person.
        return value.strip().lower()


class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
