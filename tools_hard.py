import re
from datetime import timedelta

import discord


DEVELOPER_ROLE_ID = 1572448688700391454
MAX_TIMEOUT_MINUTES = 28 * 24 * 60


class HardAccessError(Exception):
    """Raised when an Elyx developer action is not allowed."""


def has_developer_access(member):
    if not isinstance(member, discord.Member) or member.guild is None:
        return False

    if member.id == member.guild.owner_id:
        return True

    return any(role.id == DEVELOPER_ROLE_ID for role in member.roles)


def require_developer_access(member):
    if not has_developer_access(member):
        raise HardAccessError("Elyx Developer access required.")


def _get_bot_member(guild):
    bot_member = guild.me
    if bot_member is None:
        raise HardAccessError("Bot member information unavailable.")
    return bot_member


def check_bot_permissions(guild, permission):
    bot_member = _get_bot_member(guild)

    if not getattr(bot_member.guild_permissions, permission, False):
        raise HardAccessError(
            f"Bot is missing the required permission: "
            f"{permission.replace('_', ' ').title()}."
        )


def check_member_permission(member, permission):
    if member.id == member.guild.owner_id:
        return

    if not getattr(member.guild_permissions, permission, False):
        raise HardAccessError(
            f"You are missing the required permission: "
            f"{permission.replace('_', ' ').title()}."
        )


def _extract_id(value):
    if isinstance(value, int):
        return value

    if isinstance(value, (discord.Member, discord.Role, discord.abc.GuildChannel)):
        return value.id

    match = re.search(r"(\d{15,22})", str(value))

    if not match:
        raise HardAccessError(
            "A valid member, role, or channel ID/mention is required."
        )

    return int(match.group(1))


def get_target_member(guild, target):
    if isinstance(target, discord.Member):
        if target.guild.id != guild.id:
            raise HardAccessError("That member is not in this server.")
        return target

    member_id = _extract_id(target)
    member = guild.get_member(member_id)

    if member is None:
        raise HardAccessError("Member not found in this server.")

    return member


def check_hierarchy(guild, actor, target):
    bot_member = _get_bot_member(guild)

    if target.id == guild.owner_id:
        raise HardAccessError("Server owner cannot be targeted.")

    if target.id == bot_member.id:
        raise HardAccessError("Bot cannot target itself.")

    if target.top_role >= bot_member.top_role:
        raise HardAccessError(
            "Target has an equal or higher role than the bot."
        )

    if actor.id != guild.owner_id and target.top_role >= actor.top_role:
        raise HardAccessError(
            "Target has an equal or higher role than you."
        )


def _clean_name(name, channel=False):
    if not isinstance(name, str):
        raise HardAccessError("Name must be text.")

    name = name.strip()

    if not name or len(name) > 100:
        raise HardAccessError("Name must contain 1 to 100 characters.")

    if channel:
        name = re.sub(r"\s+", "-", name.lower())
        name = re.sub(r"[^a-z0-9_-]", "", name)
        name = re.sub(r"-{2,}", "-", name).strip("-_")

        if not name:
            raise HardAccessError("That channel name is not valid.")

    return name


def _parse_colour(colour):
    if colour is None:
        return None

    if isinstance(colour, discord.Colour):
        return colour

    if isinstance(colour, int):
        return discord.Colour(colour)

    value = str(colour).strip().lower()

    named_colours = {
        "red": discord.Colour.red(),
        "orange": discord.Colour.orange(),
        "yellow": discord.Colour.gold(),
        "green": discord.Colour.green(),
        "blue": discord.Colour.blue(),
        "purple": discord.Colour.purple(),
        "pink": discord.Colour.magenta(),
        "black": discord.Colour.from_rgb(0, 0, 0),
        "white": discord.Colour.from_rgb(255, 255, 255),
        "cyan": discord.Colour.from_rgb(0, 255, 255),
    }

    if value in named_colours:
        return named_colours[value]

    if value.startswith("#"):
        value = value[1:]

    try:
        number = int(value, 16)
    except ValueError:
        raise HardAccessError(
            "Unknown role colour. Use purple or a hex colour like #8000FF."
        )

    if number < 0 or number > 0xFFFFFF:
        raise HardAccessError("Role colour must be a valid 6-digit hex colour.")

    return discord.Colour(number)


async def kick_member(guild, actor, target, reason=None):
    require_developer_access(actor)
    check_member_permission(actor, "kick_members")
    check_bot_permissions(guild, "kick_members")

    member = get_target_member(guild, target)
    check_hierarchy(guild, actor, member)

    await member.kick(
        reason=reason or f"Elyx Developer action by {actor}"
    )

    return f"{member} was kicked successfully."


async def ban_member(guild, actor, target, reason=None):
    require_developer_access(actor)
    check_member_permission(actor, "ban_members")
    check_bot_permissions(guild, "ban_members")

    member = get_target_member(guild, target)
    check_hierarchy(guild, actor, member)

    await member.ban(
        reason=reason or f"Elyx Developer action by {actor}"
    )

    return f"{member} was banned successfully."


async def timeout_member(guild, actor, target, duration_minutes, reason=None):
    require_developer_access(actor)
    check_member_permission(actor, "moderate_members")
    check_bot_permissions(guild, "moderate_members")

    try:
        duration_minutes = int(duration_minutes)
    except (TypeError, ValueError):
        raise HardAccessError("Timeout duration must be a number of minutes.")

    if duration_minutes < 1 or duration_minutes > MAX_TIMEOUT_MINUTES:
        raise HardAccessError(
            "Timeout duration must be between 1 minute and 28 days."
        )

    member = get_target_member(guild, target)
    check_hierarchy(guild, actor, member)

    until = discord.utils.utcnow() + timedelta(minutes=duration_minutes)

    await member.timeout(
        until,
        reason=reason or f"Elyx Developer timeout by {actor}"
    )

    return f"{member} was timed out for {duration_minutes} minute(s)."


async def change_nickname(guild, actor, target, nickname):
    require_developer_access(actor)
    check_member_permission(actor, "manage_nicknames")
    check_bot_permissions(guild, "manage_nicknames")

    member = get_target_member(guild, target)
    check_hierarchy(guild, actor, member)

    if nickname is not None and len(nickname) > 32:
        raise HardAccessError("Nickname cannot exceed 32 characters.")

    await member.edit(
        nick=nickname,
        reason=f"Elyx Developer action by {actor}"
    )

    return f"Nickname updated for {member}."


async def create_category(guild, actor, name):
    require_developer_access(actor)
    check_member_permission(actor, "manage_channels")
    check_bot_permissions(guild, "manage_channels")

    name = _clean_name(name)

    category = await guild.create_category(
        name=name,
        reason=f"Elyx Developer action by {actor}"
    )

    return category


async def create_text_channel(guild, actor, name, category=None):
    require_developer_access(actor)
    check_member_permission(actor, "manage_channels")
    check_bot_permissions(guild, "manage_channels")

    name = _clean_name(name, channel=True)

    if category is not None:
        if isinstance(category, str):
            wanted = category.strip().casefold()

            category_obj = discord.utils.find(
                lambda item: item.name.casefold() == wanted,
                guild.categories
            )

            if category_obj is None:
                raise HardAccessError(
                    f"Category '{category}' was not found."
                )

            category = category_obj

        if not isinstance(category, discord.CategoryChannel):
            raise HardAccessError(
                "The selected parent must be a category in this server."
            )

        if category.guild.id != guild.id:
            raise HardAccessError(
                "That category does not belong to this server."
            )

    channel = await guild.create_text_channel(
        name=name,
        category=category,
        reason=f"Elyx Developer action by {actor}"
    )

    return f"Channel #{channel.name} created successfully."


async def delete_channel(guild, actor, channel_id):
    require_developer_access(actor)
    check_member_permission(actor, "manage_channels")
    check_bot_permissions(guild, "manage_channels")

    channel_id = _extract_id(channel_id)
    channel = guild.get_channel(channel_id)

    if channel is None:
        raise HardAccessError("Channel not found.")

    await channel.delete(
        reason=f"Elyx Developer action by {actor}"
    )

    return "Channel deleted successfully."


async def create_role(guild, actor, name, colour=None):
    require_developer_access(actor)
    check_member_permission(actor, "manage_roles")
    check_bot_permissions(guild, "manage_roles")

    name = _clean_name(name)
    role_colour = _parse_colour(colour)

    role = await guild.create_role(
        name=name,
        colour=role_colour or discord.Colour.default(),
        reason=f"Elyx Developer action by {actor}"
    )

    return f"Role {role.name} created successfully."


async def set_member_role(guild, actor, member_id, role_id, add=True):
    require_developer_access(actor)
    check_member_permission(actor, "manage_roles")
    check_bot_permissions(guild, "manage_roles")

    member = get_target_member(guild, member_id)
    check_hierarchy(guild, actor, member)

    role_id = _extract_id(role_id)
    role = guild.get_role(role_id)

    if role is None:
        raise HardAccessError("Role not found.")

    bot_member = _get_bot_member(guild)

    if role.is_default() or role.managed:
        raise HardAccessError(
            "This role cannot be assigned manually."
        )

    if role >= bot_member.top_role:
        raise HardAccessError(
            "Bot cannot manage this role due to role hierarchy."
        )

    if actor.id != guild.owner_id and role >= actor.top_role:
        raise HardAccessError(
            "You cannot manage a role equal to or higher than your top role."
        )

    if add:
        await member.add_roles(
            role,
            reason=f"Elyx Developer action by {actor}"
        )
        return f"Role {role.name} added to {member}."

    await member.remove_roles(
        role,
        reason=f"Elyx Developer action by {actor}"
    )

    return f"Role {role.name} removed from {member}."
