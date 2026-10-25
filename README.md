# EduZen

[![CI](https://github.com/mantra1424/eduzen-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/mantra1424/eduzen-platform/actions/workflows/ci.yml)

A learning platform for colleges and companies: groups (classrooms or teams), attendance,
assessments, and an AI assistant that answers questions from uploaded documents.
Each organisation's data is kept fully separate.

> Work in progress. Rebuilt from a hackathon prototype.

## Tech stack

- **Backend:** FastAPI, SQLModel, PostgreSQL, Alembic, pytest
- **Frontend:** React, TypeScript, Vite, React Router, TanStack Query, Vitest
- **Tooling:** Docker Compose, uv, Ruff, GitHub Actions

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

### Frontend

Requirements: Node.js 24 (see `frontend/.nvmrc`). Start the backend first, then:

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, forwards /api to the backend
```

## Tests

```bash
cd backend
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

```bash
cd frontend
npm run typecheck && npm run lint && npm run format:check && npm test
```
