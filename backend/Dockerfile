# Production image for the EduZen API.
FROM python:3.12-slim

# uv, pinned to the version used in development.
COPY --from=ghcr.io/astral-sh/uv:0.11.3 /uv /bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first, in their own layer: rebuilding after a code change
# reuses this cached layer unless uv.lock changed.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# Then the application code.
COPY . .
RUN uv sync --locked --no-dev

# Don't run as root inside the container.
RUN useradd --create-home --uid 10001 eduzen && chown -R eduzen /app
USER eduzen

EXPOSE 8000
CMD ["./start.sh"]
