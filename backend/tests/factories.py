"""Helpers that create test data with sensible defaults. Override only what a test cares about."""

from sqlmodel import Session

from app.auth.security import hash_password
from app.organizations.models import Organization, OrgType
from app.users.models import User, UserRole

DEFAULT_PASSWORD = "correct-horse-battery"


def make_org(
    session: Session, slug: str = "svmit", org_type: OrgType = OrgType.college
) -> Organization:
    org = Organization(name=slug.upper(), slug=slug, type=org_type)
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def make_user(
    session: Session,
    org: Organization,
    email: str = "asha@svmit.edu",
    role: UserRole = UserRole.learner,
    password: str = DEFAULT_PASSWORD,
    is_active: bool = True,
) -> User:
    user = User(
        org_id=org.id,
        email=email,
        name="Asha",
        password_hash=hash_password(password),
        role=role,
        is_active=is_active,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    """Headers for a request made as this user."""
    from app.auth.security import create_access_token

    token = create_access_token(user_id=user.id, org_id=user.org_id, role=user.role)
    return {"Authorization": f"Bearer {token}"}


def make_group(session: Session, org: Organization, name: str = "CE Sem 5"):
    from app.groups.models import Group

    group = Group(org_id=org.id, name=name)
    session.add(group)
    session.commit()
    session.refresh(group)
    return group


def add_to_group(session: Session, group, *users: User) -> None:
    from app.groups.models import GroupMember

    for user in users:
        session.add(GroupMember(group_id=group.id, user_id=user.id))
    session.commit()


def make_attendance_session(session: Session, group, created_by: User, held_on=None, topic=None):
    from datetime import date

    from app.attendance.models import AttendanceSession

    attendance_session = AttendanceSession(
        org_id=group.org_id,
        group_id=group.id,
        held_on=held_on or date.today(),
        topic=topic,
        created_by=created_by.id,
    )
    session.add(attendance_session)
    session.commit()
    session.refresh(attendance_session)
    return attendance_session


def mark(session: Session, attendance_session, user: User, status, marked_by: User):
    from app.attendance.models import AttendanceRecord

    record = AttendanceRecord(
        session_id=attendance_session.id, user_id=user.id, status=status, marked_by=marked_by.id
    )
    session.add(record)
    session.commit()
    return record
