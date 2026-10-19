# 🏷️ Arkhas — أرخص

Android app: type a product in **Arabic or English** → get the **3 cheapest prices in Egypt** with direct links. Facebook Marketplace and Dubizzle open in one click, sorted by price.

**No server needed.** The phone searches the stores itself; GitHub only hosts the code, the store rules and the APK.

```
phone ── web/engine.js ──► Amazon.eg · Noon · Jumia · B.TECH · 2B · Raya · Carrefour   (+ Google Shopping with a SerpAPI key)
  │                        rank: relevance → accessory / outlier flags → 🥇🥈🥉
  ├── on start: newest web/ files from GitHub  (store fixes, UI)
  └── every 12 h: newest APK from GitHub Releases
```

## 📱 Install

1. On the phone open **[Releases](https://github.com/MuhammadToffaha/arkhas/releases/latest)** → download `arkhas-1.0.N.apk` → allow "install unknown apps" once.
2. Open **أرخص**, type e.g. `ايفون 15` → top 3 appear as stores answer (JS-heavy stores take a few seconds more).
3. Optional ⚙️: add a free [SerpAPI](https://serpapi.com) key for Google Shopping (hundreds of extra Egyptian stores), set your Facebook city, turn stores on/off.

**Extras**: Share a product from any app → **أرخص** · select text anywhere → **بحث بأرخص سعر** · result links open in the store's own app.

## 🔄 Updating

| You change… | Then | Phone gets it |
|---|---|---|
| `web/stores.json` (fix/add a store), `web/synonyms.json`, `web/index.html`, `web/engine.js` | `git push` | Downloaded on next app start, active the start after. **No new APK.** |
| `android/` (native app) | `git push` | Actions builds APK → Release → red dot on ⚙️ → **Settings → 🔄 Updates → Download & install** (inside the app) |

**Stores (26)**: Amazon.eg · Noon · Jumia · B.TECH · 2B · Raya · Carrefour · Dream 2000 · Compumarts · Kimo Store · Tradeline · Raneen · Cairo Cart · Hyper One · Aman Stores · El Araby · Cairo Sales · Decathlon · Dubai Phone · El Nekhely · El Badr · Maximum Hardware · IKEA · Sigma 🐢 · Homzmart 🐢 · Fresh 🐢 (🐢 = slow JS sites, off by default, switch on in ⚙️).

`web/stores.json` fields:
- `type` — fast JSON search, no page loading: `shopify`, `woo` (WooCommerce), `magento` (GraphQL; `graphql` / `product_base` optional), `prestashop` (`path`), `ikea`. If it fails and `search_url` is set, the HTML page is used.
- `search_url` (`{q}` = query), optional `search_url_ar`; `item` / `title` / `price` / `old_price` / `link` / `image` CSS (`sel@attr` = attribute, comma = alternatives); JSON-LD fallback.
- `lang`: `both` (store gets the text as typed) · `en` / `ar` (store gets the translation).
- `render: true` = JS site, loaded in a hidden browser (slower) · `default_off: true` = off until enabled in ⚙️ · `enabled: false` = removed.

**Speed**: one request per store, 10 s limit per store (18 s for JS sites), 3 hidden browsers in parallel, results show as each store answers, same search within 15 min is instant.

**⚡ Flash deals** (bottom bar): biggest current discounts from 10 top sites — Jumia flash sales, Amazon deals, Dream 2000, Compumarts, Kimo Store, Tradeline (Shopify sale prices), Dubai Phone (WooCommerce on-sale), Cairo Sales (prices-drop), El Nekhely, Maximum Hardware (specials). Sort by % off / most saved / cheapest, filter by store, cached 1 h. Add a store with a `deals` entry in `web/stores.json`: `{"kind": "shopify" | "woo" | "prestashop"}` or `{"kind": "html", "url": "...", "render": false}` (+ optional selectors).

**Accuracy before price**: sizes and specs in the search must match — persons/place settings, GB/TB, inch, HP, kg, liter, ft, doors, burners (Arabic or English, ١٤ or 14). A title with a different value is dropped (asked 14 persons → 10-person models never show). Top 3 = cheapest **exact** matches; if fewer than 3 exist, close matches fill in, marked ≈. Extra model words (Pro, Max, Ultra…) are marked "other model".

**Arabic**: ال/بال/وال prefixes, 230+ Arabic↔English words and brands in `web/synonyms.json`, Google Translate for words not in the list (brands, slang), words like "ارخص / سعر / بكام" are ignored.

To check stores: after a search tap **🏪 Stores** in the bottom bar → count, time, error per store. Fix the card selectors with Chrome DevTools on the store's search page.

If `web/index.html` ever needs new native features, bump `arkhas-bridge` in it; older apps then keep their current copy until they update.

**Signing key**: `android/keystore/arkhas.jks` keeps every build installable over the last one. Before sharing the app with others, move it into repo secrets `ARKHAS_KEYSTORE_B64` + `ARKHAS_KEYSTORE_PASSWORD` and remove the file and fallback password from `.github/workflows/android.yml`. Keep the same key.

## 📘 Why Facebook is a link, not scraped

Marketplace requires login and Meta forbids automated collection (account bans). The app opens Marketplace / posts search with your query, sorted by price.

## ⚖️ Good citizen

One search = 1–2 page loads per store, from your phone, like a person browsing. Personal use. Prices are scraped — confirm on the store page before paying.

## 🖥️ Optional: self-hosted web version

`backend/` is a FastAPI + Playwright server with the same logic and the same `web/*.json` config, if you later get a server:
`cp .env.example .env && docker compose up -d --build` → `http://server:8080`.

## 🧩 How it works

| Part | File | Notes |
|---|---|---|
| Arabic/English normalization | `backend/app/normalize.py` | أ/إ/آ→ا, ة→ه, ى→ي, tashkeel, ٠-٩ digits, `ايفون15`→`ايفون 15` |
| Bilingual dictionary | `web/synonyms.json` | Add words here (first Arabic spelling = preferred) |
| Stores (no code needed) | `web/stores.json` | Search URL + CSS selectors; JSON-LD fallback; `render: true` = headless browser |
| Phone engine | `web/engine.js` + `web/index.html` | Same logic as the Python backend, runs in the app |
| Native app | `android/` | Network bridge, hidden renderer, self-update |
| Google Shopping Egypt | `backend/app/sources/serpapi.py` | `gl=eg`, Arabic + English; foreign-currency listings dropped |
| Facebook / Dubizzle | `backend/app/sources/links.py` | Deep links only, sorted by price (`FB_CITY` in `.env`) |
| Ranking | `backend/app/ranking.py` | Drops off-topic results, flags accessories ("case for iPhone") and prices < 30 % of median |
| UI | `backend/app/static/index.html` | RTL/LTR toggle, best-offer card, source status |

## 🧪 Tests

```bash
cd web-tests && npm install && npm test                      # phone engine + UI (jsdom)
cd backend && pip install -r requirements-dev.txt && pytest  # optional server
```

Fixtures cover Jumia/Amazon HTML, JSON-LD fallback, SerpAPI, Arabic price formats, cross-language relevance, accessory filtering and an end-to-end mocked search.
