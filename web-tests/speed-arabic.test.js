// Tests for v2: JSON store adapters, Arabic handling, one-query-per-store, timeouts, cache.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const E = require("../web/engine.js");
const { DOMParser } = new JSDOM("").window;
const W = new URL("../web/", import.meta.url);
const STORES = Object.fromEntries(JSON.parse(readFileSync(new URL("stores.json", W), "utf8")).map((s) => [s.name, s]));
E.setSynonyms(JSON.parse(readFileSync(new URL("synonyms.json", W), "utf8")));

const SHOPIFY = { resources: { results: { products: [
  { title: "Apple iPhone 15 128GB &amp; eSIM", price: "39999.00", compare_at_price_max: "42000.00", url: "/products/iphone-15?_pos=1", image: "https://cdn/x.jpg", available: true },
  { title: "Apple iPhone 15 256GB", price: "38000.00", url: "/products/iphone-15-256", available: false },
] } } };
const WOO = [{ name: "iPhone 15 &#8211; 128GB", permalink: "https://www.dubaiphone.net/product/iphone-15/", is_in_stock: true,
  prices: { price: "4150000", regular_price: "4300000", currency_minor_unit: 2 }, images: [{ src: "https://w/i.jpg" }] }];
const MAGENTO = { data: { products: { items: [{ name: "Apple iPhone 15 128GB", url_key: "apple-iphone-15", url_suffix: ".html",
  small_image: { url: "https://m/i.jpg" }, price_range: { minimum_price: { final_price: { value: 40500 }, regular_price: { value: 41000 } } } }] } } };
const PRESTA = { products: [{ name: "iPhone 15 128GB", price_amount: 40999, regular_price_amount: 40999, url: "https://www.cairosales.com/en/iphone-15.html",
  cover: { medium: { url: "https://p/i.jpg" } } }] };
const IKEA = { searchResultPage: { products: { main: { items: [{ product: { name: "MALM", typeName: "Bed frame", salesPrice: { numeral: 9995 },
  pipUrl: "https://www.ikea.com/eg/en/p/malm-bed/", mainImageUrl: "https://i/m.jpg" } }] } } } };

test("shopify adapter: decodes, skips sold-out, absolute url without tracking", () => {
  const o = E.ADAPTERS.shopify.parse(SHOPIFY, STORES["Dream 2000"]);
  assert.equal(o.length, 1);
  assert.equal(o[0].title, "Apple iPhone 15 128GB & eSIM");
  assert.equal(o[0].price, 39999);
  assert.equal(o[0].old_price, 42000);
  assert.equal(o[0].url, "https://dream2000.com/products/iphone-15");
  assert.ok(E.ADAPTERS.shopify.url(STORES["Dream 2000"], "ايفون 15").startsWith("https://dream2000.com/search/suggest.json?q=%D8%A7"));
});

test("woo / magento / prestashop / ikea adapters", () => {
  const w = E.ADAPTERS.woo.parse(WOO, STORES["Dubai Phone"])[0];
  assert.deepEqual([w.title, w.price, w.old_price], ["iPhone 15 – 128GB", 41500, 43000]);
  const m = E.ADAPTERS.magento.parse(MAGENTO, STORES["Raneen"])[0];
  assert.equal(m.url, "https://www.raneen.com/en/apple-iphone-15.html");
  assert.equal(m.price, 40500);
  assert.ok(decodeURIComponent(E.ADAPTERS.magento.url(STORES["Hyper One"], "tv")).startsWith('https://mcprod.hyperone.com.eg/graphql?query={products(search:"tv"'));
  const p = E.ADAPTERS.prestashop.parse(PRESTA, STORES["Cairo Sales"])[0];
  assert.equal(p.price, 40999);
  assert.ok(E.ADAPTERS.prestashop.url(STORES["Cairo Sales"], "tv").includes("/en/search?controller=search&s=tv&ajax=1"));
  const k = E.ADAPTERS.ikea.parse(IKEA, STORES["IKEA Egypt"])[0];
  assert.deepEqual([k.title, k.price], ["MALM Bed frame", 9995]);
});

test("selector options each with their own @attr", () => {
  const store = { name: "OC", base_url: "https://oc.eg", item: ".product-thumb", title: ".name a, .caption h4 a",
    price: ".price-new, .price", link: ".name a@href, .caption h4 a@href" };
  const html = `<div class="product-thumb"><div class="caption"><h4><a href="/p/1">Samsung TV 55</a></h4></div><p class="price">EGP 19,999</p></div>`;
  const o = E.parse(html, store, DOMParser);
  assert.deepEqual([o[0].title, o[0].price, o[0].url], ["Samsung TV 55", 19999, "https://oc.eg/p/1"]);
});

test("store list: 25+ stores, every store has a way to search", () => {
  const all = Object.values(STORES);
  assert.ok(all.length >= 25, `only ${all.length} stores`);
  for (const s of all) assert.ok(s.type || s.search_url, s.name);
  for (const s of all) if (s.type) assert.ok(E.ADAPTERS[s.type], `${s.name}: unknown type ${s.type}`);
});

// ---------- Arabic ----------
test("Arabic: ال prefix and intent words", () => {
  assert.equal(E.translateQuery("الايفون 15", false), "iphone 15");
  assert.equal(E.cleanQuery("ارخص سعر ايفون 15"), "ايفون 15");
  assert.equal(E.cleanQuery("سعر"), "سعر");
  assert.equal(E.relevance("الغساله سامسونج", "Samsung Washing Machine 8kg"), 1);
});

test("Arabic: relevance uses translation for unknown brand", () => {
  // dictionary doesn't know "جبرا"; Google gives "jabra headphones"
  assert.ok(E.relevance("سماعة جبرا", "Jabra Elite 4 Earbuds") < 0.6);
  assert.ok(E.relevance("سماعة جبرا", "Jabra Elite 4 headphones", ["سماعة جبرا", "jabra headphones"]) >= 0.6);
});

test("Arabic: unknown words are sent to Google Translate, known ones are not", async () => {
  const calls = [];
  const fetcher = async (url) => { calls.push(url); return JSON.stringify([[["Jabra headphones", "سماعة جبرا"]]]); };
  assert.deepEqual(await E.queryVariantsAsync("سماعة جبرا", fetcher), ["سماعة جبرا", "jabra headphones"]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith("https://translate.googleapis.com/"));
  assert.deepEqual(await E.queryVariantsAsync("ايفون 15", fetcher), ["ايفون 15", "iphone 15"]);
  assert.equal(calls.length, 1, "dictionary handled it, no network");
  const broken = async () => { throw new Error("offline"); };
  assert.equal((await E.queryVariantsAsync("سماعة جبرا", broken))[0], "سماعة جبرا");
});

// ---------- speed ----------
test("one query per store, slow store times out, fast results arrive first, cache", async () => {
  const seen = [];
  const fetcher = (url, o) => {
    seen.push(url);
    if (url.includes("translate.googleapis")) return Promise.resolve(JSON.stringify([[["jabra headphones"]]]));
    if (url.includes("dream2000")) return Promise.resolve(JSON.stringify({ resources: { results: { products: [
      { title: "Jabra Elite 4 Headphones", price: "3200.00", url: "/products/j", available: true }] } } }));
    if (url.includes("compumarts")) return Promise.resolve(JSON.stringify({ resources: { results: { products: [
      { title: "Jabra Elite 5 Headphones", price: "4100.00", url: "/products/j5", available: true }] } } }));
    return new Promise(() => {});  // hangs forever
  };
  const stores = [STORES["Dream 2000"], STORES["Compumarts"], STORES["Jumia"]];
  const order = [];
  const t0 = Date.now();
  const r = await E.search("سعر سماعة جبرا", { stores, fetcher, DOMParser, timeout: 300, cacheMs: 60000,
    onProgress: (p) => order.push(p.sources.at(-1).source) });
  assert.ok(Date.now() - t0 < 2000, "hung store must not block");
  assert.deepEqual(r.top3.map((o) => o.price), [3200, 4100]);
  assert.equal(order.at(-1), "Jumia");
  const st = Object.fromEntries(r.sources.map((s) => [s.source, s]));
  assert.equal(st["Jumia"].error, "timeout");
  assert.equal(st["Compumarts"].query, "jabra headphones", "English-only store gets the translation");
  assert.equal(st["Dream 2000"].query, "سماعة جبرا", "bilingual store gets the original");
  assert.equal(seen.filter((u) => u.includes("jumia")).length, 1, "one request per store, not one per language");

  const n = seen.length;
  const again = await E.search("سماعة جبرا", { stores, fetcher, DOMParser, timeout: 300, cacheMs: 60000 });
  assert.ok(again.cached);
  assert.equal(seen.length, n, "cache hit: no network");
});

// ---------- accuracy: specs beat price ----------
const off = (title, price, src = "S") => ({ title, price, source: src, url: `https://${src}/${encodeURIComponent(title)}` });

test("accuracy: 'Beko dishwasher 14 persons' never shows 10-person models; exact before cheaper", () => {
  const offers = [
    off("Beko Dishwasher 10 Place Settings, Silver", 14999, "A"),
    off("Beko Slim Dishwasher 10 Persons", 13500, "B"),
    off("Beko Dishwasher 14 Place Settings, Inox", 24999, "C"),
    off("بيكو غسالة أطباق 14 فرد فضي", 23900, "D"),
    off("Beko DFN05R14 Dishwasher", 21000, "E"),
    off("Bosch Dishwasher 14 Place Settings", 19000, "F"),
  ];
  const { kept } = E.rank("Beko dishwasher 14 persons", offers, 0.6, ["Beko dishwasher 14 persons", "غساله اطباق بيكو 14 فرد"]);
  const titles = kept.map((o) => o.title);
  assert.ok(!titles.some((t) => /10/.test(t)), "10-person models removed");
  assert.ok(!titles.some((t) => /Bosch/.test(t)), "wrong brand removed");
  assert.deepEqual(E.top(kept).map((o) => o.price), [23900, 24999, 21000], "two exact (cheapest first), then the close one");
  assert.deepEqual(E.top(kept).map((o) => o.match), [0, 0, 1]);
});

test("accuracy: Arabic query with Arabic digits and unit", () => {
  const { kept } = E.rank("غسالة اطباق بيكو ١٤ فرد",
    [off("Beko Dishwasher 10 Place Settings", 15000), off("Beko Dishwasher 14 Place Settings", 25000, "X")],
    0.6, ["غسالة اطباق بيكو ١٤ فرد", "dishwasher beko 14 persons"]);
  assert.deepEqual(kept.map((o) => o.price), [25000]);
});

test("accuracy: model numbers and storage", () => {
  const { kept } = E.rank("iphone 15 256gb", [
    off("Apple iPhone 15 128GB", 38000, "a"), off("Apple iPhone 15 256GB Black", 44000, "b"),
    off("Apple iPhone 15 Pro 256GB", 52000, "c"), off("Apple iPhone 14 256GB", 33000, "d"),
    off("Samsung Galaxy A15 256GB", 9000, "e"), off("Apple iPhone15 256 GB 5G", 43500, "f"),
  ]);
  assert.deepEqual(kept.map((o) => o.price), [43500, 44000, 52000]);
  assert.ok(kept.at(-1).flags.includes("other-model"));
});

test("accuracy: TV inches and AC horsepower", () => {
  assert.equal(E.matchInfo("شاشة سامسونج 55 بوصة", "Samsung 65 Inch Crystal UHD 4K TV", ["samsung tv 55 inch"]).tier, -1);
  assert.equal(E.matchInfo("شاشة سامسونج 55 بوصة", "Samsung 55\" Crystal UHD 4K Smart TV", ["tv samsung 55 inch"]).tier, 0);
  assert.equal(E.matchInfo("تكييف شارب 1.5 حصان", "Sharp Split AC 2.25 HP Cool", ["air conditioner sharp 1.5 hp"]).tier, -1);
  assert.equal(E.matchInfo("تكييف شارب 1.5 حصان", "Sharp Split Air Conditioner 1.5 HP Cool Only", ["air conditioner sharp 1.5 hp"]).tier, 0);
});

test("accuracy: screenshot case 'ثلاجة توشيبا 450 لتر' drops 296 L / 468 L", () => {
  const q = "ثلاجة توشيبا 450 لتر";
  const { kept } = E.rank(q, [
    off("ثلاجة GR-RT468WE-PMN(57) من توشيبا، عاكس، 468 لتر", 18499, "Amazon.eg"),
    off("ثلاجة نوفروست توشيبا، 296 لتر، 2 باب، فضي - GR-EF31-S", 18999, "Raneen"),
    off("Toshiba Refrigerator 450 Liters No Frost", 24999, "B.TECH"),
    off("ثلاجة توشيبا نوفروست ٤٥٠ لتر", 25500, "Raneen"),
  ], 0.6, E.queryVariants(q));
  assert.deepEqual(kept.map((o) => o.price), [24999, 25500]);
  assert.ok(kept.every((o) => o.match === 0));
});
