"""
"What day is it?" as a dependency, so tests can pick the date.

Uses UTC for now. Per-organisation time zones are a known follow-up: just after
midnight in India it is still the previous day in UTC.
"""

from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends


def get_today() -> date:
    return datetime.now(UTC).date()


# Use as a route parameter: `def route(today: Today)`. Tests override get_today.
Today = Annotated[date, Depends(get_today)]
