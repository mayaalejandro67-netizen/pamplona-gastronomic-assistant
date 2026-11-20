"""
Turns low-level exceptions into short, user-friendly messages.

Why this exists: `langchain-google-genai` does NOT let Gemini's own
`google.genai.errors.APIError` propagate. It wraps it in its own exception
classes (e.g. `GoogleRateLimitError`, `GoogleAuthenticationError`, or a plain
`GoogleGenerativeAIError` for embeddings), which are *not* subclasses of
`APIError`. Catching `APIError` alone therefore misses the most common
failures (bad key, exhausted quota) and lets Streamlit crash with a raw
traceback.

Instead of depending on those (private, version-specific) wrapper classes,
we walk the exception chain (`__cause__` / `__context__`) and look for:
  * an HTTP status code (the original Gemini ClientError/ServerError keeps it
    in `.code`), or
  * a network-level error (no internet, DNS, timeout).
"""
from __future__ import annotations

from typing import Iterator, Optional

import httpx

_NETWORK_ERRORS = (httpx.TransportError, ConnectionError, TimeoutError)


def _exception_chain(exc: BaseException) -> Iterator[BaseException]:
    """Yield `exc` and every exception it was raised from (guarding against cycles)."""
    seen: set[int] = set()
    current: Optional[BaseException] = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def _status_code(exc: BaseException) -> Optional[int]:
    for e in _exception_chain(exc):
        code = getattr(e, "code", None)
        if isinstance(code, int) and 100 <= code <= 599:
            return code
    return None


def _is_network_error(exc: BaseException) -> bool:
    return any(isinstance(e, _NETWORK_ERRORS) for e in _exception_chain(exc))


def describe_error(exc: BaseException) -> str:
    """Return a short message explaining what went wrong and what to do about it."""
    if _is_network_error(exc):
        return "I couldn't connect to the AI service. Please check your internet connection and try again."

    code = _status_code(exc)
    if code == 429:
        return (
            "The Gemini API usage limit (quota) has been reached. "
            "Please wait a minute and try again."
        )
    if code in (401, 403):
        return (
            "The Gemini API key was rejected. Check that `GOOGLE_API_KEY` in the `.env` "
            "file is correct and that the Generative Language API is enabled for it."
        )
    if code == 404:
        return (
            "The configured Gemini model wasn't found. Check `LLM_MODEL`, "
            "`CONDENSE_LLM_MODEL` and `EMBEDDING_MODEL` in the `.env` file."
        )
    if code == 400:
        return "Gemini rejected the request as invalid. Try rephrasing your question."
    if code is not None and code >= 500:
        return "The Gemini service is having temporary problems. Please try again in a moment."

    return f"Something unexpected went wrong ({type(exc).__name__}). Please try again."
