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

  // Arabic attached prefixes: الايفون / بالايفون / والشاشه / للغساله -> bare word
  const AR_PREFIX = /^(وال|بال|فال|كال|لل|ال)(?=[؀-ۿ]{3,})/;
  const stripAr = (t) => (isArabic(t) ? t.replace(AR_PREFIX, "") : t);

  function equivalents(token) {
    const t = normalize(token);
    const s = new Set(LOOKUP.get(t) || []);
    s.add(t);
    const bare = stripAr(t);
    if (bare !== t) { s.add(bare); for (const g of LOOKUP.get(bare) || []) s.add(g); }
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
      for (const w of part.split(" ").filter(Boolean)) {
        const k = LOOKUP.has(w) ? w : LOOKUP.has(stripAr(w)) ? stripAr(w) : null;
        words.push(k ? pick(LOOKUP.get(k), toArabic) : w);
      }
    }
    return words.join(" ").trim();
  }

  function queryVariants(query) {
    const q = query.trim();
    const other = translateQuery(q, !isArabic(q));
    return other && normalize(other) !== normalize(q) ? [q, other] : [q];
  }

  /** Arabic words the dictionary could not translate (brands, models, slang). */
  const untranslated = (q) => tokens(translateQuery(q, false)).filter((w) => isArabic(w));

  /** Google Translate (free web endpoint) for queries the dictionary can't fully handle. Falls back silently. */
  async function translateRemote(q, fetcher, from = "ar", to = "en") {
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=" + from + "&tl=" + to + "&q=" + encodeURIComponent(q);
    const data = JSON.parse(await fetcher(url, { json: true, lang: "en" }));
    const out = (data[0] || []).map((p) => p[0]).join("").trim();
    return out || null;
  }

  /** [original, translation] — dictionary first, Google for Arabic words it doesn't know. */
  async function queryVariantsAsync(query, fetcher, timeoutMs = 2500) {
    const v = queryVariants(query);
    if (!isArabic(query) || !untranslated(query).length || !fetcher) return v;
    try {
      const t = await withTimeout(translateRemote(query, fetcher), timeoutMs);
      if (t && !isArabic(t)) return [v[0], t.toLowerCase()];
    } catch (_) { /* offline / blocked: keep dictionary version */ }
    return v;
  }

  function withTimeout(p, ms, label = "timeout") {
    let t;
    return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label)), ms); })]).finally(() => clearTimeout(t));
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
  const STOP = new Set(["the", "a", "an", "and", "with", "of", "in", "new", "for", "ال", "و", "مع", "في", "من", "جديد", "ل"]);
  // words that describe the wish, not the product: "ارخص ايفون 15" -> "ايفون 15"
  const INTENT = new Set(["سعر", "اسعار", "ارخص", "رخيص", "افضل", "احسن", "عرض", "عروض", "بكام", "كام", "price", "prices",
    "cheap", "cheapest", "best", "offer", "offers", "deal", "deals", "buy"]);
  function cleanQuery(q) {
    const kept = String(q).trim().split(/\s+/).filter((w) => !INTENT.has(normalize(w)));
    return kept.length ? kept.join(" ") : String(q).trim();
  }

  // ---------------- specs: "14 persons", "256GB", "55 بوصة", "1.5 حصان" ----------------
  // Each unit group = all the ways stores and people write it. Numbers next to these words must match exactly.
  const UNITS = [
    ["persons", ["place settings", "place setting", "settings", "setting", "persons", "person", "people", "place", "places", "ps",
      "pcs persons", "فرد", "افراد", "شخص", "اشخاص", "طقم", "اطقم"]],
    ["tb", ["tb", "terabyte", "تيرا", "تيرابايت"]],
    ["gb", ["gb", "gigabyte", "جيجا", "جيجابايت", "جيجا بايت"]],
    ["inch", ["inches", "inch", "\"", "''", "بوصه", "بوصة", "انش", "إنش"]],
    ["hp", ["hp", "horsepower", "horse", "حصان"]],
    ["kg", ["kg", "kilo", "kilogram", "كيلو", "كجم", "كغ"]],
    ["liter", ["liters", "liter", "litres", "litre", "ltr", "lt", "l", "لتر"]],
    ["ft", ["feet", "foot", "ft", "قدم"]],
    ["mah", ["mah", "مللي امبير"]],
    ["w", ["watts", "watt", "w", "وات"]],
    ["hz", ["hz", "هرتز"]],
    ["cm", ["cm", "سم"]],
    ["mp", ["mp", "megapixel", "ميجابكسل", "ميجا"]],
    ["burners", ["burners", "burner", "شعله", "شعلة", "عين"]],
    ["doors", ["doors", "door", "باب", "ابواب"]],
  ];
  const AR_DIG = /[٠-٩]/g;
  const UNIT_RE = (() => {
    const alts = [];
    for (const [u, words] of UNITS) for (const w of words) alts.push([w, u]);
    alts.sort((a, b) => b[0].length - a[0].length);   // longest first: "place settings" before "place"
    const escR = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const map = new Map(alts.map(([w, u]) => [w, u]));
    const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*-?\\s*(${alts.map(([w]) => escR(w)).join("|")})(?![\\p{L}\\p{N}])`, "giu");
    return { re, map };
  })();

  /** {persons:Set(["14"]), gb:Set(["256"])} found in a title or query. */
  function specs(text) {
    const t = String(text || "").replace(AR_DIG, (c) => DIGITS[c]).replace(/[٬]/g, "").replace(/٫/g, ".")
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase();
    const out = {};
    for (const m of t.matchAll(UNIT_RE.re)) {
      const unit = UNIT_RE.map.get(m[2].toLowerCase());
      if (!unit) continue;
      const num = String(parseFloat(m[1].replace(",", ".")));
      (out[unit] = out[unit] || new Set()).add(num);
    }
    // 1TB == 1024GB is written either way
    if (out.tb) for (const n of out.tb) (out.gb = out.gb || new Set()).add(String(+n * 1024)), (out.gb).add(String(+n * 1000));
    return out;
  }

  /** Remove "14 persons" style specs from text so the plain-word matching doesn't double count them. */
  const stripSpecs = (text) => String(text || "").replace(AR_DIG, (c) => DIGITS[c]).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه")
    .replace(UNIT_RE.re, " ");

  // Product-line words: "iphone 15" ≠ "iphone 15 pro max". Extra ones in a title = different model.
  const TIER = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "fe", "neo", "se", "edge",
    "برو", "ماكس", "بلس", "الترا", "ميني", "لايت"]);

  function wordScore(query, title) {
    const q = tokens(stripSpecs(query)).filter((t) => !STOP.has(t));
    if (!q.length) return { score: 1, miss: [] };
    const tt = tokens(title), tnorm = tt.join(" ");
    const tset = new Set(tt.concat(tt.map(stripAr)));
    // "iPhone15" -> iphone + 15 (only simple word+number glue; model codes like DFN05R14 stay whole)
    for (const w of tt) { const m = w.match(/^([a-z]{3,})(\d+)$/); if (m) { tset.add(m[1]); tset.add(m[2]); } }
    let hits = 0; const miss = [];
    for (const t of q) {
      const eq = equivalents(t);
      if ([...eq].some((e) => (e.includes(" ") && tnorm.includes(e)) || tset.has(e))) { hits += 1; continue; }
      if (/^\d+$/.test(t)) {
        // model numbers must be the whole word ("15" ≠ "a15", "dfn05r14"); "15gb"-style glue is handled by specs
        miss.push(t); continue;
      }
      if (t.length >= 4 && [...tset].some((w) => w.length >= 3 && (w.startsWith(stripAr(t)) || stripAr(t).startsWith(w)))) hits += 0.6;
      else miss.push(t);
    }
    return { score: hits / q.length, miss };
  }

  /**
   * How well an offer title matches what was asked.
   * tier 0 = exact (all words + all specs), 1 = close (spec not stated in title / extra model word), 2 = loose,
   * -1 = wrong (a spec in the title contradicts the query, e.g. asked 14 persons, title says 10).
   */
  function matchInfo(query, title, variants) {
    const qs = specs(query);
    for (const v of variants || []) { const s2 = specs(v); for (const u in s2) if (!qs[u]) qs[u] = s2[u]; }
    const ts = specs(title);
    const tWords = new Set(tokens(title));
    let specOk = 0, specUnknown = 0;
    for (const u in qs) {
      if (u === "tb") continue;
      const want = [...qs[u]];
      if (ts[u] && ts[u].size) {
        if (want.some((n) => ts[u].has(n))) specOk++;
        else return { tier: -1, score: 0, why: `${u}: ${[...ts[u]].join("/")} ≠ ${want.join("/")}` };
      } else if (want.some((n) => tWords.has(n))) specOk++;   // "Beko 14 Dishwasher" — number without the unit word
      else specUnknown++;
    }
    let best = { score: 0, miss: [] };
    for (const v of [query, ...(variants || [])]) {
      const w = wordScore(v, title);
      if (w.score > best.score) best = w;
    }
    const qAll = new Set([query, ...(variants || [])].flatMap((v) => tokens(v)));
    const extraTier = [...tWords].filter((w) => TIER.has(w) && !qAll.has(w) && ![...equivalents(w)].some((e) => qAll.has(e)));
    const words = Math.round(best.score * 1000) / 1000;
    let tier = 2;
    if (words >= 0.999 && !specUnknown && !extraTier.length) tier = 0;
    else if (words >= 0.8) tier = 1;
    return { tier, score: words, specOk, specUnknown, extraTier, miss: best.miss };
  }

  /** 0..1 word match (kept for callers/tests); specs that contradict give 0. */
  function relevance(query, title, variants) {
    const m = matchInfo(query, title, variants);
    return m.tier === -1 ? 0 : m.score;
  }

  function isAccessory(query, title) {
    if (tokens(query).some((t) => ACCESSORY.has(t))) return false;
    return tokens(title).slice(0, 6).some((t) => ACCESSORY.has(t));
  }

  /**
   * Accuracy first, then price: exact matches (cheapest first) → close matches → loose.
   * Offers whose specs contradict the query are dropped.
   */
  function rank(query, offers, minRelevance = 0.6, variants) {
    const seen = new Map();
    for (const o of offers) {
      const key = o.source.toLowerCase() + "|" + o.url.split("?")[0].replace(/\/$/, "");
      if (!seen.has(key) || o.price < seen.get(key).price) seen.set(key, o);
    }
    const pool = [...seen.values()];
    const kept = [];
    for (const o of pool) {
      const m = matchInfo(query, o.title, variants);
      o.relevance = m.tier === -1 ? 0 : m.score;
      o.match = m.tier;
      o.flags = o.flags || [];
      if (m.tier === -1 || m.score < minRelevance) continue;
      if (m.extraTier && m.extraTier.length) o.flags.push("other-model");
      kept.push(o);
    }
    for (const o of kept) if (isAccessory(query, o.title)) o.flags.push("possible-accessory");
    const core = kept.filter((o) => o.match === 0 && !o.flags.length).map((o) => o.price).sort((a, b) => a - b);
    if (core.length >= 4) {
      const mid = core.length >> 1;
      const med = core.length % 2 ? core[mid] : (core[mid - 1] + core[mid]) / 2;
      for (const o of kept) if (o.price < med * 0.3 && !o.flags.includes("suspiciously-cheap")) o.flags.push("suspiciously-cheap");
    }
    const bad = (o) => o.flags.some((f) => f !== "other-model");
    kept.sort((a, b) => bad(a) - bad(b) || a.match - b.match || a.price - b.price);
    return { kept, hidden: pool.length - kept.length };
  }

  /** Top 3: exact matches first; only if fewer than 3 exist, closest others fill the gap (marked in the UI). */
  function top(offers, n = 3) {
    const clean = offers.filter((o) => !o.flags.some((f) => f !== "other-model"));
    return (clean.length ? clean : offers).slice(0, n);
  }

  // ---------------- store parsing ----------------
  function absUrl(link, base) {
    try { return new URL(link, base || undefined).href; } catch (_) { return link; }
  }

  /** "a, b@href" -> tries each comma option in order; each option may carry its own @attr. */
  function sel(el, spec) {
    if (!spec) return null;
    const parts = spec.split(/,(?![^\[]*\])/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.some((p) => p.includes("@"))) {
      for (const p of parts) { const v = sel1(el, p); if (v) return v; }
      return null;
    }
    return sel1(el, spec);
  }

  function sel1(el, spec) {
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

  // ---------------- fast JSON adapters (no page rendering) ----------------
  const enc = (q) => encodeURIComponent(q);
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const decode = (t) => String(t || "").replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, "").trim();
  const offer = (store, o) => Object.assign({ source: store.name, via: store.type, old_price: null, image: null }, o);

  const MAGENTO_Q = (q) => `{products(search:${JSON.stringify(q)},pageSize:20){items{name url_key url_suffix small_image{url} ` +
    `price_range{minimum_price{final_price{value} regular_price{value}}}}}}`;

  const ADAPTERS = {
    // Shopify predictive search — Dream 2000, Compumarts, Kimo Store, Tradeline …
    shopify: {
      url: (s, q) => `${s.base_url}/search/suggest.json?q=${enc(q)}&resources[type]=product&resources[limit]=10`,
      parse: (d, s) => ((d.resources && d.resources.results && d.resources.results.products) || [])
        .filter((p) => p.available !== false)
        .map((p) => offer(s, { title: decode(p.title), price: parsePrice(p.price), old_price: parsePrice(p.compare_at_price_max),
          url: absUrl(String(p.url || "").split("?")[0], s.base_url), image: p.image || (p.featured_image && p.featured_image.url) || null })),
    },
    // WooCommerce Store API — WordPress shops
    woo: {
      url: (s, q) => `${s.base_url}/wp-json/wc/store/v1/products?search=${enc(q)}&per_page=20`,
      parse: (d, s) => (Array.isArray(d) ? d : []).filter((p) => p.is_in_stock !== false).map((p) => {
        const pr = p.prices || {}, div = Math.pow(10, pr.currency_minor_unit ?? 2);
        return offer(s, { title: decode(p.name), price: parsePrice(+pr.price / div), old_price: parsePrice(+pr.regular_price / div),
          url: p.permalink, image: (p.images && p.images[0] && p.images[0].src) || null });
      }),
    },
    // Magento 2 GraphQL — Raneen, Cairo Cart, Hyper One …
    magento: {
      url: (s, q) => `${s.graphql || s.base_url + "/graphql"}?query=${enc(MAGENTO_Q(q))}`,
      parse: (d, s) => ((d.data && d.data.products && d.data.products.items) || []).map((p) => {
        const mp = (p.price_range && p.price_range.minimum_price) || {};
        return offer(s, { title: decode(p.name), price: parsePrice(mp.final_price && mp.final_price.value),
          old_price: parsePrice(mp.regular_price && mp.regular_price.value),
          url: `${s.product_base || s.base_url}/${p.url_key}${p.url_suffix ?? ".html"}`, image: (p.small_image && p.small_image.url) || null });
      }),
    },
    // PrestaShop 1.7+ search controller in AJAX mode — Cairo Sales …
    prestashop: {
      url: (s, q) => `${s.base_url}${s.path ?? "/en"}/search?controller=search&s=${enc(q)}&ajax=1&resultsPerPage=20`,
      parse: (d, s) => (d.products || []).map((p) => offer(s, { title: decode(p.name),
        price: parsePrice(p.price_amount ?? p.price), old_price: parsePrice(p.regular_price_amount),
        url: p.url || p.link, image: (p.cover && ((p.cover.medium && p.cover.medium.url) || (p.cover.small && p.cover.small.url))) || null })),
    },
    // IKEA public search service
    ikea: {
      url: (s, q) => `https://sik.search.blue.cdtapps.com/eg/${s.locale || "en"}/search-result-page?max-num-filters=0&size=24&q=${enc(q)}`,
      parse: (d, s) => (((d.searchResultPage || {}).products || {}).main || { items: [] }).items.map((i) => i.product).filter(Boolean)
        .map((p) => offer(s, { title: [p.name, p.typeName].filter(Boolean).join(" "),
          price: parsePrice(p.salesPrice && p.salesPrice.numeral), url: p.pipUrl, image: p.mainImageUrl || null })),
    },
  };

  // ---------------- orchestration ----------------
  const qLang = (q) => (isArabic(q) ? "ar" : "en");

  /** One query per store (halves the requests): stores that handle both languages get the original text. */
  function storeQuery(store, variants) {
    const want = store.lang || "both";
    if (want === "both") return [qLang(variants[0]), variants[0]];
    const hit = variants.find((v) => qLang(v) === want);
    return [want, hit || variants[0]];
  }

  async function htmlSearch(store, q, lang, fetcher, opt) {
    const url = buildUrl(store, q, lang);
    if (store.render) {
      const wait = (store.item || "").split(",")[0] || null;
      return parse(await withTimeout(fetcher(url, { lang, render: true, wait }), opt.renderTimeout), store, opt.DOMParser, opt.maxPerSource);
    }
    return parse(await withTimeout(fetcher(url, { lang }), opt.timeout), store, opt.DOMParser, opt.maxPerSource);
  }

  async function searchStore(store, q, lang, fetcher, opt) {
    const ad = ADAPTERS[store.type];
    if (ad) {
      try {
        const d = JSON.parse(await withTimeout(fetcher(ad.url(store, q), { lang, json: true }), opt.timeout));
        const got = ad.parse(d, store).filter((o) => o.title && o.price && o.url).slice(0, opt.maxPerSource);
        if (got.length || !store.search_url) return got;
      } catch (e) {
        if (!store.search_url) throw e;
      }
    }
    return htmlSearch(store, q, lang, fetcher, opt);  // HTML page: CSS selectors, then JSON-LD
  }

  // ---------------- ⚡ flash deals (no query: each store's own sale feed) ----------------
  const DEAL_FEEDS = {
    // Shopify: whole catalog JSON; a deal = variant with compare_at_price above price
    shopify: {
      url: (s) => `${s.base_url}/products.json?limit=250`,
      json: true,
      parse: (d, s) => (d.products || []).flatMap((p) => {
        const v = (p.variants || []).filter((x) => x.available !== false && parsePrice(x.compare_at_price) > parsePrice(x.price))
          .sort((a, b) => parsePrice(a.price) - parsePrice(b.price))[0];
        if (!v) return [];
        return [offer(s, { title: decode(p.title), price: parsePrice(v.price), old_price: parsePrice(v.compare_at_price),
          url: `${s.base_url}/products/${p.handle}`, image: (p.images && p.images[0] && p.images[0].src) || null })];
      }),
    },
    // WooCommerce: products currently on sale
    woo: { url: (s) => `${s.base_url}/wp-json/wc/store/v1/products?on_sale=true&per_page=60`, json: true,
      parse: (d, s) => ADAPTERS.woo.parse(d, s) },
    // PrestaShop: built-in "prices drop" page in AJAX mode
    prestashop: { url: (s) => `${s.base_url}${s.path ?? "/en"}/prices-drop?ajax=1&resultsPerPage=60`, json: true,
      parse: (d, s) => ADAPTERS.prestashop.parse(d, s) },
    // Any store: a deals / specials / flash-sale page read with the store's CSS selectors (overridable in "deals")
    html: { url: (s) => s.deals.url, json: false, parse: null },
  };

  /** Percent off, or 0 when there's no real old price. */
  const pctOff = (o) => (o.old_price && o.old_price > o.price ? Math.round((1 - o.price / o.old_price) * 100) : 0);

  /**
   * ⚡ Deals from every store that has a "deals" entry in stores.json.
   * opts: { stores, fetcher, DOMParser, minPct (default 10), perStore (default 12), timeout, renderTimeout, onProgress }
   * Returns { deals: [...offer, pct], sources: [...] } sorted by biggest discount.
   */
  async function deals(opts) {
    const opt = Object.assign({ minPct: 10, perStore: 12, timeout: 12000, renderTimeout: 20000 }, opts);
    const stores = (opt.stores || []).filter((s) => s.enabled !== false && s.deals);
    const all = [], sources = [];
    const snap = () => {
      const seen = new Set();
      const list = all.filter((o) => { const k = o.source + "|" + o.url.split("?")[0]; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => b.pct - a.pct || a.price - b.price);
      return { deals: list, sources: sources.slice(), total: stores.length, at: Date.now() };
    };
    await Promise.all(stores.map(async (s) => {
      const t0 = Date.now();
      try {
        const feed = DEAL_FEEDS[s.deals.kind];
        if (!feed) throw new Error("unknown deals kind " + s.deals.kind);
        let got;
        if (feed.json) {
          got = feed.parse(JSON.parse(await withTimeout(opt.fetcher(feed.url(s), { json: true, lang: "en" }), opt.timeout)), s);
        } else {
          const sel = Object.assign({}, s, s.deals);   // deals page may need its own selectors
          const html = await withTimeout(opt.fetcher(feed.url(s), s.deals.render
            ? { render: true, wait: (sel.item || "").split(",")[0] || null, lang: "en" } : { lang: "en" }), s.deals.render ? opt.renderTimeout : opt.timeout);
          got = parse(html, sel, opt.DOMParser, 80);
        }
        const keep = got.filter((o) => o.title && o.price && o.url)
          .map((o) => Object.assign(o, { pct: pctOff(o), source: s.name }))
          .filter((o) => o.pct >= opt.minPct && o.pct < 95)            // 95%+ off is almost always a data error
          .sort((a, b) => b.pct - a.pct).slice(0, opt.perStore);
        all.push(...keep);
        sources.push({ source: s.name, ok: true, count: keep.length, ms: Date.now() - t0, error: null });
      } catch (e) {
        sources.push({ source: s.name, ok: false, count: 0, ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 160) });
      }
      if (opt.onProgress) opt.onProgress(snap());
    }));
    return snap();
  }

  const CACHE = new Map();

  /**
   * opts: { stores, fetcher, serpKey, minRelevance, maxPerSource, city, DOMParser, onProgress,
   *         timeout (ms, plain/JSON), renderTimeout (ms, hidden browser), cacheMs }
   * onProgress(result) fires as each store finishes, so the UI fills in while slow stores are still loading.
   */
  async function search(rawQuery, opts) {
    const query = cleanQuery(rawQuery);
    const opt = Object.assign({ minRelevance: 0.6, maxPerSource: 20, city: "cairo", timeout: 10000, renderTimeout: 18000,
      cacheMs: 15 * 60 * 1000 }, opts);
    const stores = (opt.stores || []).filter((s) => s.enabled !== false);
    const key = normalize(query) + "|" + stores.map((s) => s.name).join(",") + "|" + (opt.serpKey ? 1 : 0);
    const hit = CACHE.get(key);
    if (hit && Date.now() - hit.t < opt.cacheMs) {
      const r = Object.assign({}, hit.r, { cached: true });
      if (opt.onProgress) opt.onProgress(r);
      return r;
    }

    let variants = queryVariants(query);
    const variantsP = queryVariantsAsync(query, opt.fetcher).then((v) => (variants = v));
    const all = [], sources = [];
    const snapshot = () => {
      const { kept, hidden } = rank(query, all.map((o) => Object.assign({}, o, { flags: [] })), opt.minRelevance, variants);
      return { query, variants, offers: kept, top3: top(kept, 3), hidden, sources: sources.slice(), total: jobs.length,
        links: externalLinks(query, opt.city) };
    };

    const jobs = stores.map((store) => ({
      name: store.name,
      run: async () => {
        // stores that take the original language start immediately; the others wait for the translation
        let [lang, q] = storeQuery(store, variants);
        if (lang !== qLang(query)) [lang, q] = storeQuery(store, await variantsP);
        return { q, offers: await searchStore(store, q, lang, opt.fetcher, opt) };
      },
    }));
    if (opt.serpKey) {
      jobs.push({ name: "Google Shopping", run: async () => {
        const q = query, lang = qLang(query);
        const d = JSON.parse(await withTimeout(opt.fetcher(serpUrl(q, lang, opt.serpKey), { lang, json: true }), opt.timeout));
        if (d.error) throw new Error(d.error);
        return { q, offers: parseSerp(d) };
      } });
    }

    await Promise.all(jobs.map(async (j) => {
      const t0 = Date.now();
      try {
        const { q, offers } = await j.run();
        all.push(...offers);
        sources.push({ source: j.name, ok: true, count: offers.length, ms: Date.now() - t0, query: q, error: null });
      } catch (e) {
        sources.push({ source: j.name, ok: false, count: 0, ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 160) });
      }
      if (opt.onProgress) opt.onProgress(snapshot());
    }));
    await variantsP;
    const r = snapshot();
    if (sources.some((s) => s.count)) CACHE.set(key, { t: Date.now(), r });
    if (CACHE.size > 50) CACHE.delete(CACHE.keys().next().value);
    return r;
  }

  const API = { normalize, tokens, isArabic, setSynonyms, equivalents, translateQuery, queryVariants, queryVariantsAsync, cleanQuery, parsePrice, ADAPTERS, DEAL_FEEDS, deals, pctOff,
    relevance, matchInfo, specs, rank, top, parse, parseSerp, buildUrl, serpUrl, externalLinks, search };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Arkhas = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
