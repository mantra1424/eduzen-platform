from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.attendance.models import AttendanceStatus
from app.attendance.summary import compute_stats
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

P, A, L, E = (
    AttendanceStatus.present,
    AttendanceStatus.absent,
    AttendanceStatus.late,
    AttendanceStatus.excused,
)


# --- the formula ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("present", "late", "absent", "excused", "percentage", "below"),
    [
        (3, 0, 1, 0, 75.0, False),  # exactly the threshold is not below it
        (2, 1, 1, 0, 75.0, False),  # late counts as attended
        (3, 0, 1, 5, 75.0, False),  # excused is left out entirely
        (1, 0, 2, 0, 33.3, True),
        (2, 0, 1, 0, 66.6, True),  # rounded down, never up
        (2999, 0, 1001, 0, 74.9, True),  # 74.975%: below, and shown as 74.9 not 75.0
        (0, 0, 0, 0, None, False),  # no data: no percentage and no warning
        (0, 0, 0, 3, None, False),  # only excused: still no data
    ],
)
def test_compute_stats(present, late, absent, excused, percentage, below):
    stats = compute_stats(present, late, absent, excused, threshold=75)
    assert stats["percentage"] == percentage
    assert stats["below_threshold"] is below
    assert stats["counted"] == present + late + absent


def test_threshold_is_respected():
    assert compute_stats(3, 0, 1, 0, threshold=80)["below_threshold"] is True
    assert compute_stats(3, 0, 1, 0, threshold=0)["below_threshold"] is False


# --- endpoints -----------------------------------------------------------------


@pytest.fixture
def org(session: Session) -> Organization:
    return make_org(session, slug="svmit")


@pytest.fixture
def teacher(session: Session, org: Organization) -> User:
    return make_user(session, org, "teacher@svmit.edu", UserRole.instructor)


def learner(session: Session, org: Organization, name: str) -> User:
    user = make_user(session, org, f"{name.lower()}@svmit.edu", UserRole.learner)
    user.name = name
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def ravi(session: Session, org: Organization) -> User:
    return learner(session, org, "Ravi")


@pytest.fixture
def asha(session: Session, org: Organization) -> User:
    return learner(session, org, "Asha")


@pytest.fixture
def group(session: Session, org: Organization, teacher: User, ravi: User, asha: User) -> Group:
    group = make_group(session, org, "CE Sem 5")
    add_to_group(session, group, teacher, ravi, asha)
    return group


def hold_sessions(
    session: Session,
    group: Group,
    teacher: User,
    marks: list[list[tuple[User, AttendanceStatus]]],
):
    """One attendance session per inner list, on consecutive days, with those marks."""
    for i, day_marks in enumerate(marks):
        lecture = make_attendance_session(
            session, group, teacher, held_on=date(2026, 10, 1) + timedelta(days=i)
        )
        for person, status in day_marks:
            mark(session, lecture, person, status, marked_by=teacher)


def test_class_summary(
    client: TestClient, session: Session, group: Group, teacher: User, ravi: User, asha: User
):
    hold_sessions(
        session,
        group,
        teacher,
        [
            [(ravi, P), (asha, A)],
            [(ravi, L), (asha, A)],
            [(ravi, A), (asha, E)],
            [(ravi, P)],  # Asha not marked in this one
        ],
    )

    response = client.get(f"/groups/{group.id}/attendance-summary", headers=auth_headers(teacher))

    assert response.status_code == 200
    body = response.json()
    assert body["group_name"] == "CE Sem 5"
    assert body["threshold"] == 75
    assert body["session_count"] == 4
    students = {s["name"]: s for s in body["students"]}
    assert list(students) == ["Asha", "Ravi"]  # sorted, learners only
    assert {
        k: students["Ravi"][k] for k in ("present", "late", "absent", "excused", "counted")
    } == {
        "present": 2,
        "late": 1,
        "absent": 1,
        "excused": 0,
        "counted": 4,
    }
    assert students["Ravi"]["percentage"] == 75.0
    assert students["Ravi"]["below_threshold"] is False
    assert students["Asha"]["percentage"] == 0.0
    assert students["Asha"]["below_threshold"] is True


def test_new_member_with_no_marks_has_no_data(
    client: TestClient, session: Session, org: Organization, group: Group, teacher: User
):
    newcomer = learner(session, org, "Zoya")
    add_to_group(session, group, newcomer)

    students = client.get(
        f"/groups/{group.id}/attendance-summary", headers=auth_headers(teacher)
    ).json()["students"]

    zoya = next(s for s in students if s["name"] == "Zoya")
    assert zoya["percentage"] is None
    assert zoya["below_threshold"] is False


def test_student_who_left_still_appears(
    client: TestClient, session: Session, group: Group, teacher: User, ravi: User
):
    hold_sessions(session, group, teacher, [[(ravi, P)]])
    session.delete(session.get(GroupMember, (group.id, ravi.id)))
    session.commit()

    students = client.get(
        f"/groups/{group.id}/attendance-summary", headers=auth_headers(teacher)
    ).json()["students"]

    ravi_row = next(s for s in students if s["name"] == "Ravi")
    assert ravi_row["is_member"] is False
    assert ravi_row["percentage"] == 100.0


def test_custom_threshold_is_used(
    client: TestClient, session: Session, org: Organization, group: Group, teacher: User, ravi: User
):
    org.low_attendance_threshold = 90
    session.add(org)
    session.commit()
    hold_sessions(
        session, group, teacher, [[(ravi, P)], [(ravi, P)], [(ravi, P)], [(ravi, P)], [(ravi, A)]]
    )

    body = client.get(
        f"/groups/{group.id}/attendance-summary", headers=auth_headers(teacher)
    ).json()

    ravi_row = next(s for s in body["students"] if s["name"] == "Ravi")
    assert body["threshold"] == 90
    assert ravi_row["percentage"] == 80.0
    assert ravi_row["below_threshold"] is True


def test_only_group_staff_see_the_class_summary(
    client: TestClient, session: Session, org: Organization, group: Group, ravi: User
):
    outsider = make_user(session, org, "other@svmit.edu", UserRole.instructor)
    admin = make_user(session, org, "admin@svmit.edu", UserRole.admin)
    other_org_admin = make_user(
        session, make_org(session, slug="acme"), "b@acme.com", UserRole.admin
    )
    path = f"/groups/{group.id}/attendance-summary"

    assert client.get(path, headers=auth_headers(admin)).status_code == 200
    assert client.get(path, headers=auth_headers(outsider)).status_code == 403
    assert client.get(path, headers=auth_headers(ravi)).status_code == 403
    assert client.get(path, headers=auth_headers(other_org_admin)).status_code == 404


def test_my_attendance_per_group(
    client: TestClient,
    session: Session,
    org: Organization,
    group: Group,
    teacher: User,
    ravi: User,
    asha: User,
):
    lab = make_group(session, org, "DBMS Lab")
    add_to_group(session, lab, teacher, ravi)
    hold_sessions(session, group, teacher, [[(ravi, P), (asha, A)], [(ravi, A), (asha, P)]])
    hold_sessions(session, lab, teacher, [[(ravi, L)]])
    make_group(session, org, "Not my group")

    response = client.get("/me/attendance", headers=auth_headers(ravi))

    assert response.status_code == 200
    body = response.json()
    assert body["threshold"] == 75
    by_name = {g["group_name"]: g for g in body["groups"]}
    assert list(by_name) == ["CE Sem 5", "DBMS Lab"]  # only my groups, sorted
    assert by_name["CE Sem 5"]["percentage"] == 50.0
    assert by_name["CE Sem 5"]["below_threshold"] is True
    assert by_name["DBMS Lab"]["percentage"] == 100.0


def test_my_attendance_shows_only_my_own_marks(
    client: TestClient, session: Session, group: Group, teacher: User, ravi: User, asha: User
):
    hold_sessions(session, group, teacher, [[(ravi, P), (asha, A)]])

    asha_view = client.get("/me/attendance", headers=auth_headers(asha)).json()["groups"]

    assert [(g["group_name"], g["present"], g["absent"]) for g in asha_view] == [("CE Sem 5", 0, 1)]


def test_group_with_no_sessions_shows_no_data(client: TestClient, group: Group, ravi: User):
    groups = client.get("/me/attendance", headers=auth_headers(ravi)).json()["groups"]
    assert [(g["group_name"], g["percentage"], g["below_threshold"]) for g in groups] == [
        ("CE Sem 5", None, False)
    ]


def test_marks_in_open_sessions_count(
    client: TestClient, session: Session, group: Group, teacher: User, ravi: User
):
    lecture = make_attendance_session(session, group, teacher)  # never closed
    mark(session, lecture, ravi, A, marked_by=teacher)

    groups = client.get("/me/attendance", headers=auth_headers(ravi)).json()["groups"]

    assert groups[0]["absent"] == 1
    assert groups[0]["percentage"] == 0.0


def test_my_attendance_requires_login(client: TestClient):
    assert client.get("/me/attendance").status_code == 401
