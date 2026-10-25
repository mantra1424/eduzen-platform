"""Database rules for attendance. Several tests use raw SQL to bypass the app and
prove the rule is enforced by Postgres itself, not just by Python code."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import DataError, IntegrityError
from sqlmodel import Session, select

from app.attendance.models import AttendanceRecord, AttendanceSession, AttendanceStatus
from app.groups.models import Group, GroupMember
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


@pytest.fixture
def org(session: Session) -> Organization:
    return make_org(session, slug="svmit")


@pytest.fixture
def teacher(session: Session, org: Organization) -> User:
    return make_user(session, org, "teacher@svmit.edu", UserRole.instructor)


@pytest.fixture
def student(session: Session, org: Organization) -> User:
    return make_user(session, org, "ravi@svmit.edu", UserRole.learner)


@pytest.fixture
def group(session: Session, org: Organization, teacher: User, student: User) -> Group:
    group = make_group(session, org, "CE Sem 5")
    add_to_group(session, group, teacher, student)
    return group


# --- sessions and records ------------------------------------------------------


def test_session_with_marks(session: Session, group: Group, teacher: User, student: User):
    lecture = make_attendance_session(
        session, group, teacher, held_on=date(2026, 10, 26), topic="Unit 3: Joins"
    )
    mark(session, lecture, student, AttendanceStatus.late, marked_by=teacher)

    records = session.exec(
        select(AttendanceRecord).where(AttendanceRecord.session_id == lecture.id)
    ).all()

    assert lecture.closed_at is None
    assert lecture.org_id == group.org_id
    assert [(r.user_id, r.status, r.marked_by) for r in records] == [
        (student.id, AttendanceStatus.late, teacher.id)
    ]
    assert records[0].marked_at.tzinfo is not None


def test_one_mark_per_person_per_session(
    session: Session, group: Group, teacher: User, student: User
):
    lecture = make_attendance_session(session, group, teacher)
    mark(session, lecture, student, AttendanceStatus.present, marked_by=teacher)
    with pytest.raises(IntegrityError):
        mark(session, lecture, student, AttendanceStatus.absent, marked_by=teacher)


def test_database_rejects_unknown_status(
    session: Session, group: Group, teacher: User, student: User
):
    lecture = make_attendance_session(session, group, teacher)
    with pytest.raises(DataError):
        session.exec(
            text(
                "INSERT INTO attendance_records (session_id, user_id, status, marked_by, marked_at)"
                " VALUES (:s, :u, 'maybe', :t, now())"
            ).bindparams(s=lecture.id, u=student.id, t=teacher.id)
        )


def test_deleting_a_session_deletes_its_marks(
    session: Session, group: Group, teacher: User, student: User
):
    lecture = make_attendance_session(session, group, teacher)
    mark(session, lecture, student, AttendanceStatus.present, marked_by=teacher)

    session.exec(text("DELETE FROM attendance_sessions WHERE id = :id").bindparams(id=lecture.id))

    assert session.exec(select(AttendanceRecord)).all() == []


# --- organisation threshold ------------------------------------------------------


def test_threshold_defaults_to_75(session: Session, org: Organization):
    assert org.low_attendance_threshold == 75


def test_database_fills_threshold_when_not_given(session: Session):
    # What existing organisations got when the column was added by the migration.
    session.exec(
        text(
            "INSERT INTO organizations (name, slug, type, created_at)"
            " VALUES ('Raw', 'raw-org', 'college', now())"
        )
    )
    value = session.exec(
        text("SELECT low_attendance_threshold FROM organizations WHERE slug = 'raw-org'")
    ).one()[0]
    assert value == 75


@pytest.mark.parametrize("bad_value", [-1, 101, 150])
def test_threshold_must_be_a_percentage(session: Session, org: Organization, bad_value: int):
    with pytest.raises(IntegrityError):
        session.exec(
            text(
                "UPDATE organizations SET low_attendance_threshold = :v WHERE id = :id"
            ).bindparams(v=bad_value, id=org.id)
        )


def test_my_organization_includes_threshold(client: TestClient, teacher: User):
    response = client.get("/organizations/me", headers=auth_headers(teacher))
    assert response.json()["low_attendance_threshold"] == 75


# --- groups with attendance can't be deleted ---------------------------------------


def test_database_refuses_to_delete_group_with_attendance(
    session: Session, group: Group, teacher: User
):
    make_attendance_session(session, group, teacher)
    # Raw SQL skips the app's own check: this proves ON DELETE RESTRICT works.
    with pytest.raises(IntegrityError):
        session.exec(text("DELETE FROM groups WHERE id = :id").bindparams(id=group.id))


def test_api_refuses_to_delete_group_with_attendance(
    client: TestClient,
    session: Session,
    org: Organization,
    group: Group,
    teacher: User,
):
    make_attendance_session(session, group, teacher)
    admin = make_user(session, org, "admin@svmit.edu", UserRole.admin)

    response = client.delete(f"/groups/{group.id}", headers=auth_headers(admin))

    assert response.status_code == 409
    assert "attendance history" in response.json()["detail"]
    assert session.get(Group, group.id) is not None
    members = session.exec(select(GroupMember).where(GroupMember.group_id == group.id)).all()
    assert len(members) == 2  # memberships untouched too


def test_group_without_attendance_can_still_be_deleted(
    client: TestClient, session: Session, org: Organization, group: Group
):
    admin = make_user(session, org, "admin@svmit.edu", UserRole.admin)
    response = client.delete(f"/groups/{group.id}", headers=auth_headers(admin))
    assert response.status_code == 204
    assert session.exec(select(AttendanceSession)).all() == []
