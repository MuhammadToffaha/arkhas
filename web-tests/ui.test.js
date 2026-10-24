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
          const body = url.startsWith("https://api.github.com/") ? JSON.stringify({ tag_name: "v6", assets: [{ name: "arkhas-1.0.6.apk", size: 2621440,
              browser_download_url: "https://github.com/MuhammadToffaha/arkhas/releases/download/v6/arkhas-1.0.6.apk" }] })
            : url.includes("jumia.com.eg") ? read(new URL("jumia.html", FX))
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
  assert.match(cards[0].textContent, /EGP 39,500/);  // prices always in English digits
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
  doc.querySelector("#gear").click();
  doc.querySelector("#lang_en").click();   // language now lives in settings
  assert.equal(doc.documentElement.dir, "ltr");
  assert.equal(prefs.lang, "en");
  assert.ok(doc.querySelector("#lang_en").classList.contains("on"));
});

test("bottom nav holds the buttons; slow stores start switched off", async () => {
  const { win, doc, prefs } = boot();
  await win.arkhasReady;
  const nav = doc.querySelector("nav.nav");
  assert.deepEqual([...nav.querySelectorAll("button")].map((b) => b.id), ["nav_search", "nav_deals", "nav_promo", "nav_fav", "gear"], "bottom bar = search, deals, promo codes, favourites, settings");
  assert.equal(doc.querySelector("#nav_status"), null);
  assert.ok(doc.querySelector(".sheet #langseg"), "language switch is inside settings");
  assert.equal(doc.querySelector("header #gear"), null, "nothing clickable left in the top area");
  doc.querySelector("#gear").click();
  const box = (n) => doc.querySelector(`#storelist input[data-n="${n}"]`);
  assert.equal(box("Sigma Computer").checked, false);
  assert.equal(box("Dream 2000").checked, true);
  box("Sigma Computer").checked = true;
  doc.querySelector("#s_save").click();
  assert.deepEqual(JSON.parse(prefs.enabled), ["Sigma Computer"]);
  assert.deepEqual(JSON.parse(prefs.disabled), []);
});

test("settings → updates: red dot, download progress, install; hidden on old apps", async () => {
  // old app 1.0.5 (no update bridge): checks GitHub through fetch, banner + download link
  const old = boot();
  await old.win.arkhasReady;
  await until(() => !old.doc.querySelector("#newver").hidden);
  assert.match(old.doc.querySelector("#newver").textContent, /1\.0\.6/);
  old.doc.querySelector("#newver").click();
  assert.equal(old.doc.querySelector("#upd").hidden, false);
  assert.equal(old.doc.querySelector("#u_web").hidden, true);
  assert.match(old.doc.querySelector("#u_install").textContent, /GitHub/);

  // new app: fake native update methods
  const calls = [];
  const html = readFileSync(new URL("index.html", W), "utf8").replace('<script src="engine.js"></script>', () => `<script>${readFileSync(new URL("engine.js", W), "utf8")}</script>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "file:///android_asset/web/index.html", beforeParse(win) {
    const reply = (id, ok, v) => setTimeout(() => win.__native(id, ok, v), 5);
    win.Native = {
      fetch: (id) => reply(id, false, "offline"), getPref: () => "", setPref() {}, appVersion: () => "1.0.5", pendingQuery: () => "",
      readConfig: (n) => readFileSync(new URL(n, W), "utf8"),
      checkUpdate(id, force) { calls.push(["check", force]); reply(id, true, JSON.stringify({ available: true, latestName: "1.0.6", latest: 6,
        url: "https://github.com/MuhammadToffaha/arkhas/releases/download/v6/arkhas-1.0.6.apk", size: 2621440 })); },
      installUpdate(id, url) { calls.push(["install", url]); setTimeout(() => win.__updProgress(42), 1); setTimeout(() => reply(id, true, "need-permission"), 10); },
      refreshWeb(id) { calls.push(["web"]); reply(id, true, "same"); },
    };
  } });
  const { window: win } = dom, doc = win.document;
  await win.arkhasReady;
  await until(() => !doc.querySelector("#dot").hidden);
  assert.deepEqual(calls[0], ["check", false], "quiet check on start");
  doc.querySelector("#gear").click();
  assert.equal(doc.querySelector("#upd").hidden, false);
  assert.match(doc.querySelector("#u_msg").textContent, /1\.0\.6.*2\.5/);
  doc.querySelector("#u_install").click();
  await until(() => calls.some((c) => c[0] === "install"));
  await until(() => /ارجع|come back/.test(doc.querySelector("#u_msg").textContent));
  assert.ok(calls.find((c) => c[0] === "install")[1].endsWith("arkhas-1.0.6.apk"));
  doc.querySelector("#u_web").click();
  await until(() => /محدّثة|up to date/.test(doc.querySelector("#u_msg").textContent));
});

test("search box: editable, cursor goes to the end (no select-all), ✕ clears; store status shown in settings", async () => {
  const { win, doc } = boot({ disabled: JSON.stringify(["Noon", "B.TECH", "Carrefour Egypt"]) });
  await win.arkhasReady;
  const q = doc.querySelector("#q");
  assert.equal(q.readOnly, false);
  q.value = "ايفون 15";
  doc.querySelector("#f").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await until(() => doc.querySelector("#bar").hidden && doc.querySelectorAll(".pc").length > 0, 5000);
  assert.equal(doc.querySelector("#qx").hidden, false, "✕ visible when there is text");
  doc.querySelector("#nav_search").click();
  assert.equal(doc.activeElement, q);
  assert.equal(q.selectionStart, q.value.length, "cursor at the end");
  assert.equal(q.selectionEnd, q.value.length, "nothing selected");
  q.setSelectionRange(3, 3); q.setRangeText("X"); q.dispatchEvent(new win.Event("input"));
  assert.equal(q.value, "ايفXون 15", "user can edit in the middle");
  doc.querySelector("#qx").click();
  assert.equal(q.value, "");
  assert.equal(doc.querySelector("#qx").hidden, true);
  doc.querySelector("#gear").click();
  const jumia = doc.querySelector('#storelist input[data-n="Jumia"]').parentElement;
  assert.match(jumia.textContent, /✅ 3/);
});

test("favourites: ♡ on cards saves without opening the store, ❤️ tab lists and removes, survives restart", async () => {
  const prefs = { disabled: JSON.stringify(["Noon", "B.TECH", "Carrefour Egypt"]) };
  const { win, doc } = boot(prefs);
  await win.arkhasReady;
  doc.querySelector("#q").value = "ايفون 15";
  doc.querySelector("#f").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await until(() => doc.querySelector("#bar").hidden && doc.querySelectorAll(".pc .fav").length === 3, 5000);
  const heartBtn = doc.querySelector(".pc .fav");
  const url = heartBtn.dataset.u;
  let navigated = false;
  heartBtn.closest("a").addEventListener("click", (e) => { if (!e.defaultPrevented) navigated = true; });
  heartBtn.click();
  assert.equal(navigated, false, "tapping the heart must not open the store");
  assert.equal(doc.querySelector(".pc .fav").textContent, "♥");
  assert.equal(doc.querySelector("#favcnt").textContent, "1");
  const saved = JSON.parse(prefs.favs);
  assert.equal(saved[0].url, url);
  assert.ok(saved[0].price > 0 && saved[0].source);

  doc.querySelector("#nav_fav").click();
  assert.equal(doc.querySelector("#favView").hidden, false);
  assert.equal(doc.querySelectorAll("#f_out .fr").length, 1);

  // restart: favourites come back from storage
  const again = boot(prefs);
  await again.win.arkhasReady;
  assert.equal(again.doc.querySelector("#favcnt").textContent, "1");
  again.doc.querySelector("#nav_fav").click();
  again.doc.querySelector("#f_out .fav").click();   // ✕ remove
  assert.equal(again.doc.querySelectorAll("#f_out .fr").length, 0);
  assert.equal(again.doc.querySelector("#favcnt").hidden, true);
  assert.deepEqual(JSON.parse(prefs.favs), []);
});
