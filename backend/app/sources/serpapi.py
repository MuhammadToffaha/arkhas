"""Google Shopping (Egypt) via SerpAPI — covers the long tail of Egyptian stores."""
from __future__ import annotations

from ..config import settings
from ..models import Offer
from ..price import parse_price
from .fetch import client

ENDPOINT = "https://serpapi.com/search.json"


def parse(data: dict) -> list[Offer]:
    out: list[Offer] = []
    for r in data.get("shopping_results", []) + data.get("inline_shopping_results", []):
        raw_price = r.get("price") or ""
        if "$" in raw_price or "€" in raw_price:
            continue  # foreign currency listing
        price = parse_price(r.get("extracted_price") or raw_price)
        link = r.get("link") or r.get("product_link")
        if not (price and link and r.get("title")):
            continue
        out.append(
            Offer(
                title=r["title"],
                price=price,
                old_price=parse_price(r.get("extracted_old_price") or r.get("old_price")),
                url=link,
                image=r.get("thumbnail"),
                source=r.get("source") or "Google Shopping",
                seller=r.get("source"),
                via="serpapi",
            )
        )
    return out


async def search(query: str, lang: str) -> list[Offer]:
    if not settings.serpapi_key:
        raise RuntimeError("SERPAPI_KEY not set")
    params = {
        "engine": "google_shopping",
        "q": query,
        "gl": "eg",
        "hl": "ar" if lang == "ar" else "en",
        "google_domain": "google.com.eg",
        "location": "Cairo,Cairo Governorate,Egypt",
        "api_key": settings.serpapi_key,
    }
    r = await client().get(ENDPOINT, params=params, timeout=settings.source_timeout)
    r.raise_for_status()
    data = r.json()
    if data.get("error"):
        raise RuntimeError(data["error"])
    return parse(data)[: settings.max_per_source * 2]
