
from pathlib import Path
from code_tester import validate_python_code

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


def validate_file_path(filename: str) -> Path:
    if not isinstance(filename, str) or not filename.strip():
        raise ValueError("File name is required.")

    if filename not in ALLOWED_FILES:
        raise ValueError("This file is not allowed to be modified.")

    path = (PROJECT_ROOT / filename).resolve()

    if path.parent != PROJECT_ROOT:
        raise ValueError("Invalid file path.")

    return path


def review_code_change(filename: str, new_code: str) -> dict:
    try:
        validate_file_path(filename)
    except ValueError as error:
        return {
            "approved": False,
            "error": str(error),
            "warnings": []
        }

    if not isinstance(new_code, str):
        return {
            "approved": False,
            "error": "New code must be text.",
            "warnings": []
        }

    if filename.endswith(".py"):
        result = validate_python_code(new_code)

        if not result["valid"]:
            return {
                "approved": False,
                "error": result["error"],
                "warnings": result.get("warnings", [])
            }

        return {
            "approved": False,
            "review_passed": True,
            "error": None,
            "warnings": result.get("warnings", []),
            "message": "Review passed. Human approval is still required."
        }

    if filename == "requirements.txt":
        return {
            "approved": False,
            "review_passed": True,
            "error": None,
            "warnings": [
                "Review package names and versions before approval."
            ],
            "message": "Review passed. Human approval is still required."
        }

    return {
        "approved": False,
        "error": "Unsupported file type.",
        "warnings": []
      }
