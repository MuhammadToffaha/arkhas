// 🤖 A robot student uses Mach ich! in a real headless browser: every lesson step of all 30 days,
//    a full lesson answered correctly, Mein Leben, flashcards, mistakes, Diktat, word bank and the full A2 mock exam.
//    npm i playwright && npx playwright install chromium && node tests/play.test.js
const path = require("path");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require(process.env.PW || "playwright-core")); }
const url = "file://" + path.resolve(__dirname, "../app/src/main/assets/www/index.html");
let failed = 0; const ok = (c, m) => { if (!c) { failed++; console.log("❌", m); } else if (process.env.VERBOSE) console.log("✅", m); };

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("dialog", d => d.accept(p._say || ""));
  await p.goto(url);
  await p.waitForSelector("#view .card");
  const txt = () => p.textContent("#view");

  // every step of every day renders
  for (let d = 0; d < 30; d++) for (let s = 0; s < 5; s++) {
    await p.evaluate(([d, s]) => App.lesson(d, s), [d, s]);
    ok((await p.$$("#view .card, #view .btn")).length > 0, `day ${d + 1} step ${s} renders`);
  }
  ok(errors.length === 0, "no JS errors while opening all lessons: " + errors.join(" | "));

  // full lesson, day 1, all answers correct
  await p.evaluate(() => App.reset());
  await p.evaluate(() => App.lesson(0, 0));
  ok((await txt()).includes("der Beruf"), "words step shows words");
  await p.click("text=Weiter → Grammatik");
  ok((await txt()).includes("sein"), "grammar step");
  await p.click("text=Weiter → Übungen");
  for (let k = 0; k < 20; k++) {
    const it = await p.evaluate(() => App._item());
    if (!it) break;
    if (it.k === "mc") await p.click(`.opt >> nth=${it.a}`);
    if (it.k === "gap") { await p.fill("#gap", it.a[0]); await p.click("text=Prüfen"); }
    if (it.k === "order") { for (let j = 0; j < it.w.length; j++) await p.click(`#c${j}`); await p.click("text=Prüfen"); }
    ok(await p.$(".fb.ok"), `drill ${k + 1} (${it.k}) accepted the right answer: ${it.q}`);
    await p.click("#fb .btn");
  }
  ok((await txt()).includes("100%"), "practice 100%");
  await p.click("text=Weiter → Sprechen");
  const sent = await p.textContent("#view .card .de");
  p._say = sent;
  await p.click("text=🎤 Jetzt sprechen >> nth=0");
  await p.waitForSelector(".fb.ok");
  ok((await txt()).includes("100%"), "speech scored 100% for exact sentence");
  await p.click("text=Weiter → Mein Leben");
  await p.fill("#txt", "Ich heiße Muhammad und komme aus Ägypten. Ich wohne seit einem Jahr in Schwelm. Ich bin Ingenieur von Beruf und arbeite bei Lenovo. Ich bin verheiratet und habe drei Kinder. Ich spreche Arabisch und Englisch.");
  await p.click("text=🔍 Prüfen");
  ok((await txt()).includes("Gespeichert"), "Mein Leben saved");
  await p.click("text=🎉 Lektion abschließen");
  ok((await txt()).includes("geschafft"), "lesson finished");
  const st = await p.evaluate(() => App._state());
  ok(st.done[0] && st.cur === 1 && st.my.length === 1 && st.st.xp > 100 && Object.keys(st.cards).length === 12, "state after lesson: " + JSON.stringify({ done: st.done, cur: st.cur, xp: st.st.xp, cards: Object.keys(st.cards).length }));

  // flashcards (make cards due)
  await p.evaluate(() => { const S = App._state(); Object.keys(S.cards).forEach(k => S.cards[k].due = "2000-01-01"); });
  await p.evaluate(() => App.flash());
  for (let k = 0; k < 15; k++) { if (!(await p.$(".flash .big"))) break; if ((await txt()).includes("Review fertig")) break; await p.click(".card.flash"); await p.click("text=✅ Gewusst"); }
  ok((await txt()).includes("Review fertig"), "flashcard session ends");

  // a wrong answer goes to mistakes, then mistakes can be redone
  await p.evaluate(() => App.lesson(1, 2));
  const it = await p.evaluate(() => App._item());
  if (it.k === "mc") await p.click(`.opt >> nth=${(it.a + 1) % it.o.length}`);
  else if (it.k === "gap") { await p.fill("#gap", "zzzz"); await p.click("text=Prüfen"); }
  ok((await p.evaluate(() => App._state().mist.length)) >= 1, "mistake recorded");
  await p.evaluate(() => App.go("review"));
  await p.click("text=❌ Meine Fehler");
  ok(await p.$(".card h3"), "mistakes session opens");

  // Diktat, word bank, library, Mein Leben book
  await p.evaluate(() => App.go("review"));
  await p.click("text=🎧 Diktat");
  ok(await p.$("#dk"), "diktat opens");
  await p.evaluate(() => App.go("review")); await p.click("text=📚 Wortschatz");
  ok((await p.$$("#view .card")).length >= 12, "word bank lists learned words");
  await p.evaluate(() => App.go("review")); await p.click("text=📐 Grammatik-Bibliothek");
  ok((await p.$$("#view .card")).length === 30, "grammar library has 30 topics");
  await p.evaluate(() => App.go("leben"));
  ok((await txt()).includes("Mein Buch · 1"), "Mein Buch shows entry");

  // full mock exam, everything right
  await p.evaluate(() => App.go("exam"));
  await p.click("text=🚀 Komplette Prüfung starten");
  const E = await p.evaluate(() => EXAM);
  for (const t of E.lesen) { for (let k = 0; k < t.q.length; k++) await p.click(`.opt[data-k="${k}"][data-j="${t.q[k].a}"]`); await p.click("text=Abgeben ✔️"); await p.click("text=Weiter →"); }
  for (const t of E.hoeren) { for (let k = 0; k < t.items.length; k++) { await p.click(`#pl${k}`); await p.click(`.opt[data-k="${k}"][data-j="${t.items[k].a}"]`); } await p.click("text=Abgeben ✔️"); await p.click("text=Weiter →"); }
  for (const t of E.schreiben) { await p.fill("#extxt", t.m); await p.click("text=Abgeben ✔️"); for (const c of await p.$$(".pt")) await c.check(); await p.click("text=Bewerten & weiter →"); }
  for (const t of E.sprechen) {
    if (t.cards) for (let k = 0; k < t.cards.length; k++) { p._say = t.cards[k][1]; await p.click(`text=🎤 Frage stellen >> nth=${k}`); await p.waitForSelector(`#sp${k} .fb`); }
    if (t.prompts) { p._say = t.m; await p.click("text=🎤 Sprechen (1–2 Min.)"); await p.waitForSelector("#sp-1 .fb"); }
    if (t.lines) for (let k = 0; k < t.lines.length; k++) { p._say = t.lines[k]; await p.click(`text=🎤 Nachsprechen >> nth=${k}`); await p.waitForSelector(`#ln${k} .fb`); }
    await p.click("text=Weiter ✔️");
  }
  const res = await p.evaluate(() => App._state().exam.slice(-1)[0]);
  ok(res && res.total >= 95, "perfect mock scores ~100: " + JSON.stringify(res));
  ok((await txt()).includes("Bestanden"), "pass screen");

  // settings
  await p.evaluate(() => App.go("settings"));
  ok((await txt()).includes("Designed by Muhammad Toffaha"), "settings credit");
  ok(await p.evaluate(() => App.back()) === true, "back from settings handled");

  ok(errors.length === 0, "no JS errors: " + errors.join(" | "));
  await b.close();
  console.log(failed ? `❌ ${failed} failed` : "✅ robot finished everything");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
