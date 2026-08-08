"""FastAPI backend.

Local:
    cd backend && python -m uvicorn server:app --reload --port 8010

On Vercel this same `app` is imported by api/index.py and runs as a serverless
Python function.

Memory is scoped per user. The frontend generates a UUID once, keeps it in
localStorage, and sends it as the X-User-Id header — so two visitors to a
deployed demo never see each other's facts.
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import memory
from extractor import extract_facts_async
from llm import CHAT_MODEL, chat_async

ANON = "anonymous"  # fallback when no X-User-Id header is sent


@asynccontextmanager
async def lifespan(_: FastAPI):
    memory.init()  # CREATE TABLE IF NOT EXISTS, once per cold start
    yield


app = FastAPI(title="Gemma Chatbot API", lifespan=lifespan)

# Only needed for local dev, where Vite (5174) and the API (8010) are separate
# origins. In production both are served from the same Vercel domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    history: list[Message]


class ChatResponse(BaseModel):
    reply: str
    learned: dict
    memory: dict


@app.get("/api/health")
def health():
    return {"ok": True, "model": CHAT_MODEL}


@app.get("/api/memory")
def read_memory(x_user_id: str = Header(default=ANON)):
    return {"memory": memory.get_facts(x_user_id)}


@app.delete("/api/memory")
def wipe_memory(x_user_id: str = Header(default=ANON)):
    memory.forget(x_user_id)
    return {"memory": {}}


@app.delete("/api/memory/{key}")
def forget_one(key: str, x_user_id: str = Header(default=ANON)):
    memory.forget(x_user_id, key)
    return {"memory": memory.get_facts(x_user_id)}


@app.post("/api/chat", response_model=ChatResponse)
async def post_chat(req: ChatRequest, x_user_id: str = Header(default=ANON)):
    history = [m.model_dump() for m in req.history]
    latest = history[-1]["content"] if history else ""

    memory_block = memory.as_prompt_block(x_user_id)

    # Both Gemma calls run concurrently — ~2x faster per turn.
    #
    # Safe to extract and reply in parallel: the newest message is already in
    # `history`, so a fact stated this turn ("I'm Sai Dhanush") is visible to the
    # chat call directly. Memory only has to carry facts from *earlier* turns.
    learned, reply = await asyncio.gather(
        extract_facts_async(latest) if latest else _empty(),
        chat_async(history, memory_block),
    )

    if learned:
        memory.save_facts(x_user_id, learned)

    return ChatResponse(reply=reply, learned=learned, memory=memory.get_facts(x_user_id))


async def _empty() -> dict:
    return {}
