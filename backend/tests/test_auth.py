from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth.dependencies import AdminUser
from app.auth.security import create_access_token, hash_password, verify_password
from app.db import get_session
from app.users.models import UserRole
from tests.factories import DEFAULT_PASSWORD, make_org, make_user


def login(client: TestClient, email: str, password: str = DEFAULT_PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- password hashing ------------------------------------------------------


def test_password_hash_is_salted_and_verifiable():
    first, second = hash_password("pw-123456"), hash_password("pw-123456")
    assert first != second  # random salt each time
    assert "pw-123456" not in first
    assert verify_password("pw-123456", first)
    assert not verify_password("wrong", first)


# --- login -----------------------------------------------------------------


def test_login_returns_token_and_user(client: TestClient, session: Session):
    org = make_org(session)
    user = make_user(session, org, role=UserRole.instructor)

    response = login(client, "asha@svmit.edu")

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"] == {
        "id": user.id,
        "org_id": org.id,
        "email": "asha@svmit.edu",
        "name": "Asha",
        "role": "instructor",
    }
    assert "password_hash" not in body["user"]


def test_login_email_is_case_insensitive(client: TestClient, session: Session):
    make_user(session, make_org(session))
    assert login(client, "  Asha@SVMIT.edu ").status_code == 200


def test_wrong_password_and_unknown_email_get_same_response(client: TestClient, session: Session):
    make_user(session, make_org(session))

    wrong_password = login(client, "asha@svmit.edu", "wrong-password")
    unknown_email = login(client, "nobody@svmit.edu")

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_deactivated_user_cannot_log_in(client: TestClient, session: Session):
    make_user(session, make_org(session), is_active=False)
    assert login(client, "asha@svmit.edu").status_code == 401


# --- /auth/me and token checks ---------------------------------------------


def test_me_returns_current_user(client: TestClient, session: Session):
    make_user(session, make_org(session))
    token = login(client, "asha@svmit.edu").json()["access_token"]

    response = client.get("/auth/me", headers=auth_header(token))

    assert response.status_code == 200
    assert response.json()["email"] == "asha@svmit.edu"


def test_me_without_token_is_401(client: TestClient):
    response = client.get("/auth/me")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_garbage_token_is_401(client: TestClient):
    assert client.get("/auth/me", headers=auth_header("not.a.token")).status_code == 401


def test_tampered_token_is_401(client: TestClient, session: Session):
    make_user(session, make_org(session))
    token = login(client, "asha@svmit.edu").json()["access_token"]
    header, payload, signature = token.split(".")
    tampered = f"{header}.{payload}.{signature[:-2]}xx"
    assert client.get("/auth/me", headers=auth_header(tampered)).status_code == 401


def test_expired_token_is_401(client: TestClient, session: Session):
    user = make_user(session, make_org(session))
    token = create_access_token(user.id, user.org_id, user.role, expires_in=timedelta(seconds=-1))
    assert client.get("/auth/me", headers=auth_header(token)).status_code == 401


def test_token_stops_working_when_user_is_deactivated(client: TestClient, session: Session):
    user = make_user(session, make_org(session))
    token = login(client, "asha@svmit.edu").json()["access_token"]

    user.is_active = False
    session.add(user)
    session.commit()

    assert client.get("/auth/me", headers=auth_header(token)).status_code == 401


def test_token_with_wrong_org_is_401(client: TestClient, session: Session):
    user = make_user(session, make_org(session))
    other_org = make_org(session, slug="acme")
    forged = create_access_token(user.id, other_org.id, user.role)
    assert client.get("/auth/me", headers=auth_header(forged)).status_code == 401


# --- role checks -----------------------------------------------------------


def _admin_only_client(session: Session) -> TestClient:
    """A tiny app with one admin-only route, to test require_roles on its own."""
    mini_app = FastAPI()

    @mini_app.get("/admin-only")
    def admin_only(user: AdminUser):
        return {"ok": True}

    mini_app.dependency_overrides[get_session] = lambda: session
    return TestClient(mini_app)


def test_admin_passes_role_check(client: TestClient, session: Session):
    admin = make_user(session, make_org(session), role=UserRole.admin)
    token = create_access_token(admin.id, admin.org_id, admin.role)
    assert _admin_only_client(session).get("/admin-only", headers=auth_header(token)).json() == {
        "ok": True
    }


def test_learner_blocked_by_role_check(client: TestClient, session: Session):
    learner = make_user(session, make_org(session), role=UserRole.learner)
    token = create_access_token(learner.id, learner.org_id, learner.role)
    response = _admin_only_client(session).get("/admin-only", headers=auth_header(token))
    assert response.status_code == 403


def test_role_comes_from_database_not_token(client: TestClient, session: Session):
    # A token that claims "admin" for a learner must not grant admin access.
    learner = make_user(session, make_org(session), role=UserRole.learner)
    token = create_access_token(learner.id, learner.org_id, UserRole.admin)
    response = _admin_only_client(session).get("/admin-only", headers=auth_header(token))
    assert response.status_code == 403
