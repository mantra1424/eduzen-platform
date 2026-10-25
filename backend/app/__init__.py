from sqlmodel import SQLModel

# Name every index and constraint predictably, so migrations can always refer to
# them (Alembic can't drop a constraint whose name it doesn't know).
# These match Postgres's own default names, so existing tables don't change.
# It lives here because this file runs before any model is imported.
SQLModel.metadata.naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
    "pk": "%(table_name)s_pkey",
}
