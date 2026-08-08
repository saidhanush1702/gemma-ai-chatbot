"""Second Gemma call per turn: pull durable facts out of the user's message."""
import json
import re
import sys

from llm import EXTRACT_MODEL, generate, generate_async

PROMPT = """You are a memory extraction system. Read the user's message and pull out
durable personal facts about the user.

Rules:
- Return ONLY a JSON object. No prose, no markdown fences, no explanation.
- Keys are snake_case. Values are short strings.
- Only extract facts that would still be true tomorrow.
- Do NOT extract questions, opinions about the chat, temporary moods, or anything
  about the assistant.
- If there are no durable facts, return {{}}

Examples:

Message: "hi, i am sai dhanush"
{{"name": "Sai Dhanush"}}

Message: "what is my name?"
{{}}

Message: "I work at Infosys as a backend dev and I love biryani"
{{"job": "backend developer", "company": "Infosys", "favourite_food": "biryani"}}

Message: "haha that's funny, tell me another one"
{{}}

Message: "actually I moved to Hyderabad last month, my dog Simba came too"
{{"city": "Hyderabad", "pet": "dog named Simba"}}

Now extract from this message:
\"\"\"{message}\"\"\""""


def _parse_json(raw: str) -> dict:
    """Small models wrap JSON in fences or chatter. Dig it out."""
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return {}
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items() if v not in (None, "", [], {})}


# Gemma 4 always "thinks"; leave room for the reasoning *and* the JSON.
MAX_TOKENS = 1024


def extract_facts(message: str) -> dict:
    """Blocking version, for cli.py / app.py / smoke_test.py.

    Returns {} on any failure — memory extraction must never break the chat.
    """
    try:
        raw = generate(PROMPT.format(message=message), model=EXTRACT_MODEL,
                       temperature=0.0, max_tokens=MAX_TOKENS)
        return _parse_json(raw)
    except Exception as e:
        print(f"[extractor] {type(e).__name__}: {e}", file=sys.stderr)
        return {}


async def extract_facts_async(message: str) -> dict:
    """Async version, so the server can run this concurrently with the reply."""
    try:
        raw = await generate_async(PROMPT.format(message=message), model=EXTRACT_MODEL,
                                   temperature=0.0, max_tokens=MAX_TOKENS)
        return _parse_json(raw)
    except Exception as e:
        print(f"[extractor] {type(e).__name__}: {e}", file=sys.stderr)
        return {}
