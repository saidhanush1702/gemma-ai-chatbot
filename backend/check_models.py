"""Step 3: find out which Gemma models THIS key can actually use.

Run:  python check_models.py
"""
import os
import sys

from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    sys.exit("No GEMINI_API_KEY found. Copy .env.example to .env and paste your key in.")

client = genai.Client(api_key=api_key)

print("=== Models your key can list ===")
gemma = []
for m in client.models.list():
    actions = getattr(m, "supported_actions", None) or []
    if "generateContent" not in actions:
        continue
    name = m.name.replace("models/", "")
    if "gemma" in name.lower():
        gemma.append(name)
        print(f"  [GEMMA] {name}")

if not gemma:
    print("  (no Gemma models listed for this key)")

print(f"\n=== Live test: can we actually call them? ===")
for name in gemma:
    try:
        r = client.models.generate_content(
            model=name,
            contents="Reply with exactly one word: pong",
        )
        print(f"  OK    {name}  -> {r.text.strip()[:40]!r}")
    except Exception as e:
        print(f"  FAIL  {name}  -> {type(e).__name__}: {str(e)[:120]}")
