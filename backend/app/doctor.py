"""Health check for every source.  Usage:  python -m app.doctor "iphone 15"

Prints, per store: OK/FAIL, how many offers, time, error, and the cheapest hit.
Use it after a store redesign to know which selectors in stores.yaml need fixing.
"""
from __future__ import annotations

import asyncio
import sys

from . import aggregator
from .sources.fetch import shutdown


async def main(q: str):
    r = await aggregator.search(q, use_cache=False)
    print(f"\nQuery: {q}   variants: {r.variants}\n")
    print(f"{'source':28} {'ok':4} {'n':>4} {'ms':>6}  error")
    for s in r.sources:
        print(f"{s.source:28} {'✅' if s.ok and s.count else '❌':3} {s.count:>4} {s.ms:>6}  {s.error or ''}")
    print(f"\nKept {len(r.offers)} relevant, hid {r.hidden} irrelevant.")
    if r.best:
        print(f"🏆 Best: {r.best.price:,.0f} EGP  {r.best.source}  {r.best.title[:70]}\n   {r.best.url}")
    await shutdown()


if __name__ == "__main__":
    asyncio.run(main(" ".join(sys.argv[1:]) or "iphone 15"))
