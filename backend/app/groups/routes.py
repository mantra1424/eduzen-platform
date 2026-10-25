from fastapi import APIRouter, status

from app.auth.dependencies import AdminUser, CurrentUser
from app.db import SessionDep
from app.groups import service
from app.groups.models import Group
from app.groups.schemas import GroupCreate, GroupPublic, GroupUpdate, MemberAdd
from app.tenancy import get_in_org_or_404
from app.users.models import User
from app.users.schemas import UserPublic

router = APIRouter(prefix="/groups", tags=["groups"])


# Declared before "/{group_id}" so "mine" isn't read as a group ID.
@router.get("/mine")
def my_groups(user: CurrentUser, session: SessionDep) -> list[GroupPublic]:
    """Groups the caller belongs to. Works for every role."""
    return service.my_groups(session, user)


@router.get("")
def list_groups(admin: AdminUser, session: SessionDep) -> list[GroupPublic]:
    return service.list_groups(session, admin)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_group(data: GroupCreate, admin: AdminUser, session: SessionDep) -> GroupPublic:
    return service.to_public(session, service.create_group(session, admin, data))


@router.get("/{group_id}")
def get_group(group_id: int, admin: AdminUser, session: SessionDep) -> GroupPublic:
    return service.to_public(session, get_in_org_or_404(session, Group, group_id, admin))


@router.patch("/{group_id}")
def update_group(
    group_id: int, data: GroupUpdate, admin: AdminUser, session: SessionDep
) -> GroupPublic:
    group = get_in_org_or_404(session, Group, group_id, admin)
    return service.to_public(session, service.update_group(session, group, data))


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, admin: AdminUser, session: SessionDep) -> None:
    service.delete_group(session, get_in_org_or_404(session, Group, group_id, admin))


# --- members -----------------------------------------------------------------


@router.get("/{group_id}/members")
def list_members(group_id: int, user: CurrentUser, session: SessionDep) -> list[UserPublic]:
    group = get_in_org_or_404(session, Group, group_id, user)
    return [UserPublic.model_validate(m) for m in service.list_members(session, user, group)]


@router.post("/{group_id}/members", status_code=status.HTTP_204_NO_CONTENT)
def add_member(group_id: int, data: MemberAdd, user: CurrentUser, session: SessionDep) -> None:
    group = get_in_org_or_404(session, Group, group_id, user)
    target = get_in_org_or_404(session, User, data.user_id, user)  # other orgs' users: 404
    service.add_member(session, user, group, target)


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(group_id: int, user_id: int, user: CurrentUser, session: SessionDep) -> None:
    group = get_in_org_or_404(session, Group, group_id, user)
    target = get_in_org_or_404(session, User, user_id, user)
    service.remove_member(session, user, group, target)
