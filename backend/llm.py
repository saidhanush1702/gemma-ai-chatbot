"""Thin wrapper around the Gemma models on the Gemini API.

Async-first: the server fires the extractor and the chat call concurrently, which
roughly halves per-turn latency. That matters on Vercel, where a Hobby function is
capped at 60s and each Gemma call can take 10-25s.
"""
import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

CHAT_MODEL = os.getenv("CHAT_MODEL", "gemma-4-26b-a4b-it")
EXTRACT_MODEL = os.getenv("EXTRACT_MODEL", "gemma-4-26b-a4b-it")
HISTORY_TURNS = 10  # sliding window; long-term memory covers everything older

_api_key = os.getenv("GEMINI_API_KEY")
if not _api_key:
    raise RuntimeError("GEMINI_API_KEY missing. Copy .env.example to .env and add your key.")

client = genai.Client(api_key=_api_key)


PRIMER = """You are a helpful, warm assistant with long-term memory of this user.

Everything you remember about them is listed below. Treat it as true and use it
naturally in conversation. If they ask something these facts answer — their name,
their city, anything — answer directly and confidently. Never say you cannot
remember something that is listed here.

--- WHAT YOU REMEMBER ---
{memory}
-------------------------"""


def _config(temperature: float, max_tokens: int) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_tokens,
    )


def _budgets(max_tokens: int) -> tuple[int, int]:
    """Gemma 4 always "thinks" and it cannot be disabled — thinking_config is
    rejected with a 400. Those hidden tokens count against max_output_tokens, so
    if the budget only covers the thinking, `.text` comes back empty with no
    error. Retry once with double the room."""
    return max_tokens, max_tokens * 2


def generate(contents, model: str, temperature: float = 0.7,
             max_tokens: int = 2048) -> str:
    """Blocking call, for cli.py / app.py / smoke_test.py.

    Deliberately uses the SDK's *sync* client rather than wrapping the async one
    in asyncio.run(). Each asyncio.run() opens and closes its own event loop,
    while the async client's httpx pool stays bound to the first one — so the
    second call dies with "Event loop is closed".
    """
    for budget in _budgets(max_tokens):
        resp = client.models.generate_content(
            model=model, contents=contents, config=_config(temperature, budget)
        )
        if text := (resp.text or "").strip():
            return text
    return ""


async def generate_async(contents, model: str, temperature: float = 0.7,
                         max_tokens: int = 2048) -> str:
    """Async twin of generate(), used by the FastAPI server so the extractor and
    the chat call can run concurrently.

    Note the other Gemma quirk handled by the caller: no system_instruction
    support, so the memory block rides in `contents` (see build_contents).
    """
    for budget in _budgets(max_tokens):
        resp = await client.aio.models.generate_content(
            model=model, contents=contents, config=_config(temperature, budget)
        )
        if text := (resp.text or "").strip():
            return text
    return ""


def build_contents(history: list[dict], memory_block: str) -> list[dict]:
    """Prompt shape:  [primer + memory] [ack] [...last N turns]

    The memory block is rebuilt every single turn, so recall never decays.
    """
    contents = [
        {"role": "user", "parts": [{"text": PRIMER.format(memory=memory_block)}]},
        {"role": "model", "parts": [{"text": "Understood. I'll keep all of that in mind."}]},
    ]
    for msg in history[-HISTORY_TURNS * 2:]:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})
    return contents


def chat(history: list[dict], memory_block: str) -> str:
    """history: [{"role": "user"|"assistant", "content": str}, ...]"""
    return generate(build_contents(history, memory_block), model=CHAT_MODEL)


async def chat_async(history: list[dict], memory_block: str) -> str:
    return await generate_async(build_contents(history, memory_block), model=CHAT_MODEL)
