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

test("🛒 next to the price for Amazon/noon/Jumia; tap = automatic add to cart via the app", async () => {
  const W = new URL("../web/", import.meta.url);
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const added = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.local/", beforeParse(w) {
    w.Native = { cartAdd: (id, u) => added.push([id, u]), cartLogin() {}, getPref: () => "", setPref() {}, readConfig: () => "", appVersion: () => "1", isBackground: () => false };
  } });
  const w = dom.window; await new Promise((r) => setTimeout(r, 50));
  const mk = (url) => w.eval(`priceRow({ url: ${JSON.stringify(url)} }, '<div class="p">EGP 1</div>')`);
  for (const u of ["https://www.amazon.eg/x/dp/B0ABCDEF12", "https://www.noon.com/egypt-en/x/N1/p/", "https://www.jumia.com.eg/x.html"])
    assert.match(mk(u), /class="prow"><div class="p">EGP 1<\/div><button type="button" class="cart"/);
  assert.doesNotMatch(mk("https://btech.com/x"), /class="cart"/);
  const d = w.document.createElement("div"); d.innerHTML = mk("https://www.amazon.eg/x/dp/B0ABCDEF12"); w.document.body.append(d);
  const b = d.querySelector(".cart"); b.click();
  assert.deepEqual(added[0], [1, "https://www.amazon.eg/x/dp/B0ABCDEF12"]);
  assert.ok(b.classList.contains("busy"));
  w.__cartDone(1, "ok");
  assert.equal(b.textContent, "✅");
});

test("cart bot: finds the store button, clicks once, reports ok when the cart count goes up", async () => {
  const src = readFileSync(new URL("../web/cartbot.js", import.meta.url), "utf8");
  const run = async (body, store, after) => {
    const dom = new JSDOM(`<body>${body}</body>`, { runScripts: "outside-only", url: "https://www.amazon.eg/dp/B0ABCDEF12" });
    const w = dom.window, out = [];
    w.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 10, height: 10 });
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.ArkCart = { clicked() {}, result: (j) => out.push(JSON.parse(j)) };
    w.__ARK_STORE = store;
    if (after) w.document.addEventListener("click", (e) => after(w, e));
    w.eval(src);
    for (let i = 0; i < 30 && !out.length; i++) await new Promise((r) => setTimeout(r, 100));
    return out[0];
  };
  const amz = await run('<span id="nav-cart-count">0</span><input id="add-to-cart-button" type="submit" value="Add to Cart">', "amazon",
    (w) => { w.document.querySelector("#nav-cart-count").textContent = "1"; });
  assert.equal(amz.status, "ok");
  const jum = await run('<div>Hello</div><button class="x">أضف إلى العربة</button>', "jumia",
    (w) => { w.document.body.insertAdjacentHTML("beforeend", "<div>Product added successfully</div>"); });
  assert.equal(jum.status, "ok");
  const out = await run('<a id="nav-logobar-greeting">Sign in ›</a><input id="add-to-cart-button" type="submit">', "amazon");
  assert.equal(out.status, "signin");
});
