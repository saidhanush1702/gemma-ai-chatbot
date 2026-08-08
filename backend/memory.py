"""Long-term fact store, backed by Postgres (Neon).

This is the whole trick behind the chatbot: facts live in a database, not in the
chat history. The context window scrolls; this doesn't.

Postgres rather than a local SQLite file because the app deploys to Vercel, where
the filesystem is ephemeral — a local .db would be wiped on every cold start.

Every row is scoped to a `user_id` so visitors don't share one another's memory.
"""
import os

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL missing. Create a free Neon project at https://neon.tech, "
        "then put its pooled connection string in backend/.env"
    )

_initialised = False


def _conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init():
    """Create the table once per process. Cheap enough to call defensively."""
    global _initialised
    if _initialised:
        return
    with _conn() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS facts (
                   user_id    TEXT NOT NULL,
                   key        TEXT NOT NULL,
                   value      TEXT NOT NULL,
                   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                   PRIMARY KEY (user_id, key)
               )"""
        )
    _initialised = True


def save_fact(user_id: str, key: str, value: str):
    """Insert or overwrite one fact. Newer statements win."""
    key = key.strip().lower().replace(" ", "_")
    value = str(value).strip()
    if not key or not value:
        return
    init()
    with _conn() as c:
        c.execute(
            """INSERT INTO facts (user_id, key, value) VALUES (%s, %s, %s)
               ON CONFLICT (user_id, key)
               DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
            (user_id, key, value),
        )


def save_facts(user_id: str, facts: dict):
    for k, v in facts.items():
        save_fact(user_id, k, v)


def get_facts(user_id: str) -> dict:
    init()
    with _conn() as c:
        rows = c.execute(
            "SELECT key, value FROM facts WHERE user_id = %s ORDER BY key", (user_id,)
        ).fetchall()
    return {r["key"]: r["value"] for r in rows}


def forget(user_id: str, key: str | None = None):
    """Drop one fact, or everything this user has stored."""
    init()
    with _conn() as c:
        if key:
            c.execute("DELETE FROM facts WHERE user_id = %s AND key = %s", (user_id, key))
        else:
            c.execute("DELETE FROM facts WHERE user_id = %s", (user_id,))


def as_prompt_block(user_id: str) -> str:
    """Render this user's facts for injection into the prompt."""
    facts = get_facts(user_id)
    if not facts:
        return "(nothing remembered about this user yet)"
    return "\n".join(f"- {k.replace('_', ' ')}: {v}" for k, v in facts.items())
