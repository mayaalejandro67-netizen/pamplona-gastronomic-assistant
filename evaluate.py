"""
Automated evaluation suite for the Pamplona Gastronomic Assistant.

Runs a representative battery of questions covering all project rubric
requirements (grounded lookup, multi-turn follow-up memory, missing attributes,
out-of-knowledge-base venues, aggregation queries, greetings, off-topic
questions, nonsensical input, and bilingual ES/EN behavior).

Usage:
    python evaluate.py
"""

from __future__ import annotations

import time
from typing import Callable, List, Tuple

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from src.ingest import build_vectorstore, load_restaurant_catalog
from src.rag_chain import (
    answer_question,
    filter_cited_sources,
    get_condense_llm,
    get_llm,
    is_fallback_answer,
)
from src.restaurants import load_structured_restaurants


def _ask(
    llm,
    condense_llm,
    vectordb,
    catalog: str,
    all_info: List[Tuple[str, str]],
    question: str,
    history: List[BaseMessage],
) -> Tuple[str, List[str], bool, float]:
    t0 = time.perf_counter()
    ans_or_stream, retrieved = answer_question(
        llm=llm,
        condense_llm=condense_llm,
        vectordb=vectordb,
        question=question,
        chat_history=history,
        catalog=catalog,
    )
    answer = ans_or_stream if isinstance(ans_or_stream, str) else "".join(ans_or_stream)
    elapsed = time.perf_counter() - t0
    sources = filter_cited_sources(answer, retrieved, all_info)
    return answer, sources, is_fallback_answer(answer), elapsed


def main() -> int:
    print("Loading vector store, catalog, and Gemini models...")
    vectordb = build_vectorstore()
    catalog = load_restaurant_catalog()
    restaurants = load_structured_restaurants()
    all_info = [(r["name"], r["source"]) for r in restaurants]
    llm = get_llm()
    condense_llm = get_condense_llm()

    # Each case: (label, question, reset_history, check_fn(answer, sources, is_fallback))
    cases: List[Tuple[str, str, bool, Callable[[str, List[str], bool], bool]]] = [
        (
            "Greeting (ES)",
            "Hola!",
            True,
            lambda a, s, fb: (not fb) and len(s) == 0 and len(a) > 5,
        ),
        (
            "Specific restaurant lookup",
            "¿Qué platos tiene el Café Iruña?",
            False,
            lambda a, s, fb: (not fb) and "16. Cafe_Iruna.pdf" in s and "iruna" in a.lower().replace("ñ", "n"),
        ),
        (
            "Multi-turn follow-up memory",
            "¿Y tiene algún postre?",
            False,
            lambda a, s, fb: (not fb) and "torrija" in a.lower() and "16. Cafe_Iruna.pdf" in s,
        ),
        (
            "Missing attribute (opening hours)",
            "¿Cuál es su horario de apertura?",
            False,
            lambda a, s, fb: fb and len(s) == 0 and "no tengo esa información" in a.lower(),
        ),
        (
            "Global aggregation (Lekunberri)",
            "¿Qué restaurantes hay en Lekunberri?",
            True,
            lambda a, s, fb: (not fb) and "epeleta" in a.lower() and "toki alai" in a.lower(),
        ),
        (
            "Venue not in documents",
            "¿Hay un McDonald's en tu guía?",
            True,
            lambda a, s, fb: fb and len(s) == 0,
        ),
        (
            "Out-of-context trivia",
            "¿Cuál es la capital de Francia?",
            True,
            lambda a, s, fb: fb and len(s) == 0 and "parís" not in a.lower() and "paris" not in a.lower(),
        ),
        (
            "Nonsensical input",
            "asdfgh qwerty",
            True,
            lambda a, s, fb: fb and len(s) == 0,
        ),
        (
            "English lookup (Babylon)",
            "What burgers does Babylon have?",
            True,
            lambda a, s, fb: (not fb) and "1. Babylon.pdf" in s and "babylon" in a.lower(),
        ),
        (
            "English follow-up missing info",
            "What is its phone number?",
            False,
            lambda a, s, fb: fb and len(s) == 0 and "don't have that information" in a.lower(),
        ),
    ]

    history: List[BaseMessage] = []
    passed = 0

    print("\nRunning evaluation suite (10 test cases)...\n" + "-" * 72)
    for label, question, reset, check in cases:
        if reset:
            history = []
        answer, sources, fb, elapsed = _ask(
            llm, condense_llm, vectordb, catalog, all_info, question, history
        )
        ok = check(answer, sources, fb)
        passed += int(ok)
        status = "PASS" if ok else "FAIL"
        preview = answer.replace("\n", " ")[:110]
        print(f"[{status}] {label:34s} ({elapsed:4.2f}s) | sources={sources}")
        print(f"       Q: {question}")
        print(f"       A: {preview}{'...' if len(answer) > 110 else ''}\n")
        history.extend([HumanMessage(content=question), AIMessage(content=answer)])

    print("-" * 72)
    print(f"Result: {passed}/{len(cases)} passed.")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
