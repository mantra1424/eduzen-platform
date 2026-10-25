# EduZen

[![CI](https://github.com/mantra1424/eduzen-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/mantra1424/eduzen-platform/actions/workflows/ci.yml)

A learning platform for colleges and companies: groups (classrooms or teams), attendance,
assessments, and an AI assistant that answers questions from uploaded documents.
Each organisation's data is kept fully separate.

> Work in progress. Rebuilt from a hackathon prototype.

## Features so far

- Organisation signup (college or company) that creates the first admin
- Login with argon2-hashed passwords and JWT tokens; logout; expired sessions send users back to login
- Admin user management and groups (classrooms/teams) with role-based permissions
- Every query is limited to the caller's organisation

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

## Deployment

Free hosting: **Vercel** (frontend), **Render** (backend, from `backend/Dockerfile`) and **Neon** (Postgres).
The frontend forwards `/api/*` to the backend (`frontend/vercel.json`), so the browser sees one
site and no CORS setup is needed.

| Where | Setting | Value |
|---|---|---|
| Render | `DATABASE_URL` | Neon connection string (`postgres://…?sslmode=require` works as given) |
| Render | `JWT_SECRET` | a new random secret: `openssl rand -hex 32` |
| Render | `DEMO_MODE` | `true` to create the demo organisations on first start |
| Render | Health check path | `/health` |
| Vercel | Root directory | `frontend` |
| Vercel | `VITE_DEMO_MODE` | `true` to show one-click demo logins |
| GitHub Actions secret | `DEMO_DATABASE_URL` | same Neon connection string, for the nightly demo reset |

On every start the container runs `alembic upgrade head`, then (with `DEMO_MODE=true`)
`python -m app.demo ensure`, then serves on `$PORT`. The **Reset demo data** workflow recreates
the two demo organisations nightly at 03:00 IST; it never touches other organisations.

The free Render plan pauses the backend when idle. The login page starts waking it as soon as it
opens, and the app explains the wait if it takes more than a few seconds.

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
