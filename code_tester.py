import ast


# =====================================
# ELYX TRADING - CODE TESTER
# =====================================

MAX_CODE_SIZE = 100_000

RISKY_MODULES = {
    "subprocess",
    "ctypes",
    "pickle",
    "telnetlib",
}

RISKY_FUNCTIONS = {
    "eval",
    "exec",
    "compile",
}


def validate_python_code(source: str) -> dict:
    """
    Checks Python syntax and reports
    potentially risky code patterns.
    Does not execute submitted code.
    """

    if not isinstance(source, str):
        return {
            "valid": False,
            "error": "Code must be text.",
            "warnings": []
        }

    if not source.strip():
        return {
            "valid": False,
            "error": "Code is empty.",
            "warnings": []
        }

    if len(source.encode("utf-8")) > MAX_CODE_SIZE:
        return {
            "valid": False,
            "error": "Code exceeds the size limit.",
            "warnings": []
        }

    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        return {
            "valid": False,
            "error": (
                f"Syntax error at line {error.lineno}: "
                f"{error.msg}"
            ),
            "warnings": []
        }

    warnings = []

    for node in ast.walk(tree):

        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in RISKY_MODULES:
                    warnings.append(
                        f"Review risky import: {alias.name}"
                    )

        elif isinstance(node, ast.ImportFrom):
            if node.module:
                if node.module.split(".")[0] in RISKY_MODULES:
                    warnings.append(
                        f"Review risky import: {node.module}"
                    )

        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in RISKY_FUNCTIONS:
                    warnings.append(
                        f"Review dynamic function: {node.func.id}"
                    )

            elif isinstance(node.func, ast.Attribute):
                if node.func.attr == "system":
                    warnings.append(
                        "Review possible system command."
                    )

    return {
        "valid": True,
        "error": None,
        "warnings": sorted(set(warnings)),
        "message": (
            "Syntax check passed. "
            "Further testing is still required."
        )
    }


def get_python_syntax_status(source: str) -> bool:
    """Returns True if Python syntax is valid."""

    result = validate_python_code(source)
    return result["valid"]
