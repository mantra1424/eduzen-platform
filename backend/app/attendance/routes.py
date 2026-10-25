from fastapi import APIRouter, status

from app.attendance import service
from app.attendance.models import AttendanceSession
from app.attendance.schemas import RecordsUpdate, SessionCreate, SessionDetail, SessionSummary
from app.auth.dependencies import CurrentUser
from app.clock import Today
from app.db import SessionDep
from app.groups.models import Group
from app.tenancy import get_in_org_or_404
from app.users.models import User

router = APIRouter(tags=["attendance"])


def _load(session: SessionDep, session_id: int, user: User) -> tuple[AttendanceSession, Group]:
    """The session (404 if it's in another organisation) and its group, if the caller may manage it."""
    att = get_in_org_or_404(session, AttendanceSession, session_id, user)
    group = session.get(Group, att.group_id)
    service.ensure_can_manage(session, user, group)
    return att, group


@router.post("/groups/{group_id}/sessions", status_code=status.HTTP_201_CREATED)
def start_session(
    group_id: int, data: SessionCreate, user: CurrentUser, session: SessionDep, today: Today
) -> SessionDetail:
    group = get_in_org_or_404(session, Group, group_id, user)
    service.ensure_can_manage(session, user, group)
    att = service.create_session(session, user, group, data, today)
    return service.session_detail(session, user, att, group, today)


@router.get("/groups/{group_id}/sessions")
def list_sessions(group_id: int, user: CurrentUser, session: SessionDep) -> list[SessionSummary]:
    group = get_in_org_or_404(session, Group, group_id, user)
    service.ensure_can_manage(session, user, group)
    return service.list_sessions(session, group)


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int, user: CurrentUser, session: SessionDep, today: Today
) -> SessionDetail:
    att, group = _load(session, session_id, user)
    return service.session_detail(session, user, att, group, today)


@router.put("/sessions/{session_id}/records")
def save_records(
    session_id: int, data: RecordsUpdate, user: CurrentUser, session: SessionDep, today: Today
) -> SessionDetail:
    """Save marks for any number of people in one go (new marks added, existing ones changed)."""
    att, group = _load(session, session_id, user)
    service.save_records(session, user, att, data, today)
    return service.session_detail(session, user, att, group, today)


@router.post("/sessions/{session_id}/close")
def close_session(
    session_id: int, user: CurrentUser, session: SessionDep, today: Today
) -> SessionDetail:
    att, group = _load(session, session_id, user)
    service.close_session(session, user, att, today)
    return service.session_detail(session, user, att, group, today)


@router.post("/sessions/{session_id}/reopen")
def reopen_session(
    session_id: int, user: CurrentUser, session: SessionDep, today: Today
) -> SessionDetail:
    att, group = _load(session, session_id, user)
    service.reopen_session(session, user, att)
    return service.session_detail(session, user, att, group, today)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, user: CurrentUser, session: SessionDep, today: Today) -> None:
    att, _ = _load(session, session_id, user)
    service.delete_session(session, user, att, today)
