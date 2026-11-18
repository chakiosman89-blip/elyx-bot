import discord
from typing import Optional


# =====================================
# ELYX TRADING - HARD ACCESS SYSTEM
# =====================================

DEVELOPER_ROLE_ID = 1572448688700391454


class HardAccessError(Exception):
    """Raised when developer access is denied."""
    pass


def has_developer_access(
    member: discord.Member
) -> bool:
    """
    Checks whether a member has the
    official Elyx Developer role.
    """

    if not isinstance(member, discord.Member):
        return False

    return any(
        role.id == DEVELOPER_ROLE_ID
        for role in member.roles
    )


def require_developer_access(
    member: discord.Member
) -> None:
    """
    Blocks users without developer access.
    """

    if not has_developer_access(member):
        raise HardAccessError(
            "You do not have Elyx Developer access."
        )


def check_bot_permissions(
    guild: discord.Guild,
    permission_name: str
) -> bool:
    """
    Checks whether the bot has a
    required permission in a server.
    """

    if guild is None or guild.me is None:
        return False

    permissions = guild.me.guild_permissions

    if not hasattr(permissions, permission_name):
        return False

    return bool(
        getattr(permissions, permission_name)
    )


def check_member_permission(
    member: discord.Member,
    permission_name: str
) -> bool:
    """
    Checks a member's Discord permission.
    """

    if not isinstance(member, discord.Member):
        return False

    permissions = member.guild_permissions

    if not hasattr(permissions, permission_name):
        return False

    return bool(
        getattr(permissions, permission_name)
    )


def get_developer_status(
    member: discord.Member
) -> dict:
    """
    Returns developer access information.
    """

    access = has_developer_access(member)

    return {
        "user_id": member.id,
        "developer_access": access,
        "role_id": DEVELOPER_ROLE_ID,
        "status": "AUTHORIZED" if access else "DENIED"
  }
