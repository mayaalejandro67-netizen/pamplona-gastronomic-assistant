"""
Streamlit frontend for the Pamplona Gastronomic Assistant.
Run with: streamlit run app.py
"""
import logging

import streamlit as st
from langchain_core.messages import AIMessage, HumanMessage

from src import config
from src.errors import describe_error
from src.ingest import IngestionError, build_vectorstore, load_restaurant_catalog
from src.rag_chain import answer_question, filter_cited_sources, get_condense_llm, get_llm

logger = logging.getLogger(__name__)

st.set_page_config(page_title="Pamplona Gastronomic Assistant", page_icon="🍴")

st.title("🍴 Pamplona Gastronomic Assistant")
st.caption("Ask me about restaurants in Pamplona. I only answer from the documents I was given, if something isn't in there, I'll say so instead of guessing.")

if not config.GOOGLE_API_KEY:
    st.error("No GOOGLE_API_KEY found. Copy `.env.example` to `.env` and add your free Gemini API key (from https://aistudio.google.com/apikey) before running the app.")
    st.stop()


@st.cache_resource(show_spinner="Indexing restaurant documents, one moment...")
def load_knowledge_base():
    vectordb = build_vectorstore(force_rebuild=False)
    catalog = load_restaurant_catalog()
    return vectordb, catalog


try:
    vectordb, catalog = load_knowledge_base()
except IngestionError as exc:
    st.error(f"Couldn't prepare the knowledge base: {exc}")
    st.stop()
except Exception as exc:  # Gemini/network errors arrive wrapped in several exception types
    logger.exception("Indexing failed")
    st.error(f"Couldn't build the knowledge base. {describe_error(exc)}")
    st.stop()

llm = get_llm()
condense_llm = get_condense_llm()

if "messages" not in st.session_state:
    st.session_state.messages = []  # what's shown on screen: [{"role", "content"}]
if "lc_history" not in st.session_state:
    st.session_state.lc_history = []  # what's fed back into the chain: [HumanMessage|AIMessage]

with st.sidebar:
    st.header("About")
    st.write("This assistant only answers using the restaurant PDFs placed in the `data/` folder. It will not make up information that isn't in those documents.")
    if st.button("🔄 Reset conversation"):
        st.session_state.messages = []
        st.session_state.lc_history = []
        st.rerun()
    if st.button("♻️ Rebuild index from data/"):
        try:
            with st.spinner("Rebuilding index..."):
                build_vectorstore(force_rebuild=True)
            st.cache_resource.clear()
            st.session_state.sidebar_notice = ("success", "Index rebuilt from `data/`.")
        except IngestionError as exc:
            st.session_state.sidebar_notice = ("error", str(exc))
        except Exception as exc:
            logger.exception("Rebuilding the index failed")
            st.session_state.sidebar_notice = ("error", describe_error(exc))
        st.rerun()

    notice = st.session_state.pop("sidebar_notice", None)
    if notice:
        kind, text = notice
        getattr(st, kind)(text)

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg.get("sources"):
            st.caption("📄 Based on: " + ", ".join(msg["sources"]))

user_input = st.chat_input("Ask about restaurants, dishes, ingredients, prices...")

if user_input:
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    with st.chat_message("assistant"):
        retrieved_sources: list[tuple[str, str]] = []
        sources: list[str] = []
        answer = ""
        failed = False  # True if Gemini/network failed: shown to the user, but NOT stored as bot memory
        try:
            # Only the routing + retrieval step happens inside the spinner;
            # the grounded answer itself is streamed below.
            with st.spinner("Thinking...", show_time=True):
                answer_or_stream, retrieved_sources = answer_question(
                    llm=llm,
                    condense_llm=condense_llm,
                    vectordb=vectordb,
                    question=user_input,
                    chat_history=st.session_state.lc_history,
                    catalog=catalog,
                )
            if isinstance(answer_or_stream, str):
                answer = answer_or_stream
                st.markdown(answer)
            else:
                answer = st.write_stream(answer_or_stream)
        except Exception as exc:  # last-resort guard so the UI never shows a traceback
            logger.exception("Answering failed")
            failed = True
            retrieved_sources = []
            error_msg = f"⚠️ {describe_error(exc)}"
            st.warning(error_msg)
            answer = error_msg

        # Only show PDFs actually referenced in the answer (and never on fallbacks).
        sources = filter_cited_sources(answer, retrieved_sources)
        if sources:
            st.caption("📄 Based on: " + ", ".join(sources))

    st.session_state.messages.append({"role": "assistant", "content": answer, "sources": sources})
    if not failed:
        # Only real exchanges go into the LLM's memory; error notices would
        # otherwise be fed back to the model as if the assistant had said them.
        st.session_state.lc_history.append(HumanMessage(content=user_input))
        st.session_state.lc_history.append(AIMessage(content=answer))
