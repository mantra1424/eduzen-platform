import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.groups.models import Group, GroupMember
from app.organizations.models import Organization
from app.users.models import User, UserRole
from tests.factories import add_to_group, auth_headers, make_group, make_org, make_user


@pytest.fixture
def org(session: Session) -> Organization:
    return make_org(session, slug="svmit")


@pytest.fixture
def admin(session: Session, org: Organization) -> User:
    return make_user(session, org, "admin@svmit.edu", UserRole.admin)


@pytest.fixture
def teacher(session: Session, org: Organization) -> User:
    return make_user(session, org, "teacher@svmit.edu", UserRole.instructor)


@pytest.fixture
def student(session: Session, org: Organization) -> User:
    return make_user(session, org, "student@svmit.edu", UserRole.learner)


@pytest.fixture
def group(session: Session, org: Organization) -> Group:
    return make_group(session, org, "CE Sem 5")


@pytest.fixture
def other_org_admin(session: Session) -> User:
    return make_user(session, make_org(session, slug="acme"), "boss@acme.com", UserRole.admin)


# --- admin: create, list, rename, delete -------------------------------------


def test_admin_creates_and_lists_groups(client: TestClient, admin: User):
    headers = auth_headers(admin)
    created = client.post("/groups", json={"name": "CE Sem 5"}, headers=headers)
    client.post("/groups", json={"name": "IT Sem 3"}, headers=headers)

    assert created.status_code == 201
    assert created.json()["member_count"] == 0
    names = [g["name"] for g in client.get("/groups", headers=headers).json()]
    assert names == ["CE Sem 5", "IT Sem 3"]


def test_group_names_unique_within_org_only(client: TestClient, admin: User, other_org_admin: User):
    client.post("/groups", json={"name": "CE Sem 5"}, headers=auth_headers(admin))

    same_org = client.post("/groups", json={"name": "CE Sem 5"}, headers=auth_headers(admin))
    other_org = client.post(
        "/groups", json={"name": "CE Sem 5"}, headers=auth_headers(other_org_admin)
    )

    assert same_org.status_code == 409
    assert other_org.status_code == 201


def test_admin_renames_group(client: TestClient, admin: User, group: Group):
    response = client.patch(
        f"/groups/{group.id}", json={"name": "CE Sem 6"}, headers=auth_headers(admin)
    )
    assert response.status_code == 200
    assert response.json()["name"] == "CE Sem 6"


def test_rename_to_existing_name_is_409(
    client: TestClient, session: Session, org: Organization, admin: User, group: Group
):
    make_group(session, org, "IT Sem 3")
    response = client.patch(
        f"/groups/{group.id}", json={"name": "IT Sem 3"}, headers=auth_headers(admin)
    )
    assert response.status_code == 409


def test_deleting_group_removes_its_memberships(
    client: TestClient, session: Session, admin: User, group: Group, student: User
):
    add_to_group(session, group, student)

    response = client.delete(f"/groups/{group.id}", headers=auth_headers(admin))

    assert response.status_code == 204
    assert session.exec(select(GroupMember)).all() == []
    assert session.get(User, student.id) is not None  # the user still exists


def test_list_shows_member_counts(
    client: TestClient, session: Session, org: Organization, admin: User, group: Group
):
    add_to_group(session, group, *[make_user(session, org, f"s{i}@svmit.edu") for i in range(3)])
    make_group(session, org, "Empty group")

    groups = {
        g["name"]: g["member_count"]
        for g in client.get("/groups", headers=auth_headers(admin)).json()
    }

    assert groups == {"CE Sem 5": 3, "Empty group": 0}


def test_non_admins_cannot_manage_groups(
    client: TestClient, teacher: User, student: User, group: Group
):
    for user in (teacher, student):
        headers = auth_headers(user)
        assert client.get("/groups", headers=headers).status_code == 403
        assert client.post("/groups", json={"name": "X"}, headers=headers).status_code == 403
        assert client.delete(f"/groups/{group.id}", headers=headers).status_code == 403


def test_other_orgs_groups_are_404(client: TestClient, other_org_admin: User, group: Group):
    headers = auth_headers(other_org_admin)
    assert client.get(f"/groups/{group.id}", headers=headers).status_code == 404
    assert client.delete(f"/groups/{group.id}", headers=headers).status_code == 404
    assert client.get(f"/groups/{group.id}/members", headers=headers).status_code == 404
    assert client.get("/groups", headers=headers).json() == []


# --- membership: admin -------------------------------------------------------


def test_admin_adds_and_removes_members(
    client: TestClient, admin: User, group: Group, student: User
):
    headers = auth_headers(admin)
    members_path = f"/groups/{group.id}/members"

    added = client.post(members_path, json={"user_id": student.id}, headers=headers)
    assert added.status_code == 204
    assert [m["email"] for m in client.get(members_path, headers=headers).json()] == [
        "student@svmit.edu"
    ]

    removed = client.delete(f"{members_path}/{student.id}", headers=headers)
    assert removed.status_code == 204
    assert client.get(members_path, headers=headers).json() == []


def test_adding_same_member_twice_is_409(
    client: TestClient, admin: User, group: Group, student: User
):
    path = f"/groups/{group.id}/members"
    client.post(path, json={"user_id": student.id}, headers=auth_headers(admin))
    response = client.post(path, json={"user_id": student.id}, headers=auth_headers(admin))
    assert response.status_code == 409


def test_cannot_add_user_from_another_org(
    client: TestClient, admin: User, group: Group, other_org_admin: User
):
    response = client.post(
        f"/groups/{group.id}/members",
        json={"user_id": other_org_admin.id},
        headers=auth_headers(admin),
    )
    assert response.status_code == 404


def test_removing_non_member_is_404(client: TestClient, admin: User, group: Group, student: User):
    response = client.delete(
        f"/groups/{group.id}/members/{student.id}", headers=auth_headers(admin)
    )
    assert response.status_code == 404


# --- membership: instructors and learners ------------------------------------


def test_instructor_manages_learners_in_own_group(
    client: TestClient, session: Session, group: Group, teacher: User, student: User
):
    add_to_group(session, group, teacher)
    headers = auth_headers(teacher)
    path = f"/groups/{group.id}/members"

    assert client.post(path, json={"user_id": student.id}, headers=headers).status_code == 204
    assert len(client.get(path, headers=headers).json()) == 2
    assert client.delete(f"{path}/{student.id}", headers=headers).status_code == 204


def test_instructor_cannot_add_other_staff(
    client: TestClient, session: Session, org: Organization, group: Group, teacher: User
):
    add_to_group(session, group, teacher)
    other_teacher = make_user(session, org, "t2@svmit.edu", UserRole.instructor)

    response = client.post(
        f"/groups/{group.id}/members",
        json={"user_id": other_teacher.id},
        headers=auth_headers(teacher),
    )

    assert response.status_code == 403


def test_instructor_cannot_touch_groups_they_are_not_in(
    client: TestClient, group: Group, teacher: User, student: User
):
    headers = auth_headers(teacher)
    path = f"/groups/{group.id}/members"
    assert client.get(path, headers=headers).status_code == 403
    assert client.post(path, json={"user_id": student.id}, headers=headers).status_code == 403


def test_learner_cannot_view_or_change_members(
    client: TestClient, session: Session, group: Group, student: User
):
    add_to_group(session, group, student)
    headers = auth_headers(student)
    path = f"/groups/{group.id}/members"
    assert client.get(path, headers=headers).status_code == 403
    assert client.delete(f"{path}/{student.id}", headers=headers).status_code == 403


# --- my groups ---------------------------------------------------------------


def test_my_groups_lists_only_groups_i_belong_to(
    client: TestClient, session: Session, org: Organization, group: Group, student: User
):
    make_group(session, org, "Not my group")
    add_to_group(session, group, student)

    response = client.get("/groups/mine", headers=auth_headers(student))

    assert response.status_code == 200
    assert [(g["name"], g["member_count"]) for g in response.json()] == [("CE Sem 5", 1)]


def test_my_groups_requires_login(client: TestClient):
    assert client.get("/groups/mine").status_code == 401
