# Gemma Chatbot with Long-Term Memory

A chatbot built on Google's **Gemma 4** that remembers facts about you *permanently*.
 
Tell it your name, chat about anything else for as long as you like, then ask
"what's my name?" — it answers correctly. Not because the conversation fits in the
context window, but because the fact was extracted, stored in a database, and
re-injected into every single prompt.

```
React + Tailwind  ──►  FastAPI  ──►  Gemma 4 (Google AI Studio)
                          │
                          └──►  Postgres / Neon  (long-term memory)
```

Everything in the stack has a permanent free tier. No credit card anywhere.

---

## The problem this solves

The naive approach is to send the whole chat history to the model each turn. That
breaks in two ways:

1. **It runs out.** Every model has a context limit. Past it, the oldest messages —
   including "I'm Sai Dhanush" — get dropped.
2. **It gets expensive and slow.** You resend the entire conversation every turn.

Truncating to "the last N messages" makes the first problem worse, not better: the
name is usually stated in message #1, the exact message truncation throws away first.

## The solution

Separate **what was said** from **what is true**.

Every turn makes two calls to Gemma:

| # | Call | Purpose |
|---|------|---------|
| 1 | **Extractor** | Reads only the newest user message. Returns JSON of durable facts, e.g. `{"name": "Sai Dhanush"}`. Temperature 0. |
| 2 | **Chat** | Generates the reply, with *all* stored facts prepended to the prompt. |

Facts go to Postgres. Chat history stays client-side and is trimmed to the last 10
turns. So the prompt sent to Gemma always looks like this:

```
--- WHAT YOU REMEMBER ---
- city: Bangalore
- name: Sai Dhanush
-------------------------

[last 10 turns of conversation]

User: what's my name?
```

The memory block is rebuilt from scratch on **every** turn. Turn 500 behaves exactly
like turn 2 — recall never decays.

### The two calls run concurrently

They're fired together with `asyncio.gather`, roughly halving per-turn latency:

```python
learned, reply = await asyncio.gather(
    extract_facts_async(latest),
    chat_async(history, memory_block),
)
```

This is safe even though extraction hasn't finished when the reply is generated. The
newest message is already in `history`, so a fact stated *this* turn is visible to
the chat call directly. Long-term memory only has to carry facts from *earlier* turns.

It also matters practically: Gemma calls take 10–25s each, and a Vercel Hobby
function is capped at 60s. Sequential calls would run uncomfortably close to that.

---

## Where the long-term memory is stored

**A Postgres database — [Neon](https://neon.tech)'s free tier.** One table:

```sql
CREATE TABLE facts (
    user_id    TEXT NOT NULL,        -- per-browser UUID
    key        TEXT NOT NULL,        -- "name", "city", "job"
    value      TEXT NOT NULL,        -- "Sai Dhanush", "Bangalore"
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);
```

The composite primary key does real work: **restating a fact overwrites it**. Say
"I moved to Hyderabad" and the `city` row updates in place via `ON CONFLICT ... DO
UPDATE` instead of creating a duplicate.

Neon's free plan gives 0.5 GB of storage and 100 compute-hours per month, with no
credit card, and scales to zero after 5 minutes idle. This table holds a few KB.

### Why not SQLite?

The first version used a local `memory.db` file, which is ideal for local
development and **completely broken on serverless**. Vercel functions get a fresh,
read-only filesystem on every cold start (except `/tmp`, which is also wiped), so
the database would vanish constantly. Moving to hosted Postgres was the one change
deployment actually forced.

`memory.py` is the only file that touches storage, so the swap was contained to it.

### Why `user_id`

Without it there is a single global memory: deploy publicly, and the next visitor
is greeted as Sai Dhanush. The frontend generates a UUID once with
`crypto.randomUUID()`, stores it in `localStorage`, and sends it as the `X-User-Id`
header on every request.

This is **identity, not authentication** — it separates visitors, it doesn't secure
anything. Clearing site data starts a fresh memory. Real accounts would mean swapping
the header for a signed session.

Inspect the store directly:

```bash
cd backend && python -c "import memory; print(memory.get_facts('some-user-id'))"
```

---

## Setup

### 1. Gemma API key (free)

[aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**.
Gemma models are free; no billing account needed.

### 2. Neon database (free)

1. Sign up at [neon.tech](https://neon.tech) — no credit card
2. Create a project (any name, any region — pick one near you)
3. Copy the **pooled** connection string (the host contains `-pooler`)

Pooled matters: serverless functions open a connection per invocation, and the
pooler is what stops that from exhausting Postgres' connection limit.

### 3. Environment

Copy `backend/.env.example` to `backend/.env` and fill in both values:

```
GEMINI_API_KEY=AIza...
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

### 4. Install

```bash
cd backend && pip install -r requirements.txt
```

```bash
cd frontend && npm install
```

Confirm which Gemma models your key can reach:

```bash
cd backend && python check_models.py
```

---

## Running locally

Two terminals, both at once.

**Terminal 1 — backend** (http://127.0.0.1:8010)

```bash
cd backend && python -m uvicorn server:app --reload --port 8010
```

**Terminal 2 — frontend** (http://127.0.0.1:5174)

```bash
cd frontend && npm run dev
```

Open **http://127.0.0.1:5174**. Vite proxies `/api/*` to the backend, so there's
nothing else to configure. The table is created automatically on first request.

> Ports are 8010 and 5174 rather than the usual 8000 and 5173, to avoid clashing
> with other projects running locally.

### Alternative front-ends

Neither needs the FastAPI server — they import the Python modules directly:

```bash
cd backend && streamlit run app.py
```

```bash
cd backend && python cli.py
```

The CLI supports `/memory`, `/forget <key>`, `/forget`, and `/quit`.

---

## Deploying to Vercel

The repo is already configured — `vercel.json` builds the React app as static files
and runs FastAPI as a Python serverless function on the same domain, so there's no
CORS and no second host to manage.

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "functions": {
    "api/index.py": { "maxDuration": 60, "includeFiles": "backend/**" }
  },
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index" }]
}
```

`api/index.py` is a five-line shim that puts `backend/` on `sys.path` and re-exports
the FastAPI `app`, so the same code runs locally under uvicorn and on Vercel.

**Steps:**

1. Push the repo to GitHub.
2. On [vercel.com](https://vercel.com), **Add New → Project**, import the repo, and
   deploy with the default settings — `vercel.json` supplies the rest.
3. In **Settings → Environment Variables**, add both secrets:
   - `GEMINI_API_KEY`
   - `DATABASE_URL` (the same pooled Neon string)
4. Redeploy so the variables take effect.

`.env` is gitignored and must never be committed — Vercel's environment variables
are where the deployed app gets its secrets.

**If a request times out:** Gemma occasionally exceeds 60s under load. Enable
**Fluid compute** in project settings, which raises the Hobby ceiling to 300s.

### Why not Netlify?

Netlify Functions run JavaScript/TypeScript and Go — not Python. Its Python support
is build-time only (`PYTHON_VERSION` for build scripts), not a function runtime.
Deploying there would mean porting the entire backend to JavaScript. Vercel supports
FastAPI natively.

---

## Testing the main feature

1. Type **"Hi, I'm Sai Dhanush"** — a green `remembered · name: Sai Dhanush` badge
   appears, and the count on the 🧠 button in the header ticks up.
2. Talk about anything else for 15–20 messages, or just press **Clear chat**.
3. Ask **"What's my name?"** → *"Your name is Sai Dhanush."*

"Clear chat · keep memory" is the sharpest demo: it wipes the conversation entirely,
so the model has *zero* history — and it still answers correctly.

Automated proof, in ~30 seconds, by shrinking the window to 2 turns so the name
provably falls out:

```bash
cd backend && python smoke_test.py
```

---

## Project layout

```
gemma-chatbot/
├── vercel.json            build + routing + function config
├── requirements.txt       deps for the Vercel function
├── api/
│   └── index.py           serverless entry point (re-exports backend/server.py)
├── backend/
│   ├── server.py          FastAPI — /api/chat, /api/memory, /api/health
│   ├── llm.py             Gemma client, prompt assembly, history window
│   ├── extractor.py       "message → JSON facts" call + tolerant JSON parsing
│   ├── memory.py          Postgres store: save_fact, get_facts, forget
│   ├── app.py             Streamlit UI (alternative front-end)
│   ├── cli.py             terminal UI (alternative front-end)
│   ├── check_models.py    lists + live-tests the Gemma models your key can use
│   ├── smoke_test.py      automated proof of long-term recall
│   └── .env               secrets (gitignored)
└── frontend/
    ├── src/App.jsx        entire chat UI + localStorage identity
    ├── src/index.css      Tailwind v4 entry + animations
    └── vite.config.js     Tailwind plugin + /api proxy to :8010
```

## API

Every route reads the `X-User-Id` header and scopes to that user.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/health` | Liveness + the active model id |
| `GET` | `/api/memory` | This user's stored facts |
| `POST` | `/api/chat` | `{history}` → `{reply, learned, memory}` |
| `DELETE` | `/api/memory/{key}` | Forget one fact |
| `DELETE` | `/api/memory` | Wipe this user's facts |

---

## Three bugs worth knowing about

All three cost real debugging time; all three are handled in `llm.py`.

**1. Gemma does not support `system_instruction`.**
The Gemini API rejects it for Gemma models, so the memory block cannot be a system
prompt. Instead it's sent as a priming user turn followed by a short model
acknowledgement — same effect, supported everywhere:

```python
contents = [
    {"role": "user",  "parts": [{"text": PRIMER.format(memory=...)}]},
    {"role": "model", "parts": [{"text": "Understood. I'll keep all of that in mind."}]},
    ...conversation...
]
```

**2. Gemma 4 always "thinks", and it cannot be turned off.**
Passing `thinking_config` returns `400 INVALID_ARGUMENT: Thinking budget is not
supported for this model`. Those hidden reasoning tokens still count against
`max_output_tokens`.

This causes a nasty silent failure: with a 256-token cap, the extractor spent all
256 tokens reasoning, produced no visible output, and `response.text` came back as an
**empty string** — so no facts were ever saved, with no error anywhere.

The fix is a generous budget plus a retry at double the budget if the text comes
back empty:

```python
for budget in _budgets(max_tokens):
    resp = client.models.generate_content(..., config=_config(temperature, budget))
    if text := (resp.text or "").strip():
        return text
```

**3. `asyncio.run()` per call breaks a shared async HTTP client.**
Once the server went async, the CLI and Streamlit front-ends needed a blocking
path, and the obvious shortcut was to wrap the async function:

```python
def chat(history, memory_block):          # looks fine, fails on the 2nd call
    return asyncio.run(chat_async(history, memory_block))
```

The first call worked. The second died with `RuntimeError: Event loop is closed`,
thrown from deep inside httpx's connection pool.

`asyncio.run()` creates a fresh event loop and closes it on return, but
`client.aio` keeps a pooled httpx connection bound to whichever loop was running
when it was created. On the next call the pool tries to reuse a socket registered
to a loop that no longer exists.

The fix isn't to juggle loops — it's to stop pretending one client can serve both
worlds. `generate()` uses the SDK's sync client, `generate_async()` uses the async
one, and they share only the config and retry helpers.

---

## Design decisions

- **Key/value facts, not vector search.** For personal attributes an embedding store
  adds a dependency and fuzzy retrieval where an exact lookup is strictly better.
  Overwriting by key also gives correct update semantics for free.
- **Extraction at temperature 0**, with few-shot examples showing the empty case
  (`"what is my name?"` → `{}`) so questions aren't misread as statements.
- **Extraction never breaks the chat.** `extract_facts_async` catches everything and
  returns `{}`, logging to stderr. A memory failure degrades recall; it doesn't drop
  the reply.
- **Tolerant JSON parsing.** Small models wrap JSON in markdown fences or add
  chatter, so the parser strips fences and regex-extracts the outermost `{...}`.
- **The memory is inspectable in the UI.** The 🧠 button in the header opens a panel
  showing exactly what the model was told, which makes the mechanism visible rather
  than magic. An ⓘ button beside it explains the architecture in plain language.

## Possible extensions

- Real authentication, replacing the localStorage UUID with a signed session
- Semantic memory (embeddings) for free-form facts that don't fit key/value
- Streaming responses via SSE, so replies appear token by token
- Confidence scores, and letting the model retire stale facts
