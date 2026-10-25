"""Rules for attendance sessions: who may manage them, when, and how marks are saved."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.attendance.models import AttendanceRecord, AttendanceSession, AttendanceStatus
from app.attendance.schemas import (
    RecordsUpdate,
    RosterEntry,
    SessionCreate,
    SessionDetail,
    SessionSummary,
)
from app.errors import BadRequestError, ConflictError, ForbiddenError
from app.groups.models import Group, GroupMember
from app.groups.service import is_member
from app.users.models import User, UserRole

# Instructors can start, mark and delete sessions held up to this many days ago.
EDIT_WINDOW_DAYS = 7


# --- rules ---------------------------------------------------------------------


def within_edit_window(held_on: date, today: date) -> bool:
    return today - timedelta(days=EDIT_WINDOW_DAYS) <= held_on <= today


def ensure_can_manage(session: Session, actor: User, group: Group) -> None:
    """Admins, and instructors who belong to the group."""
    if actor.role == UserRole.admin:
        return
    if actor.role == UserRole.learner:
        raise ForbiddenError("Learners can't manage attendance.")
    if not is_member(session, group, actor):
        raise ForbiddenError("You can only manage attendance for your own groups.")


def _read_only_reason(actor: User, att: AttendanceSession, today: date) -> str | None:
    """Why the caller can't change marks right now, or None if they can."""
    if att.closed_at is not None:
        return "This session is closed."
    if actor.role != UserRole.admin and not within_edit_window(att.held_on, today):
        return f"Sessions can only be changed within {EDIT_WINDOW_DAYS} days. Ask an admin."
    return None


def _ensure_can_edit(actor: User, att: AttendanceSession, today: date) -> None:
    reason = _read_only_reason(actor, att, today)
    if reason is None:
        return
    if att.closed_at is not None:
        raise ConflictError(reason)
    raise ForbiddenError(reason)


# --- roster --------------------------------------------------------------------


def _learner_member_ids(session: Session, group_id: int) -> set[int]:
    rows = session.exec(
        select(GroupMember.user_id)
        .join(User, User.id == GroupMember.user_id)
        .where(GroupMember.group_id == group_id, User.role == UserRole.learner)
    ).all()
    return set(rows)


def _roster(session: Session, att: AttendanceSession) -> list[RosterEntry]:
    """Current learner members, plus anyone already marked (even if they've left)."""
    members = _learner_member_ids(session, att.group_id)
    records = {
        r.user_id: r
        for r in session.exec(
            select(AttendanceRecord).where(AttendanceRecord.session_id == att.id)
        ).all()
    }
    user_ids = members | records.keys()
    if not user_ids:
        return []
    users = session.exec(
        select(User).where(User.id.in_(user_ids)).order_by(User.name, User.id)
    ).all()
    return [
        RosterEntry(
            user_id=u.id,
            name=u.name,
            email=u.email,
            is_member=u.id in members,
            status=records[u.id].status if u.id in records else None,
            marked_at=records[u.id].marked_at if u.id in records else None,
        )
        for u in users
    ]


def session_detail(
    session: Session, actor: User, att: AttendanceSession, group: Group, today: date
) -> SessionDetail:
    roster = _roster(session, att)
    reason = _read_only_reason(actor, att, today)
    can_edit = reason is None
    is_admin = actor.role == UserRole.admin
    return SessionDetail(
        id=att.id,
        group_id=att.group_id,
        group_name=group.name,
        held_on=att.held_on,
        topic=att.topic,
        created_at=att.created_at,
        closed_at=att.closed_at,
        can_edit=can_edit,
        can_close=can_edit and bool(roster) and all(e.status is not None for e in roster),
        can_reopen=is_admin and att.closed_at is not None,
        can_delete=is_admin or can_edit,
        read_only_reason=reason,
        roster=roster,
    )


# --- sessions ------------------------------------------------------------------


def create_session(
    session: Session, actor: User, group: Group, data: SessionCreate, today: date
) -> AttendanceSession:
    held_on = data.held_on or today
    if held_on > today:
        raise BadRequestError("A session can't be in the future.")
    if actor.role != UserRole.admin and not within_edit_window(held_on, today):
        raise ForbiddenError(
            f"Instructors can add sessions from the last {EDIT_WINDOW_DAYS} days. Ask an admin."
        )
    att = AttendanceSession(
        org_id=group.org_id,
        group_id=group.id,
        held_on=held_on,
        topic=data.topic,
        created_by=actor.id,
    )
    session.add(att)
    session.commit()
    session.refresh(att)
    return att


def list_sessions(session: Session, group: Group) -> list[SessionSummary]:
    """All sessions of a group, newest first, with status counts, in one query."""

    def count_of(status: AttendanceStatus):
        return func.count(AttendanceRecord.user_id).filter(AttendanceRecord.status == status)

    # Learner members of this group who have no mark in *this* session.
    # The inner check uses its own alias of the marks table and is explicitly tied
    # (correlated) to the outer session and member rows. Without that, SQLAlchemy
    # re-added the sessions table inside it, so a mark in *any* session counted.
    other_mark = aliased(AttendanceRecord)
    has_mark = (
        select(other_mark.user_id)
        .where(
            other_mark.session_id == AttendanceSession.id,
            other_mark.user_id == GroupMember.user_id,
        )
        .correlate(AttendanceSession, GroupMember)
        .exists()
    )
    unmarked = (
        select(func.count())
        .select_from(GroupMember)
        .join(User, User.id == GroupMember.user_id)
        .where(
            GroupMember.group_id == AttendanceSession.group_id,
            User.role == UserRole.learner,
            ~has_mark,
        )
        .correlate(AttendanceSession)
        .scalar_subquery()
    )
    rows = session.exec(
        select(
            AttendanceSession,
            count_of(AttendanceStatus.present),
            count_of(AttendanceStatus.absent),
            count_of(AttendanceStatus.late),
            count_of(AttendanceStatus.excused),
            unmarked,
        )
        .outerjoin(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceSession.group_id == group.id)
        .group_by(AttendanceSession.id)
        .order_by(AttendanceSession.held_on.desc(), AttendanceSession.id.desc())
    ).all()
    return [
        SessionSummary(
            id=att.id,
            group_id=att.group_id,
            held_on=att.held_on,
            topic=att.topic,
            closed=att.closed_at is not None,
            present=present,
            absent=absent,
            late=late,
            excused=excused,
            unmarked=missing,
        )
        for att, present, absent, late, excused, missing in rows
    ]


def save_records(
    session: Session, actor: User, att: AttendanceSession, data: RecordsUpdate, today: date
) -> None:
    _ensure_can_edit(actor, att, today)

    user_ids = [r.user_id for r in data.records]
    if len(user_ids) != len(set(user_ids)):
        raise BadRequestError("Each person can only appear once.")
    allowed = {e.user_id for e in _roster(session, att)}
    outsiders = sorted(set(user_ids) - allowed)
    if outsiders:
        raise BadRequestError(f"Not in this group: user {', '.join(map(str, outsiders))}.")

    now = datetime.now(UTC)
    statement = insert(AttendanceRecord).values(
        [
            {
                "session_id": att.id,
                "user_id": r.user_id,
                "status": r.status,
                "marked_by": actor.id,
                "marked_at": now,
            }
            for r in data.records
        ]
    )
    # One statement for the whole class: new marks are inserted, existing ones updated.
    statement = statement.on_conflict_do_update(
        index_elements=[AttendanceRecord.session_id, AttendanceRecord.user_id],
        set_={
            "status": statement.excluded.status,
            "marked_by": statement.excluded.marked_by,
            "marked_at": statement.excluded.marked_at,
        },
    )
    session.exec(statement)
    session.commit()


def close_session(session: Session, actor: User, att: AttendanceSession, today: date) -> None:
    _ensure_can_edit(actor, att, today)
    roster = _roster(session, att)
    unmarked = sum(1 for e in roster if e.status is None)
    if not roster:
        raise ConflictError("There's no one to mark in this session yet.")
    if unmarked:
        raise ConflictError(
            f"{unmarked} {'person is' if unmarked == 1 else 'people are'} not marked yet."
        )
    att.closed_at = datetime.now(UTC)
    session.add(att)
    session.commit()


def reopen_session(session: Session, actor: User, att: AttendanceSession) -> None:
    if actor.role != UserRole.admin:
        raise ForbiddenError("Only admins can reopen a closed session.")
    if att.closed_at is None:
        raise ConflictError("This session is already open.")
    att.closed_at = None
    session.add(att)
    session.commit()


def delete_session(session: Session, actor: User, att: AttendanceSession, today: date) -> None:
    if actor.role != UserRole.admin:
        _ensure_can_edit(actor, att, today)
    session.delete(att)  # marks are removed by the database (ON DELETE CASCADE)
    session.commit()
