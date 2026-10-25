"""
Keeping each organisation's data separate ("multi-tenancy").

Rule: every query for org-owned data goes through these helpers, so it is always
filtered by the caller's organisation. Records from another organisation behave
as if they don't exist (404), which also hides whether an ID is in use.
"""

from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlmodel import Session, select
from sqlmodel.sql.expression import SelectOfScalar

from app.users.models import User


class OrgOwned(Protocol):
    """Any table model with an org_id column (users, groups, and future tables)."""

    org_id: Any


# [ModelT: OrgOwned] is Python 3.12 generics syntax: "works with any model that has org_id,
# and returns that same model type" — so editors know get_in_org_or_404(..., User, ...) is a User.
def scoped_select[ModelT: OrgOwned](model: type[ModelT], user: User) -> SelectOfScalar[ModelT]:
    """`SELECT ... FROM model WHERE org_id = <the caller's org>`. Add more filters after."""
    return select(model).where(model.org_id == user.org_id)


def get_in_org_or_404[ModelT: OrgOwned](
    session: Session, model: type[ModelT], record_id: int, user: User
) -> ModelT:
    """Fetch one record by ID, but only if it belongs to the caller's organisation."""
    record = session.get(model, record_id)
    if record is None or record.org_id != user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return record
