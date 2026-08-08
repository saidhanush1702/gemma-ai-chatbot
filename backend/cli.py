"""Terminal version.  Run:  python cli.py

Commands:  /memory   /forget [key]   /quit
"""
import memory
from extractor import extract_facts
from llm import CHAT_MODEL, chat

USER = "local-cli"  # the terminal client always uses this memory bucket

history = []

print(f"Gemma chatbot ({CHAT_MODEL}). /memory  /forget  /quit\n")

while True:
    try:
        user = input("you> ").strip()
    except (EOFError, KeyboardInterrupt):
        break
    if not user:
        continue

    if user in ("/quit", "/exit"):
        break
    if user == "/memory":
        print(memory.as_prompt_block(USER), "\n")
        continue
    if user.startswith("/forget"):
        key = user[len("/forget"):].strip()
        memory.forget(USER, key or None)
        print(f"forgot {key or 'everything'}\n")
        continue

    history.append({"role": "user", "content": user})

    new_facts = extract_facts(user)
    if new_facts:
        memory.save_facts(USER, new_facts)
        print(f"  [learned: {new_facts}]")

    try:
        reply = chat(history, memory.as_prompt_block(USER))
    except Exception as e:
        reply = f"API error: {type(e).__name__}: {e}"

    history.append({"role": "assistant", "content": reply})
    print(f"bot> {reply}\n")
