"""
Vercel AI Gateway provider — calls Gemini via Vercel's AI Gateway
using the standard OpenAI Python SDK.

Docs: https://vercel.com/docs/ai-gateway/sdks-and-apis/python
"""

import os
import re
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from openai import OpenAI

from app.services.nl_sql.prompts import build_nl_to_sql_prompt

# ── Load .env from the repo root (WomenTechies/.env) ─────────────
_env_path = Path(__file__).resolve().parents[6] / ".env"
load_dotenv(dotenv_path=_env_path)

# ── Vercel AI Gateway configuration ──────────────────────────────
VERCEL_API_KEY = os.getenv("VERCEL_API_KEY")

# Vercel AI Gateway base URL (OpenAI-compatible endpoint)
_client = OpenAI(
    base_url="https://ai-gateway.vercel.sh/v1",
    api_key=VERCEL_API_KEY,
)

# Model identifier for Gemini 2.0 Flash via Vercel's gateway
_MODEL = "google/gemini-2.0-flash-001"


# ── Helpers ───────────────────────────────────────────────────────
def _clean_response(text: str) -> str:
    """Strip markdown code fences and whitespace from model output."""
    text = re.sub(r"```(?:sql)?\s*", "", text)
    text = re.sub(r"```", "", text)
    return text.strip()


# ── Public API ────────────────────────────────────────────────────
def gemini_generate_sql(
    natural_language: str,
    table: str,
    columns: List[str],
) -> str:
    """
    Send the prompt to Gemini (via Vercel AI Gateway) and return SQL.
    Raises on network / API errors — caller should handle.
    """
    prompt = build_nl_to_sql_prompt(natural_language, table, columns)

    response = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )

    return _clean_response(response.choices[0].message.content)
