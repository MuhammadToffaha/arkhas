// 📱 Deep electronics offers: Amazon / Noon / Jumia category pages, pooled fetching, own cap + chip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const E = require("../web/engine.js");
const { DOMParser } = new JSDOM("").window;
const STORES = JSON.parse(readFileSync(new URL("../web/stores.json", import.meta.url), "utf8"));
const S = Object.fromEntries(STORES.map((s) => [s.name, s]));
const cat = (s) => s.deals.urls.filter((u) => typeof u === "object" && u.cat === "electronics");

test("Amazon, Noon and Jumia each have a deep electronics list", () => {
  assert.ok(cat(S["Amazon.eg"]).length >= 40);
  assert.ok(cat(S["Jumia"]).length >= 20);
  assert.ok(cat(S["Noon"]).length >= 8);
  assert.ok(cat(S["Jumia"]).every((u) => u.url.includes("price_discount=50-100")));
  assert.ok(cat(S["Amazon.eg"]).some((u) => u.url.includes("page=3")));
});

test("pages are fetched through a small pool, electronics tagged and capped separately", async () => {
  let live = 0, peak = 0;
  const card = (i, old) => `<article class="prd"><a class="core" href="/p-${i}.html"><h3 class="name">Phone ${i}</h3>
    <div class="prc">EGP ${1000}</div><div class="old">EGP ${old}</div></a></article>`;
  const store = { name: "Jumia", ...S["Jumia"], deals: { kind: "html", urls: [
    ...Array.from({ length: 12 }, (_, i) => ({ url: "https://www.jumia.com.eg/e" + i + "/", cat: "electronics" })),
    "https://www.jumia.com.eg/flash-sales/"] } };
  const fetcher = async (u) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--;
    const n = u.match(/e(\d+)\//); return "<html><body>" + (n ? card("e" + n[1], 3000) : card("f", 2000)) + "</body></html>"; };
  const r = await E.deals({ stores: [store], fetcher, DOMParser, pool: 4 });
  assert.ok(peak <= 4, "pool respected, peak " + peak);
  assert.equal(r.deals.filter((o) => o.cat === "electronics").length, 12);
  assert.equal(r.deals.length, 13);
});

test("UI has the electronics chip", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.match(html, /\["elec", t\.rElec\]/);
  assert.match(html, /o\.cat === "electronics"/);
});

test("prices always shown in English digits (EGP 1,499), also in Arabic mode", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.match(html, /const money = \(v\) => "EGP " \+ Math\.round\(v\)\.toLocaleString\("en-US"\)/);
  for (const f of ["DealAlerts.kt", "Telegram.kt"]) {
    const k = readFileSync(new URL("../android/app/src/main/java/eg/arkhas/app/" + f, import.meta.url), "utf8");
    assert.match(k, /Locale\.US, "EGP %,d"/, f);
  }
});

test("🛒 store-app button: shown only when the app is installed; Amazon opens the product in the app", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const opened = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", beforeParse(w) {
    w.Native = { hasApp: (p) => (p.includes("amazon") ? "com.amazon.mShop.android.shopping" : p === "com.noon.buyerapp" ? "com.noon.buyerapp" : ""),
      openApp: (u, p) => opened.push([u, p]), getPref: () => "", setPref() {}, readConfig: () => "", appVersion: () => "1", isBackground: () => false };
  } });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  const mk = (url) => w.eval(`cartBtn({ url: ${JSON.stringify(url)} })`);
  assert.match(mk("https://www.amazon.eg/Some-Phone/dp/B0ABCDEF12?ref=x"), /class="cart"/);
  assert.match(mk("https://www.noon.com/egypt-en/x/N123/p/"), /class="cart"/);
  assert.equal(mk("https://www.jumia.com.eg/x.html"), "");      // Jumia app not installed -> no button
  assert.equal(mk("https://btech.com/x"), "");                   // not a store with an app
  const d = w.document.createElement("div"); d.innerHTML = mk("https://www.amazon.eg/Some-Phone/dp/B0ABCDEF12?ref=x"); w.document.body.append(d);
  d.querySelector(".cart").click();
  assert.deepEqual(opened[0], ["https://www.amazon.eg/Some-Phone/dp/B0ABCDEF12?ref=x", "com.amazon.mShop.android.shopping"]);
});

test("offers tab: quick Amazon / noon / Jumia filter chips", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`STORES = ${readFileSync(new URL("stores.json", W), "utf8")};
    const mk = (i, s) => ({ title: "x" + i, price: 400, old_price: 1000, pct: 60, url: "https://x/" + i, source: s });
    dealsData = { deals: [mk(1, "Amazon.eg"), mk(2, "Noon"), mk(3, "Jumia"), mk(4, "Jumia")], sources: [], total: 3, at: Date.now() };
    dealRange = "r5070"; renderDeals(true);`);
  const chips = () => [...w.document.querySelectorAll("#d_quick button[data-q]")];
  assert.deepEqual(chips().map((b) => b.dataset.q), ["", "Amazon.eg", "Noon", "Jumia"]);
  chips()[3].click();
  assert.equal(w.document.querySelectorAll("#d_out .dc").length, 2);
  assert.ok(chips()[3].classList.contains("on"));
  chips()[0].click();
  assert.equal(w.document.querySelectorAll("#d_out .dc").length, 4);
});

test("🤫 silent auto-update switch (on by default) talks to the app", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const calls = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", beforeParse(w) {
    w.Native = { setAutoUpdate: (v) => calls.push(v), checkUpdate() {}, installUpdate() {}, getPref: () => "", setPref() {}, readConfig: () => "", appVersion: () => "1.0.30", isBackground: () => false };
  } });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval("showUpd()");
  const box = w.document.querySelector("#u_auto");
  assert.equal(w.document.querySelector("#u_auto_row").hidden, false);
  assert.equal(box.checked, true);
  box.checked = false; box.dispatchEvent(new w.Event("change"));
  assert.deepEqual(calls, [false]);
  const kt = readFileSync(new URL("../android/app/src/main/java/eg/arkhas/app/Updater.kt", import.meta.url), "utf8");
  assert.match(kt, /USER_ACTION_NOT_REQUIRED/);
});

test("🎁 update pop-up on start when a new version exists", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", beforeParse(w) {
    w.Native = { checkUpdate: (id) => setTimeout(() => w.__native(id, true, JSON.stringify({ available: true, latestName: "1.0.99", latest: 99, url: "u", size: 1 })), 5),
      installUpdate() {}, getPref: () => "", setPref() {}, readConfig: () => "", appVersion: () => "1.0.33", isBackground: () => false };
  } });
  const w = dom.window; await new Promise((r) => setTimeout(r, 150));
  assert.equal(w.document.querySelector("#updpop").hidden, false);
  assert.match(w.document.querySelector("#up_t").textContent, /1\.0\.99/);
  w.document.querySelector("#up_later").click();
  assert.equal(w.document.querySelector("#updpop").hidden, true);
});

test("price box with price + old price + % off reads the first number (Noon 550, not 55,079,530)", () => {
  assert.equal(E.parsePrice("EGP 550 795 30% off"), 550);
  assert.equal(E.parsePrice("550\n795\n30%"), 550);
  assert.equal(E.parsePrice("EGP 12,999 15,999"), 12999);
  assert.equal(E.parsePrice("1 299 EGP"), 1299);
});

test("🎟️ promo codes tab lists codes by store, filters and copies", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const copied = [];
  const data = { updated: "2026-10-24T03:17:00Z", codes: [
    { store: "نون مصر", code: "B65", title: "كود خصم يصل إلى %10", expires: "2099-12-31", link: "https://www.noon.com/egypt-ar/" },
    { store: "وفرها", code: "WF23", title: "كاش باك 10%", expires: "2099-12-26", link: "https://waffarha.com/ar" },
    { store: "قديم", code: "OLD1", title: "x", expires: "2000-01-01" }] };
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", beforeParse(w) {
    w.Native = { fetch: (id) => setTimeout(() => w.__native(id, true, JSON.stringify(data)), 5), copy: (t) => copied.push(t),
      getPref: () => "", setPref() {}, readConfig: () => "{}", appVersion: () => "1", isBackground: () => false };
  } });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.document.querySelector("#nav_promo").click();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(w.document.querySelector("#promoView").hidden, false);
  assert.equal(w.document.querySelectorAll("#p_out .promo").length, 2);      // expired one hidden
  w.document.querySelector('#p_stores [data-ps="وفرها"]').click();
  assert.equal(w.document.querySelectorAll("#p_out .promo").length, 1);
  w.document.querySelector("#p_out .pcode").click();
  assert.deepEqual(copied, ["WF23"]);
});

test("📷 photo → search words: brand + model from printed text, barcode name first", async () => {
  const q = E.photoQueries({ lines: ["Galaxy A55 5G", "SAMSUNG", "SM-A556E 256GB"], labels: [{ text: "Mobile phone", conf: 0.9 }, { text: "Product", conf: 0.99 }] });
  assert.equal(q[0], "Samsung Galaxy A55 5G");
  assert.ok(!q.includes("Product"));
  assert.deepEqual(E.photoQueries({ lines: [], labels: [] }, ["Nutella 400g"]), ["Nutella 400g"]);
  const names = await E.barcodeNames("3017620422003", async (u) => u.includes("openfoodfacts")
    ? JSON.stringify({ product: { brands: "Ferrero", product_name: "Nutella" } }) : "{}");
  assert.deepEqual(names, ["Ferrero Nutella"]);
});

test("📷 photo button opens camera/gallery and the result runs a search", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const calls = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", beforeParse(w) {
    w.Native = { photo: (m) => calls.push(m), lens: () => true, fetch() {}, getPref: () => "", setPref() {}, readConfig: () => "[]", appVersion: () => "1", isBackground: () => false };
  } });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  assert.equal(w.document.querySelector("#cam").hidden, false);
  w.document.querySelector("#cam").click();
  w.document.querySelector("#cs_gal").click();
  assert.deepEqual(calls, ["gallery"]);
  await w.__photo({ ok: true, barcodes: [], lines: ["JBL", "TUNE 520BT"], labels: [{ text: "Headphones", conf: 0.9 }], thumb: "" });
  assert.equal(w.document.querySelector("#q").value, "JBL TUNE 520BT");
  assert.ok(w.document.querySelectorAll("#ph_q button").length >= 2);
});

test("🖤 finds White / Yellow / Black Friday pages on a store's home page and tags their items", async () => {
  const home = `<a href="/en/">Home</a><a href="/-/en/b?node=123"><img alt="White Friday deals"></a>
    <a href="https://www.amazon.eg/s?k=x">x</a><a href="/egypt-en/yellow-friday/electronics/">Shop</a><a href="https://evil.com/black-friday">ad</a>
    <a href="/ar/الجمعة-البيضاء">عروض</a>`;
  const u = await E.findEventPages({ name: "Amazon.eg", base_url: "https://www.amazon.eg", events: {} }, async () => home, DOMParser);
  assert.deepEqual(u, ["https://www.amazon.eg/-/en/b?node=123", "https://www.amazon.eg/egypt-en/yellow-friday/electronics/",
    "https://www.amazon.eg/ar/%D8%A7%D9%84%D8%AC%D9%85%D8%B9%D8%A9-%D8%A7%D9%84%D8%A8%D9%8A%D8%B6%D8%A7%D8%A1"]);
  const page = `<article class="prd"><a class="core" href="/tv.html"><h3 class="name">Samsung TV 55</h3><div class="prc">EGP 19,999</div></a></article>`;
  const r = await E.deals({ stores: [S["Jumia"]], DOMParser, events: { Jumia: ["https://www.jumia.com.eg/mlp-black-friday/"] }, timeout: 100,
    fetcher: async (x) => { if (x.includes("black-friday")) return page; throw new Error("x"); } });
  const bf = r.deals.filter((o) => o.tag === "bf");
  assert.equal(bf.length, 1);   // kept even without an old price
  assert.equal(bf[0].title, "Samsung TV 55");
});

test("🔎 search results: filter (exact / discounted / Amazon-noon-Jumia) and sort by biggest discount", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`const offers = [
      { title: "A", price: 100, url: "https://b.com/1", source: "B.TECH", match: 0, flags: [] },
      { title: "B", price: 120, old_price: 240, url: "https://www.amazon.eg/dp/B1", source: "Amazon.eg", match: 0, flags: [] },
      { title: "C", price: 90, url: "https://c.com/3", source: "2B", match: 1, flags: [] },
      { title: "D", price: 150, old_price: 200, url: "https://www.noon.com/x/N1/p/", source: "Noon", match: 0, flags: [] }];
    render({ query: "x", variants: ["x"], offers, top3: offers.slice(0, 3), links: [], sources: [], total: 1 }, true);`);
  const chips = () => [...w.document.querySelectorAll("#sfil button")];
  assert.ok(chips().length >= 6);
  chips().find((b) => b.dataset.sf === "big").click();
  assert.deepEqual([...w.document.querySelectorAll(".pc .ttl")].map((x) => x.textContent), ["B", "D"]);
  chips().find((b) => b.dataset.ss === "pct").click();
  assert.equal(w.document.querySelector(".pc .ttl").textContent, "B");      // -50% first
  assert.match(w.document.querySelector(".pc .offb").textContent, /-50%/);
  chips().find((b) => b.dataset.sf === "exact").click();
  assert.equal(w.document.querySelectorAll(".pc").length, 3);
});

test("⏳ search shows a live box and results while stores are still answering", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", pretendToBeVisual: true });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  let release;
  w.eval(`STORES = [{ name: "A" }, { name: "B" }]; isOn = () => true;`);
  w.Arkhas.search = (q, o) => new Promise((res) => {
    const off = { title: "JBL Tune 520BT", price: 1499, url: "https://a/1", source: "A", match: 0, flags: [] };
    setTimeout(() => o.onProgress({ query: q, variants: [q], offers: [off], top3: [off], links: [], sources: [{ source: "A", ok: true, count: 1, ms: 5 }], total: 2 }), 10);
    release = () => res({ query: q, variants: [q], offers: [off], top3: [off], links: [], sources: [{ source: "A", ok: true, count: 1, ms: 5 }, { source: "B", ok: true, count: 0, ms: 9 }], total: 2 });
  });
  const p = w.eval(`run("jbl 520")`);
  assert.ok(w.document.querySelector("#out .live"), "live box right away");
  assert.equal(w.document.querySelectorAll("#out .skel").length, 3, "placeholders before the first store answers");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(w.document.querySelectorAll("#out .pc:not(.skel)").length, 1, "first result shown while B is still loading");
  assert.match(w.document.querySelector("#out .live").textContent, /1\/2/);
  release(); await p;
  assert.equal(w.document.querySelector("#out .live"), null);
});

test("Raneen: search + deals through its Vertex search endpoint (real response)", async () => {
  const s = S["Raneen"];
  const fx = readFileSync(new URL("./fixtures/raneen-vertex.json", import.meta.url), "utf8");
  const r = E.ADAPTERS.vertex.parse(JSON.parse(fx), s);
  assert.ok(r.length >= 10);
  assert.ok(r.every((o) => o.source === "Raneen" && o.price > 0 && o.url.startsWith("https://www.raneen.com/")));
  assert.match(E.ADAPTERS.vertex.url(s, "ثلاجة"), /raneen\.com\/ar\/vertex\/search\/query\/\?q=/);
  const d = await E.deals({ stores: [s], DOMParser, fetcher: async () => fx });
  assert.ok(d.deals.length >= 5 && d.deals.every((o) => o.pct >= 10));
});

test("💄 cosmetics: 7 Egyptian beauty shops + Amazon/noon/Jumia beauty deals under one chip", async () => {
  const beauty = STORES.filter((s) => s.category === "beauty");
  assert.ok(beauty.length >= 7 && beauty.every((s) => s.type === "shopify" && s.deals.kind === "shopify"));
  for (const n of ["Amazon.eg", "Noon", "Jumia"]) assert.ok(S[n].deals.urls.filter((u) => u.cat === "beauty").length >= 3, n);
  // shop deals get the beauty category automatically
  const shop = JSON.stringify({ products: [{ title: "Lip Tint", handle: "lip", variants: [{ price: "399.00", compare_at_price: "480.00", available: true }] }] });
  const d = await E.deals({ stores: [beauty[0]], DOMParser, fetcher: async () => shop });
  assert.equal(d.deals[0].cat, "beauty");
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`STORES = ${readFileSync(new URL("stores.json", W), "utf8")}; getHide().clear();
    const mk = (i, s, cat) => ({ title: "x" + i, price: 400, old_price: 1000, pct: 60, url: "https://x/" + i, source: s, cat });
    dealsData = { deals: [mk(1, "Source Beauty", "beauty"), mk(2, "Noon", "beauty"), mk(3, "B.TECH", "electronics")], sources: [], total: 3, at: Date.now() };
    dealRange = "beauty"; renderDeals(true);`);
  assert.equal(w.document.querySelectorAll("#d_out .dc").length, 2);
  assert.ok(w.document.querySelector('#d_quick button[data-q="Source Beauty"]'));
});

test("🔎 Google Lens results → product names → search (photo without readable text)", async () => {
  const lensHtml = `<a href="https://www.amazon.eg/x"><div>Amazon.eg</div><div>JBL Tune 520BT Wireless On-Ear Headphones, Black</div><div>EGP 1,999</div></a>
    <a href="https://www.noon.com/y"><span>JBL Tune 520BT Bluetooth Headphones - Blue</span></a><a href="https://www.google.com/search?q=x">Visual matches</a>
    <a href="https://ebay.com/q"><span>JBL TUNE 520BT Pure Bass Headphones Purple</span></a>`;
  assert.equal(E.lensQueries(E.lensTitles(lensHtml, DOMParser))[0], "jbl tune 520bt headphones");
  assert.ok(E.lensCaptcha("Our systems have detected unusual traffic"));
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", beforeParse(w) {
    w.Native = { photo() {}, lens() {}, lensShow() {}, lensUpload: (id) => setTimeout(() => w.__lens(id, { ok: true, url: "https://www.google.com/search?vsrid=1" }), 5),
      fetch: (id, url) => setTimeout(() => w.__native(id, true, url.includes("vsrid") ? lensHtml : "{}"), 5),
      getPref: () => "", setPref() {}, readConfig: () => "[]", appVersion: () => "1", isBackground: () => false };
  } });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  const searched = [];
  w.eval("run = (q) => { window.__searched = (window.__searched || []).concat(q); }");
  await w.__photo({ ok: true, barcodes: [], lines: [], labels: [{ text: "Headphones", conf: 0.9 }], thumb: "" });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(JSON.stringify(w.__searched), JSON.stringify(["jbl tune 520bt headphones"]));
  assert.match(w.document.querySelector("#ph_q button").textContent, /🔎 jbl tune 520bt/);
});

test("🎯 accuracy: other models / accessories / loose matches are dropped; ⚡ beauty shops only for beauty searches", async () => {
  const mk = (t, p) => ({ title: t, price: p, url: "https://x/" + encodeURIComponent(t), source: "S" });
  const { kept } = E.rank("samsung a55", [mk("Samsung Galaxy A55 5G 256GB", 17999), mk("Samsung Galaxy A35 5G", 12999),
    mk("Samsung Galaxy A55 Silicone Case", 199), mk("Samsung Galaxy S24", 39999), mk("Galaxy A55 Screen Protector", 99)]);
  assert.deepEqual(kept.map((o) => o.price), [17999]);
  const asked = [];
  const stores = [{ name: "Shop", type: "shopify", base_url: "https://a.com" }, { name: "Beauty", type: "shopify", base_url: "https://b.com", category: "beauty" }];
  await E.search("samsung tv", { stores, fetcher: async (u) => { asked.push(u); return "{}"; }, timeout: 50 });
  assert.ok(asked.every((u) => !u.includes("b.com")));
  asked.length = 0;
  await E.search("loreal serum", { stores, fetcher: async (u) => { asked.push(u); return "{}"; }, timeout: 50 });
  assert.ok(asked.some((u) => u.includes("b.com")));
});

test("➕ products are added to the list one store at a time while searching (list open, new ones flash)", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", pretendToBeVisual: true });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`STORES = [{ name: "A" }, { name: "B" }, { name: "C" }]; isOn = () => true;`);
  const mk = (i, s) => ({ title: "JBL Tune 520BT " + i, price: 1000 + i, url: "https://" + s + "/" + i, source: s, match: 0, flags: [] });
  let step, release;
  w.Arkhas.search = (q, o) => new Promise((res) => {
    const snap = (offers, n) => ({ query: q, variants: [q], offers, top3: offers.slice(0, 3), links: [], sources: Array.from({ length: n }, (_, k) => ({ source: "S" + k, ok: true, count: 1, ms: 1 })), total: 3 });
    const a = [1, 2, 3, 4].map((i) => mk(i, "a")), b = [5, 6].map((i) => mk(i, "b"));
    step = (n) => o.onProgress(n === 1 ? snap(a, 1) : snap([...a, ...b], 2));
    release = () => res(snap([...a, ...b], 3));
  });
  const p = w.eval(`run("jbl")`);
  step(1); await new Promise((r) => setTimeout(r, 40));
  const count = () => w.document.querySelectorAll("#out .pc:not(.skel), #out .row").length;
  assert.equal(count(), 4);
  assert.ok(w.document.querySelector("#allres").open, "list is open while searching");
  step(2); await new Promise((r) => setTimeout(r, 40));
  assert.equal(count(), 6);
  assert.equal(w.document.querySelectorAll("#out .row.fresh").length, 2, "the 2 new products flash in");
  release(); await p;
});

test("🔬 deep search: big marketplaces load 2 result pages at once and merge them", async () => {
  const card = (i) => `<div data-component-type="s-search-result"><a class="a-link-normal" href="/dp/B0AAAAAA${String(i).padStart(2, "0")}"><h2><span>JBL Tune 520BT model ${i}</span></h2></a>
    <span class="a-price"><span class="a-offscreen">EGP ${1000 + i}</span></span></div>`;
  const asked = [];
  const r = await E.search("jbl tune 520bt", { stores: [S["Amazon.eg"]], DOMParser, fetcher: async (u) => {
    asked.push(u); const pg = +(u.match(/[?&]page=(\d)/) || [0, 1])[1];
    if (pg === 3) throw new Error("blocked");                       // a failed extra page is ignored
    return [1, 2, 3].map((k) => card(pg * 10 + k)).join("") + card(99);   // card 99 repeats on every page
  } });
  assert.equal(asked.length, 2);
  assert.equal(r.offers.length, 7);
});

test("🖤 Black Friday first: home banner, default tab in season, campaign stores' other big discounts included", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`STORES = ${readFileSync(new URL("stores.json", W), "utf8")}; getHide().clear();`);
  w.eval(`const mk = (i, s, pct, tag) => ({ title: "x" + i, price: 100 - pct, old_price: 100, pct, url: "https://x/" + i, source: s, tag });
    dealsData = { deals: [mk(1, "Jumia", 0, "bf"), mk(2, "Jumia", 45), mk(3, "Jumia", 12), mk(4, "B.TECH", 60)], sources: [], total: 2, at: Date.now() };
    rangeTouched = false; dealRange = ""; renderDeals(true);`);
  // campaign item + Jumia's 45% deal; not the 12% one, not B.TECH (no live campaign there)
  const season = w.eval("inSeason()");
  w.eval(`dealRange = "bf"; renderDeals(true);`);
  assert.equal(w.document.querySelectorAll("#d_out .dc").length, 2);
  assert.equal(w.document.querySelectorAll("#d_out .bfb").length, 2);
  w.eval(`$("#out").innerHTML = ""; renderHome();`);
  assert.equal(!!w.document.querySelector("#bfhero"), season);
  assert.equal(w.document.querySelectorAll("#home .cats button").length, 12);
  // recent searches
  w.eval(`addRecent("iphone 15"); addRecent("samsung a55"); addRecent("iphone 15"); renderHome();`);
  assert.equal([...w.document.querySelectorAll("#home .recents button")].map((b) => b.textContent).join("|"), "iphone 15|samsung a55");
});

test("⚡ deals list: 40 cards first, the rest on demand; saved list shows at once while refreshing", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`STORES = [{ name: "Jumia", deals: { kind: "html", urls: [] } }]; isOn = () => true; getHide().clear();
    const mk = (i) => ({ title: "x" + i, price: 40, old_price: 100, pct: 60, url: "https://x/" + i, source: "Jumia" });
    dealsData = { deals: Array.from({ length: 100 }, (_, i) => mk(i)), sources: [], total: 1, at: Date.now() - 3 * 3600 * 1000 };
    rangeTouched = true; dealRange = "r5070";
    let finish; Arkhas.deals = (o) => new Promise((res) => { finish = () => res({ deals: [mk(1000)], sources: [], total: 1, at: Date.now() }); });
    Arkhas.findEventPages = async () => []; window.__finish = () => finish();`);
  const p = w.eval("loadDeals(false)");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(w.document.querySelectorAll("#d_out .dc").length, 40, "old list visible while the new one loads");
  w.document.querySelector("#d_more").click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.document.querySelectorAll("#d_out .dc").length, 80);
  w.__finish(); await p;
  assert.equal(w.document.querySelectorAll("#d_out .dc").length, 1);
});

test("🚦 a search goes first: deal pages wait while it runs, and a search never hangs past its deadline", async () => {
  const order = [];
  const jum = Object.assign({}, S["Jumia"], { search_pages: 1, deals: { kind: "html", urls: ["https://www.jumia.com.eg/d1/", "https://www.jumia.com.eg/d2/"] } });
  const never = { name: "Dead", type: "shopify", base_url: "https://dead.example" };
  const fetcher = (u) => new Promise((res) => {
    if (u.includes("dead.example")) return;                                   // never answers
    order.push((u.includes("/d") ? "deal:" : "search:") + (E.TRAFFIC.searching ? "during" : "idle"));
    setTimeout(() => res("<html></html>"), 30);
  });
  const sP = E.search("samsung tv", { stores: [jum, never], DOMParser, fetcher, maxMs: 400, timeout: 5000 });
  const dP = E.deals({ stores: [jum], DOMParser, fetcher });
  const t0 = Date.now();
  const r = await sP;
  assert.ok(Date.now() - t0 < 1500, "deadline, not the 5 s store timeout");
  assert.ok(r.sources.some((x) => x.source === "Dead" && x.error === "slow"));
  await dP;
  assert.ok(order.filter((x) => x.startsWith("deal:")).every((x) => x === "deal:idle"), order.join(","));
});

test("🖤 dedicated Friday section: campaign pages only, grouped by store, 11.11 separate, store link when nothing is read", async () => {
  const page = `<article class="prd"><a class="core" href="/tv.html"><h3 class="name">Samsung TV 55</h3><div class="prc">EGP 19,999</div><div class="old">EGP 29,999</div></a></article>`;
  const asked = [];
  const r = await E.deals({ stores: [S["Jumia"]], DOMParser, onlyEvents: true,
    events: { Jumia: ["https://www.jumia.com.eg/mlp-black-friday/", "https://www.jumia.com.eg/mlp-11-11/"] },
    fetcher: async (u) => { asked.push(u); return u.includes("11-11") ? page.replace("tv.html", "ph.html").replace("Samsung TV 55", "Redmi 13") : page; } });
  assert.equal(asked.length, 2, "only the two campaign pages are loaded");
  assert.deepEqual(r.deals.map((o) => o.tag).sort(), ["1111", "bf"]);
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((x) => setTimeout(x, 50));
  w.__deals = r.deals;
  w.eval(`friData = { deals: window.__deals, sources: [], total: 1, at: Date.now() };
    evCache = { at: Date.now(), pages: { Jumia: ["https://www.jumia.com.eg/mlp-black-friday/"], Noon: ["https://www.noon.com/egypt-en/yellow-friday/"] } };
    showView("fri"); renderFri();`);
  const secs = [...w.document.querySelectorAll("#bf_out .fsec")];
  assert.equal(secs.length, 2);
  assert.equal(secs[0].querySelectorAll(".dc").length, 2);                      // Jumia with products first
  assert.match(secs[1].querySelector(".empty a").getAttribute("href"), /noon\.com\/egypt-en\/yellow-friday/);   // noon: direct link
  w.document.querySelector('#bf_kind [data-fk="1111"]').click();
  assert.equal(w.document.querySelectorAll("#bf_out .dc").length, 1);
  assert.match(w.document.querySelector("#bf_out .dc").textContent, /11\.11/);
});

test("📚 books are left out of the deals (format words, Arabic, Amazon ISBN links); notebooks stay", () => {
  const E = globalThis.__ArkhasForBooks || (() => { const w = new JSDOM(`<script>${readFileSync(new URL("../web/engine.js", import.meta.url), "utf8")}</script>`, { runScripts: "dangerously" }).window; return w.Arkhas; })();
  const b = (title, url = "https://x/1") => E.isBook({ title, url });
  assert.ok(b("Atomic Habits (Paperback)"));
  assert.ok(b("كتاب الطبخ المصري"));
  assert.ok(b("Some title", "https://www.amazon.eg/Some-Title/dp/1847941834/ref=sr_1_1"));
  assert.ok(!b("Lenovo IdeaPad Notebook 15"));
  assert.ok(!b("MacBook Air M3", "https://www.amazon.eg/dp/B0CX23V2ZK"));
  const stores = JSON.parse(readFileSync(new URL("../web/stores.json", import.meta.url), "utf8"));
  assert.ok(!stores.some((s) => s.deals && (s.deals.urls || []).some((u) => /k=books/.test(u.url || u))), "no book deal pages");
});

test("🖤 Friday tab lists campaign deals + every flash-sale product + everything 70%+, no duplicates", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`const mk = (i, pct, tag) => Object.assign({ title: "x" + i, price: 100, old_price: 100 / (1 - pct / 100), pct, url: "https://x/" + i, source: "Jumia" }, tag ? { tag } : {});
    friData = { deals: [mk(1, 40, "bf"), mk(2, 20, "1111")], sources: [], total: 1, at: Date.now() };
    dealsData = { deals: [mk(1, 40, "bf"), mk(3, 5, "flash"), mk(4, 75), mk(5, 55), mk(6, 0, "mega")], sources: [], total: 1, at: Date.now() };
    renderFri();`);
  const ttl = () => [...w.document.querySelectorAll("#bf_out .dc .ttl")].map((x) => x.textContent).sort();
  assert.deepEqual(ttl(), ["x1", "x2", "x3", "x4", "x6"], "55% non-flash left out, x1 once");
  const chip = (k) => w.document.querySelector(`#bf_kind button[data-fk="${k}"]`);
  chip("flash").click(); assert.deepEqual(ttl(), ["x3", "x6"]);
  chip("r70").click(); assert.deepEqual(ttl(), ["x4"]);
});
