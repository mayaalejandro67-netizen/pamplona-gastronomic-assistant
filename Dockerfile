# Multi-stage Dockerfile for Google Cloud Run (serves React SPA + FastAPI RAG on 1 URL)

# --- Stage 1: Build React + TypeScript + Tailwind frontend -------------------
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python + FastAPI + LangChain + ChromaDB runtime ----------------
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py app.py evaluate.py ./
COPY src/ ./src/
COPY data/ ./data/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure ChromaDB persist folder is writable even under non-root runtimes (e.g. HF Spaces).
RUN mkdir -p /app/chroma_db && chmod -R 777 /app/chroma_db

EXPOSE 8080

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8080}"]
