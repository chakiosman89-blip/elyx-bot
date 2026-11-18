from pathlib import Path

from code_tester import validate_python_code, validate_text_size


# ================= CONFIGURATION =================

PROJECT_ROOT = Path(__file__).resolve().parent

ALLOWED_FILES = {
    "main.py",
    "ai_brain.py",
    "tools_hard.py",
    "tools_normal.py",
    "self_coder.py",
    "memory.py",
    "database.py",
    "github_builder.py",
    "code_tester.py",
    "requirements.txt",
}

MAX_FILE_SIZE = 100_000


# ================= FILE VALIDATION =================

def validate_file_path(file_path):

    if not isinstance(file_path, str) or not file_path.strip():
        raise ValueError("Invalid file path.")

    requested = Path(file_path)

    if requested.is_absolute():
        raise ValueError("Absolute paths are not allowed.")

    if ".." in requested.parts:
        raise ValueError("Path traversal is not allowed.")

    if len(requested.parts) != 1:
        raise ValueError("Only approved project files are allowed.")

    if requested.name not in ALLOWED_FILES:
        raise ValueError("This file is not in the approved file list.")

    resolved = (PROJECT_ROOT / requested).resolve()

    if resolved.parent != PROJECT_ROOT.resolve():
        raise ValueError("File path is outside the project directory.")

    return resolved


# ================= FILE READER =================

def read_project_file(file_path):

    path = validate_file_path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"{path.name} does not exist.")

    if not path.is_file():
        raise ValueError("Requested path is not a file.")

    if path.stat().st_size > MAX_FILE_SIZE:
        raise ValueError("File exceeds the allowed size.")

    return path.read_text(encoding="utf-8")


# ================= CODE REVIEW =================

def review_code_change(file_path, new_code):

    result = {
        "approved": False,
        "valid": False,
        "file": None,
        "errors": [],
        "warnings": [],
        "message": "",
    }

    try:
        path = validate_file_path(file_path)
        result["file"] = path.name

    except ValueError as error:
        result["errors"].append(str(error))
        result["message"] = "File validation failed."
        return result

    if not isinstance(new_code, str):
        result["errors"].append("New code must be text.")
        result["message"] = "Invalid code."
        return result

    if not validate_text_size(new_code, MAX_FILE_SIZE):
        result["errors"].append("New code exceeds the file size limit.")
        result["message"] = "Code is too large."
        return result

    if path.suffix == ".py":

        check = validate_python_code(new_code)

        result["warnings"].extend(check.get("warnings", []))

        if not check.get("valid", False):
            result["errors"].extend(check.get("errors", []))
            result["message"] = "Python syntax validation failed."
            return result

    elif path.name == "requirements.txt":

        for line_number, line in enumerate(new_code.splitlines(), 1):
            cleaned = line.strip()

            if cleaned and cleaned.startswith("-"):
                result["warnings"].append(
                    f"Review requirement option on line {line_number}."
                )

    result["valid"] = True
    result["approved"] = False

    result["warnings"].append(
        "Human approval is required before saving or committing this change."
    )

    result["message"] = "Code review passed. Waiting for human approval."

    return result
