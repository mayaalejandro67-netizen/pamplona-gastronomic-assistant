"""
Structured restaurant metadata extracted strictly from the PDFs in `data/`.

Used by the FastAPI backend (`api.py`) to power restaurant cards, search/category
filters, and dish lists in the React UI without altering the RAG pipeline.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List

from . import config
from .ingest import _load_pdfs

_DISH_RE = re.compile(
    r"(?:^|\n)\s*(?:[•\-*]|\d+\.)?\s*"
    r"(?P<name>[^\n:•]{2,90}?)\s*"
    r"\((?P<price>\d+(?:[.,]\d{1,2})?\s*€(?:/\w+)?)\)\s*:\s*"
    r"(?P<desc>.+?)"
    r"(?=(?:\n\s*(?:[•\-*]|\d+\.)?\s*[^\n:•]{2,90}?\s*\(\d+(?:[.,]\d{1,2})?\s*€(?:/\w+)?\)\s*:)|\Z)",
    re.DOTALL,
)


def _slugify(text: str) -> str:
    norm = unicodedata.normalize("NFKD", text.lower())
    ascii_only = "".join(ch for ch in norm if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")


def _infer_category(name: str, prose: str) -> str:
    text = f"{name} {prose}".lower()
    if any(k in text for k in ("hamburgues", "burger")):
        return "Hamburguesería"
    if any(k in text for k in ("asiátic", "asiatic", "barbacoa asiática", "hanazono")):
        return "Asiática"
    if any(k in text for k in ("sidrería", "sidreria", "asador", "parrilla")):
        return "Asador / Sidrería"
    if any(k in text for k in ("pincho", "pintxo", "gastrobar", "gastroteka", "cocina en miniatura", "tapeo")):
        return "Pinchos y Gastrobar"
    if any(k in text for k in ("alta cocina", "vanguardia", "chef", "solera")):
        return "Alta Cocina"
    return "Cocina Tradicional"


def _parse_price_value(price_str: str) -> float | None:
    match = re.search(r"(\d+(?:[.,]\d{1,2})?)", price_str)
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def _price_tier(avg_price: float | None) -> str:
    """Derive a price tier (€, €€, €€€) strictly from the PDF menu prices."""
    if avg_price is None:
        return "€€"
    if avg_price < 13.0:
        return "€"
    if avg_price <= 20.0:
        return "€€"
    return "€€€"


def _load_coordinates(data_dir: Path) -> Dict[str, Dict[str, Any]]:
    coords_path = data_dir / "coordinates.json"
    try:
        raw = json.loads(coords_path.read_text(encoding="utf-8"))
        return {k: v for k, v in raw.items() if isinstance(v, dict) and "lat" in v and "lng" in v}
    except (OSError, ValueError):
        return {}


def load_structured_restaurants(data_dir: Path | None = None) -> List[Dict[str, Any]]:
    """Parse all restaurant PDFs into structured dictionaries (100% grounded in the PDFs)."""
    folder = data_dir or Path(config.DATA_DIR)
    docs = _load_pdfs(folder)
    coords_map = _load_coordinates(folder)
    restaurants: List[Dict[str, Any]] = []

    for doc in docs:
        name = doc.metadata["restaurant"]
        location = doc.metadata.get("location") or "Pamplona"
        source = doc.metadata["source"]

        parts = re.split(r"Lista de Platos[^\n]*", doc.page_content, maxsplit=1, flags=re.IGNORECASE)
        prose_raw = parts[0]
        dish_section = parts[1] if len(parts) > 1 else ""

        lines = [line.strip() for line in prose_raw.splitlines() if line.strip()]
        body_lines = lines[1:] if len(lines) > 1 and doc.metadata.get("location") else lines
        description = re.sub(r"\s+", " ", " ".join(body_lines)).strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", description) if s.strip()]
        summary = sentences[0] if sentences else ""
        # Split sentences cleanly into grounded summary sections:
        # intro (sentence 1), what makes it special (sentences 2-3), cuisine proposal (rest).
        special = " ".join(sentences[1:3]).strip() if len(sentences) > 1 else ""
        cuisine_proposal = " ".join(sentences[3:]).strip() if len(sentences) > 3 else ""

        dishes: List[Dict[str, Any]] = []
        for match in _DISH_RE.finditer(dish_section):
            dish_name = re.sub(r"\s+", " ", match.group("name")).strip()
            price_str = re.sub(r"\s+", " ", match.group("price")).strip()
            dish_desc = re.sub(r"\s+", " ", match.group("desc")).strip()
            dishes.append(
                {
                    "name": dish_name,
                    "price": price_str,
                    "price_value": _parse_price_value(price_str),
                    "description": dish_desc,
                }
            )

        # Exclude per-kg prices when computing the typical dish min/max range.
        unit_prices = [
            d["price_value"]
            for d in dishes
            if d["price_value"] is not None and "/kg" not in d["price"].lower()
        ]
        if not unit_prices:
            unit_prices = [d["price_value"] for d in dishes if d["price_value"] is not None]

        slug = _slugify(name)
        avg_price = (sum(unit_prices) / len(unit_prices)) if unit_prices else None
        coord = coords_map.get(slug, {})

        restaurants.append(
            {
                "id": slug,
                "name": name,
                "location": location,
                "neighborhood": coord.get("neighborhood", location),
                "lat": coord.get("lat"),
                "lng": coord.get("lng"),
                "google_maps_url": coord.get("google_maps_url"),
                "photos_url": coord.get("photos_url"),
                "photos": coord.get("photos") or [],
                "photo_attributions": coord.get("photo_attributions") or [],
                "category": _infer_category(name, description),
                "source": source,
                "summary": summary,
                "special": special,
                "cuisine_proposal": cuisine_proposal,
                "description": description,
                "dishes": dishes,
                "dish_count": len(dishes),
                "min_price": min(unit_prices) if unit_prices else None,
                "max_price": max(unit_prices) if unit_prices else None,
                "price_tier": _price_tier(avg_price),
            }
        )

    restaurants.sort(key=lambda r: r["name"].lower())
    return restaurants
