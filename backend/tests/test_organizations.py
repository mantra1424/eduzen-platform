from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.organizations.models import Organization
from tests.factories import auth_headers, make_org, make_user


def signup_payload(**overrides) -> dict:
    payload = {
        "org_name": "SVMIT",
        "slug": "svmit",
        "type": "college",
        "admin_name": "Priya Shah",
        "admin_email": "priya@svmit.edu",
        "admin_password": "a-strong-password",
    }
    return payload | overrides


def test_signup_creates_org_and_admin_and_logs_in(client: TestClient):
    response = client.post("/organizations", json=signup_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["slug"] == "svmit"
    assert body["organization"]["type"] == "college"
    assert body["user"]["role"] == "admin"
    assert body["user"]["org_id"] == body["organization"]["id"]

    # The returned token works straight away.
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == "priya@svmit.edu"

    # And the admin can log in with the password they chose.
    login = client.post(
        "/auth/login", json={"email": "priya@svmit.edu", "password": "a-strong-password"}
    )
    assert login.status_code == 200


def test_signup_normalizes_slug_and_email(client: TestClient):
    body = client.post(
        "/organizations", json=signup_payload(slug=" SVMIT ", admin_email="Priya@SVMIT.edu")
    ).json()
    assert body["organization"]["slug"] == "svmit"
    assert body["user"]["email"] == "priya@svmit.edu"


def test_signup_with_taken_slug_is_409(client: TestClient):
    client.post("/organizations", json=signup_payload())
    response = client.post(
        "/organizations", json=signup_payload(admin_email="someone-else@svmit.edu")
    )
    assert response.status_code == 409


def test_signup_with_taken_email_is_409_and_creates_nothing(client: TestClient, session: Session):
    client.post("/organizations", json=signup_payload())

    response = client.post("/organizations", json=signup_payload(slug="other-college"))

    assert response.status_code == 409
    slugs = session.exec(select(Organization.slug)).all()
    assert slugs == ["svmit"]  # the second organisation was not half-created


def test_signup_rejects_bad_input(client: TestClient):
    bad_inputs = [
        {"slug": "a"},  # too short
        {"slug": "has spaces"},
        {"type": "school"},  # not college/company
        {"admin_email": "not-an-email"},
        {"admin_password": "short"},
        {"org_name": "   "},
    ]
    for override in bad_inputs:
        response = client.post("/organizations", json=signup_payload(**override))
        assert response.status_code == 422, override


def test_my_organization(client: TestClient, session: Session):
    org = make_org(session, slug="acme")
    user = make_user(session, org)
    response = client.get("/organizations/me", headers=auth_headers(user))
    assert response.status_code == 200
    assert response.json()["slug"] == "acme"


def test_my_organization_requires_login(client: TestClient):
    assert client.get("/organizations/me").status_code == 401
