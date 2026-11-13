// 🧠 Mach ich! — pure logic (no DOM). Tested by tests/logic.test.js
var L = (function () {
  // ---------- dates ----------
  function today(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(iso, n) { var p = iso.split("-").map(Number); var d = new Date(p[0], p[1] - 1, p[2]); d.setDate(d.getDate() + n); return today(d); }
  function daysBetween(a, b) { var pa = a.split("-").map(Number), pb = b.split("-").map(Number); return Math.round((new Date(pb[0], pb[1] - 1, pb[2]) - new Date(pa[0], pa[1] - 1, pa[2])) / 864e5); }

  // ---------- text ----------
  function norm(s) {
    return String(s || "").toLowerCase().replace(/[„“”"'’.,!?;:()…\-–]/g, " ")
      .replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü").replace(/ss/g, "ß")
      .replace(/\s+/g, " ").trim();
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  /** typed answer vs accepted list → "ok" | "typo" (1 letter off, long words) | "no" */
  function grade(input, accepted) {
    var x = norm(input);
    if (!x) return "no";
    for (var k = 0; k < accepted.length; k++) {
      var a = norm(accepted[k]);
      if (x === a) return "ok";
      if (a.length >= 5 && lev(x, a) === 1) return "typo";
    }
    return "no";
  }
  /** word-level similarity 0..100 between what the mic heard and the target sentence */
  function similarity(heard, target) {
    var h = norm(heard).split(" ").filter(Boolean), t = norm(target).split(" ").filter(Boolean);
    if (!t.length) return 0;
    var m = h.length, n = t.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (h[i - 1] === t[j - 1] || lev(h[i - 1], t[j - 1]) <= 1 && t[j - 1].length > 4 ? 0 : 1));
    return Math.max(0, Math.round(100 * (1 - d[m][n] / Math.max(n, m))));
  }
  function bestSimilarity(list, target) { var b = 0; (list || []).forEach(function (h) { b = Math.max(b, similarity(h, target)); }); return b; }
  function words(s) { return String(s || "").split(/\s+/).filter(function (w) { return /[a-zäöüß0-9]/i.test(w); }).length; }

  // ---------- spaced repetition (Leitner, like Busuu's vocab strength) ----------
  var INTERVALS = [0, 1, 2, 4, 8, 16, 35];   // days for box 0..6
  function newCard(t) { return { b: 0, due: t, seen: 0, wrong: 0 }; }
  function review(card, right, t) {
    var c = Object.assign({}, card);
    c.seen = (c.seen || 0) + 1;
    if (right) { c.b = Math.min(6, (c.b || 0) + 1); c.due = addDays(t, INTERVALS[c.b]); }
    else { c.wrong = (c.wrong || 0) + 1; c.b = 1; c.due = t; }
    return c;
  }
  function strength(card) { return card ? Math.round(100 * Math.min(card.b, 5) / 5) : 0; }   // 0..100
  function dueKeys(cards, t) { return Object.keys(cards).filter(function (k) { return cards[k].due <= t; }).sort(function (a, b) { return cards[a].b - cards[b].b; }); }

  // ---------- streak & XP ----------
  function addXp(st, n, t) {
    st.xp = (st.xp || 0) + n;
    st.days = st.days || {};
    st.days[t] = (st.days[t] || 0) + n;
    if (st.last !== t) {
      st.streak = st.last && daysBetween(st.last, t) === 1 ? (st.streak || 0) + 1 : 1;
      st.last = t;
    }
    st.best = Math.max(st.best || 0, st.streak || 0);
    return st;
  }
  function liveStreak(st, t) { return st.last && daysBetween(st.last, t) <= 1 ? (st.streak || 0) : 0; }
  function level(xp) { return Math.floor(Math.sqrt((xp || 0) / 50)) + 1; }

  // ---------- ✍️ Mein Leben checker (hints, not a teacher) ----------
  var FINITE = /^(bin|bist|ist|sind|seid|habe|hast|hat|haben|habt|kann|kannst|können|muss|musst|müssen|will|willst|wollen|möchte|möchtest|darf|war|warst|waren|hatte|hattest|hatten|werde|wirst|wird|werden|gehe|gehst|geht|komme|kommst|kommt|arbeite|arbeitest|arbeitet|wohne|wohnt|mache|macht|spiele|spielt|lerne|lernt|fahre|fährt|finde|findet)$/i;
  var MOVE_PART = /\b(gegangen|gefahren|geflogen|gekommen|geblieben|aufgestanden|angekommen|passiert|gelaufen|umgezogen|eingeschlafen|gewesen|geworden)\b/i;
  var PRON = /^(ich|du|er|sie|es|wir|ihr|man)$/i;

  function check(text, task, vocab) {
    var out = [], t = String(text || "").trim(), n = words(t);
    task = task || {};
    if (!t) return { notes: [{ ok: false, m: "Write something first ✍️" }], used: [], score: 0 };
    var target = task.words || 30;
    out.push(n >= target ? { ok: true, m: "✅ " + n + " words (goal " + target + ")" } : { ok: false, m: "📏 " + n + " / " + target + " words — add a bit more" });
    (task.need || []).forEach(function (p) {
      if (!p) return;
      var re = new RegExp("(^|[^a-zäöüß])(" + p + ")", "i");
      out.push(re.test(t) ? { ok: true, m: "✅ uses: " + p.split("|")[0] } : { ok: false, m: "🎯 try to use: " + p.split("|").join(" / ") });
    });
    if (task.perfekt) {
      var pf = /\b(habe|hast|hat|haben|habt|bin|bist|ist|sind|seid)\b[^.!?]*\b(ge\w{2,}(t|en)|\w+iert|be\w+t|ver\w+(t|en))\b/i.test(t);
      out.push(pf ? { ok: true, m: "✅ Perfekt found" } : { ok: false, m: "⏮️ Add past: habe … gemacht / bin … gefahren" });
    }
    var sents = t.split(/(?<=[.!?])\s+/).filter(Boolean);
    sents.forEach(function (s) {
      if (/^[a-zäöü]/.test(s)) out.push({ ok: false, m: "🔠 Start sentences with a capital: \"" + s.slice(0, 20) + "…\"" });
    });
    // weil / dass / ob / wenn / als → verb at the end
    var sub = t.match(/\b(weil|dass|ob)\s+(\S+)\s+(\S+)/gi) || [];
    sub.forEach(function (m) {
      var p = m.split(/\s+/);
      if (PRON.test(p[1]) && FINITE.test(p[2].replace(/[.,!?]/g, ""))) {
        var rest = t.slice(t.indexOf(m) + m.length).split(/[.,!?]/)[0].trim();
        if (rest.split(/\s+/).filter(Boolean).length >= 1) out.push({ ok: false, m: "🔚 \"" + m + " …\" → after " + p[0] + " the verb goes to the END (" + p[0] + " " + p[1] + " … " + p[2] + ")" });
      }
    });
    if (/[^,\s]\s+(weil|dass|obwohl)\b/i.test(t)) out.push({ ok: false, m: "✏️ Put a comma before weil / dass" });
    if (task.weil && !/\bweil\b/i.test(t)) out.push({ ok: false, m: "🎯 Use weil at least once" });
    // deshalb/trotzdem + pronoun → inversion missing
    (t.match(/\b(deshalb|trotzdem|dann|danach|heute|morgen|gestern)\s+(ich|du|er|sie|wir|ihr|man)\s+\S+/gi) || []).forEach(function (m) {
      var p = m.split(/\s+/);
      if (FINITE.test(p[2].replace(/[.,!?]/g, ""))) out.push({ ok: false, m: "🔄 \"" + m + "\" → verb comes 2nd: " + p[0] + " " + p[2] + " " + p[1] });
    });
    // haben + movement participle
    var hm = t.match(/\b(habe|hast|hat|haben|habt)\b[^.!?]*/gi) || [];
    hm.forEach(function (c) { var mm = c.match(MOVE_PART); if (mm) out.push({ ok: false, m: "🚶 \"" + mm[0] + "\" uses sein, not haben (bin/ist … " + mm[0] + ")" }); });
    if (/\b(ich habe|er hat|sie hat)\s+\d+\s+jahre/i.test(t)) out.push({ ok: false, m: "🎂 Age uses sein: Ich bin 40 Jahre alt" });
    if (task.email) {
      out.push(/^(sehr geehrte|liebe|lieber|hallo|guten tag)/i.test(t) ? { ok: true, m: "✅ greeting" } : { ok: false, m: "✉️ Start with a greeting (Sehr geehrte …)" });
      out.push(/(grüßen|grüße|gruß)/i.test(t) ? { ok: true, m: "✅ closing" } : { ok: false, m: "✉️ End with Mit freundlichen Grüßen" });
    }
    // nouns from the course written in lower case
    var used = [];
    (vocab || []).forEach(function (w) {
      var base = String(w[0]).replace(/^(der|die|das|sich)\s+/i, "").split(/[ /]/)[0];
      if (base.length < 3) return;
      var re = new RegExp("(^|[^a-zäöüß])(" + base.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i");
      var m = t.match(re);
      if (m) {
        used.push(w[0]);
        if (/^(der|die|das)\s/i.test(w[0]) && m[2][0] === m[2][0].toLowerCase() && base[0] !== base[0].toLowerCase())
          out.push({ ok: false, m: "🔠 Nouns are capitalised: " + base });
      }
    });
    if (used.length) out.push({ ok: true, m: "📚 today's words used: " + used.length });
    var bad = out.filter(function (x) { return !x.ok; }).length, good = out.filter(function (x) { return x.ok; }).length;
    return { notes: out, used: used, score: Math.max(0, Math.min(100, Math.round(100 * good / Math.max(1, good + bad)))) };
  }

  return { today: today, addDays: addDays, daysBetween: daysBetween, norm: norm, lev: lev, grade: grade,
    similarity: similarity, bestSimilarity: bestSimilarity, words: words, INTERVALS: INTERVALS,
    newCard: newCard, review: review, strength: strength, dueKeys: dueKeys,
    addXp: addXp, liveStreak: liveStreak, level: level, check: check };
})();
if (typeof module !== "undefined") module.exports = L;
