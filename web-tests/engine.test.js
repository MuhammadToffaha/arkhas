// Same cases as backend/tests/test_core.py, run against web/engine.js (the code inside the Android app).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const E = require("../web/engine.js");
const { DOMParser } = new JSDOM("").window;
const FX = new URL("../backend/tests/fixtures/", import.meta.url);
const fx = (n) => readFileSync(new URL(n, FX), "utf8");
const STORES = Object.fromEntries(JSON.parse(readFileSync(new URL("../web/stores.json", import.meta.url), "utf8")).map((s) => [s.name, s]));
E.setSynonyms(JSON.parse(readFileSync(new URL("../web/synonyms.json", import.meta.url), "utf8")));

test("normalize arabic variants", () => {
  assert.equal(E.normalize("آيفونٌ ١٥ بـرو"), "ايفون 15 برو");
  assert.equal(E.normalize("ثلاجة"), E.normalize("ثلاجه"));
  assert.equal(E.normalize("ايفون15"), "ايفون 15");
});

for (const [q, exp] of [["ايفون 15 برو", "iphone 15 pro"], ["غسالة سامسونج", "washing machine samsung"],
  ["iphone 15", "ايفون 15"], ["samsung washing machine", "سامسونج غساله"]]) {
  test(`variants: ${q}`, () => {
    const v = E.queryVariants(q);
    assert.equal(v[0], q);
    assert.equal(E.normalize(v[1]), E.normalize(exp));
  });
}

test("parse price", () => {
  const cases = [["EGP 41,999.00", 41999], ["٥٤٬٩٩٩٫٠٠ جنيه", 54999], ["12.999 ج.م", 12999], ["1.299,50 EGP", 1299.5],
    ["EGP 150", 150], [39900, 39900], ["call", null], ["0", null]];
  for (const [raw, v] of cases) assert.equal(E.parsePrice(raw), v, String(raw));
});

test("jumia css", () => {
  const o = E.parse(fx("jumia.html"), STORES["Jumia"], DOMParser);
  assert.equal(o.length, 3);
  assert.equal(o[0].price, 41999);
  assert.equal(o[0].old_price, 45000);
  assert.equal(o[0].url, "https://www.jumia.com.eg/apple-iphone-15-128gb-black-12345.html");
  assert.equal(o[0].image, "https://eg.jumia.is/p1.jpg");
});

test("amazon css + arabic digits", () => {
  const o = E.parse(fx("amazon.html"), STORES["Amazon.eg"], DOMParser);
  assert.deepEqual(o.map((x) => x.price), [40750, 54999]);
  assert.ok(o[0].url.startsWith("https://www.amazon.eg/Apple-iPhone-15-128-GB/dp/B0X1"));
});

test("json-ld fallback", () => {
  const store = { name: "X", base_url: "https://store.eg", item: "div.nothing", title: "h2", price: ".p" };
  const o = E.parse(fx("jsonld.html"), store, DOMParser);
  assert.deepEqual(new Set(o.map((x) => `${x.title}|${x.price}`)), new Set(["Apple iPhone 15 128GB|40999", "Apple iPhone 15 Plus|46999"]));
  assert.equal(o[0].url, "https://store.eg/en/iphone-15-128");
});

test("build url", () => {
  assert.ok(E.buildUrl(STORES["Amazon.eg"], "ايفون 15", "ar").endsWith("language=ar_AE"));
  assert.ok(E.buildUrl(STORES["Jumia"], "iphone 15", "en").includes("q=iphone+15"));
});

test("serpapi skips foreign currency", () => {
  const o = E.parseSerp(JSON.parse(fx("serpapi.json")));
  assert.deepEqual(o.map((x) => x.price), [39900, 39500]);
});

const mk = (title, price, source = "S", url) => ({ title, price, source, url: url || `https://${source}/${title}` });

test("relevance cross-language", () => {
  assert.equal(E.relevance("ايفون 15", "Apple iPhone 15 128GB"), 1);
  assert.equal(E.relevance("iphone 15 pro", "ابل ايفون 15 برو 256 جيجا"), 1);
  assert.ok(E.relevance("iphone 15", "Samsung Galaxy A15") < 0.6);
});

test("rank: real product beats case", () => {
  const { kept, hidden } = E.rank("iphone 15", [mk("Silicone Case For iPhone 15", 150), mk("Apple iPhone 15 128GB", 41999),
    mk("Apple iPhone 15 128GB", 40500, "T"), mk("Samsung Galaxy A15", 7499)]);
  assert.equal(hidden, 1);
  assert.equal(kept[0].price, 40500);
  assert.ok(kept.at(-1).flags.includes("possible-accessory"));
  assert.deepEqual(E.top(kept).map((o) => o.price), [40500, 41999]);
});

test("rank: accessory allowed when asked", () => {
  assert.deepEqual(E.rank("iphone 15 case", [mk("Silicone Case For iPhone 15", 150)]).kept[0].flags, []);
});

test("end-to-end with fake fetcher: top 3 + progress", async () => {
  const fetcher = async (url, o) => {
    if (url.startsWith("https://www.jumia.com.eg")) return fx("jumia.html");
    if (url.startsWith("https://serpapi.com")) return fx("serpapi.json");
    throw new Error("HTTP 503");
  };
  let progress = 0;
  const r = await E.search("ايفون 15", { stores: [STORES["Jumia"], STORES["Amazon.eg"]], fetcher, serpKey: "k",
    renderFallback: false, DOMParser, onProgress: () => progress++ });
  assert.deepEqual(r.variants, ["ايفون 15", "iphone 15"]);
  assert.deepEqual(r.top3.map((o) => o.price), [39500, 39900, 41999]);
  assert.equal(progress, 3);
  const st = Object.fromEntries(r.sources.map((s) => [s.source, s]));
  assert.ok(st["Jumia"].count > 0 && !st["Amazon.eg"].ok);
  assert.ok(r.links[0].url.includes("facebook.com/marketplace/cairo"));
});
