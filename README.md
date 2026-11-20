# Pamplona Gastronomic Assistant 🍴

A conversational RAG (Retrieval-Augmented Generation) gastronomic guide for Pamplona and Navarra built with **Python**, **LangChain**, **ChromaDB**, and **Google Gemini**. It answers strictly from 20 local restaurant PDF documents (`data/`), preventing hallucinations and handling follow-up questions naturally in Spanish and English.

The project ships with **two synchronized frontends** sharing the exact same RAG core (`src/`):
1. **Streamlit (`app.py`)** — single-command interface matching the core assignment specification.
2. **React + TypeScript + FastAPI (`api.py` + `frontend/`)** — enhanced 3-column gastronomic discovery app using `assistant-ui`, Tailwind CSS, shadcn/ui, Google Maps (with automatic OpenStreetMap fallback), real restaurant photography, a side-by-side restaurant comparator, and Light / Dark (*Slate & Sage*) modes.

---

## Architecture

```
PDFs in data/ (20 restaurants, 200 dishes)
  ──► PyPDFLoader (pages joined per venue)
  ──► Contextual Chunk Headers ("Restaurante: <Name> (<Location>)")
  ──► RecursiveCharacterTextSplitter (1000 chars / 150 overlap)
  ──► GoogleGenerativeAIEmbeddings (gemini-embedding-001, asymmetric retrieval)
  ──► ChromaDB (cosine space, persisted to chroma_db/ + SHA-256 fingerprint)

User message
  ──► Layer 1: Intent Router & Query Condenser (gemini-3.1-flash-lite)
               • Classifies greeting / off_topic / restaurant_query
               • Detects language (ES / EN)
               • Rewrites follow-ups using bounded chat history (last 6 turns)
  ──► Layer 2: Semantic Retrieval + Calibrated Cutoff (SCORE_THRESHOLD=0.65, TOP_K=6)
               • Discards weak matches; skips answer LLM if nothing clears 0.65
  ──► Layer 3: Strict Grounding Prompt + Grounded PDF Directory (gemini-3.5-flash-lite, streamed)
               • Answers strictly from retrieved chunks + 20-venue PDF directory
               • Filters cited PDFs so only actually referenced venues are shown
```

### Repository Layout

| Path | Responsibility |
|---|---|
| `src/config.py` | Central configuration (models, chunking, retrieval cutoff, memory window), overridable via `.env`. |
| `src/ingest.py` | PDF loading, contextual chunk headers, SHA-256 auto-rebuild fingerprint, Chroma indexing, and grounded catalog export. |
| `src/rag_chain.py` | 3-layer grounded RAG pipeline (intent router + condenser, calibrated retrieval, streamed grounded answer, source citation filtering). |
| `src/errors.py` | Exception-chain classifier turning Gemini/LangChain/network errors (401/403/404/429/5xx/offline) into readable messages. |
| `src/restaurants.py` | Deterministic parser extracting structured dishes, prices, categories, and summary sections straight from the 20 PDFs. |
| `src/fetch_google_places.py` | Optional utility to fetch exact Google Maps coordinates & links via Places API (New) into `data/coordinates.json`. |
| `app.py` | **Streamlit** chat interface (`streamlit run app.py`). |
| `api.py` | **FastAPI** REST & SSE streaming backend connecting React to `src/`. |
| `frontend/` | **React + TypeScript + Tailwind + shadcn/ui + assistant-ui + Google Maps/Leaflet** 3-column interface. |
| `evaluate.py` | Automated 10-case test suite validating grounding, memory, off-topic handling, and bilingual responses. |
| `data/` | Source restaurant PDFs (`1. Babylon.pdf` … `20. La_Cocina_de_Alex_Mugica.pdf`) + UI-only `coordinates.json`. |

---

## Setup

### 1. Python environment

```bash
python -m venv .venv

# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Environment variables

Copy `.env.example` to `.env` and add your Gemini API key (free at https://aistudio.google.com/apikey):

```bash
# Windows (PowerShell):
Copy-Item .env.example .env
# macOS / Linux:
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_API_KEY=your_gemini_api_key
# Optional (only for Google Maps in the React UI; falls back to OpenStreetMap if omitted):
GOOGLE_MAPS_API_KEY=
```

---

## Running the App

### Option A — Streamlit UI (1 command)

```bash
streamlit run app.py
```

Opens at **http://localhost:8501**. The vector index in `chroma_db/` is built automatically on first launch and automatically rebuilt whenever files in `data/` change.

### Option B — Enhanced React + FastAPI UI (2 terminals)

**Terminal 1 — FastAPI backend:**
```bash
uvicorn api:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — React frontend (requires Node.js 18+):**
```bash
cd frontend
npm install
npm run dev
```

Opens at **http://127.0.0.1:5173** (API docs at **http://127.0.0.1:8000/docs**).

### Running the Evaluation Suite

```bash
python evaluate.py
```

Runs 10 live end-to-end checks (greetings, specific menu queries, follow-up memory, missing attributes like opening hours, non-existent restaurants, town-level aggregation, off-topic trivia, nonsensical text, and English queries).

---

## Deploying Online (Public HTTPS Link)

### Option 1 — Google Cloud Run (React + FastAPI on 1 URL)

The repository includes a multi-stage `Dockerfile` that builds `frontend/` and serves both the React SPA and FastAPI `/api/*` endpoints from a single container.

From **Google Cloud Shell** (upload & unzip the project folder, then `cd` into it):

```bash
gcloud run deploy pamplona-gastronomic-assistant \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --set-env-vars GOOGLE_API_KEY="YOUR_GEMINI_KEY",GOOGLE_MAPS_API_KEY="YOUR_MAPS_KEY"
```

Cloud Run returns a public HTTPS URL (`https://pamplona-gastronomic-assistant-xxxx.a.run.app`).

### Option 2 — Streamlit Community Cloud (Streamlit `app.py`)

1. Push this repository to GitHub (`.env` is gitignored).
2. Open https://share.streamlit.io, select the repo and `app.py`.
3. Add `GOOGLE_API_KEY = "YOUR_GEMINI_KEY"` under *App settings → Secrets*.

---

## How Technical Requirements Are Met

- **Strict Grounding (Zero Hallucinations):** Enforced across 3 independent layers:
  1. *Intent Router:* Rejects nonsensical (`asdfgh qwerty`) and clearly off-topic queries (`capital of France`) immediately without invoking the answer model or attaching sources.
  2. *Calibrated Cosine Threshold (`SCORE_THRESHOLD = 0.65`):* Empirically tuned on the 20 PDFs with `gemini-embedding-001` where off-topic/gibberish queries scored `0.56–0.64` while valid restaurant queries (Spanish & English) scored `0.67–0.81`.
  3. *Prompt Grounding + Citation Filtering:* Instructs the model to reply with an exact language-matched fallback when details (such as opening hours or phone numbers) are absent from the PDFs, and suppresses source badges on fallbacks.
- **Contextual Chunking:** Each PDF (~2,500 chars) is joined across pages and split with a prepended header (`Restaurante: <Name> (<Location>)`) on every chunk so menu items on later chunks remain retrievable by restaurant name.
- **Context & Memory Management:** Follow-up questions (e.g., *"¿Y tiene algún postre?"*) are condensed into standalone search queries using a bounded sliding window (`MAX_HISTORY_TURNS = 6` exchanges), preventing unbounded token growth. Failed turns are never persisted to conversation memory.
- **Error Handling:** `src/errors.py` walks exception chains to classify wrapped `langchain-google-genai` errors (invalid key, quota 429, missing model 404, server 5xx, offline/network errors) into clear UI notices without crashing Streamlit or FastAPI.
