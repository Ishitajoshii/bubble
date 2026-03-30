"""
Regex-based fallback when Gemini is unreachable or returns invalid SQL.
"""

import re


def fallback_sql(prompt: str, table: str = "sales") -> str:
    """
    Simple keyword matching — always returns something useful
    even when the LLM is unavailable.
    """
    p = prompt.lower()

    if re.search(r"\bcount\b", p):
        return f"SELECT COUNT(*) FROM {table};"

    if re.search(r"\b(average|avg|mean)\b", p):
        return f"SELECT AVG(amount) FROM {table};"

    if re.search(r"\b(sum|total)\b", p):
        return f"SELECT SUM(amount) FROM {table};"

    if re.search(r"\b(max|maximum|highest|largest)\b", p):
        return f"SELECT MAX(amount) FROM {table};"

    if re.search(r"\b(min|minimum|lowest|smallest)\b", p):
        return f"SELECT MIN(amount) FROM {table};"

    return f"SELECT * FROM {table} LIMIT 10;"
