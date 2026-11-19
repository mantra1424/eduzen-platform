from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth.throttle import LOCKOUT_SECONDS, MAX_FAILURES, WINDOW_SECONDS, LoginThrottle
from tests.factories import DEFAULT_PASSWORD, make_org, make_user


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def login(client: TestClient, email: str, password: str = DEFAULT_PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


# --- the throttle on its own (fake clock, no waiting) -----------------------


def test_locks_after_max_failures_and_unlocks_after_lockout():
    clock = FakeClock()
    throttle = LoginThrottle(clock)

    for _ in range(MAX_FAILURES - 1):
        throttle.record_failure("a@x.com")
    assert throttle.seconds_locked("a@x.com") == 0

    throttle.record_failure("a@x.com")
    assert throttle.seconds_locked("a@x.com") == LOCKOUT_SECONDS

    clock.now += LOCKOUT_SECONDS
    assert throttle.seconds_locked("a@x.com") == 0


def test_old_failures_fall_out_of_the_window():
    clock = FakeClock()
    throttle = LoginThrottle(clock)

    for _ in range(MAX_FAILURES - 1):
        throttle.record_failure("a@x.com")
    clock.now += WINDOW_SECONDS  # the earlier failures are now too old to count
    throttle.record_failure("a@x.com")

    assert throttle.seconds_locked("a@x.com") == 0


def test_success_resets_the_count_and_emails_are_separate():
    throttle = LoginThrottle(FakeClock())

    for _ in range(MAX_FAILURES - 1):
        throttle.record_failure("a@x.com")
        throttle.record_failure("b@x.com")
    throttle.record_success("a@x.com")
    throttle.record_failure("a@x.com")
    throttle.record_failure("b@x.com")

    assert throttle.seconds_locked("a@x.com") == 0
    assert throttle.seconds_locked("b@x.com") > 0


# --- through the API --------------------------------------------------------


def test_too_many_wrong_passwords_lock_the_account(client: TestClient, session: Session):
    make_user(session, make_org(session))

    for _ in range(MAX_FAILURES):
        assert login(client, "asha@svmit.edu", "wrong-password").status_code == 401

    # Locked: even the right password is refused, with a clear message.
    locked = login(client, "asha@svmit.edu")
    assert locked.status_code == 429
    assert "Too many failed login attempts" in locked.json()["detail"]
    assert int(locked.headers["Retry-After"]) > 0


def test_lockout_ignores_email_case(client: TestClient, session: Session):
    make_user(session, make_org(session))

    for _ in range(MAX_FAILURES):
        login(client, "Asha@SVMIT.edu", "wrong-password")

    assert login(client, "asha@svmit.edu").status_code == 429


def test_unknown_email_locks_the_same_way(client: TestClient, session: Session):
    """Otherwise the lockout itself would reveal which emails have accounts."""
    make_user(session, make_org(session))

    for _ in range(MAX_FAILURES):
        login(client, "asha@svmit.edu", "wrong-password")
        login(client, "nobody@svmit.edu", "wrong-password")

    real, unknown = login(client, "asha@svmit.edu"), login(client, "nobody@svmit.edu")
    assert real.status_code == unknown.status_code == 429
    assert real.json() == unknown.json()


def test_one_locked_account_does_not_affect_others(client: TestClient, session: Session):
    org = make_org(session)
    make_user(session, org)
    make_user(session, org, email="ravi@svmit.edu")

    for _ in range(MAX_FAILURES):
        login(client, "asha@svmit.edu", "wrong-password")

    assert login(client, "ravi@svmit.edu").status_code == 200
