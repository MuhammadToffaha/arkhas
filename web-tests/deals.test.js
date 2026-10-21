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

test("every site in the app has a deals feed", () => {
  const normal = STORES.filter((s) => !s.default_off && s.enabled !== false);
  assert.ok(normal.length >= 23);
  for (const s of normal) {
    assert.ok(s.deals, `${s.name} has no deals feed`);
    assert.ok(E.DEAL_FEEDS[s.deals.kind], `${s.name}: unknown kind ${s.deals.kind}`);
  }
});

test("magento + ikea deal feeds keep only real discounts", () => {
  const mag = { data: { products: { items: [
    { name: "Sharp Split AC 1.5 HP", url_key: "sharp-ac", url_suffix: ".html", price_range: { minimum_price: { final_price: { value: 21000 }, regular_price: { value: 28000 } } } },
    { name: "Normal price TV", url_key: "tv", url_suffix: ".html", price_range: { minimum_price: { final_price: { value: 9000 }, regular_price: { value: 9000 } } } },
  ] } } };
  const m = E.DEAL_FEEDS.magento.parse(mag, S["Raneen"]).map((o) => [o.title, E.pctOff(o)]);
  assert.deepEqual(m, [["Sharp Split AC 1.5 HP", 25], ["Normal price TV", 0]]);
  assert.ok(decodeURIComponent(E.DEAL_FEEDS.magento.url(S["Raya Shop"])).includes('filter:{price:{from:"1"}}'));
  const ik = { searchResultPage: { products: { main: { items: [{ product: { name: "BILLY", typeName: "Bookcase", pipUrl: "https://www.ikea.com/eg/en/p/billy/",
    salesPrice: { numeral: 2995, previous: { numeral: 3995 } } } }] } } } };
  const k = E.DEAL_FEEDS.ikea.parse(ik, S["IKEA Egypt"])[0];
  assert.deepEqual([k.price, k.old_price, E.pctOff(k)], [2995, 3995, 25]);
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
  await until(() => doc.querySelector("#d_bar").hidden && doc.querySelectorAll(".dc").length >= 1);
  // default range = 50–70%: only the 50% Jumia deal
  assert.equal(doc.querySelector("#d_range button.on").dataset.r, "r5070");
  assert.deepEqual([...doc.querySelectorAll(".dc .off")].map((x) => x.textContent), ["-50%"]);
  [...doc.querySelectorAll("#d_range button")].find((b) => b.dataset.r === "all").click();
  assert.ok(doc.querySelectorAll(".dc").length >= 5);
  assert.equal(prefs.dealRange, "all");
  assert.equal(doc.querySelector(".dc .off").textContent, "-50%");
  [...doc.querySelectorAll("#d_sort button")].find((b) => b.dataset.k === "price").click();
  assert.match(doc.querySelector(".dc .ttl").textContent, /SSD|Air Fryer/);
  // store dropdown: closed by default, opens, "clear all" then tick one store
  assert.equal(doc.querySelector("#d_panel").hidden, true);
  doc.querySelector("#d_ddbtn").click();
  assert.equal(doc.querySelector("#d_panel").hidden, false);
  assert.ok(doc.querySelectorAll("#d_stores input[type=checkbox]").length >= 20, "every store with deals is listed");
  doc.querySelector("#d_none").click();
  assert.equal(doc.querySelectorAll(".dc").length, 0);
  const box = doc.querySelector('#d_stores input[data-s="Cairo Sales"]');
  box.checked = true; box.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(doc.querySelectorAll(".dc").length, 1);
  assert.match(doc.querySelector("#d_ddlbl").textContent, /Cairo Sales/);
  assert.ok(!JSON.parse(prefs.dealHide).includes("Cairo Sales"), "choice remembered");
  doc.body.click();
  assert.equal(doc.querySelector("#d_panel").hidden, true, "tap outside closes the list");
  // bigger labelled refresh button
  assert.ok(doc.querySelector("#d_refresh.dref #d_ref_l").textContent.length > 0);
  assert.ok(prefs.dealsCache, "cached for instant reopen");
  doc.querySelector("#nav_search").click();
  assert.equal(doc.querySelector("#searchView").hidden, false);
});

test("Amazon deals: several percent-off pages, merged; one failing page doesn't kill the store", async () => {
  const amazon = S["Amazon.eg"];
  assert.ok(amazon.deals.urls.length >= 8 && amazon.deals.urls.every((u) => /rh=p_8%3A[57]0-/.test(u)));
  const page = (title, p, old, asin) => `<div data-component-type="s-search-result"><a class="a-link-normal" href="/dp/${asin}"><h2><span>${title}</span></h2></a>
    <span class="a-price"><span class="a-offscreen">EGP ${p}</span></span><span class="a-price a-text-price"><span class="a-offscreen">EGP ${old}</span></span></div>`;
  let n = 0;
  const fetcher = (url) => {
    n++;
    if (url.includes("k=electronics")) return Promise.resolve(page("JBL Speaker", "1,200", "3,000", "B1"));
    if (url.includes("k=kitchen")) return Promise.resolve(page("Air Fryer", "1,500", "3,000", "B2") + page("Toaster", "900", "1,000", "B3"));
    return Promise.reject(new Error("HTTP 503"));
  };
  const r = await E.deals({ stores: [amazon], fetcher, DOMParser, timeout: 200 });
  assert.equal(n, amazon.deals.urls.length);
  assert.deepEqual(r.deals.map((o) => [o.title, o.pct]), [["JBL Speaker", 60], ["Air Fryer", 50], ["Toaster", 10]]);  // range chips in the UI pick 50–70%
  assert.equal(r.sources[0].ok, true);
});

test("70%+ chip shows every deal from 70% up (70, 75, 77, 88), biggest first; Amazon has 70%+ pages", async () => {
  assert.ok(S["Amazon.eg"].deals.urls.some((u) => u.includes("p_8%3A70-")));
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const mk = (n, p, o) => `<article class="prd"><a class="core" href="/${n}.html"><h3 class="name">${n} item</h3><div class="prc">EGP ${p}</div><div class="old">EGP ${o}</div></a></article>`;
  const page = mk("a70", 300, 1000) + mk("b75", 250, 1000) + mk("c77", 230, 1000) + mk("d88", 120, 1000) + mk("e60", 400, 1000) + mk("f50", 500, 1000);
  const prefs = { dealRange: "r70" };
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "file:///x/index.html", beforeParse(win) {
    win.Native = { fetch(id, url) { setTimeout(() => win.__native(id, url.includes("jumia.com.eg/flash") , url.includes("jumia.com.eg/flash") ? page : "HTTP 404"), 3); },
      getPref: (k) => prefs[k] || "", setPref: (k, v) => { prefs[k] = v; }, readConfig: (n) => readFileSync(new URL(n, W), "utf8"),
      appVersion: () => "1.0.22", pendingQuery: () => "" };
  } });
  const win = dom.window, doc = win.document;
  await win.arkhasReady;
  doc.querySelector("#nav_deals").click();
  const until = async (f) => { const t = Date.now(); while (!f()) { if (Date.now() - t > 8000) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 20)); } };
  await until(() => doc.querySelector("#d_bar").hidden && doc.querySelectorAll(".dc").length);
  assert.deepEqual([...doc.querySelectorAll(".dc .off")].map((x) => x.textContent), ["-88%", "-77%", "-75%", "-70%"]);
});
