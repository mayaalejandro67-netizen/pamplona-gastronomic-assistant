"""
Fetch real Google Maps coordinates, links, and restaurant photos using
Google Places API (New) (plus official restaurant website `og:image` fallback
when Google Places omits user photos under EEA/DMA billing rules).

Usage:
    python -m src.fetch_google_places

Requires `GOOGLE_MAPS_API_KEY` in `.env` with **Places API (New)** enabled in
Google Cloud. Photos are downloaded once into `frontend/public/images/places/`
so the UI loads them locally with zero repeated API calls, and exact
coordinates + Google Maps links are saved to `data/coordinates.json` (kept
strictly separate from the RAG vector database).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urljoin

import httpx

from . import config
from .restaurants import load_structured_restaurants

PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_MEDIA_BASE = "https://places.googleapis.com/v1"
MAX_PHOTOS_PER_PLACE = 4

_META_IMG_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)["\']|'
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']',
    re.IGNORECASE,
)


def _search_place(client: httpx.Client, api_key: str, query: str) -> Dict[str, Any] | None:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.displayName,places.formattedAddress,places.location,"
            "places.googleMapsUri,places.googleMapsLinks,places.websiteUri,places.photos"
        ),
    }
    resp = client.post(
        PLACES_SEARCH_URL,
        headers=headers,
        json={"textQuery": query, "languageCode": "es", "maxResultCount": 1},
    )
    resp.raise_for_status()
    places = resp.json().get("places") or []
    return places[0] if places else None


def _download_image(client: httpx.Client, url: str, dest: Path, params: dict | None = None) -> bool:
    try:
        resp = client.get(
            url,
            params=params,
            headers={"User-Agent": "Mozilla/5.0 (compatible; PamplonaGastronomicAssistant/2.0)"},
            follow_redirects=True,
            timeout=12.0,
        )
    except Exception:
        return False
    ctype = (resp.headers.get("content-type") or "").lower()
    if resp.status_code != 200 or not ctype.startswith("image/") or "svg" in ctype or "icon" in ctype:
        return False
    # Skip tiny logos/placeholders (< 15 KB).
    if len(resp.content) < 15_000:
        return False
    dest.write_bytes(resp.content)
    return True


def _fetch_official_site_photo(client: httpx.Client, website_url: str, dest: Path) -> bool:
    """Download the official og:image from the restaurant's own website (if available)."""
    try:
        resp = client.get(
            website_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; PamplonaGastronomicAssistant/2.0)"},
            follow_redirects=True,
            timeout=10.0,
        )
        if resp.status_code != 200 or "text/html" not in (resp.headers.get("content-type") or "").lower():
            return False
    except Exception:
        return False

    for match in _META_IMG_RE.finditer(resp.text[:80_000]):
        img_url = (match.group(1) or match.group(2) or "").strip()
        if not img_url:
            continue
        full_url = urljoin(str(resp.url), img_url)
        if any(skip in full_url.lower() for skip in ("logo", "favicon", "icon", "sprite")):
            continue
        if _download_image(client, full_url, dest):
            return True
    return False


def fetch_all() -> None:
    api_key = config.GOOGLE_MAPS_API_KEY
    if not api_key:
        raise SystemExit(
            "GOOGLE_MAPS_API_KEY is not set in .env. Add it and enable 'Places API (New)' in Google Cloud."
        )

    data_dir = Path(config.DATA_DIR)
    coords_path = data_dir / "coordinates.json"
    photos_dir = config.BASE_DIR / "frontend" / "public" / "images" / "places"
    photos_dir.mkdir(parents=True, exist_ok=True)

    try:
        coords_data: Dict[str, Any] = json.loads(coords_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        coords_data = {
            "_note": "Map display coordinates and Google Maps metadata (kept separate from the RAG vector store)."
        }

    restaurants = load_structured_restaurants(data_dir)
    ok_count = 0
    photo_places = 0

    with httpx.Client(timeout=20.0) as client:
        for r in restaurants:
            slug = r["id"]
            query = f"{r['name']}, {r['location']}, Navarra, España"
            try:
                place = _search_place(client, api_key, query)
            except httpx.HTTPStatusError as exc:
                print(f"[error] {r['name']}: HTTP {exc.response.status_code} - {exc.response.text[:180]}")
                if exc.response.status_code in (401, 403):
                    raise SystemExit(
                        "Places API (New) rejected the key. Make sure 'Places API (New)' is enabled and allowed on GOOGLE_MAPS_API_KEY."
                    )
                continue
            except Exception as exc:
                print(f"[error] {r['name']}: {exc}")
                continue

            if not place:
                print(f"[miss]  {r['name']} (no match)")
                continue

            loc = place.get("location") or {}
            links = place.get("googleMapsLinks") or {}
            entry = dict(coords_data.get(slug) or {})
            if "latitude" in loc and "longitude" in loc:
                entry["lat"] = round(float(loc["latitude"]), 6)
                entry["lng"] = round(float(loc["longitude"]), 6)
            if place.get("googleMapsUri"):
                entry["google_maps_url"] = place["googleMapsUri"]
            if links.get("photosUri"):
                entry["photos_url"] = links["photosUri"]
            if links.get("directionsUri"):
                entry["directions_url"] = links["directionsUri"]
            if place.get("websiteUri"):
                entry["website_url"] = place["websiteUri"]
            if "neighborhood" not in entry:
                entry["neighborhood"] = r["location"]

            saved_photos: List[str] = []
            attributions: List[str] = []

            # 1) Prefer Google Places photos when returned by the API.
            for idx, photo in enumerate((place.get("photos") or [])[:MAX_PHOTOS_PER_PLACE], start=1):
                photo_name = photo.get("name")
                if not photo_name:
                    continue
                filename = f"{slug}-{idx}.jpg"
                dest = photos_dir / filename
                url = f"{PLACES_MEDIA_BASE}/{photo_name}/media"
                if _download_image(client, url, dest, params={"maxWidthPx": 900, "key": api_key}):
                    saved_photos.append(f"/images/places/{filename}")
                    authors = photo.get("authorAttributions") or []
                    if authors and authors[0].get("displayName"):
                        attributions.append(authors[0]["displayName"])

            # 2) Fallback for EEA/DMA accounts where Places API omits photos[]:
            #    fetch the official hero photo from the venue's own website.
            if not saved_photos and place.get("websiteUri"):
                filename = f"{slug}-site.jpg"
                dest = photos_dir / filename
                if _fetch_official_site_photo(client, place["websiteUri"], dest):
                    saved_photos.append(f"/images/places/{filename}")
                    attributions.append("Web oficial del restaurante")

            if saved_photos:
                entry["photos"] = saved_photos
                photo_places += 1
            if attributions:
                entry["photo_attributions"] = sorted(set(attributions))

            coords_data[slug] = entry
            ok_count += 1
            print(
                f"[ok]    {r['name']:28s} | photos={len(saved_photos)} | "
                f"maps_photos_link={bool(entry.get('photos_url'))}"
            )

    coords_path.write_text(json.dumps(coords_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone: {ok_count}/20 places updated, {photo_places}/20 with real venue photos downloaded.")


if __name__ == "__main__":
    try:
        fetch_all()
    except KeyboardInterrupt:
        sys.exit(130)
