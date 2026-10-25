"""Attendance percentages: per student in a group, and per group for one student.

Percentage = (present + late) / (present + late + absent). Excused and unmarked
don't count either way. Marks count as soon as they're saved, closed session or not.
"""

from sqlalchemy import func
from sqlmodel import Session, select

from app.attendance.models import AttendanceRecord, AttendanceSession, AttendanceStatus
from app.attendance.schemas import (
    AttendanceStats,
    GroupAttendanceSummary,
    MyAttendance,
    MyGroupAttendance,
    StudentAttendance,
)
from app.groups.models import Group, GroupMember
from app.organizations.models import Organization
from app.users.models import User, UserRole


def compute_stats(present: int, late: int, absent: int, excused: int, threshold: int) -> dict:
    """The numbers for one person. Shared by both endpoints so they always agree."""
    attended = present + late
    counted = attended + absent
    if counted == 0:
        percentage, below = None, False  # no data yet: no warning either
    else:
        # Rounded *down* to 1 decimal using whole numbers, so the shown figure never
        # overstates attendance: 2999/4000 = 74.975% shows as 74.9, not 75.0.
        percentage = (attended * 1000 // counted) / 10
        # Exact integer comparison, independent of how the number is displayed.
        below = attended * 100 < threshold * counted
    return AttendanceStats(
        present=present,
        late=late,
        absent=absent,
        excused=excused,
        counted=counted,
        percentage=percentage,
        below_threshold=below,
    ).model_dump()


def _status_counts():
    """count(...) FILTER (WHERE status = ...) for each status, in a fixed order."""
    return [
        func.count().filter(AttendanceRecord.status == status)
        for status in (
            AttendanceStatus.present,
            AttendanceStatus.late,
            AttendanceStatus.absent,
            AttendanceStatus.excused,
        )
    ]


def _threshold(session: Session, org_id: int) -> int:
    return session.get(Organization, org_id).low_attendance_threshold


def group_summary(session: Session, group: Group) -> GroupAttendanceSummary:
    threshold = _threshold(session, group.org_id)

    # Query 1: every marked person's counts in this group's sessions.
    counts = {
        user_id: (present, late, absent, excused)
        for user_id, present, late, absent, excused in session.exec(
            select(AttendanceRecord.user_id, *_status_counts())
            .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
            .where(AttendanceSession.group_id == group.id)
            .group_by(AttendanceRecord.user_id)
        ).all()
    }

    # Query 2: who to list: current learner members, plus anyone with marks here.
    member_ids = set(
        session.exec(
            select(GroupMember.user_id)
            .join(User, User.id == GroupMember.user_id)
            .where(GroupMember.group_id == group.id, User.role == UserRole.learner)
        ).all()
    )
    people = session.exec(
        select(User).where(User.id.in_(member_ids | counts.keys())).order_by(User.name, User.id)
    ).all()

    session_count = session.exec(
        select(func.count())
        .select_from(AttendanceSession)
        .where(AttendanceSession.group_id == group.id)
    ).one()

    return GroupAttendanceSummary(
        group_id=group.id,
        group_name=group.name,
        threshold=threshold,
        session_count=session_count,
        students=[
            StudentAttendance(
                user_id=person.id,
                name=person.name,
                email=person.email,
                is_member=person.id in member_ids,
                **compute_stats(*counts.get(person.id, (0, 0, 0, 0)), threshold),
            )
            for person in people
        ],
    )


def my_attendance(session: Session, user: User) -> MyAttendance:
    threshold = _threshold(session, user.org_id)

    # Query 1: my counts per group.
    counts = {
        group_id: (present, late, absent, excused)
        for group_id, present, late, absent, excused in session.exec(
            select(AttendanceSession.group_id, *_status_counts())
            .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
            .where(AttendanceRecord.user_id == user.id)
            .group_by(AttendanceSession.group_id)
        ).all()
    }

    # Query 2: groups to show: ones I'm in, plus ones I have marks in.
    my_group_ids = set(
        session.exec(select(GroupMember.group_id).where(GroupMember.user_id == user.id)).all()
    )
    groups = session.exec(
        select(Group)
        .where(Group.id.in_(my_group_ids | counts.keys()), Group.org_id == user.org_id)
        .order_by(Group.name)
    ).all()

    return MyAttendance(
        threshold=threshold,
        groups=[
            MyGroupAttendance(
                group_id=group.id,
                group_name=group.name,
                **compute_stats(*counts.get(group.id, (0, 0, 0, 0)), threshold),
            )
            for group in groups
        ],
    )
