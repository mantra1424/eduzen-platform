"""Business rules for groups (classrooms/teams) and their members."""

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.groups.models import Group, GroupMember
from app.groups.schemas import GroupCreate, GroupPublic, GroupUpdate
from app.users.models import User, UserRole

# --- reading -----------------------------------------------------------------


def _groups_with_counts(session: Session, user: User, only_mine: bool) -> list[GroupPublic]:
    """Groups in the caller's org, each with its member count, in one query."""
    # Count members per group once, then LEFT JOIN so empty groups show 0.
    counts = (
        select(GroupMember.group_id, func.count().label("member_count"))
        .group_by(GroupMember.group_id)
        .subquery()
    )
    member_count = func.coalesce(counts.c.member_count, 0)
    # Two columns per row (group, count), so this can't use scoped_select (one model per row);
    # the org filter is written out instead. Don't remove it.
    query = (
        select(Group, member_count)
        .where(Group.org_id == user.org_id)
        .outerjoin(counts, counts.c.group_id == Group.id)
        .order_by(Group.name)
    )
    if only_mine:
        my_group_ids = select(GroupMember.group_id).where(GroupMember.user_id == user.id)
        query = query.where(Group.id.in_(my_group_ids))

    return [
        GroupPublic(id=g.id, name=g.name, created_at=g.created_at, member_count=n)
        for g, n in session.exec(query).all()
    ]


def list_groups(session: Session, admin: User) -> list[GroupPublic]:
    return _groups_with_counts(session, admin, only_mine=False)


def my_groups(session: Session, user: User) -> list[GroupPublic]:
    return _groups_with_counts(session, user, only_mine=True)


def to_public(session: Session, group: Group) -> GroupPublic:
    count = session.exec(
        select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id)
    ).one()
    return GroupPublic(
        id=group.id, name=group.name, created_at=group.created_at, member_count=count
    )


def is_member(session: Session, group: Group, user: User) -> bool:
    return session.get(GroupMember, (group.id, user.id)) is not None


def list_members(session: Session, actor: User, group: Group) -> list[User]:
    _ensure_can_view_members(session, actor, group)
    query = (
        select(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group.id)
        .order_by(User.name, User.id)
    )
    return list(session.exec(query).all())


# --- creating and changing groups (admin only; checked by the route) ---------


def _save_group(session: Session, group: Group) -> Group:
    session.add(group)
    try:
        session.commit()
    except IntegrityError:
        # uq_groups_org_id_name: same name already used in this organisation.
        session.rollback()
        raise ConflictError("A group with that name already exists.") from None
    session.refresh(group)
    return group


def create_group(session: Session, admin: User, data: GroupCreate) -> Group:
    return _save_group(session, Group(org_id=admin.org_id, name=data.name))


def update_group(session: Session, group: Group, data: GroupUpdate) -> Group:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    return _save_group(session, group)


def delete_group(session: Session, group: Group) -> None:
    # Memberships are removed by the database (ON DELETE CASCADE).
    session.delete(group)
    session.commit()


# --- membership --------------------------------------------------------------


def _ensure_can_view_members(session: Session, actor: User, group: Group) -> None:
    if actor.role == UserRole.admin:
        return
    if actor.role == UserRole.learner:
        raise ForbiddenError("Learners can't view group member lists.")
    if is_member(session, group, actor):
        return
    raise ForbiddenError("You can only view members of your own groups.")


def _ensure_can_change_membership(session: Session, actor: User, group: Group, target: User):
    if actor.role == UserRole.admin:
        return
    if actor.role == UserRole.learner:
        raise ForbiddenError("Learners can't change group membership.")
    if not is_member(session, group, actor):
        raise ForbiddenError("You can only manage members of your own groups.")
    # Instructors manage learners in their own groups, not other staff.
    if target.role != UserRole.learner:
        raise ForbiddenError("Instructors can only add or remove learners.")


def add_member(session: Session, actor: User, group: Group, target: User) -> None:
    """`target` must already be checked to be in the same organisation."""
    _ensure_can_change_membership(session, actor, group, target)
    if is_member(session, group, target):
        raise ConflictError("That user is already in this group.")
    session.add(GroupMember(group_id=group.id, user_id=target.id))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()  # two requests added the same member at the same moment
        raise ConflictError("That user is already in this group.") from None


def remove_member(session: Session, actor: User, group: Group, target: User) -> None:
    _ensure_can_change_membership(session, actor, group, target)
    membership = session.get(GroupMember, (group.id, target.id))
    if membership is None:
        raise NotFoundError("That user isn't in this group.")
    session.delete(membership)
    session.commit()
