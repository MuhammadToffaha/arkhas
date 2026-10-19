"""HTTP fetch with browser-like headers, plus optional headless Chromium for JS sites."""
from __future__ import annotations

import asyncio
import logging
import random

import httpx

from ..config import settings

log = logging.getLogger(__name__)

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
]


def headers(lang: str = "en") -> dict[str, str]:
    return {
        "User-Agent": random.choice(UAS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.8" if lang == "ar" else "en-US,en;q=0.9,ar;q=0.7",
    }


_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            follow_redirects=True, timeout=settings.source_timeout, proxy=settings.proxy, http2=False
        )
    return _client


class Blocked(Exception):
    pass


async def get_html(url: str, lang: str = "en") -> str:
    r = await client().get(url, headers=headers(lang))
    if r.status_code in (403, 429, 503):
        raise Blocked(f"HTTP {r.status_code}")
    r.raise_for_status()
    return r.text


# ---------- Playwright (optional) ----------
_browser = None
_pw = None
_lock = asyncio.Lock()
_sem = asyncio.Semaphore(3)  # max concurrent pages


async def _get_browser():
    global _browser, _pw
    async with _lock:
        if _browser is None:
            from playwright.async_api import async_playwright  # imported lazily

            _pw = await async_playwright().start()
            launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if settings.proxy:
                launch["proxy"] = {"server": settings.proxy}
            _browser = await _pw.chromium.launch(**launch)
    return _browser


async def render_html(url: str, lang: str = "en", wait_selector: str | None = None) -> str:
    if not settings.playwright:
        raise RuntimeError("Playwright disabled (ENABLE_PLAYWRIGHT=false)")
    browser = await _get_browser()
    async with _sem:
        ctx = await browser.new_context(
            user_agent=random.choice(UAS),
            locale="ar-EG" if lang == "ar" else "en-US",
            viewport={"width": 1366, "height": 900},
        )
        page = await ctx.new_page()
        # skip heavy assets
        await page.route(
            "**/*",
            lambda route: route.abort()
            if route.request.resource_type in ("image", "media", "font")
            else route.continue_(),
        )
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=settings.source_timeout * 1000)
            if wait_selector:
                try:
                    await page.wait_for_selector(wait_selector, timeout=8000)
                except Exception:  # noqa: BLE001 - fall through to whatever loaded
                    pass
            await page.mouse.wheel(0, 3000)  # trigger lazy loading
            await page.wait_for_timeout(800)
            return await page.content()
        finally:
            await ctx.close()


async def shutdown():
    global _client, _browser, _pw
    if _client:
        await _client.aclose()
        _client = None
    if _browser:
        await _browser.close()
        _browser = None
    if _pw:
        await _pw.stop()
        _pw = None
