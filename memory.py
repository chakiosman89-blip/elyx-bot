import database


# =====================================
# ELYX TRADING - MEMORY SYSTEM
# =====================================

def initialize_memory():
    """Initializes the permanent memory database."""
    database.initialize_database()


def remember(
    user_id,
    content,
    category="general"
):
    """Saves an approved memory."""

    if not content or not str(content).strip():
        raise ValueError("Memory content cannot be empty.")

    return database.save_memory(
        user_id=user_id,
        content=str(content).strip(),
        category=category
    )


def recall(user_id, limit=20):
    """Retrieves memories belonging to a user."""

    return database.get_memories(
        user_id=user_id,
        limit=limit
    )


def remember_project(
    content,
    category="project"
):
    """Saves an Elyx project instruction or decision."""

    return database.save_memory(
        user_id="ELYX_PROJECT",
        content=str(content).strip(),
        category=category
    )


def recall_project(limit=50):
    """Retrieves saved Elyx project decisions."""

    return database.get_memories(
        user_id="ELYX_PROJECT",
        limit=limit
    )


def remember_feature(
    name,
    description="",
    file_path="",
    status="planned"
):
    """Stores a record of an Elyx feature."""

    return database.save_feature(
        name=name,
        description=description,
        file_path=file_path,
        status=status
    )


def recall_features(limit=50):
    """Retrieves saved Elyx feature records."""

    return database.get_features(limit=limit)


def save_preference(key, value):
    """Stores a project or system preference."""

    database.set_setting(key, value)


def get_preference(key, default=None):
    """Retrieves a saved preference."""

    return database.get_setting(key, default)
