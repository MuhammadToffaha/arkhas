# 🏷️ Arkhas — أرخص

Search once in **Arabic or English** → get the **cheapest price in Egypt** across online stores, with a **direct link** to the offer. Facebook Marketplace and Dubizzle open in one click, sorted by price.

```
"ايفون 15"  ──►  ["ايفون 15", "iphone 15"]  ──►  Amazon.eg · Noon · Jumia · B.TECH · 2B · Raya · Carrefour
                                              ──►  Google Shopping Egypt (SerpAPI, long tail of stores)
                                              ──►  rank: relevance filter → accessory/outlier flags → sort by EGP
                                              ──►  🏆 best offer + full list + Facebook / Dubizzle deep links
```

## 🚀 Run (Docker)

```bash
git clone https://github.com/<you>/arkhas.git && cd arkhas
cp .env.example .env          # add SERPAPI_KEY (optional but recommended)
docker compose up -d --build
# open http://<server-ip>:8080
```

API: `GET /api/search?q=غسالة سامسونج` · `GET /api/health` · add `&fresh=true` to skip the 15-min cache.

## 📱 Android app

The app is a light native shell; the search UI and scrapers live on your server.

```
phone app ──► your Arkhas server (Docker) ──► stores / Google Shopping
   │                    ▲
   └── checks GitHub Releases for new APK
```

**Install**
1. On the phone open **[Releases](https://github.com/MuhammadToffaha/arkhas/releases/latest)** → download `arkhas-1.0.N.apk` → allow "install unknown apps" once.
2. First launch asks for the server address, e.g. `http://192.168.1.50:8080` (home Wi-Fi) or your HTTPS tunnel URL.

**Extras**
- 🔗 **Share** a product from any app (Amazon, Facebook, WhatsApp…) → choose **أرخص** → instant price search.
- ✂️ Select text anywhere → **بحث بأرخص سعر** in the text menu.
- Store / Facebook links open in their own apps.
- ⋮ menu: Reload · Server · Check for updates.

**Updating**

| You changed… | What to do | Phone |
|---|---|---|
| Scrapers, stores, UI (`backend/`) | `git pull && docker compose up -d --build` on server | Pull-to-refresh. No new APK. |
| The app itself (`android/`) | `git push` | GitHub Actions builds APK + Release → app says "New version" |

Rebuild without code change: Actions → **android-apk** → Run workflow (can pre-fill your server URL).

**Reaching the server outside home**: put it behind [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [Tailscale](https://tailscale.com) and use that HTTPS URL in the app.

**Signing key**: `android/keystore/arkhas.jks` keeps every build installable over the last one. For better security move it into repo secrets `ARKHAS_KEYSTORE_B64` (base64 of the file) and `ARKHAS_KEYSTORE_PASSWORD` (Settings → Secrets → Actions), then delete the file and the fallback password from `.github/workflows/android.yml`. Keep the same key, or users must uninstall once.

Web alternative: open the server in Chrome → ⋮ → **Add to Home screen**.

## 🧩 How it works

| Part | File | Notes |
|---|---|---|
| Arabic/English normalization | `backend/app/normalize.py` | أ/إ/آ→ا, ة→ه, ى→ي, tashkeel, ٠-٩ digits, `ايفون15`→`ايفون 15` |
| Bilingual dictionary | `backend/app/data/synonyms.yaml` | Add words here (first Arabic spelling = preferred) |
| Stores (no code needed) | `backend/app/data/stores.yaml` | Search URL + CSS selectors; JSON-LD fallback; `render: true` = headless Chromium |
| Google Shopping Egypt | `backend/app/sources/serpapi.py` | `gl=eg`, Arabic + English; foreign-currency listings dropped |
| Facebook / Dubizzle | `backend/app/sources/links.py` | Deep links only, sorted by price (`FB_CITY` in `.env`) |
| Ranking | `backend/app/ranking.py` | Drops off-topic results, flags accessories ("case for iPhone") and prices < 30 % of median |
| UI | `backend/app/static/index.html` | RTL/LTR toggle, best-offer card, source status |

## 🩺 When a store stops returning results

Stores redesign their pages. Check which source broke:

```bash
docker compose exec app python -m app.doctor "iphone 15"
```

Then fix that store's selectors in `stores.yaml` (browser DevTools → inspect a product card) and `docker compose restart`. Same way you add a new store.

## 📘 Why Facebook is a link, not scraped

Marketplace requires login, Meta's terms forbid automated collection, and scraping gets accounts banned. Arkhas opens Marketplace / posts search with your query already sorted by price — one click, no risk.

## ⚖️ Be a good citizen

- Results are cached 15 min; one search ≈ 1–2 requests per store. Keep it for personal use.
- Respect each site's terms. If a store blocks your server IP, set `SCRAPER_PROXY` or disable that store.
- Prices are scraped — always confirm on the store page before paying.

## 🧪 Tests

```bash
cd backend && pip install -r requirements-dev.txt && pytest
```

Fixtures cover Jumia/Amazon HTML, JSON-LD fallback, SerpAPI, Arabic price formats, cross-language relevance, accessory filtering and an end-to-end mocked search.
