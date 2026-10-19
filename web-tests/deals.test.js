// ⚡ Flash deals: feeds for the top sites, % off ranking, UI tab.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const E = require("../web/engine.js");
const { DOMParser } = new JSDOM("").window;
const W = new URL("../web/", import.meta.url);
const STORES = JSON.parse(readFileSync(new URL("stores.json", W), "utf8"));
const S = Object.fromEntries(STORES.map((s) => [s.name, s]));

const SHOPIFY = JSON.stringify({ products: [
  { title: "HP Victus 15 Gaming Laptop", handle: "hp-victus-15", images: [{ src: "https://cdn/v.jpg" }],
    variants: [{ price: "41999.00", compare_at_price: "52999.00", available: true }, { price: "45999.00", compare_at_price: "52999.00", available: true }] },
  { title: "Logitech Mouse", handle: "mouse", variants: [{ price: "500.00", compare_at_price: null, available: true }] },          // not on sale
  { title: "Sold out deal", handle: "x", variants: [{ price: "100.00", compare_at_price: "300.00", available: false }] },        // sold out
] });
const WOO = JSON.stringify([{ name: "Galaxy A55 &#8211; 256GB", permalink: "https://www.dubaiphone.net/product/a55/", is_in_stock: true,
  prices: { price: "1599900", regular_price: "1999900", currency_minor_unit: 2 }, images: [] }]);
const PRESTA = JSON.stringify({ products: [{ name: "Toshiba Fridge 450L", price_amount: 21000, regular_price_amount: 30000,
  url: "https://www.cairosales.com/en/fridge.html", cover: null }] });
const JUMIA = `<html><body>
  <article class="prd"><a class="core" href="/air-fryer-1.html"><img class="img" data-src="https://j/1.jpg"><h3 class="name">Tefal Air Fryer 4.2L</h3>
    <div class="prc">EGP 2,499</div><div class="old">EGP 4,999</div></a></article>
  <article class="prd"><a class="core" href="/kettle.html"><h3 class="name">Kettle</h3><div class="prc">EGP 900</div><div class="old">EGP 950</div></a></article>
</body></html>`;
const OPENCART = `<div class="product-layout"><div class="image"><img src="https://o/1.jpg"></div><div class="name"><a href="https://elnekhelytechnology.com/ssd">Samsung SSD 1TB</a></div>
  <div class="price"><span class="price-new">3,200 EGP</span> <span class="price-old">4,000 EGP</span></div></div>`;

function fakeFetch(url) {
  if (url.includes("/products.json")) return Promise.resolve(SHOPIFY);
  if (url.includes("on_sale=true")) return Promise.resolve(WOO);
  if (url.includes("prices-drop")) return Promise.resolve(PRESTA);
  if (url.includes("jumia.com.eg/flash-sales")) return Promise.resolve(JUMIA);
  if (url.includes("route=product/special")) return Promise.resolve(OPENCART);
  return new Promise(() => {});   // amazon render etc: hangs -> timeout
}

test("top 10 sites have a deals feed", () => {
  const withDeals = STORES.filter((s) => s.deals);
  assert.equal(withDeals.length, 10);
  for (const s of withDeals) assert.ok(E.DEAL_FEEDS[s.deals.kind], s.name);
});

test("deals: % off computed, non-sale / sold-out / tiny discounts dropped, biggest discount first", async () => {
  const stores = ["Dream 2000", "Dubai Phone", "Cairo Sales", "Jumia", "El Nekhely", "Amazon.eg"].map((n) => S[n]);
  let progress = 0;
  const r = await E.deals({ stores, fetcher: fakeFetch, DOMParser, timeout: 200, renderTimeout: 200, onProgress: () => progress++ });
  assert.equal(progress, 6);
  const t = r.deals.map((o) => [o.source, o.pct, o.price]);
  assert.deepEqual(t[0], ["Jumia", 50, 2499]);
  assert.deepEqual(t.find((x) => x[0] === "Dream 2000"), ["Dream 2000", 21, 41999], "cheapest on-sale variant");
  assert.ok(t.some((x) => x[0] === "Cairo Sales" && x[1] === 30));
  assert.ok(t.some((x) => x[0] === "Dubai Phone" && x[1] === 20));
  assert.ok(t.some((x) => x[0] === "El Nekhely" && x[1] === 20));
  assert.ok(!r.deals.some((o) => /Kettle|Mouse|Sold out/.test(o.title)));
  for (let i = 1; i < r.deals.length; i++) assert.ok(r.deals[i - 1].pct >= r.deals[i].pct);
  assert.equal(r.sources.find((x) => x.source === "Amazon.eg").error, "timeout");
  assert.equal(r.deals.find((o) => o.source === "Dream 2000").url, "https://dream2000.com/products/hp-victus-15");
});

test("UI: ⚡ tab shows deal cards, sorting and store filter", async () => {
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const prefs = {};
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "file:///android_asset/web/index.html", beforeParse(win) {
    win.Native = {
      fetch(id, url) { fakeFetch(url).then((b) => win.__native(id, true, b)); setTimeout(() => win.__native(id, false, "timeout"), 300); },
      getPref: (k) => prefs[k] || "", setPref: (k, v) => { prefs[k] = v; }, appVersion: () => "1.0.7", pendingQuery: () => "",
      readConfig: (n) => readFileSync(new URL(n, W), "utf8"),
    };
  } });
  const win = dom.window, doc = win.document;
  await win.arkhasReady;
  const btn = doc.querySelector("nav #nav_deals");
  assert.ok(btn && btn.textContent.includes("⚡"), "dedicated ⚡ icon in the bottom bar");
  btn.click();
  assert.equal(doc.querySelector("#dealsView").hidden, false);
  assert.equal(doc.querySelector("#searchView").hidden, true);
  const until = async (f) => { const t = Date.now(); while (!f()) { if (Date.now() - t > 5000) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 20)); } };
  await until(() => doc.querySelector("#d_bar").hidden && doc.querySelectorAll(".dc").length >= 5);
  assert.equal(doc.querySelector(".dc .off").textContent, "-50%");
  [...doc.querySelectorAll("#d_sort button")].find((b) => b.dataset.k === "price").click();
  assert.match(doc.querySelector(".dc .ttl").textContent, /SSD|Air Fryer/);
  [...doc.querySelectorAll("#d_stores button")].find((b) => b.dataset.s === "Cairo Sales").click();
  assert.equal(doc.querySelectorAll(".dc").length, 1);
  assert.ok(prefs.dealsCache, "cached for instant reopen");
  doc.querySelector("#nav_search").click();
  assert.equal(doc.querySelector("#searchView").hidden, false);
});
