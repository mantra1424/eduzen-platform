# EduZen

A learning platform for colleges and companies: groups (classrooms or teams), attendance,
assessments, and an AI assistant that answers questions from uploaded documents.
Each organisation's data is kept fully separate.

> Work in progress. Rebuilt from a hackathon prototype.

## Tech stack

- **Backend:** FastAPI, SQLModel, PostgreSQL, Alembic, pytest
- **Frontend:** React, TypeScript, Vite *(coming soon)*
- **Tooling:** Docker Compose, uv, Ruff, GitHub Actions *(coming soon)*

## Running locally

Requirements: [Docker](https://www.docker.com/), [uv](https://docs.astral.sh/uv/), Python 3.12+.

```bash
cp .env.example .env          # then change the passwords in .env
docker compose up -d --wait   # starts Postgres on port 5433
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

Check it's running: <http://localhost:8000/health> should return `{"status": "ok", "database": "ok"}`.
API docs: <http://localhost:8000/docs>.

## Tests

```bash
cd backend
uv run pytest
uv run ruff check . && uv run ruff format --check .
```
