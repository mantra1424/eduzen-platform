import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.groups.models import Group, GroupMember
from app.users.models import User, UserRole
from tests.factories import make_org, make_user


def test_create_org_user_group_and_membership(session: Session):
    org = make_org(session)
    user = make_user(session, org)
    group = Group(org_id=org.id, name="CE Sem 5")
    session.add(group)
    session.commit()
    session.refresh(group)

    session.add(GroupMember(group_id=group.id, user_id=user.id))
    session.commit()

    members = session.exec(select(GroupMember).where(GroupMember.group_id == group.id)).all()
    assert [m.user_id for m in members] == [user.id]
    assert user.is_active is True
    assert user.created_at.tzinfo is not None


def test_duplicate_email_rejected(session: Session):
    org = make_org(session)
    make_user(session, org, email="same@svmit.edu")
    with pytest.raises(IntegrityError):
        make_user(session, org, email="same@svmit.edu")


def test_duplicate_org_slug_rejected(session: Session):
    make_org(session, slug="svmit")
    with pytest.raises(IntegrityError):
        make_org(session, slug="svmit")


def test_same_member_cannot_join_group_twice(session: Session):
    org = make_org(session)
    user = make_user(session, org)
    group = Group(org_id=org.id, name="CE Sem 5")
    session.add(group)
    session.commit()

    session.add(GroupMember(group_id=group.id, user_id=user.id))
    session.commit()
    session.add(GroupMember(group_id=group.id, user_id=user.id))
    with pytest.raises(IntegrityError):
        session.commit()


def test_user_must_belong_to_existing_org(session: Session):
    session.add(
        User(org_id=999_999, email="x@x.edu", name="X", password_hash="h", role=UserRole.admin)
    )
    with pytest.raises(IntegrityError):
        session.commit()
