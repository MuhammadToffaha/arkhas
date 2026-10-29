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

test("🏬 finds each store's own 'sold by' filter from its listing page and applies it to every deal page", async () => {
  const amz = S["Amazon.eg"], noon = S["Noon"], jum = S["Jumia"];
  const amzHtml = `<div id="s-refinements"><div id="p_6-title">Seller</div><ul>
    <li><a href="/s?k=headphones&rh=n%3A21832883031%2Cp_6%3AA1ZVRGNO5AYLOV&language=en_AE"><span>Amazon.eg</span></a></li>
    <li><a href="/s?k=headphones&rh=p_6%3AA2ABCDEF&language=en_AE"><span>Cell Phone Shop</span></a></li></ul></div>`;
  const f1 = await E.findStoreFilter(amz, async () => amzHtml, DOMParser);
  assert.deepEqual(f1.params, [["rh", "p_6:A1ZVRGNO5AYLOV"]]);
  assert.equal(E.mergeFilter("https://www.amazon.eg/s?k=laptop&rh=p_8%3A50-&language=en_AE", f1),
    "https://www.amazon.eg/s?k=laptop&rh=p_8%3A50-%2Cp_6%3AA1ZVRGNO5AYLOV&language=en_AE");
  const noonHtml = `<a href="/egypt-en/electronics-and-mobiles/?f%5Bseller%5D%5B%5D=noon">noon (1,234)</a>`;
  const f2 = await E.findStoreFilter(noon, async () => noonHtml, DOMParser);
  assert.deepEqual(f2.params, [["f[seller][]", "noon"]]);
  const jumHtml = `<a href="/mobile-phones/?tag=JMALL">Jumia Mall</a><a href="/mobile-phones/?shop_premium_services=shop_express_delivery">Express Delivery</a>`;
  const f3 = await E.findStoreFilter(jum, async () => jumHtml, DOMParser);
  assert.deepEqual(f3.params, [["tag", "JMALL"]]);
  assert.equal(await E.findStoreFilter(jum, async () => "<a href='/x'>nothing</a>", DOMParser), null);
  // deals with filters: only those stores, URLs rewritten, everything marked as sold by the store
  const urls = [];
  const r = await E.deals({ stores: [amz, jum], DOMParser, filters: { "Amazon.eg": f1 }, timeout: 50,
    fetcher: async (u) => { urls.push(u); throw new Error("offline"); } });
  assert.ok(urls.length > 10 && urls.every((u) => u.includes("p_6%3AA1ZVRGNO5AYLOV")));
  assert.equal(r.total, 1);
});

test("🏬 offers tab button loads only 'sold by the store' deals and shows what it found", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/" });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  w.eval(`STORES = ${readFileSync(new URL("stores.json", W), "utf8")};
    Arkhas.findStoreFilter = async (s) => s.name === "Amazon.eg" ? { params: [["rh", "p_6:AAA"]], text: "Amazon.eg", level: 0 } : null;
    Arkhas.deals = async (o) => ({ deals: o.filters ? [{ title: "Sold by Amazon", price: 400, old_price: 1000, pct: 60, url: "https://www.amazon.eg/dp/B1", source: "Amazon.eg", big: true }]
      : [{ title: "3rd party", price: 400, old_price: 1000, pct: 60, url: "https://x/2", source: "Noon" }], sources: [], total: 1, at: Date.now() });
    dealsData = { deals: [{ title: "3rd party", price: 400, old_price: 1000, pct: 60, url: "https://x/2", source: "Noon" }], sources: [], total: 1, at: Date.now() };
    dealRange = "r5070"; dealBig = false; renderDeals(true);`);
  w.document.querySelector("#d_quick button[data-big]").click();
  await new Promise((r) => setTimeout(r, 50));
  const cards = [...w.document.querySelectorAll("#d_out .dc")];
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent, /Sold by Amazon/);
  assert.match(w.document.querySelector("#d_big").textContent, /✅ Amazon/);
  assert.match(w.document.querySelector("#d_big").textContent, /❌ Noon/);
});
