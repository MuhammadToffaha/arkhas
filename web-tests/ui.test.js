// Loads web/index.html like the Android app does, with a fake Native bridge serving fixture pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const W = new URL("../web/", import.meta.url);
const FX = new URL("../backend/tests/fixtures/", import.meta.url);
const read = (u) => readFileSync(u, "utf8");

function boot(prefs = {}) {
  const html = read(new URL("index.html", W)).replace('<script src="engine.js"></script>', () => `<script>${read(new URL("engine.js", W))}</script>`);
  const fetched = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", url: "file:///android_asset/web/index.html",
    beforeParse(win) {
      win.Native = {
        fetch(id, url, opts) {
          fetched.push([url, JSON.parse(opts)]);
          const body = url.includes("jumia.com.eg") ? read(new URL("jumia.html", FX))
            : url.includes("amazon.eg") ? read(new URL("amazon.html", FX))
            : url.includes("serpapi.com") ? read(new URL("serpapi.json", FX)) : null;
          setTimeout(() => win.__native(id, body !== null, body ?? "HTTP 503"), 5);
        },
        getPref: (k) => prefs[k] || "", setPref: (k, v) => { prefs[k] = v; },
        readConfig: (n) => read(new URL(n, W)), appVersion: () => "1.0.test", pendingQuery: () => "",
      };
    },
  });
  return { dom, win: dom.window, doc: dom.window.document, fetched, prefs };
}
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 20)); } };

test("search shows top 3 with medals, links and store status", async () => {
  const { win, doc, fetched } = boot({ serp: "KEY", disabled: JSON.stringify(["Noon", "B.TECH", "Carrefour Egypt", "2B", "Raya Shop"]) });
  await win.arkhasReady;
  doc.querySelector("#q").value = "ايفون 15";
  doc.querySelector("#f").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await until(() => doc.querySelectorAll(".pc").length === 3 && doc.querySelector("#bar").hidden);
  const cards = [...doc.querySelectorAll(".pc")];
  assert.deepEqual(cards.map((c) => c.querySelector(".medal").textContent), ["🥇", "🥈", "🥉"]);
  assert.match(cards[0].textContent, /٣٩٬٥٠٠/);  // 39,500 EGP in Arabic digits
  assert.ok(cards[2].getAttribute("href").includes("amazon.eg"));  // 40,750 beats Jumia 41,999
  assert.ok([...doc.querySelectorAll(".links a")].some((a) => a.href.includes("facebook.com/marketplace")));
  assert.ok(fetched.some(([u]) => u.includes("serpapi.com") && u.includes("api_key=KEY")));
  assert.ok(!fetched.some(([u]) => u.includes("noon.com")), "disabled stores are skipped");
});

test("settings sheet saves prefs; language toggle", async () => {
  const { win, doc, prefs } = boot();
  await win.arkhasReady;
  doc.querySelector("#gear").click();
  assert.ok(doc.querySelectorAll("#storelist input").length >= 6);
  doc.querySelector("#serp").value = " abc ";
  doc.querySelector("#storelist input").checked = false;
  doc.querySelector("#s_save").click();
  assert.equal(prefs.serp, "abc");
  assert.deepEqual(JSON.parse(prefs.disabled), ["Amazon.eg"]);
  doc.querySelector("#lang").click();
  assert.equal(doc.documentElement.dir, "ltr");
  assert.equal(prefs.lang, "en");
});
