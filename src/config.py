"""
Main configuration for the Pamplona Gastronomic Assistant.
All settings can be overridden via environment variables or `.env`.
"""
import os
import warnings
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Chroma's cosine relevance-score function can legitimately return a value
# slightly outside [0, 1] (cosine similarity lives in [-1, 1]); it logs a
# UserWarning every time that happens, which is just noise here because
# SCORE_THRESHOLD below is applied regardless.
warnings.filterwarnings("ignore", message="Relevance scores must be between 0 and 1")
warnings.filterwarnings("ignore", message=".*uses fixed sampling defaults.*")

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Data & storage ----------------------------------------------------------
DATA_DIR = os.getenv("DATA_DIR", str(BASE_DIR / "data"))
PERSIST_DIR = os.getenv("PERSIST_DIR", str(BASE_DIR / "chroma_db"))
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "pamplona_restaurants")

# --- Models ------------------------------------------------------------------
# Google Gemini API key (free tier or Google Cloud project).
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

# Optional Google Maps JavaScript API key (for the React map UI; if unset, the
# map automatically falls back to OpenStreetMap via React Leaflet).
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()

# Two separate models for lower latency: every turn runs a lightweight
# intent-routing / question-rewrite step (CONDENSE_LLM_MODEL) and, when
# grounded chunks are found, streams the final answer (LLM_MODEL).
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-3.5-flash-lite")
CONDENSE_LLM_MODEL = os.getenv("CONDENSE_LLM_MODEL", "gemini-3.1-flash-lite")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")

TEMPERATURE = float(os.getenv("TEMPERATURE", "0"))

# --- Chunking ----------------------------------------------------------------
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))

# --- Retrieval & memory ------------------------------------------------------
# Number of chunks to retrieve per query. With ~3 chunks per restaurant PDF,
# TOP_K=6 fits a full restaurant menu or a 2-restaurant comparison.
TOP_K = int(os.getenv("TOP_K", "6"))

# Minimum cosine relevance score (0-1, higher = more similar) required to treat
# a chunk as real evidence. Calibrated empirically against the 20 restaurant
# PDFs with gemini-embedding-001: off-topic/gibberish queries scored 0.56-0.64,
# while genuine restaurant questions (ES & EN) scored 0.67-0.81.
SCORE_THRESHOLD = float(os.getenv("SCORE_THRESHOLD", "0.65"))

# Maximum number of prior user/assistant exchanges sent to the LLM so long
# conversations don't blow up token usage, latency, or quota.
MAX_HISTORY_TURNS = int(os.getenv("MAX_HISTORY_TURNS", "6"))
