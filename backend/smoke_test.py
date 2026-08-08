"""Proves long-term recall in ~30s.

The history window is shrunk to 2 turns so the name provably falls out of the
conversation, leaving the database as the only place it could come from.

Run:  python smoke_test.py
"""
import llm
import memory
from extractor import extract_facts

llm.HISTORY_TURNS = 2  # tiny window -> the name scrolls out fast

USER = "smoke-test"
memory.forget(USER)
history = []


def turn(msg, learn=True):
    history.append({"role": "user", "content": msg})
    if learn:
        facts = extract_facts(msg)
        if facts:
            memory.save_facts(USER, facts)
            print(f"   [learned] {facts}")
    reply = llm.chat(history, memory.as_prompt_block(USER))
    history.append({"role": "assistant", "content": reply})
    print(f"you> {msg}\nbot> {reply[:100]}\n")


turn("hey i am sai dhanush, i live in bangalore")
for q in ["capital of japan?", "what is 2+2?", "largest ocean?", "speed of light?"]:
    turn(q, learn=False)

print("--- the name is now outside the chat window ---")
print(memory.as_prompt_block(USER), "\n")
turn("what is my name?", learn=False)

memory.forget(USER)
