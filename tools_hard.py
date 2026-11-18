import discord


# ================= CONFIGURATION =================

DEVELOPER_ROLE_ID = 1572448688700391454


# ================= ACCESS CONTROL =================

class HardAccessError(Exception):
    pass


def has_developer_access(member):
    if not isinstance(member, discord.Member):
        return False

    if member.guild is None:
        return False

    if member.id == member.guild.owner_id:
        return True

    return any(
        role.id == DEVELOPER_ROLE_ID
        for role in member.roles
    )


def require_developer_access(member):
    if not has_developer_access(member):
        raise HardAccessError(
            "Elyx Developer access required."
        )


# ================= PERMISSION CHECKS =================

def check_bot_permissions(guild, permission):
    bot_member = guild.me

    if bot_member is None:
        raise HardAccessError("Bot member information unavailable.")

    if not getattr(bot_member.guild_permissions, permission, False):
        raise HardAccessError(
            f"Bot is missing permission: {permission}"
        )


def check_member_permission(member, permission):
    if not getattr(member.guild_permissions, permission, False):
        raise HardAccessError(
            f"Member is missing permission: {permission}"
        )


def get_target_member(guild, target):
    if isinstance(target, discord.Member):
        return target

    member = guild.get_member(int(target))

    if member is None:
        raise HardAccessError("Member not found in this server.")

    return member


def check_hierarchy(guild, actor, target):
    bot_member = guild.me

    if bot_member is None:
        raise HardAccessError("Bot member information unavailable.")

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


# ================= MODERATION =================

async def kick_member(guild, actor, target, reason=None):

    require_developer_access(actor)
    check_bot_permissions(guild, "kick_members")

    member = get_target_member(guild, target)
    check_hierarchy(guild, actor, member)

    await member.kick(
        reason=reason or f"Elyx Developer action by {actor}"
    )

    return f"{member} was kicked successfully."


async def ban_member(guild, actor, target, reason=None):

    require_developer_access(actor)
    check_bot_permissions(guild, "ban_members")

    member = get_target_member(guild, target)
    check_hierarchy(guild, actor, member)

    await member.ban(
        reason=reason or f"Elyx Developer action by {actor}"
    )

    return f"{member} was banned successfully."


async def change_nickname(guild, actor, target, nickname):

    require_developer_access(actor)
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


# ================= CHANNEL MANAGEMENT =================

async def create_text_channel(guild, actor, name):

    require_developer_access(actor)
    check_bot_permissions(guild, "manage_channels")

    name = name.strip().lower().replace(" ", "-")

    if not name or len(name) > 100:
        raise HardAccessError("Invalid channel name.")

    channel = await guild.create_text_channel(
        name=name,
        reason=f"Elyx Developer action by {actor}"
    )

    return f"Channel #{channel.name} created successfully."


async def delete_channel(guild, actor, channel_id):

    require_developer_access(actor)
    check_bot_permissions(guild, "manage_channels")

    channel = guild.get_channel(int(channel_id))

    if channel is None:
        raise HardAccessError("Channel not found.")

    await channel.delete(
        reason=f"Elyx Developer action by {actor}"
    )

    return "Channel deleted successfully."


# ================= ROLE MANAGEMENT =================

async def create_role(guild, actor, name):

    require_developer_access(actor)
    check_bot_permissions(guild, "manage_roles")

    name = name.strip()

    if not name or len(name) > 100:
        raise HardAccessError("Invalid role name.")

    role = await guild.create_role(
        name=name,
        reason=f"Elyx Developer action by {actor}"
    )

    return f"Role {role.name} created successfully."


async def set_member_role(
    guild,
    actor,
    member_id,
    role_id,
    add=True
):

    require_developer_access(actor)
    check_bot_permissions(guild, "manage_roles")

    member = get_target_member(guild, member_id)
    check_hierarchy(guild, actor, member)

    role = guild.get_role(int(role_id))

    if role is None:
        raise HardAccessError("Role not found.")

    bot_member = guild.me

    if role.is_default() or role.managed:
        raise HardAccessError("This role cannot be assigned manually.")

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
