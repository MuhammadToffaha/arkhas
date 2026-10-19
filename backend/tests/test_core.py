import json
from pathlib import Path

import httpx
import pytest
import respx

from app import aggregator
from app.config import load_stores, settings
from app.models import Offer
from app.normalize import normalize, query_variants
from app.price import parse_price
from app.ranking import rank, relevance
from app.sources import serpapi
from app.sources.links import external_links
from app.sources.store import build_url, parse

FX = Path(__file__).parent / "fixtures"
STORES = {s["name"]: s for s in load_stores()}


# ---------- normalize / translate ----------
def test_normalize_arabic_variants():
    assert normalize("آيفونٌ ١٥ بـرو") == "ايفون 15 برو"
    assert normalize("ثلاجة") == normalize("ثلاجه")
    assert normalize("ايفون15") == "ايفون 15"


@pytest.mark.parametrize("q,expected", [
    ("ايفون 15 برو", "iphone 15 pro"),
    ("غسالة سامسونج", "washing machine samsung"),
    ("iphone 15", "ايفون 15"),
    ("samsung washing machine", "سامسونج غساله"),
])
def test_query_variants(q, expected):
    v = query_variants(q)
    assert v[0] == q and normalize(v[1]) == normalize(expected)


# ---------- price ----------
@pytest.mark.parametrize("raw,val", [
    ("EGP 41,999.00", 41999), ("٥٤٬٩٩٩٫٠٠ جنيه", 54999), ("12.999 ج.م", 12999),
    ("1.299,50 EGP", 1299.5), ("EGP 150", 150), (39900, 39900), ("call", None), ("0", None),
])
def test_parse_price(raw, val):
    assert parse_price(raw) == val


# ---------- store parsers ----------
def test_jumia_css():
    offers = parse((FX / "jumia.html").read_text(), STORES["Jumia"])
    assert len(offers) == 3
    o = offers[0]
    assert o.price == 41999 and o.old_price == 45000
    assert o.url == "https://www.jumia.com.eg/apple-iphone-15-128gb-black-12345.html"
    assert o.image == "https://eg.jumia.is/p1.jpg"


def test_amazon_css_arabic_digits():
    offers = parse((FX / "amazon.html").read_text(), STORES["Amazon.eg"])
    assert [o.price for o in offers] == [40750, 54999]
    assert offers[0].url.startswith("https://www.amazon.eg/Apple-iPhone-15-128-GB/dp/B0X1")


def test_jsonld_fallback():
    store = {"name": "X", "base_url": "https://store.eg", "item": "div.nothing", "title": "h2", "price": ".p"}
    offers = parse((FX / "jsonld.html").read_text(), store)
    assert {(o.title, o.price) for o in offers} == {("Apple iPhone 15 128GB", 40999), ("Apple iPhone 15 Plus", 46999)}
    assert offers[0].url == "https://store.eg/en/iphone-15-128"


def test_build_url_lang():
    assert build_url(STORES["Amazon.eg"], "ايفون 15", "ar").endswith("language=ar_AE")
    assert "q=iphone+15" in build_url(STORES["Jumia"], "iphone 15", "en")


def test_serpapi_parse_skips_foreign_currency():
    offers = serpapi.parse(json.loads((FX / "serpapi.json").read_text()))
    assert [o.price for o in offers] == [39900, 39500]
    assert offers[1].url.startswith("https://www.google.com.eg/shopping")


# ---------- ranking ----------
def _o(t, p, s="S", u=None):
    return Offer(title=t, price=p, source=s, url=u or f"https://{s}/{t}")


def test_relevance_cross_language():
    assert relevance("ايفون 15", "Apple iPhone 15 128GB") == 1.0
    assert relevance("iphone 15 pro", "ابل ايفون 15 برو 256 جيجا") == 1.0
    assert relevance("iphone 15", "Samsung Galaxy A15") < 0.6


def test_rank_picks_real_product_not_case():
    offers = [_o("Silicone Case For iPhone 15", 150), _o("Apple iPhone 15 128GB", 41999),
              _o("Apple iPhone 15 128GB", 40500, "T"), _o("Samsung Galaxy A15", 7499)]
    kept, hidden = rank("iphone 15", offers)
    assert hidden == 1  # samsung
    assert kept[0].price == 40500 and not kept[0].flags
    case = next(o for o in kept if "Case" in o.title)
    assert "possible-accessory" in case.flags and kept[-1] is case


def test_rank_allows_accessory_when_asked():
    kept, _ = rank("iphone 15 case", [_o("Silicone Case For iPhone 15", 150)])
    assert kept[0].flags == []


def test_dedupe_same_url():
    kept, _ = rank("iphone 15", [_o("iPhone 15", 100, u="https://a/x?ref=1"), _o("iPhone 15", 90, u="https://a/x?ref=2")])
    assert len(kept) == 1 and kept[0].price == 90


def test_facebook_links():
    links = external_links("ايفون 15")
    fb = links[0]
    assert fb.url.startswith("https://www.facebook.com/marketplace/cairo/search/?query=")
    assert "sortBy=price_ascend" in fb.url


# ---------- end-to-end with mocked network ----------
@pytest.mark.asyncio
@respx.mock
async def test_aggregator_end_to_end(monkeypatch):
    monkeypatch.setattr(settings, "playwright", False)
    monkeypatch.setattr(settings, "serpapi_key", "test")
    monkeypatch.setattr(aggregator, "load_stores",
                        lambda: [STORES["Jumia"], STORES["Amazon.eg"]])
    respx.get(url__startswith="https://www.jumia.com.eg").mock(
        return_value=httpx.Response(200, text=(FX / "jumia.html").read_text()))
    respx.get(url__startswith="https://www.amazon.eg").mock(return_value=httpx.Response(503))
    respx.get(url__startswith="https://serpapi.com").mock(
        return_value=httpx.Response(200, text=(FX / "serpapi.json").read_text()))

    r = await aggregator.search("ايفون 15", use_cache=False)
    assert r.variants == ["ايفون 15", "iphone 15"]
    assert r.best.price == 39500 and r.best.via == "serpapi"
    status = {s.source: s for s in r.sources}
    assert status["Jumia"].count > 0 and not status["Amazon.eg"].ok
    assert all("possible-accessory" in o.flags for o in r.offers if "Case" in o.title)
