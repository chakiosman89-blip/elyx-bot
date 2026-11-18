import discord

DEVELOPER_ROLE_ID = 1572448688700391454


class HardAccessError(Exception):
    pass


def has_developer_access(member):
    if not isinstance(member, discord.Member):
        return False

    return any(
        role.id == DEVELOPER_ROLE_ID
        for role in member.roles
    )


def require_developer_access(member):
    if not has_developer_access(member):
        raise HardAccessError(
            "Elyx Developer access required."
        )


def check_bot_permissions(guild, permission_name):
    if guild is None or guild.me is None:
        return False

    return bool(
        getattr(guild.me.guild_permissions, permission_name, False)
    )


def check_member_permission(member, permission_name):
    if not isinstance(member, discord.Member):
        return False

    return bool(
        getattr(member.guild_permissions, permission_name, False)
    )


def get_developer_status(member):
    access = has_developer_access(member)

    return {
        "user_id": member.id,
        "developer_access": access,
        "role_id": DEVELOPER_ROLE_ID,
        "status": "AUTHORIZED" if access else "DENIED"
    }


async def get_target_member(guild, user_id):
    member = guild.get_member(int(user_id))

    if member is None:
        try:
            member = await guild.fetch_member(int(user_id))
        except discord.NotFound:
            return None

    return member


def check_hierarchy(actor, target, bot_member):
    if target.id == actor.id:
        raise HardAccessError("You cannot target yourself.")

    if target.id == actor.guild.owner_id:
        raise HardAccessError("Server owner cannot be targeted.")

    if target.top_role >= actor.top_role:
        raise HardAccessError(
            "Target member has an equal or higher role."
        )

    if target.top_role >= bot_member.top_role:
        raise HardAccessError(
            "Bot role must be higher than target member."
        )


async def kick_member(guild, actor, user_id, reason=None):
    require_developer_access(actor)

    if not check_bot_permissions(guild, "kick_members"):
        raise HardAccessError("Bot needs Kick Members permission.")

    target = await get_target_member(guild, user_id)

    if target is None:
        raise HardAccessError("Member not found.")

    check_hierarchy(actor, target, guild.me)

    await target.kick(reason=reason or "Elyx Developer action")

    return f"Successfully kicked {target}."


async def ban_member(guild, actor, user_id, reason=None):
    require_developer_access(actor)

    if not check_bot_permissions(guild, "ban_members"):
        raise HardAccessError("Bot needs Ban Members permission.")

    target = await get_target_member(guild, user_id)

    if target is None:
        raise HardAccessError("Member not found.")

    check_hierarchy(actor, target, guild.me)

    await target.ban(
        reason=reason or "Elyx Developer action",
        delete_message_seconds=0
    )

    return f"Successfully banned {target}."


async def change_nickname(guild, actor, user_id, nickname):
    require_developer_access(actor)

    if not check_bot_permissions(guild, "manage_nicknames"):
        raise HardAccessError(
            "Bot needs Manage Nicknames permission."
        )

    target = await get_target_member(guild, user_id)

    if target is None:
        raise HardAccessError("Member not found.")

    check_hierarchy(actor, target, guild.me)

    await target.edit(
        nick=nickname,
        reason="Elyx Developer action"
    )

    return f"Nickname updated for {target}."


async def create_text_channel(guild, actor, name):
    require_developer_access(actor)

    if not check_bot_permissions(guild, "manage_channels"):
        raise HardAccessError("Bot needs Manage Channels permission.")

    channel = await guild.create_text_channel(
        name=name,
        reason="Elyx Developer action"
    )

    return f"Created channel {channel.mention}."


async def delete_channel(guild, actor, channel_id):
    require_developer_access(actor)

    if not check_bot_permissions(guild, "manage_channels"):
        raise HardAccessError("Bot needs Manage Channels permission.")

    channel = guild.get_channel(int(channel_id))

    if channel is None:
        raise HardAccessError("Channel not found.")

    await channel.delete(reason="Elyx Developer action")

    return "Channel deleted."


async def create_role(guild, actor, name):
    require_developer_access(actor)

    if not check_bot_permissions(guild, "manage_roles"):
        raise HardAccessError("Bot needs Manage Roles permission.")

    role = await guild.create_role(
        name=name,
        reason="Elyx Developer action"
    )

    return f"Created role: {role.name}."


async def set_member_role(guild, actor, user_id, role_id, add=True):
    require_developer_access(actor)

    if not check_bot_permissions(guild, "manage_roles"):
        raise HardAccessError("Bot needs Manage Roles permission.")

    target = await get_target_member(guild, user_id)

    if target is None:
        raise HardAccessError("Member not found.")

    role = guild.get_role(int(role_id))

    if role is None:
        raise HardAccessError("Role not found.")

    if role >= guild.me.top_role:
        raise HardAccessError(
            "Bot role must be higher than the selected role."
        )

    if add:
        await target.add_roles(role, reason="Elyx Developer action")
        return f"Added {role.name} to {target}."

    await target.remove_roles(role, reason="Elyx Developer action")
    return f"Removed {role.name} from {target}."
