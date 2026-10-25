from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.auth.routes import router as auth_router
from app.config import settings
from app.db import SessionDep
from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.groups.routes import router as groups_router
from app.organizations.routes import router as organizations_router
from app.users.routes import router as users_router

app = FastAPI(title=settings.app_name)
app.include_router(auth_router)
app.include_router(organizations_router)
app.include_router(users_router)
app.include_router(groups_router)


# Services raise plain Python errors; these handlers turn them into HTTP responses
# in one place, so routes don't each need their own try/except.
_ERROR_STATUS = {ConflictError: 409, ForbiddenError: 403, NotFoundError: 404}


def _service_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=_ERROR_STATUS[type(exc)], content={"detail": str(exc)})


for error_class in _ERROR_STATUS:
    app.add_exception_handler(error_class, _service_error_handler)


@app.get("/health")
def health(session: SessionDep):
    """Reports whether the API is up and can reach the database."""
    try:
        session.exec(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ok", "database": "ok"}
