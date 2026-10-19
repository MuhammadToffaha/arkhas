// Noon: card selectors, Next.js data fallback, and link-anchored fallback for hashed class names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const E = require("../web/engine.js");
const { DOMParser } = new JSDOM("").window;
const NOON = JSON.parse(readFileSync(new URL("../web/stores.json", import.meta.url), "utf8")).find((s) => s.name === "Noon");

test("noon: productContainer cards (name div must NOT be treated as a card)", () => {
  const html = `<div class="grid">
    <span class="productContainer"><a href="/egypt-en/apple-iphone-15-128gb/N53432/p/?o=1">
      <img src="https://f.nooncdn.com/p/a.jpg"><div data-qa="product-name" title="Apple iPhone 15 128GB Black">Apple iPhone 15 128GB Black</div>
      <div class="price"><strong class="amount">41,999</strong><span class="currency">EGP</span><span class="oldPrice">45,000</span></div></a></span>
    <span class="productContainer"><a href="/egypt-en/samsung-a55/N1/p/"><div data-qa="product-name">Samsung Galaxy A55</div><strong class="amount">17,499</strong></a></span>
  </div>`;
  const o = E.parse(html, NOON, DOMParser);
  assert.deepEqual(o.map((x) => [x.title, x.price]), [["Apple iPhone 15 128GB Black", 41999], ["Samsung Galaxy A55", 17499]]);
  assert.equal(o[0].old_price, 45000);
  assert.equal(o[0].url, "https://www.noon.com/egypt-en/apple-iphone-15-128gb/N53432/p/?o=1");
});

test("noon: Next.js page data (hits) when the HTML has no usable cards", () => {
  const data = { props: { pageProps: { catalog: { hits: [
    { name: "Apple iPhone 15 128GB", sku: "N53432", url: "apple-iphone-15-128gb", price: 45000, sale_price: 41999, image_key: "v1/abc" },
  ] } } } };
  const html = `<html><body><div id="root"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
  const o = E.parse(html, NOON, DOMParser)[0];
  assert.deepEqual([o.title, o.price, o.old_price], ["Apple iPhone 15 128GB", 41999, 45000]);
  assert.equal(o.url, "https://www.noon.com/egypt-en/apple-iphone-15-128gb/N53432/p/");
  assert.equal(o.image, "https://f.nooncdn.com/p/v1/abc.jpg");
});

test("noon: new hashed class names -> link-anchored cards still work", () => {
  const html = `<div class="x7Hq"><div class="aB3"><a href="/egypt-en/jbl-flip-6/N9/p/"><img src="i.jpg"><div class="zz1">JBL Flip 6 Portable Speaker</div></a>
    <div class="q9"><span>EGP</span> <b>4,299</b></div></div></div>`;
  const o = E.parse(html, NOON, DOMParser);
  assert.equal(o.length, 1);
  assert.equal(o[0].price, 4299);
  assert.match(o[0].title, /JBL Flip 6/);
});

test("noon: hidden browser waits for product links", () => {
  assert.equal(NOON.wait, 'a[href*="/p/"]');
  assert.equal(NOON.deals.wait, 'a[href*="/p/"]');
});

test("noon mega deals: own page, tagged, kept even without old price, preferred over duplicates", async () => {
  const urls = NOON.deals.urls.map((u) => (typeof u === "string" ? u : u.url));
  assert.ok(urls.includes("https://www.noon.com/egypt-en/megadeals-eg/"));
  const card = (href, name, price, old) => `<span class="productContainer"><a href="${href}"><div data-qa="product-name">${name}</div>
    <strong class="amount">${price}</strong>${old ? `<span class="oldPrice">${old}</span>` : ""}</a></span>`;
  const fetcher = (url) => {
    if (url.includes("megadeals-eg") && url.includes("egypt-en")) return Promise.resolve(
      card("/egypt-en/airpods/N1/p/", "AirPods Pro 2", "7,999", "13,999") + card("/egypt-en/kettle/N2/p/", "Tefal Kettle", "999", null));
    if (url.includes("/deals/")) return Promise.resolve(card("/egypt-en/airpods/N1/p/", "AirPods Pro 2", "7,999", "13,999"));
    return Promise.reject(new Error("HTTP 404"));
  };
  const r = await E.deals({ stores: [NOON], fetcher, DOMParser, timeout: 200, renderTimeout: 200 });
  const t = r.deals.map((o) => [o.title, o.pct, o.tag || null]);
  assert.deepEqual(t, [["AirPods Pro 2", 43, "mega"], ["Tefal Kettle", 0, "mega"]], "deduped, mega copy kept, no-old-price mega item kept");
});
