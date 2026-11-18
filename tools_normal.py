
import discord

from tools_hard import has_developer_access


def is_valid_member(member: discord.Member) -> bool:
    """Checks whether the user is a valid human server member."""

    if not isinstance(member, discord.Member):
        return False

    return not member.bot


def get_access_level(member: discord.Member) -> str:
    """Identifies the member's Elyx access level."""

    if not is_valid_member(member):
        return "none"

    if has_developer_access(member):
        return "developer"

    return "normal"


def can_use_normal_features(member: discord.Member) -> bool:
    """Allows ordinary features to valid human members."""

    return is_valid_member(member)


def get_normal_member_info(member: discord.Member) -> dict:
    """Returns basic member information."""

    if not is_valid_member(member):
        return {}

    return {
        "user_id": member.id,
        "username": member.name,
        "display_name": member.display_name,
        "access_level": get_access_level(member),
        "normal_features": True
      }
