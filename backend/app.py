"""Streamlit UI.  Run:  streamlit run app.py"""
import streamlit as st

import memory
from extractor import extract_facts
from llm import CHAT_MODEL, chat

st.set_page_config(page_title="Gemma Chatbot with Memory", page_icon="🧠")

USER = "local-streamlit"  # this client always uses one memory bucket

if "history" not in st.session_state:
    st.session_state.history = []
if "last_extracted" not in st.session_state:
    st.session_state.last_extracted = {}

# ---------------- sidebar: the memory, made visible ----------------
with st.sidebar:
    st.header("🧠 Long-term memory")
    st.caption(f"model: `{CHAT_MODEL}`")

    facts = memory.get_facts(USER)
    if facts:
        for k, v in facts.items():
            col1, col2 = st.columns([5, 1])
            col1.markdown(f"**{k.replace('_', ' ')}**  \n{v}")
            if col2.button("✕", key=f"del_{k}", help="forget this"):
                memory.forget(USER, k)
                st.rerun()
    else:
        st.info("Nothing remembered yet. Try: *I'm Sai Dhanush*")

    if st.session_state.last_extracted:
        st.success(f"Just learned: {st.session_state.last_extracted}")

    st.divider()
    if st.button("Clear chat (keep memory)"):
        st.session_state.history = []
        st.rerun()
    if st.button("Wipe memory", type="primary"):
        memory.forget(USER)
        st.session_state.last_extracted = {}
        st.rerun()

# ---------------- chat ----------------
st.title("Gemma Chatbot")
st.caption("Facts you mention are stored permanently and re-injected every turn — "
           "so recall survives any number of messages.")

for msg in st.session_state.history:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if prompt := st.chat_input("Say something…"):
    st.session_state.history.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # 1. learn from this message
    new_facts = extract_facts(prompt)
    st.session_state.last_extracted = new_facts
    if new_facts:
        memory.save_facts(USER, new_facts)

    # 2. reply, with the full memory block in front of the model
    with st.chat_message("assistant"):
        with st.spinner(""):
            try:
                reply = chat(st.session_state.history, memory.as_prompt_block(USER))
            except Exception as e:
                reply = f"⚠️ API error: {type(e).__name__}: {e}"
        st.markdown(reply)

    st.session_state.history.append({"role": "assistant", "content": reply})
    st.rerun()
