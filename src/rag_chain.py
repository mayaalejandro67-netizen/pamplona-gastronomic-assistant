"""
Conversational RAG pipeline for the Pamplona Gastronomic Assistant.

Architecture (3 layers against hallucinations):
  1. Intent router & question condenser (`CONDENSE_LLM_MODEL`, fast/cheap):
     Classifies each message into `greeting`, `off_topic`, or
     `restaurant_query`, detects the user's language, and rewrites follow-ups
     (e.g. "And does it have desserts?") into standalone queries using a
     bounded window of recent chat history. Greetings get a friendly reply
     with no fake sources; clearly off-topic or nonsensical inputs are
     rejected immediately without calling the answer model.
  2. Semantic retrieval + calibrated score cutoff (`SCORE_THRESHOLD`):
     Queries Chroma using cosine relevance scores and discards chunks below
     the threshold. If no chunk survives, returns the deterministic fallback
     in the user's language without invoking the answer LLM.
  3. Strict grounding prompt + restaurant directory (`LLM_MODEL`, streamed):
     Streams the final answer using ONLY the retrieved PDF chunks and a
     compact directory of the 20 indexed restaurants (extracted directly from
     the PDFs so global/listing questions also work). If the context still
     lacks the requested detail (e.g. opening hours or phone numbers), the
     model outputs the exact fallback sentence, and the UI hides source tags.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterator, List, Optional, Tuple, Union

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI

from . import config
from .ingest import load_restaurant_catalog

FALLBACK_MESSAGES = {
    "es": (
        "No tengo esa información en los documentos de restaurantes que me han "
        "proporcionado. ¿Puedes preguntarme otra cosa sobre los restaurantes de Pamplona?"
    ),
    "en": (
        "I don't have that information in the restaurant documents I was given. "
        "Could you try asking something else about Pamplona's restaurants?"
    ),
}

OFF_TOPIC_MESSAGES = {
    "es": (
        "No tengo esa información en los documentos de restaurantes que me han "
        "proporcionado. Solo puedo ayudarte con preguntas sobre los restaurantes, "
        "platos y precios de mi guía gastronómica de Pamplona."
    ),
    "en": (
        "I don't have that information in the restaurant documents I was given. "
        "I can only help with questions about the restaurants, dishes, and prices "
        "in my Pamplona gastronomic guide."
    ),
}

_DEFAULT_GREETING = {
    "es": (
        "¡Hola! Soy Pamplona Bites, tu asistente gastronómico de Pamplona. "
        "Pregúntame sobre restaurantes, platos, ingredientes o precios de mi guía."
    ),
    "en": (
        "Hi! I'm Pamplona Bites, your gastronomic guide for Pamplona. "
        "Ask me about the restaurants, dishes, ingredients, or prices in my guide."
    ),
}

_FALLBACK_PREFIXES = (
    "no tengo esa información en los documentos",
    "i don't have that information in the restaurant documents",
)

ROUTER_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are the query router and rewriter for "Pamplona Bites", a gastronomic chatbot \
that answers questions about Pamplona & Navarra restaurants from a set of PDF guides.

Analyze the user's latest message together with the conversation history and output ONLY a valid \
JSON object with these four keys (no markdown fences, no extra text):
- "intent": one of "greeting", "off_topic", or "restaurant_query".
  * "greeting": greetings, farewells, thanks, or questions asking who you are / what you can do \
(e.g. "Hola", "Gracias!", "Hi", "What can you help me with?").
  * "off_topic": nonsensical text / random characters (e.g. "asdfgh qwerty", "???"), OR \
questions clearly unrelated to food, dining, restaurants, dishes, menus, or gastronomy \
(e.g. country capitals, weather, sports, math, programming, general trivia).
  * "restaurant_query": ANY question about restaurants, bars, cafes, dishes, desserts, menus, \
ingredients, prices, cuisines, chefs, locations, recommendations, listing the restaurants in \
the guide, OR follow-up questions referring to a previous restaurant/dish (e.g. "And desserts?", \
"How much is it?"). Also use "restaurant_query" for food/restaurant questions whose answer \
might not be in the documents (e.g. opening hours, phone numbers, McDonald's) so the retrieval \
step verifies them against the documents.
- "language": "es" if the latest message is in Spanish, "en" if in English (for ambiguous \
gibberish, match the language of the recent conversation, defaulting to "es").
- "standalone_question": for "restaurant_query", rewrite the latest message as a standalone \
question resolving pronouns/references from chat history (e.g. "And desserts?" -> "Does Café \
Iruña have desserts?"). Keep the same language as the user. Leave "" for other intents.
- "reply": ONLY for "greeting", write a brief, warm 1-2 sentence response in the user's \
language inviting them to ask about Pamplona's restaurants. Leave "" for other intents.""",
        ),
        MessagesPlaceholder("chat_history"),
        ("human", "{question}"),
    ]
)

ANSWER_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are "Pamplona Bites", a friendly gastronomic guide assistant for Pamplona, Spain.

Answer the user's question using ONLY the information in the RESTAURANT DIRECTORY and CONTEXT \
sections below, which come strictly from the provided local restaurant PDF documents.

Follow these rules strictly:
1. If the provided sections do not contain enough information to answer the question (for \
example: opening hours, phone numbers, addresses not listed, reservations, or restaurants not \
in the documents), reply with EXACTLY this sentence and nothing else:
{fallback}
   Never invent, guess, or use outside/general knowledge to fill gaps.
2. When answering, mention the specific restaurant name(s) your answer is based on.
3. For global questions ("what restaurants do you have?", "which ones are in Lekunberri?", \
"which burger places exist?"), use the RESTAURANT DIRECTORY below so no restaurant is missed.
4. For superlatives across all menus (e.g. "cheapest dish overall"), clarify that your answer \
only compares the dishes present in the retrieved excerpts unless all menus are shown.
5. Keep answers concise, natural, and scannable. When recommending 2 or more restaurants, \
write ONLY a brief 1-2 sentence overview (maximum ~45 words) naming the matching restaurants \
clearly — do NOT write long paragraphs or list every dish, because the UI automatically renders \
detailed cards with photos, prices, and menus for each restaurant right below your message. \
Only list full menus or dish prices when the user specifically asks for dishes, prices, or a \
detailed comparison. Do NOT start follow-up replies with "Hola!" or "Hi!" once the conversation \
is underway.
6. CRITICAL LANGUAGE RULE: You MUST write your ENTIRE response in {response_language}, even \
though the CONTEXT and RESTAURANT DIRECTORY are written in Spanish (you may keep proper \
restaurant or dish names as written).

RESTAURANT DIRECTORY (extracted from the provided PDFs):
{catalog}

CONTEXT (retrieved document excerpts):
{context}""",
        ),
        MessagesPlaceholder("chat_history"),
        ("human", "{question}"),
    ]
)


@dataclass
class QueryAnalysis:
    intent: str  # "greeting" | "off_topic" | "restaurant_query"
    language: str  # "es" | "en"
    standalone_question: str
    reply: str = ""


def get_fallback_message(language: str = "es") -> str:
    return FALLBACK_MESSAGES.get(language, FALLBACK_MESSAGES["en"])


def is_fallback_answer(text: str) -> bool:
    """Return True when the assistant replied with a 'not in documents' fallback."""
    normalized = text.strip().strip('"').strip("'").lower()
    return any(normalized.startswith(prefix) for prefix in _FALLBACK_PREFIXES)


def _normalize_text(text: str) -> str:
    """Lowercase and strip accents for robust name matching."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def filter_cited_sources(
    answer: str,
    retrieved_docs_info: List[Tuple[str, str]],
    all_restaurants_info: Optional[List[Tuple[str, str]]] = None,
) -> List[str]:
    """Keep only sources whose restaurant name actually appears in the answer.

    Checks both the retrieved chunks AND (when provided) the full grounded
    restaurant directory so a venue recommended from the directory is never
    dropped from the UI cards or map pins. If none match by name (e.g. a very
    short reply), falls back to the retrieved sources.
    """
    if is_fallback_answer(answer):
        return []
    candidates = list(retrieved_docs_info)
    if all_restaurants_info:
        candidates.extend(all_restaurants_info)
    if not candidates:
        return []

    answer_norm = _normalize_text(answer)
    matched: set[str] = set()
    for restaurant, source in candidates:
        name_norm = _normalize_text(restaurant)
        # Also match without generic prefixes ("Restaurante Europa" -> "europa").
        short_norm = re.sub(r"^(?:restaurante|asador|sidreria|meson|cafe)\s+", "", name_norm).strip()
        if (name_norm and name_norm in answer_norm) or (len(short_norm) >= 4 and short_norm in answer_norm):
            matched.add(source)
    if matched:
        return sorted(matched)
    return sorted({source for _, source in retrieved_docs_info})


def get_llm() -> ChatGoogleGenerativeAI:
    """The model that writes the final answer streamed to the user."""
    return ChatGoogleGenerativeAI(
        model=config.LLM_MODEL,
        temperature=config.TEMPERATURE,
        google_api_key=config.GOOGLE_API_KEY,
    )


def get_condense_llm() -> ChatGoogleGenerativeAI:
    """Faster/cheaper model for the internal intent-routing and question-rewrite step."""
    return ChatGoogleGenerativeAI(
        model=config.CONDENSE_LLM_MODEL,
        temperature=0,
        google_api_key=config.GOOGLE_API_KEY,
    )


def _trim_history(chat_history: List[BaseMessage]) -> List[BaseMessage]:
    """Keep only the most recent MAX_HISTORY_TURNS user/assistant exchanges."""
    max_messages = max(0, config.MAX_HISTORY_TURNS) * 2
    if max_messages == 0:
        return []
    return chat_history[-max_messages:]


def _guess_language(text: str) -> str:
    """Tiny heuristic used only if the router's JSON can't be parsed."""
    lowered = text.lower()
    if any(ch in lowered for ch in "¿¡áéíóúñ") or re.search(
        r"\b(hola|qué|que|dónde|donde|cuánto|cuanto|tiene|hay|restaurantes|platos|gracias)\b",
        lowered,
    ):
        return "es"
    return "en"


def _analyze_query(
    condense_llm: ChatGoogleGenerativeAI,
    question: str,
    chat_history: List[BaseMessage],
) -> QueryAnalysis:
    """Classify intent, detect language, and rewrite follow-up questions in one fast call."""
    chain = ROUTER_PROMPT | condense_llm | StrOutputParser()
    raw = chain.invoke({"question": question, "chat_history": chat_history}).strip()

    # Strip optional ```json ... ``` fences in case the model wraps its JSON.
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.DOTALL).strip()
    try:
        data = json.loads(cleaned)
        intent = data.get("intent", "restaurant_query")
        if intent not in ("greeting", "off_topic", "restaurant_query"):
            intent = "restaurant_query"
        lang = "es" if str(data.get("language", "")).lower().startswith("es") else "en"
        standalone = str(data.get("standalone_question") or "").strip() or question
        reply = str(data.get("reply") or "").strip()
        return QueryAnalysis(
            intent=intent,
            language=lang,
            standalone_question=standalone,
            reply=reply,
        )
    except (ValueError, TypeError, AttributeError):
        return QueryAnalysis(
            intent="restaurant_query",
            language=_guess_language(question),
            standalone_question=question,
        )


def _retrieve_relevant_docs(vectordb: Chroma, query: str) -> List[Document]:
    """Similarity search with a calibrated cosine relevance-score cutoff."""
    results = vectordb.similarity_search_with_relevance_scores(query, k=config.TOP_K)
    return [doc for doc, score in results if score >= config.SCORE_THRESHOLD]


def _format_docs(docs: List[Document]) -> str:
    blocks = []
    for doc in docs:
        restaurant = doc.metadata.get("restaurant", "Unknown restaurant")
        source = doc.metadata.get("source", "unknown document")
        blocks.append(f"[Restaurante: {restaurant} | Archivo: {source}]\n{doc.page_content}")
    return "\n\n---\n\n".join(blocks)


def answer_question(
    llm: ChatGoogleGenerativeAI,
    condense_llm: ChatGoogleGenerativeAI,
    vectordb: Chroma,
    question: str,
    chat_history: List[BaseMessage],
    catalog: Optional[str] = None,
) -> Tuple[Union[str, Iterator[str]], List[Tuple[str, str]]]:
    """Run one full turn of the conversational RAG pipeline.

    Returns `(answer, retrieved_sources)`:
      - `answer` is either a plain `str` (greeting, off-topic/no-info fallback,
        empty input) or a streaming `Iterator[str]` for a grounded answer.
      - `retrieved_sources` is a list of `(restaurant_name, filename)` pairs
        for the retrieved chunks; pass it with the finished answer text to
        `filter_cited_sources()` to display only the PDFs actually used.
    """
    if not question or not question.strip():
        return "Escribe una pregunta sobre los restaurantes de Pamplona. 🙂", []

    recent_history = _trim_history(chat_history)
    analysis = _analyze_query(condense_llm, question, recent_history)

    if analysis.intent == "greeting":
        reply = analysis.reply or _DEFAULT_GREETING.get(analysis.language, _DEFAULT_GREETING["en"])
        return reply, []

    if analysis.intent == "off_topic":
        return OFF_TOPIC_MESSAGES.get(analysis.language, OFF_TOPIC_MESSAGES["en"]), []

    docs = _retrieve_relevant_docs(vectordb, analysis.standalone_question)
    if not docs:
        return get_fallback_message(analysis.language), []

    context = _format_docs(docs)
    # Keep (restaurant_name, filename) pairs so callers can filter out unused
    # neighbor chunks once the streamed answer finishes.
    retrieved_info = sorted(
        {(doc.metadata.get("restaurant", ""), doc.metadata.get("source", "unknown document")) for doc in docs}
    )
    directory = catalog if catalog is not None else load_restaurant_catalog()
    fallback = get_fallback_message(analysis.language)
    response_language = "Spanish" if analysis.language == "es" else "English"

    answer_chain = ANSWER_PROMPT | llm | StrOutputParser()

    def _stream() -> Iterator[str]:
        yield from answer_chain.stream(
            {
                "question": question,
                "chat_history": recent_history,
                "context": context,
                "catalog": directory or "(not available)",
                "fallback": fallback,
                "response_language": response_language,
            }
        )

    return _stream(), retrieved_info
