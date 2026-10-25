from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.auth.routes import router as auth_router
from app.config import settings
from app.db import SessionDep
from app.organizations.routes import router as organizations_router
from app.users.routes import router as users_router

app = FastAPI(title=settings.app_name)
app.include_router(auth_router)
app.include_router(organizations_router)
app.include_router(users_router)


@app.get("/health")
def health(session: SessionDep):
    """Reports whether the API is up and can reach the database."""
    try:
        session.exec(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ok", "database": "ok"}
