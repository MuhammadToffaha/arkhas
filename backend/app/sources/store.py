"""Config-driven store scraper: CSS selectors first, JSON-LD / embedded JSON fallback."""
from __future__ import annotations

import json
import logging
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup

from ..config import settings
from ..models import Offer
from ..price import parse_price
from .fetch import Blocked, get_html, render_html

log = logging.getLogger(__name__)


def _select(el, spec: str | None):
    """'css' -> text, 'css@attr' -> attribute. Comma lists are tried in order."""
    if not spec:
        return None
    css, _, attr = spec.partition("@")
    node = el.select_one(css)
    if node is None:
        return None
    if attr:
        val = node.get(attr)
        if not val and attr in ("src", "data-src"):
            val = node.get("data-src") or node.get("src") or node.get("srcset", "").split(" ")[0]
        return val
    return node.get_text(" ", strip=True)


def parse_css(html: str, store: dict) -> list[Offer]:
    soup = BeautifulSoup(html, "lxml")
    base = store.get("base_url", "")
    out: list[Offer] = []
    for card in soup.select(store["item"]) if store.get("item") else []:
        title = _select(card, store.get("title"))
        price = parse_price(_select(card, store.get("price")))
        link = _select(card, store.get("link"))
        if not link and card.name == "a":
            link = card.get("href")
        if not (title and price and link):
            continue
        img = _select(card, store.get("image"))
        out.append(
            Offer(
                title=title,
                price=price,
                old_price=parse_price(_select(card, store.get("old_price"))),
                url=urljoin(base, link),
                image=urljoin(base, img) if img else None,
                source=store["name"],
            )
        )
    return out


# ---------- structured-data fallback ----------
def _walk(obj, found: list[dict]):
    if isinstance(obj, dict):
        keys = {k.lower() for k in obj}
        if ("name" in keys or "title" in keys) and keys & {"offers", "price", "sale_price", "saleprice"}:
            found.append(obj)
        for v in obj.values():
            _walk(v, found)
    elif isinstance(obj, list):
        for v in obj:
            _walk(v, found)


def _first_price(d: dict):
    offers = d.get("offers")
    if isinstance(offers, list) and offers:
        offers = offers[0]
    if isinstance(offers, dict):
        return offers.get("price") or offers.get("lowPrice"), offers.get("url")
    for k in ("sale_price", "salePrice", "price"):
        if d.get(k) is not None:
            return d[k], None
    return None, None


def parse_structured(html: str, store: dict) -> list[Offer]:
    soup = BeautifulSoup(html, "lxml")
    blobs = []
    for s in soup.select('script[type="application/ld+json"], script#__NEXT_DATA__'):
        try:
            blobs.append(json.loads(s.string or ""))
        except (json.JSONDecodeError, TypeError):
            continue
    found: list[dict] = []
    for b in blobs:
        _walk(b, found)
    base = store.get("base_url", "")
    out = []
    for d in found:
        price_raw, offer_url = _first_price(d)
        price = parse_price(price_raw)
        title = d.get("name") or d.get("title")
        url = d.get("url") or offer_url or d.get("url_slug")
        if not (price and title and url and isinstance(title, str)):
            continue
        img = d.get("image")
        if isinstance(img, list):
            img = img[0] if img else None
        if isinstance(img, dict):
            img = img.get("url")
        out.append(
            Offer(title=title, price=price, url=urljoin(base, str(url)), image=img, source=store["name"])
        )
    return out


def parse(html: str, store: dict) -> list[Offer]:
    offers = parse_css(html, store)
    if not offers:
        offers = parse_structured(html, store)
    return offers[: settings.max_per_source]


def build_url(store: dict, query: str, lang: str) -> str:
    tmpl = store.get("search_url_ar") if lang == "ar" and store.get("search_url_ar") else store["search_url"]
    return tmpl.replace("{q}", quote_plus(query))


async def search_store(store: dict, query: str, lang: str) -> list[Offer]:
    url = build_url(store, query, lang)
    wait = (store.get("item") or "").split(",")[0] or None
    if store.get("render"):
        return parse(await render_html(url, lang, wait), store)

    html = None
    try:
        html = await get_html(url, lang)
        offers = parse(html, store)
        if offers:
            return offers
    except Blocked as e:
        log.info("%s blocked plain HTTP (%s), trying browser", store["name"], e)

    # plain HTTP got nothing usable -> retry once with a real browser
    if settings.playwright and store.get("render_fallback", True):
        try:
            return parse(await render_html(url, lang, wait), store)
        except Exception as e:  # noqa: BLE001
            if html is None:
                raise
            log.info("%s browser fallback failed: %s", store["name"], e)
    if html is None:
        raise Blocked("blocked and no browser fallback")
    return []
