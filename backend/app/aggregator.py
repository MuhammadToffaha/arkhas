"""Fan out one query to every source in parallel, then rank."""
from __future__ import annotations

import asyncio
import logging
import time

from .config import load_stores, settings
from .models import Offer, SearchResponse, SourceStatus
from .normalize import is_arabic, query_variants
from .ranking import best_offer, rank
from .sources import serpapi
from .sources.links import external_links
from .sources.store import search_store

log = logging.getLogger(__name__)

_cache: dict[str, tuple[float, SearchResponse]] = {}


def _by_lang(variants: list[str]) -> dict[str, str]:
    """{'en': ..., 'ar': ...} using translation where available."""
    out: dict[str, str] = {}
    for v in variants:
        out.setdefault("ar" if is_arabic(v) else "en", v)
    return out


def _plan(variants: list[str], wanted: str) -> list[tuple[str, str]]:
    by = _by_lang(variants)
    if wanted == "both":
        return [(lang, q) for lang, q in by.items()]
    if wanted in by:
        return [(wanted, by[wanted])]
    # no translation known: send the original query anyway
    lang = "ar" if is_arabic(variants[0]) else "en"
    return [(lang, variants[0])]


async def _run(name: str, jobs: list) -> tuple[SourceStatus, list[Offer]]:
    t0 = time.perf_counter()
    offers: list[Offer] = []
    errors = []
    results = await asyncio.gather(
        *(asyncio.wait_for(j, settings.source_timeout + 5) for j in jobs), return_exceptions=True
    )
    for r in results:
        if isinstance(r, BaseException):
            errors.append(type(r).__name__ + (f": {r}" if str(r) else ""))
        else:
            offers.extend(r)
    ms = int((time.perf_counter() - t0) * 1000)
    ok = bool(offers) or not errors
    return SourceStatus(source=name, ok=ok, count=len(offers), ms=ms,
                        error="; ".join(errors)[:300] or None), offers


async def search(query: str, use_cache: bool = True) -> SearchResponse:
    key = " ".join(query.lower().split())
    hit = _cache.get(key)
    if use_cache and hit and time.time() - hit[0] < settings.cache_ttl:
        return hit[1].model_copy(update={"cached": True})

    variants = query_variants(query)
    tasks = []
    for store in load_stores():
        jobs = [search_store(store, q, lang) for lang, q in _plan(variants, store.get("lang", "both"))]
        tasks.append(_run(store["name"], jobs))
    if settings.serpapi_key:
        tasks.append(_run("Google Shopping (SerpAPI)",
                          [serpapi.search(q, lang) for lang, q in _plan(variants, "both")]))

    done = await asyncio.gather(*tasks)
    statuses = [s for s, _ in done]
    all_offers = [o for _, offers in done for o in offers]

    ranked, hidden = rank(query, all_offers, settings.min_relevance)
    resp = SearchResponse(
        query=query,
        variants=variants,
        best=best_offer(ranked),
        offers=ranked,
        hidden=hidden,
        links=external_links(query),
        sources=statuses,
    )
    _cache[key] = (time.time(), resp)
    if len(_cache) > 500:
        _cache.pop(next(iter(_cache)))
    return resp
