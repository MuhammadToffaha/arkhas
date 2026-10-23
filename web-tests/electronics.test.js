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

test("🛒 store-app button: shown only when the app is installed; Amazon opens add-to-cart in the app", async () => {
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
  assert.deepEqual(opened[0], ["https://www.amazon.eg/gp/aws/cart/add.html?ASIN.1=B0ABCDEF12&Quantity.1=1", "com.amazon.mShop.android.shopping"]);
});
