"""Deep links for places that must not be scraped (Facebook) or are marketplaces of used items."""
from __future__ import annotations

from urllib.parse import quote, quote_plus

from ..config import settings
from ..models import ExternalLink


def external_links(query: str) -> list[ExternalLink]:
    q = quote_plus(query)
    slug = quote(query.strip().replace(" ", "-"))
    city = settings.fb_city
    return [
        ExternalLink(name="Facebook Marketplace", kind="social",
                     url=f"https://www.facebook.com/marketplace/{city}/search/?query={q}&sortBy=price_ascend"),
        ExternalLink(name="Facebook posts & groups", kind="social",
                     url=f"https://www.facebook.com/search/posts/?q={q}"),
        ExternalLink(name="Dubizzle Egypt", kind="classifieds",
                     url=f"https://www.dubizzle.com.eg/en/ads/q-{slug}/?sorting=asc-price"),
        ExternalLink(name="Google Shopping Egypt", kind="classifieds",
                     url=f"https://www.google.com.eg/search?tbm=shop&q={q}&tbs=p_ord:p"),
    ]
