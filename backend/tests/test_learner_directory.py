import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.organizations.models import Organization
from app.users.models import User, UserRole
from tests.factories import auth_headers, make_org, make_user


@pytest.fixture
def org(session: Session) -> Organization:
    return make_org(session, slug="svmit")


@pytest.fixture
def teacher(session: Session, org: Organization) -> User:
    return make_user(session, org, "teacher@svmit.edu", UserRole.instructor)


def learner(session: Session, org: Organization, name: str, email: str, **kwargs) -> User:
    user = make_user(session, org, email, UserRole.learner, **kwargs)
    user.name = name
    session.add(user)
    session.commit()
    return user


def directory(client: TestClient, as_user: User, **params) -> list[dict]:
    response = client.get("/users/directory", params=params, headers=auth_headers(as_user))
    assert response.status_code == 200, response.text
    return response.json()


def test_lists_only_active_learners_in_own_org(
    client: TestClient, session: Session, org: Organization, teacher: User
):
    learner(session, org, "Ravi Patel", "ravi@svmit.edu")
    learner(session, org, "Asha Shah", "asha@svmit.edu")
    learner(session, org, "Left Already", "left@svmit.edu", is_active=False)
    make_user(session, org, "admin@svmit.edu", UserRole.admin)
    learner(session, make_org(session, slug="acme"), "Other Org", "bob@acme.com")

    names = [entry["name"] for entry in directory(client, teacher)]

    assert names == ["Asha Shah", "Ravi Patel"]  # sorted; no staff, inactive or other orgs


def test_returns_only_id_name_and_email(
    client: TestClient, session: Session, org: Organization, teacher: User
):
    ravi = learner(session, org, "Ravi Patel", "ravi@svmit.edu")
    assert directory(client, teacher) == [
        {"id": ravi.id, "name": "Ravi Patel", "email": "ravi@svmit.edu"}
    ]


def test_admins_can_use_it_too(client: TestClient, session: Session, org: Organization):
    admin = make_user(session, org, "admin@svmit.edu", UserRole.admin)
    learner(session, org, "Ravi Patel", "ravi@svmit.edu")
    assert len(directory(client, admin)) == 1


def test_learners_cannot_use_it(client: TestClient, session: Session, org: Organization):
    ravi = learner(session, org, "Ravi Patel", "ravi@svmit.edu")
    response = client.get("/users/directory", headers=auth_headers(ravi))
    assert response.status_code == 403


def test_requires_login(client: TestClient):
    assert client.get("/users/directory").status_code == 401


def test_instructors_still_cannot_use_admin_user_endpoints(client: TestClient, teacher: User):
    assert client.get("/users", headers=auth_headers(teacher)).status_code == 403


def test_search_matches_name_or_email_case_insensitively(
    client: TestClient, session: Session, org: Organization, teacher: User
):
    learner(session, org, "Ravi Patel", "ravi@svmit.edu")
    learner(session, org, "Asha Shah", "asha.p@svmit.edu")

    assert [e["name"] for e in directory(client, teacher, q="RAVI")] == ["Ravi Patel"]
    assert [e["name"] for e in directory(client, teacher, q="asha.p@")] == ["Asha Shah"]
    assert directory(client, teacher, q="nobody") == []


def test_search_treats_wildcards_literally(
    client: TestClient, session: Session, org: Organization, teacher: User
):
    learner(session, org, "Ravi Patel", "ravi@svmit.edu")
    learner(session, org, "Under_Score", "under@svmit.edu")

    assert directory(client, teacher, q="%") == []  # would match everyone if not escaped
    assert [e["name"] for e in directory(client, teacher, q="_")] == ["Under_Score"]


def test_results_are_capped_at_50(
    client: TestClient, session: Session, org: Organization, teacher: User
):
    for i in range(55):
        learner(session, org, f"Student {i:02d}", f"s{i:02d}@svmit.edu")
    entries = directory(client, teacher)
    assert len(entries) == 50
    assert entries[0]["name"] == "Student 00"


def test_overly_long_search_is_rejected(client: TestClient, teacher: User):
    response = client.get(
        "/users/directory", params={"q": "x" * 101}, headers=auth_headers(teacher)
    )
    assert response.status_code == 422
