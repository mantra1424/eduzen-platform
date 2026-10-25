"""Database engine and a per-request session."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, create_engine

from app.config import settings

# pool_pre_ping checks a connection is still alive before using it.
engine = create_engine(settings.database_url, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, closed afterwards."""
    with Session(engine) as session:
        yield session


# Use this as a parameter type in routes: `def route(session: SessionDep)`.
SessionDep = Annotated[Session, Depends(get_session)]
