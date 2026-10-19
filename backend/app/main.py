from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import aggregator
from .config import WEB, load_stores, settings
from .models import SearchResponse
from .sources.fetch import shutdown

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await shutdown()


app = FastAPI(title="Arkhas — أرخص", version="1.0", lifespan=lifespan)


@app.get("/api/search", response_model=SearchResponse)
async def api_search(q: str = Query(..., min_length=2, max_length=120), fresh: bool = False):
    q = q.strip()
    if not q:
        raise HTTPException(400, "empty query")
    return await aggregator.search(q, use_cache=not fresh)


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "stores": [s["name"] for s in load_stores()],
        "serpapi": bool(settings.serpapi_key),
        "playwright": settings.playwright,
    }


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/web", StaticFiles(directory=WEB), name="web")
