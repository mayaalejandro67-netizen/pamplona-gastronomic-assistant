"""
FastAPI backend for the Pamplona Gastronomic Assistant.

Connects the React frontend to the existing RAG engine in `src/` without
modifying how the RAG pipeline works (Streamlit `app.py` continues to work
independently).

Run with:
    uvicorn api:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from pydantic import BaseModel, Field

from src import config
from src.errors import describe_error
from src.ingest import IngestionError, build_vectorstore, load_restaurant_catalog
from src.rag_chain import (
    answer_question,
    filter_cited_sources,
    get_condense_llm,
    get_llm,
    is_fallback_answer,
)
from src.restaurants import load_structured_restaurants

logger = logging.getLogger(__name__)


class AppState:
    vectordb: Any = None
    catalog: str = ""
    llm: Any = None
    condense_llm: Any = None
    restaurants: List[Dict[str, Any]] = []
    source_to_id: Dict[str, str] = {}
    all_restaurants_info: List[tuple[str, str]] = []


state = AppState()


def _load_resources(force_rebuild: bool = False) -> None:
    if not config.GOOGLE_API_KEY:
        raise RuntimeError(
            "GOOGLE_API_KEY is missing. Add it to the .env file before starting the API."
        )
    state.vectordb = build_vectorstore(force_rebuild=force_rebuild)
    state.catalog = load_restaurant_catalog()
    state.restaurants = load_structured_restaurants()
    state.source_to_id = {r["source"]: r["id"] for r in state.restaurants}
    state.all_restaurants_info = [(r["name"], r["source"]) for r in state.restaurants]
    if state.llm is None:
        state.llm = get_llm()
    if state.condense_llm is None:
        state.condense_llm = get_condense_llm()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_resources(force_rebuild=False)
    yield


app = FastAPI(
    title="Pamplona Gastronomic Assistant API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Schemas -----------------------------------------------------------------

class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., description="Latest user message")
    history: List[HistoryMessage] = Field(
        default_factory=list,
        description="Prior conversation turns (excluding the latest user message)",
    )


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]
    mentioned_restaurants: List[str]
    is_fallback: bool


def _to_lc_history(history: List[HistoryMessage]) -> List[BaseMessage]:
    messages: List[BaseMessage] = []
    for item in history:
        if item.role == "user":
            messages.append(HumanMessage(content=item.content))
        else:
            messages.append(AIMessage(content=item.content))
    return messages


def _sources_to_ids(sources: List[str]) -> List[str]:
    return [state.source_to_id[s] for s in sources if s in state.source_to_id]


# --- Endpoints ---------------------------------------------------------------

@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "restaurants_count": len(state.restaurants),
        "google_maps_enabled": bool(config.GOOGLE_MAPS_API_KEY),
        "models": {
            "llm": config.LLM_MODEL,
            "condense_llm": config.CONDENSE_LLM_MODEL,
            "embedding": config.EMBEDDING_MODEL,
        },
    }


@app.get("/api/config")
def client_config() -> Dict[str, Any]:
    """Public frontend settings (e.g. optional Google Maps JS API key)."""
    return {
        "google_maps_api_key": config.GOOGLE_MAPS_API_KEY or None,
    }


@app.get("/api/restaurants")
def list_restaurants(
    q: Optional[str] = Query(default=None, description="Free-text filter on name, description, or dishes"),
    location: Optional[str] = Query(default=None, description="Filter by town/location"),
    category: Optional[str] = Query(default=None, description="Filter by cuisine category"),
    max_price: Optional[float] = Query(default=None, ge=0, description="Max minimum-dish price in EUR"),
) -> Dict[str, Any]:
    items = state.restaurants
    if location and location.lower() != "all":
        items = [r for r in items if r["location"].lower() == location.lower()]
    if category and category.lower() != "all":
        items = [r for r in items if r["category"].lower() == category.lower()]
    if max_price is not None:
        items = [r for r in items if r["min_price"] is not None and r["min_price"] <= max_price]
    if q and q.strip():
        needle = q.strip().lower()
        items = [
            r
            for r in items
            if needle in r["name"].lower()
            or needle in r["location"].lower()
            or needle in r["description"].lower()
            or any(
                needle in d["name"].lower() or needle in d["description"].lower()
                for d in r["dishes"]
            )
        ]

    return {
        "restaurants": items,
        "total": len(items),
        "locations": sorted({r["location"] for r in state.restaurants}),
        "categories": sorted({r["category"] for r in state.restaurants}),
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """Synchronous JSON chat endpoint (reuses src/rag_chain.py directly)."""
    lc_history = _to_lc_history(req.history)
    try:
        answer_or_stream, retrieved_sources = answer_question(
            llm=state.llm,
            condense_llm=state.condense_llm,
            vectordb=state.vectordb,
            question=req.message,
            chat_history=lc_history,
            catalog=state.catalog,
        )
        answer = (
            answer_or_stream
            if isinstance(answer_or_stream, str)
            else "".join(answer_or_stream)
        )
    except Exception as exc:
        logger.exception("Chat endpoint failed")
        raise HTTPException(status_code=502, detail=describe_error(exc))

    sources = filter_cited_sources(answer, retrieved_sources, state.all_restaurants_info)
    return ChatResponse(
        answer=answer,
        sources=sources,
        mentioned_restaurants=_sources_to_ids(sources),
        is_fallback=is_fallback_answer(answer),
    )


@app.post("/api/chat/stream")
def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Server-Sent Events (SSE) streaming endpoint for real-time UI rendering."""
    lc_history = _to_lc_history(req.history)

    def event_generator() -> Iterator[str]:
        def sse(payload: Dict[str, Any]) -> str:
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        try:
            answer_or_stream, retrieved_sources = answer_question(
                llm=state.llm,
                condense_llm=state.condense_llm,
                vectordb=state.vectordb,
                question=req.message,
                chat_history=lc_history,
                catalog=state.catalog,
            )

            chunks: List[str] = []
            if isinstance(answer_or_stream, str):
                chunks.append(answer_or_stream)
                yield sse({"type": "token", "text": answer_or_stream})
            else:
                for token in answer_or_stream:
                    if token:
                        chunks.append(token)
                        yield sse({"type": "token", "text": token})

            answer = "".join(chunks)
            sources = filter_cited_sources(answer, retrieved_sources, state.all_restaurants_info)
            yield sse(
                {
                    "type": "done",
                    "answer": answer,
                    "sources": sources,
                    "mentioned_restaurants": _sources_to_ids(sources),
                    "is_fallback": is_fallback_answer(answer),
                }
            )
        except Exception as exc:
            logger.exception("Streaming chat endpoint failed")
            yield sse({"type": "error", "message": describe_error(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/index/rebuild")
def rebuild_index() -> Dict[str, Any]:
    """Rebuild Chroma index from `data/` and refresh in-memory restaurant list."""
    try:
        _load_resources(force_rebuild=True)
    except IngestionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Index rebuild failed")
        raise HTTPException(status_code=502, detail=describe_error(exc))
    return {"status": "rebuilt", "restaurants_count": len(state.restaurants)}


# --- Production SPA static serving (Cloud Run / single-URL deployment) -------
_FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"
if (_FRONTEND_DIST / "index.html").is_file():
    if (_FRONTEND_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="assets")
    if (_FRONTEND_DIST / "images").is_dir():
        app.mount("/images", StaticFiles(directory=str(_FRONTEND_DIST / "images")), name="images")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        candidate = (_FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file() and _FRONTEND_DIST in candidate.parents:
            return FileResponse(str(candidate))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
