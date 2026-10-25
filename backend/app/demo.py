"""
Public demo data: one college and one company with sample people, groups and attendance.

    python -m app.demo reset    # delete the two demo organisations and recreate them
    python -m app.demo ensure   # create them only if they don't exist yet

Only organisations with the slugs in DEMO_SLUGS are ever touched. The demo password is
public on purpose: it is shown on the login page and only opens this sample data.
"""

import random
import sys
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete
from sqlmodel import Session, select

from app.attendance.models import AttendanceRecord, AttendanceSession, AttendanceStatus
from app.auth.security import hash_password
from app.clock import get_today
from app.db import engine
from app.groups.models import Group, GroupMember
from app.organizations.models import Organization, OrgType
from app.users.models import User, UserRole

DEMO_PASSWORD = "demo-pass-2026"
COLLEGE_SLUG = "demo-college"
COMPANY_SLUG = "demo-company"
DEMO_SLUGS = (COLLEGE_SLUG, COMPANY_SLUG)


@dataclass
class Person:
    name: str
    email: str
    role: UserRole
    # Chance of being marked present (learners only); the rest is absent, late or excused.
    attendance: float = 0.9


@dataclass
class DemoGroup:
    name: str
    instructor_email: str
    learner_emails: list[str]
    sessions: int  # how many past weekday sessions to create
    topics: list[str] = field(default_factory=list)


@dataclass
class DemoOrg:
    slug: str
    name: str
    type: OrgType
    people: list[Person]
    groups: list[DemoGroup]


def _college() -> DemoOrg:
    d = "college.example.com"
    students = [
        Person("Aarav Shah", f"aarav@{d}", UserRole.learner, 0.95),
        Person("Diya Patel", f"diya@{d}", UserRole.learner, 0.9),
        Person("Ishaan Mehta", f"ishaan@{d}", UserRole.learner, 0.85),
        Person("Kavya Iyer", f"kavya@{d}", UserRole.learner, 0.97),
        Person("Rohan Desai", f"rohan@{d}", UserRole.learner, 0.5),  # below 75%: shows the warning
        Person("Sneha Reddy", f"student@{d}", UserRole.learner, 0.6),  # the demo student login
        Person("Arjun Nair", f"arjun@{d}", UserRole.learner, 0.88),
        Person("Meera Joshi", f"meera@{d}", UserRole.learner, 0.92),
        Person("Vihaan Kulkarni", f"vihaan@{d}", UserRole.learner, 0.8),
        Person("Ananya Rao", f"ananya@{d}", UserRole.learner, 0.9),
    ]
    staff = [
        Person("Dr. Neha Kapoor", f"admin@{d}", UserRole.admin),
        Person("Prof. Rahul Verma", f"teacher@{d}", UserRole.instructor),
        Person("Prof. Anjali Singh", f"anjali@{d}", UserRole.instructor),
    ]
    all_students = [s.email for s in students]
    return DemoOrg(
        slug=COLLEGE_SLUG,
        name="Demo College of Engineering",
        type=OrgType.college,
        people=staff + students,
        groups=[
            DemoGroup(
                "CE Sem 5 - Database Systems",
                f"teacher@{d}",
                all_students,
                sessions=10,
                topics=["ER diagrams", "Normalisation", "SQL joins", "Indexes", "Transactions"],
            ),
            DemoGroup(
                "CE Sem 5 - Operating Systems",
                f"anjali@{d}",
                all_students[:8],
                sessions=6,
                topics=["Processes", "Scheduling", "Deadlocks", "Paging"],
            ),
        ],
    )


def _company() -> DemoOrg:
    d = "company.example.com"
    employees = [
        Person("Kabir Malhotra", f"employee@{d}", UserRole.learner, 0.9),
        Person("Tara Fernandes", f"tara@{d}", UserRole.learner, 0.95),
        Person("Nikhil Bose", f"nikhil@{d}", UserRole.learner, 0.65),
        Person("Riya Chatterjee", f"riya@{d}", UserRole.learner, 0.9),
        Person("Sameer Khan", f"sameer@{d}", UserRole.learner, 0.85),
        Person("Pooja Menon", f"pooja@{d}", UserRole.learner, 0.92),
    ]
    staff = [
        Person("Leena Thomas", f"admin@{d}", UserRole.admin),
        Person("Vikram Rao", f"trainer@{d}", UserRole.instructor),
    ]
    return DemoOrg(
        slug=COMPANY_SLUG,
        name="Demo Tech Solutions",
        type=OrgType.company,
        people=staff + employees,
        groups=[
            DemoGroup(
                "Onboarding - Batch 12",
                f"trainer@{d}",
                [e.email for e in employees],
                sessions=6,
                topics=["Company tools", "Security basics", "Code review", "Deployments"],
            ),
        ],
    )


def _past_weekdays(today: date, count: int) -> list[date]:
    """The last `count` weekdays before today, oldest first."""
    days: list[date] = []
    day = today
    while len(days) < count:
        day -= timedelta(days=1)
        if day.weekday() < 5:
            days.append(day)
    return sorted(days)


def _status_for(rng: random.Random, attendance: float) -> AttendanceStatus:
    roll = rng.random()
    if roll < attendance:
        # Most attendees are on time; a few are late (which still counts as attended).
        return AttendanceStatus.late if rng.random() < 0.08 else AttendanceStatus.present
    return AttendanceStatus.excused if rng.random() < 0.15 else AttendanceStatus.absent


def delete_demo_orgs(session: Session) -> None:
    """Remove the demo organisations and everything in them. Nothing else is touched."""
    org_ids = list(
        session.exec(select(Organization.id).where(Organization.slug.in_(DEMO_SLUGS))).all()
    )
    if not org_ids:
        return
    group_ids = select(Group.id).where(Group.org_id.in_(org_ids))
    # Order matters: sessions first (their marks go with them), then memberships,
    # groups, people, and finally the organisations.
    session.exec(delete(AttendanceSession).where(AttendanceSession.org_id.in_(org_ids)))
    session.exec(delete(GroupMember).where(GroupMember.group_id.in_(group_ids)))
    session.exec(delete(Group).where(Group.org_id.in_(org_ids)))
    session.exec(delete(User).where(User.org_id.in_(org_ids)))
    session.exec(delete(Organization).where(Organization.id.in_(org_ids)))


def _create_org(session: Session, spec: DemoOrg, password_hash: str, today: date) -> None:
    org = Organization(name=spec.name, slug=spec.slug, type=spec.type)
    session.add(org)
    session.flush()

    users: dict[str, User] = {}
    attendance_rate = {p.email: p.attendance for p in spec.people}
    for person in spec.people:
        user = User(
            org_id=org.id,
            email=person.email,
            name=person.name,
            password_hash=password_hash,
            role=person.role,
        )
        session.add(user)
        users[person.email] = user
    session.flush()

    for group_spec in spec.groups:
        group = Group(org_id=org.id, name=group_spec.name)
        session.add(group)
        session.flush()
        instructor = users[group_spec.instructor_email]
        for email in [group_spec.instructor_email, *group_spec.learner_emails]:
            session.add(GroupMember(group_id=group.id, user_id=users[email].id))

        days = _past_weekdays(today, group_spec.sessions)
        for i, held_on in enumerate(days):
            is_latest = i == len(days) - 1
            att = AttendanceSession(
                org_id=org.id,
                group_id=group.id,
                held_on=held_on,
                topic=group_spec.topics[i % len(group_spec.topics)] if group_spec.topics else None,
                created_by=instructor.id,
                # The latest session stays open so visitors can try changing marks.
                closed_at=None if is_latest else datetime.now(UTC),
            )
            session.add(att)
            session.flush()
            for email in group_spec.learner_emails:
                # Seeded per person, group and day: random-looking but the same every reset.
                rng = random.Random(f"{spec.slug}|{group_spec.name}|{email}|{held_on}")
                session.add(
                    AttendanceRecord(
                        session_id=att.id,
                        user_id=users[email].id,
                        status=_status_for(rng, attendance_rate[email]),
                        marked_by=instructor.id,
                    )
                )


def reset(session: Session, today: date | None = None) -> None:
    """Delete and recreate both demo organisations, in one transaction."""
    today = today or get_today()
    password_hash = hash_password(DEMO_PASSWORD)  # one hash: every demo login shares it
    delete_demo_orgs(session)
    for spec in (_college(), _company()):
        _create_org(session, spec, password_hash, today)
    session.commit()


def ensure(session: Session, today: date | None = None) -> bool:
    """Create the demo organisations if they're missing. Returns True if it created them."""
    existing = session.exec(
        select(Organization.slug).where(Organization.slug.in_(DEMO_SLUGS))
    ).all()
    if set(existing) == set(DEMO_SLUGS):
        return False
    reset(session, today)
    return True


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else ""
    if command not in ("reset", "ensure"):
        print("Usage: python -m app.demo reset|ensure", file=sys.stderr)
        return 2
    with Session(engine) as session:
        if command == "reset":
            reset(session)
            print("Demo organisations reset.")
        else:
            print(
                "Demo organisations created."
                if ensure(session)
                else "Demo organisations already exist."
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
