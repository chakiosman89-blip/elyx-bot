import ast
import re


MAX_CODE_SIZE = 100_000

BLOCKED_IMPORTS = {
    "subprocess",
    "ctypes",
    "pickle",
    "telnetlib",
}

BLOCKED_FUNCTIONS = {
    "eval",
    "exec",
    "compile",
}

BLOCKED_ATTRIBUTES = {
    "system",
    "popen",
}


def validate_python_code(code):
    """
    Static Python code validation.
    Code is NEVER executed by this function.
    """

    result = {
        "valid": False,
        "success": False,
        "errors": [],
        "warnings": [],
        "message": "",
    }

    if not isinstance(code, str):
        result["errors"].append("Code must be a string.")
        result["message"] = "Invalid code input."
        return result

    if not code.strip():
        result["errors"].append("Code is empty.")
        result["message"] = "Empty code."
        return result

    if len(code.encode("utf-8")) > MAX_CODE_SIZE:
        result["errors"].append("Code exceeds the 100 KB size limit.")
        result["message"] = "Code is too large."
        return result

    try:
        tree = ast.parse(code)

    except SyntaxError as error:
        result["errors"].append(
            f"Syntax error at line {error.lineno}: {error.msg}"
        )
        result["message"] = "Python syntax validation failed."
        return result

    for node in ast.walk(tree):

        if isinstance(node, ast.Import):

            for alias in node.names:
                module = alias.name.split(".")[0]

                if module in BLOCKED_IMPORTS:
                    result["warnings"].append(
                        f"Restricted import detected: {module}"
                    )

        elif isinstance(node, ast.ImportFrom):

            if node.module:
                module = node.module.split(".")[0]

                if module in BLOCKED_IMPORTS:
                    result["warnings"].append(
                        f"Restricted import detected: {module}"
                    )

        elif isinstance(node, ast.Call):

            if isinstance(node.func, ast.Name):

                if node.func.id in BLOCKED_FUNCTIONS:
                    result["warnings"].append(
                        f"Restricted function detected: {node.func.id}"
                    )

            elif isinstance(node.func, ast.Attribute):

                if node.func.attr in BLOCKED_ATTRIBUTES:
                    result["warnings"].append(
                        f"Restricted operation detected: {node.func.attr}"
                    )

    result["valid"] = True
    result["success"] = True
    result["message"] = "Python syntax validation passed."

    return result


def validate_text_size(text, max_size=MAX_CODE_SIZE):

    if not isinstance(text, str):
        return False

    return len(text.encode("utf-8")) <= max_size
