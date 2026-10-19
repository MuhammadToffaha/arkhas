"""Relevance scoring, dedup and accessory filtering so 'cheapest' means the real product."""
from __future__ import annotations

import statistics

from .models import Offer
from .normalize import equivalents, tokens

# Words that signal an accessory when the query itself is not about accessories.
ACCESSORY_WORDS = {
    "case", "cover", "protector", "screen protector", "glass", "skin", "strap", "cable", "adapter",
    "holder", "stand", "sticker", "pouch", "sleeve", "replacement", "spare", "charger", "cases",
    "جراب", "كفر", "اسكرينه", "سكرينه", "حمايه", "لزقه", "كابل", "وصله", "حامل", "استاند", "غطاء", "شاحن",
}

STOP = {"the", "a", "an", "and", "with", "of", "in", "new", "ال", "و", "مع", "في", "من", "جديد"}


def relevance(query: str, title: str) -> float:
    """Share of meaningful query tokens (in any language variant) found in the title."""
    q = [t for t in tokens(query) if t not in STOP]
    if not q:
        return 0.0
    title_toks = set(tokens(title))
    title_norm = " ".join(tokens(title))
    hits = 0.0
    for t in q:
        eq = equivalents(t)
        if any((" " in e and e in title_norm) or e in title_toks for e in eq):
            hits += 1
        elif t.isdigit() and any(t in w for w in title_toks):  # "256" in "256gb"
            hits += 0.8
        elif len(t) >= 4 and any(w.startswith(t) or t.startswith(w) for w in title_toks if len(w) >= 3):
            hits += 0.6  # partial: plural / suffix variants
    return round(hits / len(q), 3)


def _is_accessory(query: str, title: str) -> bool:
    q = set(tokens(query))
    if q & ACCESSORY_WORDS:
        return False  # user is searching for an accessory
    t = tokens(title)
    head = set(t[:6])  # accessory words near the start = the product IS the accessory
    return bool(head & ACCESSORY_WORDS)


def rank(query: str, offers: list[Offer], min_relevance: float = 0.6) -> tuple[list[Offer], int]:
    """Score, dedupe, filter and sort offers by price. Returns (kept, hidden_count)."""
    seen: dict[tuple[str, str], Offer] = {}
    for o in offers:
        o.relevance = relevance(query, o.title)
        key = (o.source.lower(), o.url.split("?")[0].rstrip("/"))
        if key not in seen or o.price < seen[key].price:
            seen[key] = o
    pool = list(seen.values())

    kept = [o for o in pool if o.relevance >= min_relevance]
    for o in kept:
        if _is_accessory(query, o.title):
            o.flags.append("possible-accessory")

    # price outlier: far below median of relevant items -> likely accessory / part / scam
    core = [o.price for o in kept if "possible-accessory" not in o.flags]
    if len(core) >= 4:
        med = statistics.median(core)
        for o in kept:
            if o.price < med * 0.3 and "suspiciously-cheap" not in o.flags:
                o.flags.append("suspiciously-cheap")

    kept.sort(key=lambda o: (bool(o.flags), o.price))
    return kept, len(pool) - len(kept)


def best_offer(offers: list[Offer]) -> Offer | None:
    clean = [o for o in offers if not o.flags]
    return min(clean, key=lambda o: o.price) if clean else (offers[0] if offers else None)
