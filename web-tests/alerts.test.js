// 🔔 deal alerts: settings UI drives Native.setAlerts; background mode runs the engine and hands deals to Native.bgDone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const W = new URL("../web/", import.meta.url);
const read = (u) => readFileSync(u, "utf8");
const html = () => read(new URL("index.html", W)).replace('<script src="engine.js"></script>', () => `<script>${read(new URL("engine.js", W))}</script>`);
const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 20)); } };

const JUMIA = `<article class="prd"><a class="core" href="/fryer.html"><h3 class="name">Air Fryer XL</h3><div class="prc">EGP 1,500</div><div class="old">EGP 5,000</div></a></article>
  <article class="prd"><a class="core" href="/kettle.html"><h3 class="name">Kettle</h3><div class="prc">EGP 800</div><div class="old">EGP 1,000</div></a></article>`;
const NOONMEGA = `<span class="productContainer"><a href="/egypt-en/watch/N7/p/"><div data-qa="product-name">Smart Watch</div><strong class="amount">999</strong></a></span>`;

function boot({ bg = false, prefs = {}, calls = [] } = {}) {
  const dom = new JSDOM(html(), { runScripts: "dangerously", url: "file:///android_asset/web/index.html", beforeParse(win) {
    win.Native = {
      fetch(id, url) {
        calls.push(["fetch", url]);
        const body = url.includes("jumia.com.eg/flash-sales") ? JUMIA : url.includes("egmega") ? NOONMEGA
          : url.includes("/getMe") ? (url.includes("botBAD") ? null : JSON.stringify({ ok: true, result: { username: "arkhas_deals_bot" } }))
          : url.includes("/deleteWebhook") ? JSON.stringify({ ok: true, result: true })
          : url.includes("/getUpdates") && win.__tgEmpty ? JSON.stringify({ ok: true, result: [] })
          : url.includes("/getUpdates") ? JSON.stringify({ ok: true, result: [
              { update_id: 1, my_chat_member: { chat: { id: -1001234, title: "عروض العيلة", type: "supergroup" } } },
              { update_id: 2, message: { chat: { id: 55, type: "private" } } }] })
          : url.includes("/sendMessage") ? JSON.stringify({ ok: true, result: {} }) : null;
        setTimeout(() => win.__native(id, body !== null, body ?? "HTTP 404"), 3);
      },
      getPref: (k) => prefs[k] || "", setPref: (k, v) => { prefs[k] = v; }, readConfig: (n) => read(new URL(n, W)),
      appVersion: () => "1.0.16", pendingQuery: () => "", pendingView: () => "",
      isBackground: () => bg, bgDone: (j) => calls.push(["done", JSON.parse(j)]),
      setAlerts: (j) => calls.push(["setAlerts", JSON.parse(j)]), testAlerts: () => calls.push(["test"]), canNotify: () => true,
    };
  } });
  return { win: dom.window, doc: dom.window.document, prefs, calls };
}

test("settings: alerts switch, min %, stores, frequency -> Native.setAlerts", async () => {
  const { win, doc, prefs, calls } = boot();
  await win.arkhasReady;
  doc.querySelector("#gear").click();
  assert.equal(doc.querySelector("#al").hidden, false);
  assert.equal(doc.querySelector("#al_body").hidden, true, "options hidden while off");
  const on = doc.querySelector("#al_on"); on.checked = true; on.dispatchEvent(new win.Event("change"));
  assert.equal(doc.querySelector("#al_body").hidden, false);
  doc.querySelector('#al_min button[data-m="70"]').click();
  doc.querySelector('#al_st button[data-s="Jumia"]').click();    // untick Jumia
  doc.querySelector('#al_h button[data-h="6"]').click();
  const last = calls.filter((c) => c[0] === "setAlerts").at(-1)[1];
  assert.deepEqual(last, { on: true, min: 70, stores: ["Amazon.eg", "Noon"], mega: true, hours: 6, notify: true,
    tg: { on: false, token: "", chat: "", title: "" } });
  assert.deepEqual(JSON.parse(prefs.alerts), last);
  doc.querySelector("#al_test").click();
  assert.ok(calls.some((c) => c[0] === "test"));
});

test("settings: alerts hidden on apps without the native alert support", async () => {
  const dom = new JSDOM(html(), { runScripts: "dangerously", url: "file:///x/index.html", beforeParse(win) {
    win.Native = { fetch() {}, getPref: () => "", setPref() {}, readConfig: (n) => read(new URL(n, W)), appVersion: () => "1.0.15", pendingQuery: () => "" };
  } });
  await dom.window.arkhasReady;
  dom.window.document.querySelector("#gear").click();
  assert.equal(dom.window.document.querySelector("#al").hidden, true);
});

test("background mode: only alert stores are fetched, deals >= min + Noon mega handed to bgDone, no UI work", async () => {
  const prefs = { alerts: JSON.stringify({ on: true, min: 60, stores: ["Jumia", "Noon"], mega: true, hours: 3 }) };
  const calls = [];
  const { win } = boot({ bg: true, prefs, calls });
  await win.arkhasReady;
  await until(() => calls.some((c) => c[0] === "done"), 8000);
  const done = calls.find((c) => c[0] === "done")[1];
  assert.deepEqual(done.deals.map((d) => [d.source, d.title, d.pct, d.tag]).sort(),
    [["Jumia", "Air Fryer XL", 70, null], ["Noon", "Smart Watch", 0, "mega"]].sort());
  const fetched = calls.filter((c) => c[0] === "fetch").map((c) => c[1]);
  assert.ok(!fetched.some((u) => u.includes("amazon")), "Amazon not selected -> not fetched");
  assert.ok(!fetched.some((u) => u.includes("api.github.com")), "no update check in background");
});

test("telegram setup: token -> find group -> pick -> test message", async () => {
  const calls = [];
  const { win, doc, prefs } = boot({ calls });
  await win.arkhasReady;
  doc.querySelector("#gear").click();
  const on = doc.querySelector("#al_on"); on.checked = true; on.dispatchEvent(new win.Event("change"));
  const tg = doc.querySelector("#tg_on"); tg.checked = true; tg.dispatchEvent(new win.Event("change"));
  assert.equal(doc.querySelector("#tg_box").hidden, false);
  assert.equal(doc.querySelectorAll("#tg_steps li").length, 3);
  doc.querySelector("#tg_token").value = "123:ABC";
  doc.querySelector("#tg_find").click();
  await until(() => doc.querySelectorAll("#tg_chats button").length === 2);
  assert.match(doc.querySelector("#tg_chats").textContent, /عروض العيلة/);
  assert.match(doc.querySelector("#tg_chats").textContent, /📩/, "private chat offered too");
  doc.querySelector("#tg_chats button").click();
  const cfg = JSON.parse(prefs.alerts);
  assert.deepEqual(cfg.tg, { on: true, token: "123:ABC", chat: "-1001234", title: "عروض العيلة" });
  doc.querySelector("#tg_test").click();
  await until(() => /✓/.test(doc.querySelector("#tg_msg").textContent));
  const sent = calls.find((c) => c[0] === "fetch" && c[1].includes("/sendMessage"))[1];
  assert.ok(sent.startsWith("https://api.telegram.org/bot123:ABC/sendMessage?chat_id=-1001234"));
});

test("whatsapp: big button shares the shown deals, 📤 on a card shares one, wa.me link with full message", async () => {
  const { win, doc } = boot({ prefs: { dealRange: "all" } });
  await win.arkhasReady;
  let href = null;
  win.__openExt = (u) => { href = u; };
  doc.querySelector("#nav_deals").click();
  await until(() => doc.querySelectorAll(".dc .share").length >= 1, 8000);
  doc.querySelector(".dc .share").click();
  assert.ok(href && href.startsWith("https://wa.me/?text="));
  const one = decodeURIComponent(href.split("text=")[1]);
  assert.match(one, /🔥 -\d+% · /);
  assert.match(one, /https?:\/\//);
  doc.querySelector("#d_wa").click();
  const all = decodeURIComponent(href.split("text=")[1]);
  assert.match(all, /^🔥 .*\n\n1\) /s, "numbered list of deals");
});

test("telegram one-tap: '➕ add bot' opens Telegram's add-to-group screen, waits, picks the new group, sends hello", async () => {
  const calls = [];
  const { win, doc, prefs } = boot({ calls });
  await win.arkhasReady;
  let opened = null; win.__openExt = (u) => { opened = u; };
  win.__tgEmpty = true;                       // group not added yet
  doc.querySelector("#gear").click();
  const on = doc.querySelector("#al_on"); on.checked = true; on.dispatchEvent(new win.Event("change"));
  const tg = doc.querySelector("#tg_on"); tg.checked = true; tg.dispatchEvent(new win.Event("change"));
  doc.querySelector("#tg_token").value = "123:ABC";
  doc.querySelector("#tg_add").click();
  await until(() => opened);
  assert.equal(opened, "https://t.me/arkhas_deals_bot?startgroup=arkhas&admin=post_messages");
  assert.match(doc.querySelector("#tg_bot").textContent, /@arkhas_deals_bot/);
  win.__tgEmpty = false;                      // user picked the group in Telegram
  await until(() => JSON.parse(prefs.alerts).tg.chat === "-1001234", 8000);
  await until(() => calls.some((c) => c[0] === "fetch" && c[1].includes("/sendMessage")), 4000);
  assert.equal(JSON.parse(prefs.alerts).tg.title, "عروض العيلة");
});

test("telegram: wrong token is reported clearly", async () => {
  const { win, doc } = boot();
  await win.arkhasReady;
  doc.querySelector("#gear").click();
  const on = doc.querySelector("#al_on"); on.checked = true; on.dispatchEvent(new win.Event("change"));
  const tg = doc.querySelector("#tg_on"); tg.checked = true; tg.dispatchEvent(new win.Event("change"));
  doc.querySelector("#tg_token").value = "BAD";
  doc.querySelector("#tg_find").click();
  await until(() => /Token|token/.test(doc.querySelector("#tg_msg").textContent));
});

test("telegram: built-in bot token (from the GitHub secret) -> no token field, works out of the box", async () => {
  const calls = [];
  const dom = new JSDOM(html(), { runScripts: "dangerously", url: "file:///x/index.html", beforeParse(win) {
    win.Native = { fetch(id, url) { calls.push(url); setTimeout(() => win.__native(id, true, url.includes("getMe")
        ? JSON.stringify({ ok: true, result: { username: "ToffahaBot" } }) : JSON.stringify({ ok: true, result: [] })), 3); },
      getPref: () => "", setPref() {}, readConfig: (n) => read(new URL(n, W)), appVersion: () => "1.0.21", pendingQuery: () => "",
      setAlerts() {}, testAlerts() {}, canNotify: () => true, defaultTgToken: () => "999:BUILTIN" };
  } });
  const { window: win } = dom, doc = win.document;
  await win.arkhasReady;
  doc.querySelector("#gear").click();
  const on = doc.querySelector("#al_on"); on.checked = true; on.dispatchEvent(new win.Event("change"));
  const tg = doc.querySelector("#tg_on"); tg.checked = true; tg.dispatchEvent(new win.Event("change"));
  assert.equal(doc.querySelector("#tg_token").hidden, true);
  assert.match(doc.querySelector("#tg_steps").textContent, /@ToffahaBot/);
  doc.querySelector("#tg_find").click();
  await until(() => calls.some((u) => u.includes("/bot999:BUILTIN/getMe")));
});
