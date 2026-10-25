import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.organizations.models import Organization
from app.users.models import User, UserRole
from tests.factories import DEFAULT_PASSWORD, auth_headers, make_org, make_user


@pytest.fixture
def org(session: Session) -> Organization:
    return make_org(session, slug="svmit")


@pytest.fixture
def admin(session: Session, org: Organization) -> User:
    return make_user(session, org, "admin@svmit.edu", UserRole.admin)


@pytest.fixture
def other_org_user(session: Session) -> User:
    """A user in a different organisation, who our admin must never see."""
    return make_user(session, make_org(session, slug="acme"), "bob@acme.com", UserRole.learner)


def new_user_payload(**overrides) -> dict:
    payload = {
        "email": "ravi@svmit.edu",
        "name": "Ravi",
        "password": "ravi-password",
        "role": "learner",
    }
    return payload | overrides


# --- create ----------------------------------------------------------------


def test_admin_creates_user_who_can_log_in(client: TestClient, admin: User):
    response = client.post("/users", json=new_user_payload(), headers=auth_headers(admin))

    assert response.status_code == 201
    body = response.json()
    assert body["org_id"] == admin.org_id  # placed in the admin's own organisation
    assert body["role"] == "learner"
    assert "password" not in body
    assert "password_hash" not in body

    login = client.post(
        "/auth/login", json={"email": "ravi@svmit.edu", "password": "ravi-password"}
    )
    assert login.status_code == 200


def test_client_cannot_choose_org(client: TestClient, admin: User, other_org_user: User):
    payload = new_user_payload(org_id=other_org_user.org_id)  # extra field is ignored
    body = client.post("/users", json=payload, headers=auth_headers(admin)).json()
    assert body["org_id"] == admin.org_id


def test_duplicate_email_is_409(client: TestClient, admin: User):
    headers = auth_headers(admin)
    client.post("/users", json=new_user_payload(), headers=headers)
    response = client.post("/users", json=new_user_payload(email="RAVI@svmit.edu"), headers=headers)
    assert response.status_code == 409


def test_non_admins_cannot_manage_users(client: TestClient, session: Session, org: Organization):
    for role in (UserRole.instructor, UserRole.learner):
        user = make_user(session, org, email=f"{role.value}@svmit.edu", role=role)
        headers = auth_headers(user)
        assert client.get("/users", headers=headers).status_code == 403
        assert client.post("/users", json=new_user_payload(), headers=headers).status_code == 403
        assert client.get(f"/users/{user.id}", headers=headers).status_code == 403


def test_user_endpoints_require_login(client: TestClient):
    assert client.get("/users").status_code == 401


# --- list and read ---------------------------------------------------------


def test_list_only_shows_own_org(
    client: TestClient, session: Session, org: Organization, admin: User, other_org_user: User
):
    make_user(session, org, "learner@svmit.edu")

    emails = [u["email"] for u in client.get("/users", headers=auth_headers(admin)).json()]

    assert sorted(emails) == ["admin@svmit.edu", "learner@svmit.edu"]


def test_list_filters_by_role_and_status(
    client: TestClient, session: Session, org: Organization, admin: User
):
    make_user(session, org, "teacher@svmit.edu", role=UserRole.instructor)
    make_user(session, org, "left@svmit.edu", is_active=False)
    headers = auth_headers(admin)

    instructors = client.get("/users", params={"role": "instructor"}, headers=headers).json()
    inactive = client.get("/users", params={"is_active": "false"}, headers=headers).json()

    assert [u["email"] for u in instructors] == ["teacher@svmit.edu"]
    assert [u["email"] for u in inactive] == ["left@svmit.edu"]


def test_get_user_in_own_org(client: TestClient, admin: User):
    response = client.get(f"/users/{admin.id}", headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.json()["email"] == "admin@svmit.edu"


def test_other_orgs_users_are_404(client: TestClient, admin: User, other_org_user: User):
    headers = auth_headers(admin)
    path = f"/users/{other_org_user.id}"
    assert client.get(path, headers=headers).status_code == 404
    assert client.patch(path, json={"name": "Hacked"}, headers=headers).status_code == 404


def test_missing_user_is_404(client: TestClient, admin: User):
    assert client.get("/users/999999", headers=auth_headers(admin)).status_code == 404


# --- update ----------------------------------------------------------------


def test_admin_updates_name_and_role(
    client: TestClient, session: Session, org: Organization, admin: User
):
    user = make_user(session, org)

    response = client.patch(
        f"/users/{user.id}",
        json={"name": "Asha Patel", "role": "instructor"},
        headers=auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Asha Patel"
    assert response.json()["role"] == "instructor"


def test_update_only_changes_fields_sent(
    client: TestClient, session: Session, org: Organization, admin: User
):
    user = make_user(session, org, role=UserRole.instructor)
    body = client.patch(
        f"/users/{user.id}", json={"name": "New Name"}, headers=auth_headers(admin)
    ).json()
    assert body["role"] == "instructor"  # untouched
    assert body["is_active"] is True  # untouched


def test_deactivated_user_cannot_log_in(
    client: TestClient, session: Session, org: Organization, admin: User
):
    user = make_user(session, org)
    client.patch(f"/users/{user.id}", json={"is_active": False}, headers=auth_headers(admin))

    login = client.post("/auth/login", json={"email": user.email, "password": DEFAULT_PASSWORD})

    assert login.status_code == 401


def test_admin_cannot_lock_themselves_out(client: TestClient, admin: User):
    headers = auth_headers(admin)
    path = f"/users/{admin.id}"
    assert client.patch(path, json={"is_active": False}, headers=headers).status_code == 400
    assert client.patch(path, json={"role": "learner"}, headers=headers).status_code == 400
    # Changing their own name is fine.
    assert client.patch(path, json={"name": "Head Admin"}, headers=headers).status_code == 200
