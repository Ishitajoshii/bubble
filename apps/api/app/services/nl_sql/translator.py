"""
NL → SQL translator — complete pipeline + FastAPI app.

Run directly:
    uvicorn app.services.nl_sql.translator:app --reload

Or:
    python -m app.services.nl_sql.translator
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from app.services.nl_sql.provider import gemini_generate_sql
from app.services.nl_sql.fallback_templates import fallback_sql


# ── Schema ────────────────────────────────────────────────────────
class Schema:
    def __init__(self, table: str, columns: List[str]):
        self.table = table
        self.columns = columns


schema = Schema(table="sales", columns=["amount", "region", "date"])


# ── Validator ─────────────────────────────────────────────────────
def is_valid_sql(sql: str) -> bool:
    """Only allow SELECT statements — block anything destructive."""
    sql_lower = sql.strip().lower()

    if not sql_lower.startswith("select"):
        return False

    forbidden = ["drop", "delete", "update", "insert", "alter", "truncate"]
    if any(word in sql_lower for word in forbidden):
        return False

    return True


# ── Pipeline ──────────────────────────────────────────────────────
def nl_to_sql(prompt: str) -> dict:
    """
    Convert a natural-language prompt into SQL.
    1. Try Gemini
    2. Validate
    3. Fall back to regex on failure
    """
    # --- Try Gemini first ---
    try:
        sql = gemini_generate_sql(prompt, schema.table, schema.columns)
        if is_valid_sql(sql):
            return {"sql": sql, "source": "gemini"}
    except Exception as exc:
        error_msg = str(exc)
        return {
            "sql": fallback_sql(prompt, schema.table),
            "source": "fallback",
            "error": error_msg,
        }

    # Gemini returned something unsafe → fall back
    return {
        "sql": fallback_sql(prompt, schema.table),
        "source": "fallback",
        "error": "Gemini returned invalid or unsafe SQL",
    }


# ── FastAPI ───────────────────────────────────────────────────────
app = FastAPI(
    title="NL-to-SQL API",
    description="Converts natural-language prompts into SQL using Google Gemini.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    prompt: str

class QueryResponse(BaseModel):
    sql: str
    source: str
    error: Optional[str] = None

@app.post("/nl-to-sql", response_model=QueryResponse)
def generate_sql(req: QueryRequest):
    """Translate a natural-language prompt into a SQL SELECT statement."""
    return nl_to_sql(req.prompt)


@app.get("/health")
def health():
    return {"status": "ok"}


# Allow `python -m app.services.nl_sql.translator`
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
