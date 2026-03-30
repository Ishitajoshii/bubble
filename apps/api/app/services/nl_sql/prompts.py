"""
Prompt template sent to Gemini for NL → SQL conversion.
"""

from typing import List


def build_nl_to_sql_prompt(
    natural_language: str,
    table: str,
    columns: List[str],
) -> str:
    """
    Build the prompt that instructs Gemini to return
    a single valid SELECT statement and nothing else.
    """
    col_list = ", ".join(columns)

    return f"""You are an expert SQL assistant.

RULES
  1. Output ONLY a single valid SQL SELECT statement — no markdown, no explanation.
  2. The query MUST only reference the table `{table}` with columns: {col_list}.
  3. Do NOT use DROP, DELETE, UPDATE, INSERT, ALTER, or any DDL/DML that modifies data.
  4. If the user's request is ambiguous, make a reasonable assumption and still return valid SQL.
  5. Always end the SQL statement with a semicolon.

USER REQUEST
\"{natural_language}\"

SQL:"""
