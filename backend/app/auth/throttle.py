"""
Login lockout: after too many wrong passwords for one email, refuse logins for it
for a while, so nobody can guess a password by trying thousands of them.

Kept in memory, which suits the single API server we run: a restart forgets the
counts, which only ever makes things easier for real users. With several servers
this would move to a shared store such as Redis or a database table.

Unknown emails are counted and locked exactly like real ones, so the lockout
message never reveals which emails have accounts.
"""

import math
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from threading import Lock

MAX_FAILURES = 5  # wrong passwords allowed...
WINDOW_SECONDS = 15 * 60  # ...within this long, before the email is locked
LOCKOUT_SECONDS = 15 * 60  # and how long the lock lasts
MAX_TRACKED_EMAILS = 10_000  # caps memory if someone tries endless made-up emails


@dataclass
class _Record:
    failures: list[float] = field(default_factory=list)  # times of recent failures
    locked_until: float = 0.0


class LoginThrottle:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._records: dict[str, _Record] = {}
        self._lock = Lock()  # FastAPI runs sync routes in a thread pool

    def seconds_locked(self, email: str) -> int:
        """How many seconds until this email may try again (0 = not locked)."""
        with self._lock:
            record = self._records.get(email)
            if record is None:
                return 0
            return max(0, math.ceil(record.locked_until - self._clock()))

    def record_failure(self, email: str) -> None:
        now = self._clock()
        with self._lock:
            record = self._records.get(email)
            if record is None:
                if len(self._records) >= MAX_TRACKED_EMAILS:
                    self._forget_stale(now)
                record = self._records[email] = _Record()
            record.failures = [t for t in record.failures if now - t < WINDOW_SECONDS]
            record.failures.append(now)
            if len(record.failures) >= MAX_FAILURES:
                record.locked_until = now + LOCKOUT_SECONDS
                record.failures.clear()  # a fresh count once the lock ends

    def record_success(self, email: str) -> None:
        with self._lock:
            self._records.pop(email, None)

    def clear(self) -> None:
        with self._lock:
            self._records.clear()

    def _forget_stale(self, now: float) -> None:
        """Drop emails with no lock and no recent failures; if still full, the oldest half."""
        self._records = {
            email: r
            for email, r in self._records.items()
            if r.locked_until > now or any(now - t < WINDOW_SECONDS for t in r.failures)
        }
        if len(self._records) >= MAX_TRACKED_EMAILS:
            keep = list(self._records.items())[MAX_TRACKED_EMAILS // 2 :]
            self._records = dict(keep)


login_throttle = LoginThrottle()
