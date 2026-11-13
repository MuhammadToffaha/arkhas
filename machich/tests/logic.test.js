// 🧪 Mach ich! — content integrity + logic. Run: node tests/logic.test.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const www = path.join(__dirname, "../app/src/main/assets/www");
const ctx = {}; vm.createContext(ctx);
["days1.js", "days2.js", "days3.js", "exam.js", "en.js", "mocks_a1.js", "mocks_a2.js", "logic.js"].forEach(f => vm.runInContext(fs.readFileSync(path.join(www, f), "utf8").replace(/^var (DAYS|EXAM|L|MY_EN|EXAM_EN|MOCKS|MOCK_LIST|RF|JN) =/gm, "this.$1 ="), ctx, { filename: f }));
const { DAYS, EXAM, L, MY_EN, EXAM_EN, MOCK_LIST } = ctx;
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log("❌ " + m); } };

// ---- 30 days, complete ----
ok(DAYS.length === 30, "30 days, got " + DAYS.length);
const seen = {};
DAYS.forEach((D, i) => {
  const id = "Day " + (i + 1) + " (" + D.t + ")";
  ["t", "g", "lv", "x"].forEach(k => ok(D[k] && D[k].length > 1, id + " missing " + k));
  ok(D.w.length === 12, id + " needs 12 words, has " + D.w.length);
  D.w.forEach(w => { ok(w.length === 4 && w.every(s => s && s.trim()), id + " bad word " + w[0]); ok(/[.!?]$/.test(w[2]), id + " example needs punctuation: " + w[2]); seen[w[0]] = (seen[w[0]] || 0) + 1; });
  ok(D.eg.length >= 2, id + " needs 2+ examples");
  ok(D.d.length === 6, id + " needs 6 drills");
  D.d.forEach((d, k) => {
    const did = id + " drill " + (k + 1);
    if (d.k === "mc") ok(Array.isArray(d.o) && d.a >= 0 && d.a < d.o.length, did + " mc answer index");
    else if (d.k === "gap") ok(d.q.includes("___") && d.a.length, did + " gap needs ___ and answers");
    else if (d.k === "order") ok(d.w.length >= 3, did + " order needs 3+ words");
    else ok(false, did + " unknown kind " + d.k);
  });
  ok(D.my && D.my.p && D.my.m && D.my.words > 0, id + " Mein Leben task");
  // the model answer must pass its own checker's required words
  const r = L.check(D.my.m, D.my, D.w);
  r.notes.filter(x => !x.ok && /try to use|Add past|Use weil/.test(x.m)).forEach(x => ok(false, id + " model answer fails own check: " + x.m));
});
ok(Object.keys(seen).length >= 340, "≥340 unique words, got " + Object.keys(seen).length);

// ---- exam ----
ok(EXAM.lesen.length === 4 && EXAM.hoeren.length === 4 && EXAM.schreiben.length === 2 && EXAM.sprechen.length === 3, "exam parts");
EXAM.lesen.forEach(t => t.q.forEach(x => ok(x.a >= 0 && x.a < x.o.length, "lesen idx " + x.q)));
EXAM.hoeren.forEach(t => t.items.forEach(x => ok(x.say && x.a >= 0 && x.a < x.o.length, "hören idx " + x.q)));
ok(EXAM.lesen.reduce((s, t) => s + t.q.length, 0) === 20, "20 Lesen items");
ok(EXAM.hoeren.reduce((s, t) => s + t.items.length, 0) === 20, "20 Hören items");

// ---- 🇬🇧 translations ----
ok(MY_EN.length === 30 && MY_EN.every(Boolean), "30 model-answer translations");
EXAM.lesen.forEach((t, i) => ok(EXAM_EN.lesen[i] && EXAM_EN.lesen[i].text && EXAM_EN.lesen[i].q.length === t.q.length, "Lesen EN " + (i + 1)));
EXAM.hoeren.forEach((t, i) => ok(EXAM_EN.hoeren[i] && EXAM_EN.hoeren[i].length === t.items.length, "Hören EN " + (i + 1)));

// ---- 10 mocks ----
ok(MOCK_LIST.length === 10 && MOCK_LIST.filter(M => M.lv === "A1").length === 5, "5 A1 + 5 A2 mocks");
ok(new Set(MOCK_LIST.map(M => M.id)).size === 10, "unique mock ids");
MOCK_LIST.forEach(M => {
  const id = M.id, X = M.ex, A1 = M.lv === "A1";
  ok(X.lesen.length === (A1 ? 3 : 4) && X.hoeren.length === (A1 ? 3 : 4) && X.schreiben.length === 2 && X.sprechen.length === 3, id + " parts");
  M.order.forEach(m => ok(M.min[m] > 0, id + " minutes " + m));
  X.lesen.forEach((t, i) => { ok((t.text || t.ads) && M.en.lesen[i].text && M.en.lesen[i].q.length === t.q.length, id + " lesen EN " + i); t.q.forEach(x => ok(x.q && x.a >= 0 && x.a < x.o.length, id + " lesen idx " + x.q)); });
  X.hoeren.forEach((t, i) => { ok(M.en.hoeren[i].length === t.items.length && M.en.hoeren[i].every(Boolean), id + " hören EN " + i); t.items.forEach(x => ok(x.say && x.a >= 0 && x.a < x.o.length, id + " hören idx " + x.q)); });
  X.schreiben.forEach(t => { ok(t.task && t.m && t.points.length >= 3, id + " schreiben"); if (id !== "a2-1") ok(t.taskEn && t.mEn, id + " schreiben EN"); });
  X.sprechen.forEach(t => {
    ok(t.cards || t.prompts || t.lines, id + " sprechen kind");
    if (id === "a2-1") return;
    if (t.cards) t.cards.forEach(c => ok(c.length === 3 && c.every(Boolean), id + " card EN " + c[0]));
    if (t.prompts) ok(t.topicEn && t.mEn && L.words(t.m) >= 20, id + " prompts EN + long model");
    if (t.lines) ok(t.linesEn && t.linesEn.length === t.lines.length, id + " lines EN");
  });
});

// ---- logic ----
ok(L.grade("Bin", ["bin"]) === "ok", "grade case");
ok(L.grade("angekomen", ["angekommen"]) === "typo", "typo tolerance");
ok(L.grade("Strasse", ["Straße"]) === "ok", "ss = ß");
ok(L.grade("schoen", ["schön"]) === "ok", "oe = ö");
ok(L.grade("bist", ["bin"]) === "no", "wrong");
ok(L.similarity("ich stehe um sechs uhr auf", "Ich stehe um sechs Uhr auf.") === 100, "speech exact");
ok(L.similarity("ich stehe sechs auf", "Ich stehe um sechs Uhr auf.") < 80, "speech partial");
let c = L.newCard("2026-01-01");
c = L.review(c, true, "2026-01-01"); ok(c.b === 1 && c.due === "2026-01-02", "srs 1 day");
c = L.review(c, true, "2026-01-02"); ok(c.b === 2 && c.due === "2026-01-04", "srs 2 days");
c = L.review(c, false, "2026-01-04"); ok(c.b === 1 && c.due === "2026-01-04", "srs reset on wrong");
let st = {}; L.addXp(st, 10, "2026-01-01"); L.addXp(st, 10, "2026-01-02"); L.addXp(st, 5, "2026-01-02");
ok(st.streak === 2 && st.xp === 25 && st.days["2026-01-02"] === 15, "streak & xp");
L.addXp(st, 5, "2026-01-05"); ok(st.streak === 1 && st.best === 2, "streak break");
ok(L.liveStreak({ last: "2026-01-01", streak: 4 }, "2026-01-03") === 0, "streak expires");
const bad = L.check("ich habe nach Köln gegangen. Ich lerne weil ich habe Zeit. Deshalb ich gehe.", { words: 5, perfekt: true }, []);
const msgs = bad.notes.map(x => x.m).join("\n");
ok(/capital/.test(msgs), "checker: capital");
ok(/verb goes to the END/.test(msgs), "checker: weil word order");
ok(/comma/.test(msgs), "checker: comma");
ok(/verb comes 2nd/.test(msgs), "checker: inversion");
ok(/uses sein/.test(msgs), "checker: sein-Perfekt");
const good = L.check("Ich lerne Deutsch, weil ich hier wohne. Gestern bin ich nach Köln gefahren.", { words: 5, perfekt: true }, []);
ok(good.notes.every(x => x.ok), "checker: clean text has no warnings → " + good.notes.filter(x => !x.ok).map(x => x.m).join(" | "));

console.log((fails ? "❌ " + fails + " failed" : "✅ all passed") + " (" + n + " checks)");
process.exit(fails ? 1 : 0);
