from __future__ import annotations

import os
from pathlib import Path

import yaml

BASE = Path(__file__).parent


class Settings:
    serpapi_key: str = os.getenv("SERPAPI_KEY", "")
    fb_city: str = os.getenv("FB_CITY", "cairo")
    cache_ttl: int = int(os.getenv("CACHE_TTL_SECONDS", "900"))
    source_timeout: float = float(os.getenv("SOURCE_TIMEOUT_SECONDS", "25"))
    max_per_source: int = int(os.getenv("MAX_RESULTS_PER_SOURCE", "20"))
    min_relevance: float = float(os.getenv("MIN_RELEVANCE", "0.6"))
    playwright: bool = os.getenv("ENABLE_PLAYWRIGHT", "true").lower() == "true"
    proxy: str | None = os.getenv("SCRAPER_PROXY") or None  # optional, e.g. http://user:pass@host:port
    stores_file: Path = Path(os.getenv("STORES_FILE", str(BASE / "data" / "stores.yaml")))


settings = Settings()


def load_stores() -> list[dict]:
    data = yaml.safe_load(settings.stores_file.read_text(encoding="utf-8")) or []
    return [s for s in data if s.get("enabled", True)]
