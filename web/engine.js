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

  function relevanceOne(query, title) {
    const q = tokens(query).filter((t) => !STOP.has(t));
    if (!q.length) return 0;
    const tt = tokens(title), tnorm = tt.join(" ");
    const tset = new Set(tt.concat(tt.map(stripAr)));
    let hits = 0;
    for (const t of q) {
      const eq = equivalents(t);
      if ([...eq].some((e) => (e.includes(" ") && tnorm.includes(e)) || tset.has(e))) hits += 1;
      else if (/^\d+$/.test(t) && tt.some((w) => w.includes(t))) hits += 0.8;
      else if (t.length >= 4 && [...tset].some((w) => w.length >= 3 && (w.startsWith(stripAr(t)) || stripAr(t).startsWith(w)))) hits += 0.6;
    }
    return Math.round((hits / q.length) * 1000) / 1000;
  }

  /** Best match over the original query and its translations (an Arabic query vs English titles and vice versa). */
  function relevance(query, title, variants) {
    let best = relevanceOne(query, title);
    for (const v of variants || []) if (v !== query) best = Math.max(best, relevanceOne(v, title));
    return best;
  }

  function isAccessory(query, title) {
    if (tokens(query).some((t) => ACCESSORY.has(t))) return false;
    return tokens(title).slice(0, 6).some((t) => ACCESSORY.has(t));
  }

  function rank(query, offers, minRelevance = 0.6, variants) {
    const seen = new Map();
    for (const o of offers) {
      o.relevance = relevance(query, o.title, variants);
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

  const API = { normalize, tokens, isArabic, setSynonyms, equivalents, translateQuery, queryVariants, queryVariantsAsync, cleanQuery, parsePrice, ADAPTERS,
    relevance, rank, top, parse, parseSerp, buildUrl, serpUrl, externalLinks, search };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Arkhas = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
