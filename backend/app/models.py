from __future__ import annotations

from pydantic import BaseModel, Field


class Offer(BaseModel):
    title: str
    price: float  # EGP
    url: str
    source: str  # store name, e.g. "Amazon.eg"
    currency: str = "EGP"
    old_price: float | None = None
    image: str | None = None
    seller: str | None = None
    via: str = "scraper"  # scraper | serpapi
    relevance: float = 0.0
    flags: list[str] = Field(default_factory=list)  # e.g. ["possible-accessory"]


class ExternalLink(BaseModel):
    name: str
    url: str
    kind: str  # social | classifieds


class SourceStatus(BaseModel):
    source: str
    ok: bool
    count: int = 0
    ms: int = 0
    error: str | None = None


class SearchResponse(BaseModel):
    query: str
    variants: list[str]
    best: Offer | None
    offers: list[Offer]
    hidden: int  # offers dropped as irrelevant
    links: list[ExternalLink]
    sources: list[SourceStatus]
    cached: bool = False
