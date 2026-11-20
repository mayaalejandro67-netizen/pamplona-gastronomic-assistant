"""
PDF loading, chunking and vector-store construction.

    python -m src.ingest            # build the index (only if missing or out of date)
    python -m src.ingest --force    # wipe and rebuild from scratch

Key design decision - contextual chunk headers:
    Each restaurant PDF is ~2,500 characters, so it gets split into several
    chunks, but only the first chunk naturally contains the restaurant's
    name. Without help, a chunk like "Ajoarriero con Gambas (16,00 EUR) ..."
    has no idea which restaurant it belongs to, so a question such as
    "Does Cafe Iruna have desserts?" can't retrieve it. We therefore prepend
    a short header ("Restaurante: Cafe Iruna (Pamplona)") to EVERY chunk
    before embedding it, and also store the name in the chunk's metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import List, Optional, Tuple

from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from . import config

# Bump this whenever the way chunks are built changes, so existing indexes
# are detected as outdated and rebuilt automatically.
INDEX_FORMAT_VERSION = "2"
FINGERPRINT_FILE = "index_fingerprint.json"
CATALOG_FILE = "restaurant_catalog.json"

# Matches a title line like "1. Babylon (Pamplona)" or "Cafe Iruna (Pamplona)".
_TITLE_RE = re.compile(r"^\s*(?:\d+\.\s*)?(?P<name>[^()\n]{2,80}?)\s*\((?P<location>[^()\n]{2,60})\)\s*$")


class IngestionError(Exception):
    """Raised whenever the PDF -> vector store pipeline can't produce a usable index."""


# --- Loading -----------------------------------------------------------------

def _name_from_filename(pdf_path: Path) -> str:
    """'16. Cafe_Iruna.pdf' -> 'Cafe Iruna' (fallback when the PDF has no title line)."""
    stem = re.sub(r"^\s*\d+\.\s*", "", pdf_path.stem)
    return stem.replace("_", " ").strip()


def _extract_restaurant(text: str, pdf_path: Path) -> Tuple[str, Optional[str]]:
    """Return (restaurant name, location) from the PDF's first line, or fall back to the filename."""
    first_line = next((line for line in text.splitlines() if line.strip()), "")
    match = _TITLE_RE.match(first_line)
    if match:
        return match.group("name").strip(), match.group("location").strip()
    return _name_from_filename(pdf_path), None


def _load_pdfs(data_dir: Path) -> List[Document]:
    """Load every PDF as ONE document (pages joined), tagged with restaurant metadata."""
    if not data_dir.exists():
        raise IngestionError(
            f"The data folder '{data_dir}' does not exist. Create it and put the "
            "restaurant PDFs inside before running the app."
        )

    pdf_paths = sorted(data_dir.glob("*.pdf"))
    if not pdf_paths:
        raise IngestionError(f"No PDF files found in '{data_dir}'. Add at least one restaurant PDF and try again.")

    documents: List[Document] = []
    skipped: list[tuple[str, str]] = []

    for pdf_path in pdf_paths:
        try:
            pages = PyPDFLoader(str(pdf_path)).load()
        except Exception as exc:  # a single corrupt/locked PDF shouldn't kill the run
            skipped.append((pdf_path.name, str(exc)))
            continue

        # Join the pages so a menu that continues on page 2 is still attached
        # to the restaurant title on page 1.
        text = "\n".join(page.page_content for page in pages).strip()
        if not text:
            skipped.append((pdf_path.name, "no extractable text"))
            continue

        name, location = _extract_restaurant(text, pdf_path)
        metadata = {"source": pdf_path.name, "restaurant": name}
        if location:
            metadata["location"] = location
        documents.append(Document(page_content=text, metadata=metadata))

    if not documents:
        raise IngestionError(f"None of the PDFs in the data folder could be read. Details: {skipped}")

    if skipped:
        names = ", ".join(name for name, _ in skipped)
        print(f"[ingest] Warning: skipped {len(skipped)} unreadable file(s): {names}")

    return documents


# --- Chunking ----------------------------------------------------------------

def _chunk_header(metadata: dict) -> str:
    location = metadata.get("location")
    label = f"{metadata['restaurant']} ({location})" if location else metadata["restaurant"]
    return f"Restaurante: {label}\n"


def _split_documents(documents: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=config.CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(documents)
    for chunk in chunks:
        # Every chunk carries its restaurant's name, so it can be found (and
        # attributed) on its own - see module docstring.
        chunk.page_content = _chunk_header(chunk.metadata) + chunk.page_content
    return chunks


# --- Vector store --------------------------------------------------------------

def _fingerprint(data_dir: Path) -> str:
    """Hash of everything that affects the index: PDF contents + chunking/embedding settings."""
    h = hashlib.sha256()
    h.update(f"{INDEX_FORMAT_VERSION}|{config.EMBEDDING_MODEL}|{config.CHUNK_SIZE}|{config.CHUNK_OVERLAP}".encode())
    for pdf in sorted(data_dir.glob("*.pdf")):
        h.update(pdf.name.encode())
        h.update(pdf.read_bytes())
    return h.hexdigest()


def _read_fingerprint(persist_dir: Path) -> Optional[str]:
    try:
        return json.loads((persist_dir / FINGERPRINT_FILE).read_text(encoding="utf-8")).get("fingerprint")
    except (OSError, ValueError):
        return None


def _write_fingerprint(persist_dir: Path, fingerprint: str) -> None:
    (persist_dir / FINGERPRINT_FILE).write_text(json.dumps({"fingerprint": fingerprint}), encoding="utf-8")


def _build_catalog_entries(documents: List[Document]) -> list[dict[str, str]]:
    """Extract a concise, 100%-grounded 1-line summary per restaurant from the PDFs."""
    entries: list[dict[str, str]] = []
    for doc in documents:
        lines = [line.strip() for line in doc.page_content.splitlines() if line.strip()]
        # Skip the title line if it was extracted as the header.
        body_lines = lines[1:] if len(lines) > 1 and doc.metadata.get("location") else lines
        body = " ".join(body_lines)
        first_sentence = body.split(".")[0].strip()
        if first_sentence:
            first_sentence += "."
        entries.append(
            {
                "restaurant": doc.metadata["restaurant"],
                "location": doc.metadata.get("location") or "Pamplona",
                "source": doc.metadata["source"],
                "summary": first_sentence,
            }
        )
    entries.sort(key=lambda item: item["restaurant"].lower())
    return entries


def _write_catalog(persist_dir: Path, documents: List[Document]) -> None:
    persist_dir.mkdir(parents=True, exist_ok=True)
    entries = _build_catalog_entries(documents)
    (persist_dir / CATALOG_FILE).write_text(
        json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def load_restaurant_catalog() -> str:
    """Return a formatted directory of all indexed restaurants (grounded in the PDFs).

    Used to answer global/aggregation questions ("list all restaurants",
    "which restaurants are in Lekunberri?") that top-k chunk retrieval alone
    cannot cover.
    """
    catalog_path = Path(config.PERSIST_DIR) / CATALOG_FILE
    entries: list[dict[str, str]] = []
    try:
        entries = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data_dir = Path(config.DATA_DIR)
        if data_dir.exists():
            documents = _load_pdfs(data_dir)
            _write_catalog(Path(config.PERSIST_DIR), documents)
            entries = _build_catalog_entries(documents)

    if not entries:
        return ""
    return "\n".join(
        f"- {e['restaurant']} ({e['location']}): {e['summary']}" for e in entries
    )


def _open_collection(embeddings: GoogleGenerativeAIEmbeddings, persist_dir: Path) -> Chroma:
    persist_dir.mkdir(parents=True, exist_ok=True)
    return Chroma(
        persist_directory=str(persist_dir),
        embedding_function=embeddings,
        collection_name=config.COLLECTION_NAME,
        # Cosine distance gives similarity_search_with_relevance_scores() a
        # well-defined 0-1-ish range to compare against SCORE_THRESHOLD
        # (Chroma's default L2 distance is unbounded).
        collection_metadata={"hnsw:space": "cosine"},
    )


def build_vectorstore(force_rebuild: bool = False) -> Chroma:
    """Return a ready-to-query Chroma vector store, (re)building it if needed.

    The index is rebuilt when `force_rebuild` is set, when it's empty, or when
    the PDFs / chunking settings changed since it was built (fingerprint mismatch).
    """
    persist_dir = Path(config.PERSIST_DIR)
    data_dir = Path(config.DATA_DIR)

    # GoogleGenerativeAIEmbeddings already uses task_type="RETRIEVAL_DOCUMENT"
    # for embed_documents() and "RETRIEVAL_QUERY" for embed_query(), so the
    # asymmetric document/query embeddings Gemini supports come for free.
    embeddings = GoogleGenerativeAIEmbeddings(model=config.EMBEDDING_MODEL, google_api_key=config.GOOGLE_API_KEY)
    vectordb = _open_collection(embeddings, persist_dir)

    current = _fingerprint(data_dir) if data_dir.exists() else None
    is_up_to_date = current is not None and _read_fingerprint(persist_dir) == current
    if not force_rebuild and is_up_to_date and vectordb._collection.count() > 0:
        return vectordb

    # Start from an empty collection (also clears a partially-built index).
    vectordb.delete_collection()
    vectordb = _open_collection(embeddings, persist_dir)

    documents = _load_pdfs(data_dir)
    chunks = _split_documents(documents)
    if not chunks:
        raise IngestionError("The PDFs were read but produced no usable text chunks.")

    vectordb.add_documents(chunks)
    _write_catalog(persist_dir, documents)
    _write_fingerprint(persist_dir, _fingerprint(data_dir))
    print(f"[ingest] Indexed {len(chunks)} chunks from {len(documents)} PDF(s).")
    return vectordb


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the restaurant PDF vector index.")
    parser.add_argument("--force", action="store_true", help="Wipe and rebuild the index from scratch.")
    parser.add_argument("--clean", action="store_true", help="Delete the whole index folder first (removes stale files).")
    args = parser.parse_args()

    if args.clean:
        shutil.rmtree(config.PERSIST_DIR, ignore_errors=True)

    try:
        build_vectorstore(force_rebuild=args.force)
    except IngestionError as exc:
        raise SystemExit(f"[ingest] Failed: {exc}")
