from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import func
from sqlmodel import Session, select

from app import demo
from app.attendance.models import AttendanceRecord, AttendanceSession, AttendanceStatus
from app.attendance.summary import my_attendance
from app.groups.models import Group, GroupMember
from app.organizations.models import Organization
from app.users.models import User, UserRole
from tests.factories import (
    add_to_group,
    make_attendance_session,
    make_group,
    make_org,
    make_user,
    mark,
)

TODAY = date(2026, 10, 26)  # a Monday


def count(session: Session, model, *where) -> int:
    return session.exec(select(func.count()).select_from(model).where(*where)).one()


def org(session: Session, slug: str) -> Organization:
    return session.exec(select(Organization).where(Organization.slug == slug)).one()


def test_reset_creates_both_demo_organisations(session: Session):
    demo.reset(session, TODAY)

    college = org(session, demo.COLLEGE_SLUG)
    company = org(session, demo.COMPANY_SLUG)
    assert college.type == "college"
    assert company.type == "company"
    assert count(session, User, User.org_id == college.id) == 13  # 1 admin, 2 teachers, 10 students
    assert count(session, User, User.org_id == company.id) == 8
    assert count(session, Group, Group.org_id == college.id) == 2
    assert count(session, AttendanceSession, AttendanceSession.org_id == college.id) == 16
    assert count(session, AttendanceSession, AttendanceSession.org_id == company.id) == 6


def test_demo_logins_work(client: TestClient, session: Session):
    demo.reset(session, TODAY)
    for email in (
        "admin@college.example.com",
        "teacher@college.example.com",
        "student@college.example.com",
        "admin@company.example.com",
        "trainer@company.example.com",
        "employee@company.example.com",
    ):
        response = client.post("/auth/login", json={"email": email, "password": demo.DEMO_PASSWORD})
        assert response.status_code == 200, email


def test_sessions_are_past_weekdays_with_only_the_latest_open(session: Session):
    demo.reset(session, TODAY)
    group = session.exec(select(Group).where(Group.name == "CE Sem 5 - Database Systems")).one()
    sessions = session.exec(
        select(AttendanceSession)
        .where(AttendanceSession.group_id == group.id)
        .order_by(AttendanceSession.held_on)
    ).all()

    assert all(s.held_on < TODAY and s.held_on.weekday() < 5 for s in sessions)
    assert [s.closed_at is None for s in sessions] == [False] * 9 + [True]


def test_every_learner_is_marked_in_every_session(session: Session):
    demo.reset(session, TODAY)
    college = org(session, demo.COLLEGE_SLUG)
    sessions = session.exec(
        select(AttendanceSession).where(AttendanceSession.org_id == college.id)
    ).all()
    for att in sessions:
        learners = count(
            session,
            GroupMember,
            GroupMember.group_id == att.group_id,
            GroupMember.user_id.in_(select(User.id).where(User.role == UserRole.learner)),
        )
        assert count(session, AttendanceRecord, AttendanceRecord.session_id == att.id) == learners


def test_the_demo_student_shows_a_warning(session: Session):
    demo.reset(session, TODAY)
    rohan = session.exec(select(User).where(User.email == "rohan@college.example.com")).one()

    groups = my_attendance(session, rohan).groups

    assert any(g.below_threshold for g in groups)


def _all_marks(session: Session) -> list[tuple[str, str, date, str]]:
    """(group, person, day, status) for every demo mark: comparable across resets."""
    rows = session.exec(
        select(Group.name, User.email, AttendanceSession.held_on, AttendanceRecord.status)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(Group, Group.id == AttendanceSession.group_id)
        .join(User, User.id == AttendanceRecord.user_id)
    ).all()
    return sorted((g, e, d, s.value) for g, e, d, s in rows)


def test_reset_is_repeatable(session: Session):
    demo.reset(session, TODAY)
    first = _all_marks(session)
    demo.reset(session, TODAY)
    second = _all_marks(session)

    assert len(first) > 100
    assert first == second  # same person, same day, same mark, every time
    assert count(session, Organization, Organization.slug.in_(demo.DEMO_SLUGS)) == 2


def test_reset_never_touches_other_organisations(session: Session):
    real = make_org(session, slug="svmit")
    teacher = make_user(session, real, "teacher@svmit.edu", UserRole.instructor)
    student = make_user(session, real, "ravi@svmit.edu", UserRole.learner)
    group = make_group(session, real, "CE Sem 5")
    add_to_group(session, group, teacher, student)
    lecture = make_attendance_session(session, group, teacher)
    mark(session, lecture, student, AttendanceStatus.present, marked_by=teacher)

    demo.reset(session, TODAY)
    demo.reset(session, TODAY)

    assert count(session, User, User.org_id == real.id) == 2
    assert count(session, Group, Group.org_id == real.id) == 1
    assert count(session, AttendanceSession, AttendanceSession.org_id == real.id) == 1
    assert count(session, AttendanceRecord, AttendanceRecord.session_id == lecture.id) == 1


def test_ensure_creates_only_when_missing(session: Session):
    assert demo.ensure(session, TODAY) is True
    college_id = org(session, demo.COLLEGE_SLUG).id

    assert demo.ensure(session, TODAY) is False
    assert org(session, demo.COLLEGE_SLUG).id == college_id  # not recreated


def test_reset_clears_visitor_changes(session: Session):
    demo.reset(session, TODAY)
    college = org(session, demo.COLLEGE_SLUG)
    session.add(Group(org_id=college.id, name="Made by a visitor"))
    student = session.exec(select(User).where(User.email == "student@college.example.com")).one()
    student.is_active = False
    session.add(student)
    session.commit()

    demo.reset(session, TODAY)

    assert session.exec(select(Group).where(Group.name == "Made by a visitor")).first() is None
    student = session.exec(select(User).where(User.email == "student@college.example.com")).one()
    assert student.is_active is True


def test_command_line_usage():
    assert demo.main(["demo"]) == 2
    assert demo.main(["demo", "wipe-everything"]) == 2


def test_frontend_demo_logins_match_the_backend():
    """frontend/src/demo.ts repeats the password and emails; they must not drift apart."""
    import re
    from pathlib import Path

    source = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "demo.ts").read_text()
    password = re.search(r"DEMO_PASSWORD = '([^']+)'", source).group(1)
    emails = set(re.findall(r"email: '([^']+)'", source))

    assert password == demo.DEMO_PASSWORD
    backend_emails = {p.email for spec in (demo._college(), demo._company()) for p in spec.people}
    assert emails and emails <= backend_emails
