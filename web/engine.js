/*
 * Arkhas search engine — runs on the phone (inside the app) and in Node tests.
 * Mirrors backend/app/{normalize,price,ranking,sources/store}.py.
 * Network access is injected: fetcher(url, {lang, render, wait, json}) -> Promise<string>
 */
(function (root) {
  "use strict";

  // ---------------- normalize ----------------
  const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
  const ARABIC = /[؀-ۿ]/;
  const DIGITS = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
  const LETTERS = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي" };
  const WORD = "[\\p{L}\\p{N}\\p{M}_]";

  const isArabic = (t) => ARABIC.test(t || "");

  function normalize(text) {
    if (!text) return "";
    let t = String(text).normalize("NFKC").replace(TASHKEEL, "");
    t = t.replace(/./gu, (c) => DIGITS[c] || LETTERS[c] || c).toLowerCase();
    t = t.replace(/[^\p{L}\p{N}\p{M}\s_]+/gu, " ");
    t = t.replace(/(?<=[؀-ۿ])(?=[a-z0-9])|(?<=[a-z0-9])(?=[؀-ۿ])/g, " ");
    return t.replace(/\s+/g, " ").trim();
  }
  const tokens = (t) => normalize(t).split(" ").filter(Boolean);

  // ---------------- bilingual dictionary ----------------
  let LOOKUP = new Map(), ORDER = new Map();

  function setSynonyms(dict) {
    LOOKUP = new Map(); ORDER = new Map();
    let i = 0;
    for (const [en, variants] of Object.entries(dict || {})) {
      const words = [en, ...(variants || [])].map((w) => normalize(String(w))).filter(Boolean);
      for (const w of words) if (!ORDER.has(w)) ORDER.set(w, i++);
      const group = new Set(words);
      for (const w of group) {
        if (!LOOKUP.has(w)) LOOKUP.set(w, new Set());
        for (const g of group) LOOKUP.get(w).add(g);
      }
    }
  }

  function equivalents(token) {
    const t = normalize(token);
    const s = new Set(LOOKUP.get(t) || []);
    s.add(t);
    return s;
  }

  function pick(group, arabic) {
    const rank = (g) => (ORDER.has(g) ? ORDER.get(g) : 1e9);
    const all = [...group];
    const c = all.filter((g) => isArabic(g) === arabic).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
    return c.length ? c[0] : all.sort()[0];
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function translateQuery(query, toArabic) {
    let out = normalize(query);
    const phrases = [...LOOKUP.keys()].filter((k) => k.includes(" ")).sort((a, b) => b.length - a.length);
    for (const p of phrases) {
      const re = new RegExp(`(?<!${WORD})${esc(p)}(?!${WORD})`, "gu");
      if (re.test(out)) out = out.replace(re, "\u0000" + pick(LOOKUP.get(p), toArabic) + "\u0000");
    }
    const words = [];
    for (const part of out.split(/(\u0000[^\u0000]*\u0000)/)) {
      if (part.startsWith("\u0000")) { words.push(part.replace(/\u0000/g, "")); continue; }
      for (const w of part.split(" ").filter(Boolean)) words.push(LOOKUP.has(w) ? pick(LOOKUP.get(w), toArabic) : w);
    }
    return words.join(" ").trim();
  }

  function queryVariants(query) {
    const q = query.trim();
    const other = translateQuery(q, !isArabic(q));
    return other && normalize(other) !== normalize(q) ? [q, other] : [q];
  }

  // ---------------- price ----------------
  function parsePrice(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return raw > 0 ? raw : null;
    let s = String(raw).replace(/[٠-٩]/g, (c) => DIGITS[c]).replace(/٬/g, ",").replace(/٫/g, ".").replace(/ /g, " ");
    const m = s.match(/\d[\d.,\s]*/);
    if (!m) return null;
    let num = m[0].replace(/\s/g, "").replace(/[.,]+$/, "");
    if (num.includes(",") && num.includes(".")) {
      num = num.lastIndexOf(",") > num.lastIndexOf(".") ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
    } else if (num.includes(",")) {
      num = /^\d{1,3}(,\d{3})+$/.test(num) ? num.replace(/,/g, "") : num.replace(",", ".");
    } else if (num.includes(".") && /^\d{1,3}(\.\d{3})+$/.test(num)) {
      num = num.replace(/\./g, "");
    }
    const v = parseFloat(num);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  // ---------------- ranking ----------------
  const ACCESSORY = new Set(["case", "cover", "protector", "screen protector", "glass", "skin", "strap", "cable", "adapter",
    "holder", "stand", "sticker", "pouch", "sleeve", "replacement", "spare", "charger", "cases",
    "جراب", "كفر", "اسكرينه", "سكرينه", "حمايه", "لزقه", "كابل", "وصله", "حامل", "استاند", "غطاء", "شاحن"]);
  const STOP = new Set(["the", "a", "an", "and", "with", "of", "in", "new", "ال", "و", "مع", "في", "من", "جديد"]);

  function relevance(query, title) {
    const q = tokens(query).filter((t) => !STOP.has(t));
    if (!q.length) return 0;
    const tt = tokens(title), tset = new Set(tt), tnorm = tt.join(" ");
    let hits = 0;
    for (const t of q) {
      const eq = equivalents(t);
      if ([...eq].some((e) => (e.includes(" ") && tnorm.includes(e)) || tset.has(e))) hits += 1;
      else if (/^\d+$/.test(t) && tt.some((w) => w.includes(t))) hits += 0.8;
      else if (t.length >= 4 && tt.some((w) => w.length >= 3 && (w.startsWith(t) || t.startsWith(w)))) hits += 0.6;
    }
    return Math.round((hits / q.length) * 1000) / 1000;
  }

  function isAccessory(query, title) {
    if (tokens(query).some((t) => ACCESSORY.has(t))) return false;
    return tokens(title).slice(0, 6).some((t) => ACCESSORY.has(t));
  }

  function rank(query, offers, minRelevance = 0.6) {
    const seen = new Map();
    for (const o of offers) {
      o.relevance = relevance(query, o.title);
      o.flags = o.flags || [];
      const key = o.source.toLowerCase() + "|" + o.url.split("?")[0].replace(/\/$/, "");
      if (!seen.has(key) || o.price < seen.get(key).price) seen.set(key, o);
    }
    const pool = [...seen.values()];
    const kept = pool.filter((o) => o.relevance >= minRelevance);
    for (const o of kept) if (isAccessory(query, o.title)) o.flags.push("possible-accessory");
    const core = kept.filter((o) => !o.flags.length).map((o) => o.price).sort((a, b) => a - b);
    if (core.length >= 4) {
      const mid = core.length >> 1;
      const med = core.length % 2 ? core[mid] : (core[mid - 1] + core[mid]) / 2;
      for (const o of kept) if (o.price < med * 0.3 && !o.flags.includes("suspiciously-cheap")) o.flags.push("suspiciously-cheap");
    }
    kept.sort((a, b) => (a.flags.length > 0) - (b.flags.length > 0) || a.price - b.price);
    return { kept, hidden: pool.length - kept.length };
  }

  function top(offers, n = 3) {
    const clean = offers.filter((o) => !o.flags.length);
    return (clean.length ? clean : offers).slice(0, n);
  }

  // ---------------- store parsing ----------------
  function absUrl(link, base) {
    try { return new URL(link, base || undefined).href; } catch (_) { return link; }
  }

  function sel(el, spec) {
    if (!spec) return null;
    const i = spec.lastIndexOf("@");
    const css = i > 0 ? spec.slice(0, i) : spec, attr = i > 0 ? spec.slice(i + 1) : null;
    let node;
    try { node = el.querySelector(css); } catch (_) { return null; }
    if (!node) return null;
    if (attr) {
      let v = node.getAttribute(attr);
      if (!v && (attr === "src" || attr === "data-src")) {
        v = node.getAttribute("data-src") || node.getAttribute("src") || (node.getAttribute("srcset") || "").split(" ")[0];
      }
      return v || null;
    }
    return (node.textContent || "").replace(/\s+/g, " ").trim() || null;
  }

  function parseCss(doc, store) {
    const out = [];
    if (!store.item) return out;
    let cards;
    try { cards = doc.querySelectorAll(store.item); } catch (_) { return out; }
    for (const card of cards) {
      const title = sel(card, store.title);
      const price = parsePrice(sel(card, store.price));
      let link = sel(card, store.link);
      if (!link && card.tagName === "A") link = card.getAttribute("href");
      if (!(title && price && link)) continue;
      const img = sel(card, store.image);
      out.push({
        title, price, url: absUrl(link, store.base_url),
        old_price: parsePrice(sel(card, store.old_price)),
        image: img ? absUrl(img, store.base_url) : null,
        source: store.name, via: "scraper",
      });
    }
    return out;
  }

  function walk(obj, found) {
    if (Array.isArray(obj)) { for (const v of obj) walk(v, found); return; }
    if (obj && typeof obj === "object") {
      const keys = new Set(Object.keys(obj).map((k) => k.toLowerCase()));
      if ((keys.has("name") || keys.has("title")) && ["offers", "price", "sale_price", "saleprice"].some((k) => keys.has(k))) found.push(obj);
      for (const v of Object.values(obj)) walk(v, found);
    }
  }

  function firstPrice(d) {
    let offers = d.offers;
    if (Array.isArray(offers)) offers = offers[0];
    if (offers && typeof offers === "object") return [offers.price ?? offers.lowPrice, offers.url];
    for (const k of ["sale_price", "salePrice", "price"]) if (d[k] !== undefined && d[k] !== null) return [d[k], null];
    return [null, null];
  }

  function parseStructured(doc, store) {
    const found = [];
    for (const s of doc.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__')) {
      try { walk(JSON.parse(s.textContent || ""), found); } catch (_) { /* skip */ }
    }
    const out = [];
    for (const d of found) {
      const [raw, offerUrl] = firstPrice(d);
      const price = parsePrice(raw);
      const title = d.name || d.title;
      const url = d.url || offerUrl || d.url_slug;
      if (!(price && typeof title === "string" && url)) continue;
      let img = d.image;
      if (Array.isArray(img)) img = img[0] || null;
      if (img && typeof img === "object") img = img.url;
      out.push({ title, price, url: absUrl(String(url), store.base_url), image: img || null, source: store.name, via: "scraper" });
    }
    return out;
  }

  function parse(html, store, DOMParserImpl, max = 20) {
    const P = DOMParserImpl || root.DOMParser;
    const doc = new P().parseFromString(html, "text/html");
    let offers = parseCss(doc, store);
    if (!offers.length) offers = parseStructured(doc, store);
    return offers.slice(0, max);
  }

  function buildUrl(store, query, lang) {
    const tmpl = lang === "ar" && store.search_url_ar ? store.search_url_ar : store.search_url;
    return tmpl.replace("{q}", encodeURIComponent(query).replace(/%20/g, "+"));
  }

  // ---------------- SerpAPI (Google Shopping Egypt) ----------------
  function parseSerp(data) {
    const out = [];
    for (const r of [...(data.shopping_results || []), ...(data.inline_shopping_results || [])]) {
      const raw = r.price || "";
      if (raw.includes("$") || raw.includes("€")) continue;
      const price = parsePrice(r.extracted_price ?? raw);
      const link = r.link || r.product_link;
      if (!(price && link && r.title)) continue;
      out.push({ title: r.title, price, old_price: parsePrice(r.extracted_old_price ?? r.old_price),
        url: link, image: r.thumbnail || null, source: r.source || "Google Shopping", via: "serpapi" });
    }
    return out;
  }

  function serpUrl(query, lang, key) {
    const p = new URLSearchParams({ engine: "google_shopping", q: query, gl: "eg", hl: lang === "ar" ? "ar" : "en",
      google_domain: "google.com.eg", location: "Cairo,Cairo Governorate,Egypt", api_key: key });
    return "https://serpapi.com/search.json?" + p.toString();
  }

  // ---------------- deep links ----------------
  function externalLinks(query, city = "cairo") {
    const q = encodeURIComponent(query).replace(/%20/g, "+");
    const slug = encodeURIComponent(query.trim().replace(/ /g, "-"));
    return [
      { name: "Facebook Marketplace", kind: "social", url: `https://www.facebook.com/marketplace/${city}/search/?query=${q}&sortBy=price_ascend` },
      { name: "Facebook posts & groups", kind: "social", url: `https://www.facebook.com/search/posts/?q=${q}` },
      { name: "Dubizzle Egypt", kind: "classifieds", url: `https://www.dubizzle.com.eg/en/ads/q-${slug}/?sorting=asc-price` },
      { name: "Google Shopping Egypt", kind: "classifieds", url: `https://www.google.com.eg/search?tbm=shop&q=${q}&tbs=p_ord:p` },
    ];
  }

  // ---------------- orchestration ----------------
  function plan(variants, wanted) {
    const by = {};
    for (const v of variants) { const l = isArabic(v) ? "ar" : "en"; if (!(l in by)) by[l] = v; }
    if (wanted === "both") return Object.entries(by);
    if (by[wanted]) return [[wanted, by[wanted]]];
    return [[isArabic(variants[0]) ? "ar" : "en", variants[0]]];
  }

  async function searchStore(store, q, lang, fetcher, opt) {
    const url = buildUrl(store, q, lang);
    const wait = (store.item || "").split(",")[0] || null;
    if (store.render) return parse(await fetcher(url, { lang, render: true, wait }), store, opt.DOMParser, opt.maxPerSource);
    let html = null, blocked = null;
    try {
      html = await fetcher(url, { lang });
      const offers = parse(html, store, opt.DOMParser, opt.maxPerSource);
      if (offers.length) return offers;
    } catch (e) { blocked = e; }
    if (opt.renderFallback && store.render_fallback !== false) {
      return parse(await fetcher(url, { lang, render: true, wait }), store, opt.DOMParser, opt.maxPerSource);
    }
    if (blocked) throw blocked;
    return [];
  }

  /**
   * opts: { stores, fetcher, serpKey, minRelevance, maxPerSource, renderFallback, city, DOMParser, onProgress }
   * onProgress(result) fires after each source finishes, so the UI can show results as they arrive.
   */
  async function search(query, opts) {
    const opt = Object.assign({ minRelevance: 0.6, maxPerSource: 20, renderFallback: true, city: "cairo" }, opts);
    const variants = queryVariants(query);
    const all = [], sources = [];
    const snapshot = () => {
      const { kept, hidden } = rank(query, all.map((o) => Object.assign({}, o, { flags: [] })), opt.minRelevance);
      return { query, variants, offers: kept, top3: top(kept, 3), hidden, sources: sources.slice(),
        links: externalLinks(query, opt.city) };
    };
    const jobs = [];
    for (const store of (opt.stores || []).filter((s) => s.enabled !== false)) {
      jobs.push({ name: store.name, run: () => plan(variants, store.lang || "both").map(([l, q]) => searchStore(store, q, l, opt.fetcher, opt)) });
    }
    if (opt.serpKey) {
      jobs.push({ name: "Google Shopping", run: () => plan(variants, "both").map(([l, q]) =>
        opt.fetcher(serpUrl(q, l, opt.serpKey), { lang: l, json: true }).then((t) => {
          const d = JSON.parse(t); if (d.error) throw new Error(d.error); return parseSerp(d);
        })) });
    }
    await Promise.all(jobs.map(async (j) => {
      const t0 = Date.now();
      const res = await Promise.allSettled(j.run());
      const got = res.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
      const errs = res.filter((r) => r.status === "rejected").map((r) => String(r.reason && r.reason.message || r.reason));
      all.push(...got);
      sources.push({ source: j.name, ok: got.length > 0 || !errs.length, count: got.length, ms: Date.now() - t0, error: errs.join("; ").slice(0, 200) || null });
      if (opt.onProgress) opt.onProgress(snapshot());
    }));
    return snapshot();
  }

  const API = { normalize, tokens, isArabic, setSynonyms, equivalents, translateQuery, queryVariants, parsePrice,
    relevance, rank, top, parse, parseSerp, buildUrl, serpUrl, externalLinks, search };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Arkhas = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
