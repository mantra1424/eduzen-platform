from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.attendance.models import AttendanceRecord, AttendanceStatus
from app.clock import get_today
from app.groups.models import Group, GroupMember
from app.main import app
from app.organizations.models import Organization
from app.users.models import User, UserRole
from tests.factories import (
    add_to_group,
    auth_headers,
    make_attendance_session,
    make_group,
    make_org,
    make_user,
    mark,
)

TODAY = date(2026, 10, 26)


@pytest.fixture(autouse=True)
def fixed_today(client: TestClient):
    """Every test runs on TODAY, so the 7-day window is checked against exact dates."""
    app.dependency_overrides[get_today] = lambda: TODAY


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
def ravi(session: Session, org: Organization) -> User:
    user = make_user(session, org, "ravi@svmit.edu", UserRole.learner)
    user.name = "Ravi"
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def asha(session: Session, org: Organization) -> User:
    user = make_user(session, org, "asha@svmit.edu", UserRole.learner)
    user.name = "Asha"
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def group(session: Session, org: Organization, teacher: User, ravi: User, asha: User) -> Group:
    group = make_group(session, org, "CE Sem 5")
    add_to_group(session, group, teacher, ravi, asha)
    return group


def start(client: TestClient, group: Group, as_user: User, **body):
    return client.post(f"/groups/{group.id}/sessions", json=body, headers=auth_headers(as_user))


def save(client: TestClient, session_id: int, as_user: User, marks: dict[int, str]):
    records = [{"user_id": uid, "status": status} for uid, status in marks.items()]
    return client.put(
        f"/sessions/{session_id}/records", json={"records": records}, headers=auth_headers(as_user)
    )


# --- starting sessions ---------------------------------------------------------


def test_teacher_starts_session_for_today(
    client: TestClient, group: Group, teacher: User, ravi: User, asha: User
):
    response = start(client, group, teacher, topic="  Unit 3: Joins  ")

    assert response.status_code == 201
    body = response.json()
    assert body["held_on"] == "2026-10-26"
    assert body["topic"] == "Unit 3: Joins"
    assert body["group_name"] == "CE Sem 5"
    # Learners only: the teacher is a member but isn't on the class list.
    assert [(e["name"], e["status"], e["is_member"]) for e in body["roster"]] == [
        ("Asha", None, True),
        ("Ravi", None, True),
    ]
    assert body["can_edit"] is True
    assert body["can_close"] is False  # nobody marked yet
    assert body["can_reopen"] is False


def test_blank_topic_is_stored_as_none(client: TestClient, group: Group, teacher: User):
    assert start(client, group, teacher, topic="   ").json()["topic"] is None


def test_session_cannot_be_in_the_future(client: TestClient, group: Group, admin: User):
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    assert start(client, group, admin, held_on=tomorrow).status_code == 400


def test_teachers_can_add_sessions_from_the_last_7_days_only(
    client: TestClient, group: Group, teacher: User
):
    seven_days_ago = (TODAY - timedelta(days=7)).isoformat()
    eight_days_ago = (TODAY - timedelta(days=8)).isoformat()

    assert start(client, group, teacher, held_on=seven_days_ago).status_code == 201
    late = start(client, group, teacher, held_on=eight_days_ago)
    assert late.status_code == 403
    assert "7 days" in late.json()["detail"]


def test_admins_can_add_older_sessions(client: TestClient, group: Group, admin: User):
    old = (TODAY - timedelta(days=30)).isoformat()
    assert start(client, group, admin, held_on=old).status_code == 201


def test_only_group_staff_can_start_sessions(
    client: TestClient, session: Session, org: Organization, group: Group, ravi: User
):
    outsider = make_user(session, org, "other-teacher@svmit.edu", UserRole.instructor)
    other_org_admin = make_user(
        session, make_org(session, slug="acme"), "b@acme.com", UserRole.admin
    )

    assert start(client, group, outsider).status_code == 403  # not their group
    assert start(client, group, ravi).status_code == 403  # learners can't
    assert start(client, group, other_org_admin).status_code == 404  # can't even see it


# --- listing -------------------------------------------------------------------


def test_list_shows_counts_newest_first(
    client: TestClient,
    session: Session,
    group: Group,
    teacher: User,
    ravi: User,
    asha: User,
):
    older = make_attendance_session(session, group, teacher, held_on=TODAY - timedelta(days=2))
    newer = make_attendance_session(session, group, teacher, held_on=TODAY)
    mark(session, older, ravi, AttendanceStatus.present, marked_by=teacher)
    mark(session, older, asha, AttendanceStatus.excused, marked_by=teacher)
    mark(session, newer, ravi, AttendanceStatus.late, marked_by=teacher)

    response = client.get(f"/groups/{group.id}/sessions", headers=auth_headers(teacher))

    assert response.status_code == 200
    rows = response.json()
    assert [r["id"] for r in rows] == [newer.id, older.id]
    assert {k: rows[0][k] for k in ("present", "absent", "late", "excused", "unmarked")} == {
        "present": 0,
        "absent": 0,
        "late": 1,
        "excused": 0,
        "unmarked": 1,
    }
    assert rows[1]["present"] == 1
    assert rows[1]["excused"] == 1
    assert rows[1]["unmarked"] == 0


def test_learners_cannot_list_sessions(client: TestClient, group: Group, ravi: User):
    assert client.get(f"/groups/{group.id}/sessions", headers=auth_headers(ravi)).status_code == 403


# --- marking -------------------------------------------------------------------


def test_save_marks_for_the_whole_class_then_change_one(
    client: TestClient,
    session: Session,
    group: Group,
    teacher: User,
    admin: User,
    ravi: User,
    asha: User,
):
    session_id = start(client, group, teacher).json()["id"]

    first = save(client, session_id, teacher, {ravi.id: "present", asha.id: "absent"})
    assert first.status_code == 200
    assert {e["name"]: e["status"] for e in first.json()["roster"]} == {
        "Ravi": "present",
        "Asha": "absent",
    }
    assert first.json()["can_close"] is True

    # Asha arrived late after all; an admin corrects it.
    second = save(client, session_id, admin, {asha.id: "late"})
    assert {e["name"]: e["status"] for e in second.json()["roster"]} == {
        "Ravi": "present",
        "Asha": "late",
    }
    record = session.get(AttendanceRecord, (session_id, asha.id))
    session.refresh(record)
    assert record.marked_by == admin.id  # who changed it is recorded


def test_cannot_mark_people_outside_the_group(
    client: TestClient,
    session: Session,
    org: Organization,
    group: Group,
    teacher: User,
):
    session_id = start(client, group, teacher).json()["id"]
    stranger = make_user(session, org, "stranger@svmit.edu", UserRole.learner)

    response = save(client, session_id, teacher, {stranger.id: "present"})

    assert response.status_code == 400
    assert str(stranger.id) in response.json()["detail"]
    # Staff aren't on the class list either.
    assert save(client, session_id, teacher, {teacher.id: "present"}).status_code == 400


def test_each_person_once_per_save(client: TestClient, group: Group, teacher: User, ravi: User):
    session_id = start(client, group, teacher).json()["id"]
    response = client.put(
        f"/sessions/{session_id}/records",
        json={
            "records": [
                {"user_id": ravi.id, "status": "present"},
                {"user_id": ravi.id, "status": "absent"},
            ]
        },
        headers=auth_headers(teacher),
    )
    assert response.status_code == 400


def test_empty_save_and_unknown_status_are_rejected(
    client: TestClient, group: Group, teacher: User, ravi: User
):
    session_id = start(client, group, teacher).json()["id"]
    path = f"/sessions/{session_id}/records"
    headers = auth_headers(teacher)
    assert client.put(path, json={"records": []}, headers=headers).status_code == 422
    bad = {"records": [{"user_id": ravi.id, "status": "maybe"}]}
    assert client.put(path, json=bad, headers=headers).status_code == 422


def test_teachers_cannot_change_sessions_older_than_7_days(
    client: TestClient,
    session: Session,
    group: Group,
    teacher: User,
    admin: User,
    ravi: User,
):
    old = make_attendance_session(session, group, admin, held_on=TODAY - timedelta(days=8))

    detail = client.get(f"/sessions/{old.id}", headers=auth_headers(teacher)).json()
    assert detail["can_edit"] is False
    assert "7 days" in detail["read_only_reason"]
    assert save(client, old.id, teacher, {ravi.id: "present"}).status_code == 403

    # Admins can still correct it.
    assert save(client, old.id, admin, {ravi.id: "present"}).status_code == 200


# --- closing and reopening ----------------------------------------------------


def test_close_needs_everyone_marked(
    client: TestClient, group: Group, teacher: User, ravi: User, asha: User
):
    session_id = start(client, group, teacher).json()["id"]
    save(client, session_id, teacher, {ravi.id: "present"})

    early = client.post(f"/sessions/{session_id}/close", headers=auth_headers(teacher))
    assert early.status_code == 409
    assert early.json()["detail"] == "1 person is not marked yet."

    save(client, session_id, teacher, {asha.id: "absent"})
    closed = client.post(f"/sessions/{session_id}/close", headers=auth_headers(teacher))
    assert closed.status_code == 200
    assert closed.json()["closed_at"] is not None
    assert closed.json()["can_edit"] is False
    assert closed.json()["read_only_reason"] == "This session is closed."


def test_closed_sessions_are_locked_until_an_admin_reopens(
    client: TestClient,
    group: Group,
    teacher: User,
    admin: User,
    ravi: User,
    asha: User,
):
    session_id = start(client, group, teacher).json()["id"]
    save(client, session_id, teacher, {ravi.id: "present", asha.id: "present"})
    client.post(f"/sessions/{session_id}/close", headers=auth_headers(teacher))

    assert save(client, session_id, teacher, {ravi.id: "absent"}).status_code == 409
    assert save(client, session_id, admin, {ravi.id: "absent"}).status_code == 409
    teacher_reopen = client.post(f"/sessions/{session_id}/reopen", headers=auth_headers(teacher))
    assert teacher_reopen.status_code == 403

    reopened = client.post(f"/sessions/{session_id}/reopen", headers=auth_headers(admin))
    assert reopened.status_code == 200
    assert reopened.json()["can_edit"] is True
    assert save(client, session_id, teacher, {ravi.id: "absent"}).status_code == 200


def test_cannot_close_a_session_with_nobody_to_mark(
    client: TestClient, session: Session, org: Organization, teacher: User
):
    empty_group = make_group(session, org, "No students yet")
    add_to_group(session, empty_group, teacher)
    session_id = start(client, empty_group, teacher).json()["id"]

    response = client.post(f"/sessions/{session_id}/close", headers=auth_headers(teacher))

    assert response.status_code == 409


# --- deleting ------------------------------------------------------------------


def test_teacher_deletes_a_mistaken_session(
    client: TestClient, session: Session, group: Group, teacher: User, ravi: User
):
    session_id = start(client, group, teacher).json()["id"]
    save(client, session_id, teacher, {ravi.id: "present"})

    response = client.delete(f"/sessions/{session_id}", headers=auth_headers(teacher))

    assert response.status_code == 204
    assert session.exec(select(AttendanceRecord)).all() == []


def test_closed_sessions_can_only_be_deleted_by_admins(
    client: TestClient,
    group: Group,
    teacher: User,
    admin: User,
    ravi: User,
    asha: User,
):
    session_id = start(client, group, teacher).json()["id"]
    save(client, session_id, teacher, {ravi.id: "present", asha.id: "present"})
    client.post(f"/sessions/{session_id}/close", headers=auth_headers(teacher))

    assert (
        client.delete(f"/sessions/{session_id}", headers=auth_headers(teacher)).status_code == 409
    )
    assert client.delete(f"/sessions/{session_id}", headers=auth_headers(admin)).status_code == 204


# --- visibility and history ---------------------------------------------------


def test_sessions_are_invisible_to_other_organisations(
    client: TestClient, session: Session, group: Group, teacher: User
):
    session_id = start(client, group, teacher).json()["id"]
    other_admin = make_user(session, make_org(session, slug="acme"), "b@acme.com", UserRole.admin)
    headers = auth_headers(other_admin)

    assert client.get(f"/sessions/{session_id}", headers=headers).status_code == 404
    assert client.delete(f"/sessions/{session_id}", headers=headers).status_code == 404


def test_learners_cannot_open_sessions(client: TestClient, group: Group, teacher: User, ravi: User):
    session_id = start(client, group, teacher).json()["id"]
    assert client.get(f"/sessions/{session_id}", headers=auth_headers(ravi)).status_code == 403


def test_someone_who_left_the_group_keeps_their_mark(
    client: TestClient,
    session: Session,
    group: Group,
    teacher: User,
    ravi: User,
):
    session_id = start(client, group, teacher).json()["id"]
    save(client, session_id, teacher, {ravi.id: "present"})
    membership = session.get(GroupMember, (group.id, ravi.id))
    session.delete(membership)
    session.commit()

    roster = client.get(f"/sessions/{session_id}", headers=auth_headers(teacher)).json()["roster"]

    ravi_entry = next(e for e in roster if e["user_id"] == ravi.id)
    assert ravi_entry["status"] == "present"
    assert ravi_entry["is_member"] is False
