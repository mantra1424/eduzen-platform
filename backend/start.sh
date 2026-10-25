#!/bin/sh
# Container start: bring the database up to date, then serve.
set -e

echo "Applying database migrations..."
alembic upgrade head

if [ "$DEMO_MODE" = "true" ]; then
  echo "Making sure the demo organisations exist..."
  python -m app.demo ensure
fi

# Render (and most hosts) say which port to use in $PORT.
# --proxy-headers: trust the host's proxy for the visitor's real IP and https.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips="*"
