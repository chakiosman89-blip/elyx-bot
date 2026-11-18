import discord


# Elyx Developer role
DEVELOPER_ROLE_ID = 1572448688700391454


def is_valid_member(member):
    """Check whether the user is a valid human server member."""

    return (
        isinstance(member, discord.Member)
        and not member.bot
        and member.guild is not None
    )


def has_developer_access(member):
    """Check Elyx Developer role access."""

    if not is_valid_member(member):
        return False

    # Server owner always has developer-level access
    if member.id == member.guild.owner_id:
        return True

    return any(
        role.id == DEVELOPER_ROLE_ID
        for role in member.roles
    )


def get_access_level(member):
    """Return the member's access level."""

    if not is_valid_member(member):
        return "invalid"

    if has_developer_access(member):
        return "developer"

    return "normal"


def can_use_normal_features(member):
    """Check access to normal member features."""

    return is_valid_member(member)


def get_normal_member_info(member):
    """Return basic member information."""

    if not is_valid_member(member):
        return None

    return {
        "user_id": member.id,
        "username": str(member),
        "display_name": member.display_name,
        "guild_id": member.guild.id,
        "access_level": get_access_level(member),
        "is_developer": has_developer_access(member),
        "is_bot": member.bot,
    }
