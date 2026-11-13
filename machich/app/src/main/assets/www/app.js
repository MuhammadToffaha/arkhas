// 🇩🇪 Mach ich! — UI. Native bridge = window.Mi (falls back to browser APIs for testing).
var App = (function () {
  var M = window.Mi || null, T = L.today(), S = null, WD = 0, tab = "home", sub = null, heardCb = null, timerId = null;
  var V = function () { return document.getElementById("view"); };
  var ALLW = {};
  DAYS.forEach(function (d, i) { d.w.forEach(function (w) { if (!ALLW[w[0]]) ALLW[w[0]] = { w: w, day: i }; }); });

  // ---------- state ----------
  function load() {
    try { S = JSON.parse((M ? M.load() : localStorage.getItem("machich")) || "null"); } catch (e) { S = null; }
    S = S || {};
    S.st = S.st || {}; S.done = S.done || {}; S.cards = S.cards || {}; S.mist = S.mist || []; S.my = S.my || [];
    S.exam = S.exam || []; S.acc = S.acc || { g: [0, 0], h: [0, 0], sp: [0, 0] }; S.steps = S.steps || {};
    S.start = S.start || T; S.goal = S.goal || 50;
    if (S.cur == null) S.cur = 0;
  }
  function save() {
    var j = JSON.stringify(S);
    if (M) { M.save(j); if (S.st.days && S.st.days[T]) { M.setPref("studied", T); M.setPref("streak", String(L.liveStreak(S.st, T))); } }
    else try { localStorage.setItem("machich", j); } catch (e) { }
    head();
  }
  function xp(n) { L.addXp(S.st, n, T); save(); }
  function pref(k, d) { return M ? M.getPref(k, d) : (localStorage.getItem("p_" + k) || d); }
  function setPref(k, v) { if (M) M.setPref(k, v); else localStorage.setItem("p_" + k, v); }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function q(s) { return JSON.stringify(String(s)).replace(/"/g, "&quot;"); }   // safe JS string inside onclick=""
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a, n) { return shuffle(a).slice(0, n); }
  function toast(m) { var t = document.getElementById("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("on"); }, 2600); }
  function speak(text, slow) {
    var rate = parseFloat(pref("rate", "0.95")) * (slow ? 0.7 : 1);
    if (M) M.speak(String(text), rate);
    else if (window.speechSynthesis) { var u = new SpeechSynthesisUtterance(text); u.lang = "de-DE"; u.rate = rate; speechSynthesis.cancel(); speechSynthesis.speak(u); }
  }
  function listen(prompt, cb) {
    heardCb = cb;
    if (M) M.listen(prompt);
    else { var h = window.prompt("🎤 (browser) type what you said:", ""); App.onHeard(JSON.stringify(h ? [h] : [])); }
  }
  function sayBtn(t, slow) { return '<button class="say" onclick="App.say(' + q(t) + (slow ? ",1" : "") + ')">' + (slow ? "🐢" : "🔊") + "</button>"; }
  function E(t) { return t ? '<span class="en">' + esc(t) + "</span>" : ""; }
  function bar(p) { return '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, p)) + '%"></i></div>'; }
  function set(html) { V().innerHTML = html; V().scrollTop = 0; }
  function head() {
    document.getElementById("streak").textContent = "🔥 " + L.liveStreak(S.st, T);
    document.getElementById("xpp").textContent = "⭐ " + (S.st.xp || 0);
  }
  function tabs() { [].forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.dataset.t === tab); }); }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function plannedDay() { return Math.min(29, Math.max(0, L.daysBetween(S.start, T))); }
  function skillPct() {
    var cards = Object.keys(S.cards), voc = cards.length ? cards.reduce(function (s, k) { return s + L.strength(S.cards[k]); }, 0) / Object.keys(ALLW).length : 0;
    var lastExam = S.exam[S.exam.length - 1] || {};
    return { "📚 Wortschatz": voc, "📐 Grammatik": S.acc.g[1] ? 100 * S.acc.g[0] / S.acc.g[1] : 0,
      "🎧 Hören": S.acc.h[1] ? 100 * S.acc.h[0] / S.acc.h[1] : (lastExam.h || 0) * 4, "🗣️ Sprechen": S.acc.sp[1] ? S.acc.sp[0] / S.acc.sp[1] : 0,
      "✍️ Schreiben": Math.min(100, S.my.length * 100 / 30), "📖 Lesen": (lastExam.l || 0) * 4 };
  }

  // ---------- 🏠 Heute ----------
  function home() {
    var d = S.cur, D = DAYS[d], today = (S.st.days || {})[T] || 0, due = L.dueKeys(S.cards, T).length;
    var exd = pref("examDate", ""), left = exd ? L.daysBetween(T, exd) : null, pd = plannedDay();
    var sk = skillPct(), nd = Object.keys(S.done).length, h = "";
    h += '<div class="card hero"><div class="mut">Tag ' + (d + 1) + " von 30 · " + esc(D.lv) + E("Day " + (d + 1) + " of 30") + '</div><h2 style="font-size:26px;margin:6px 0 2px;letter-spacing:-.8px">' + esc(D.t) + "</h2>" + E(D.my.p.split(/[.:]/)[0]) + '<div class="mut" style="margin-top:6px">' + esc(D.g) + "</div>" + bar(nd * 100 / 30) +
      '<div class="mut sm" style="margin-top:4px">' + nd + "/30 Tage fertig" + (d < pd ? " · ⏰ Plan: Tag " + (pd + 1) : d > pd ? " · 🚀 vor dem Plan" : "") + E(nd + "/30 days done" + (d < pd ? " · plan says day " + (pd + 1) : d > pd ? " · ahead of plan" : "")) + '</div><button class="btn" style="background:#fff;color:#0B0D17;position:relative;z-index:1" onclick="App.lesson(' + d + ')">' + (S.steps[d] ? "▶️ Weiter" : "🚀 Lektion starten") + E(S.steps[d] ? "Continue" : "Start lesson") + "</button></div>";
    h += '<div class="bento">';
    h += '<div class="card"><div class="mut sm">🔥 Streak</div><div class="big-n">' + L.liveStreak(S.st, T) + '</div><div class="mut sm">Tage · best ' + (S.st.best || 0) + "</div>" + E("days in a row") + "</div>";
    h += '<div class="card"><div class="mut sm">🎯 Tagesziel</div><div class="big-n">' + today + '<span class="mut" style="font-size:15px"> / ' + S.goal + "</span></div>" + bar(today * 100 / S.goal) + E("daily goal · XP today") + "</div>";
    h += '<div class="card" onclick="App.flash()"><div class="mut sm">🔁 Review</div><div class="big-n">' + due + '</div><div class="mut sm">Wörter fällig</div>' + E("words due — tap") + "</div>";
    h += '<div class="card" onclick="App.go(\'' + (left == null ? "settings" : "exam") + '\')"><div class="mut sm">🏆 Prüfung</div><div class="big-n">' + (left == null ? "–" : left) + '</div><div class="mut sm">' + (left == null ? "Datum setzen" : "Tage") + "</div>" + E(left == null ? "set exam date" : "days to the exam") + "</div>";
    h += '<div class="card wide"><h3>✍️ Mein Leben</h3>' + E("My life — write about yourself") + '<div class="mut" style="margin-top:6px">' + esc(D.my.p) + '</div><button class="btn alt" onclick="App.write(' + d + ')">Über mein Leben schreiben' + E("Write about my life") + "</button></div>";
    h += '<div class="card wide"><h3>📊 Deine Skills</h3>' + E("Your skills") + '<div class="skills" style="margin-top:8px">' + Object.keys(sk).map(function (k) { return '<div><div class="sm">' + k + " · " + Math.round(sk[k]) + "%</div>" + bar(sk[k]) + "</div>"; }).join("") + "</div></div>";
    h += '<div class="card wide"><div class="row"><div class="mut">🏅 Level ' + L.level(S.st.xp) + '</div><div class="mut" style="text-align:right">⭐ ' + (S.st.xp || 0) + " XP</div></div></div>";
    set(h + "</div>");
  }

  // ---------- 📅 Plan ----------
  function plan() {
    var pd = plannedDay(), h = '<div class="card"><h2>📅 30 Tage bis A2</h2>' + E("30 days to A2") + '<div class="mut">Day 1 = ' + esc(S.start) + ". One lesson a day (~30 min). ✅ done · 🔵 current · dashed = exam days.</div></div><div class=\"days\">";
    DAYS.forEach(function (D, i) {
      h += '<button class="day' + (S.done[i] ? " done" : "") + (i === S.cur ? " cur" : "") + (D.lv === "Exam" ? " ex" : "") + '" onclick="App.lesson(' + i + ')">' + (S.done[i] ? "✅" : i + 1) + "<small>" + (i === pd ? "heute" : D.lv) + "</small></button>";
    });
    h += "</div>";
    DAYS.forEach(function (D, i) { h += '<div class="card" onclick="App.lesson(' + i + ')"><div class="row"><div><b>' + (i + 1) + ". " + esc(D.t) + '</b>' + E(D.my.p.split(/[.:]/)[0]) + '<div class="mut sm">' + esc(D.g) + "</div></div><div style=\"flex:none\">" + (S.done[i] ? "✅" : "›") + "</div></div></div>"; });
    set(h);
  }

  // ---------- 📖 Lesson: words → grammar → practice → speak → write ----------
  var LS = null;
  var STEPS = ["📚 Wörter", "📐 Grammatik", "✏️ Übungen", "🗣️ Sprechen", "✍️ Mein Leben"], STEPS_EN = ["Words", "Grammar", "Exercises", "Speaking", "My life"];
  function lesson(i, step) {
    S.cur = i; drillDone = null; save();
    LS = { d: i, step: step != null ? step : (S.steps[i] || 0) };
    sub = "lesson"; stopTimer(); runStep();
  }
  function stepHead() {
    var D = DAYS[LS.d];
    return '<div class="steps">' + STEPS.map(function (s, k) { return "<i" + (k <= LS.step ? ' class="on"' : "") + "></i>"; }).join("") + '</div><div class="mut sm">Tag ' + (LS.d + 1) + " · " + STEPS[LS.step] + " · " + STEPS_EN[LS.step] + "</div><h2 style=\"margin:2px 0 0\">" + esc(D.t) + "</h2>" + E(D.my.p.split(/[.:]/)[0]) + '<div style="height:8px"></div>';
  }
  function runStep() {
    S.steps[LS.d] = LS.step; save();
    [stepWords, stepGrammar, stepPractice, stepSpeak, stepWrite][LS.step]();
  }
  function nextStep() { if (LS.step < 4) { LS.step++; runStep(); } else finishLesson(); }
  function stepWords() {
    var D = DAYS[LS.d], h = stepHead() + '<div class="mut">Tap 🔊 to hear, 🐢 slow. Say each word aloud 2×. They go into your spaced-repetition review.</div>';
    D.w.forEach(function (w) {
      if (!S.cards[w[0]]) S.cards[w[0]] = L.newCard(T);
      h += '<div class="card"><div class="row"><div><div style="font-size:19px;font-weight:800">' + esc(w[0]) + '</div><div class="mut">' + esc(w[1]) + '</div></div><div style="flex:none" class="row">' + sayBtn(w[0]) + "</div></div>" +
        '<div class="ex"><div style="flex:1"><div class="de">' + esc(w[2]) + '</div><div class="mut sm">' + esc(w[3]) + "</div></div>" + sayBtn(w[2]) + sayBtn(w[2], 1) + "</div></div>";
    });
    save();
    set(h + '<button class="btn" onclick="App.next()">Weiter → Grammatik' + E("Next → grammar") + '</button>');
  }
  function grammarHtml(D) {
    var h = '<div class="card"><span class="tag">' + esc(D.lv) + '</span><h3 style="margin-top:6px">📐 ' + esc(D.g) + "</h3><div>" + esc(D.x) + "</div>";
    if (D.tab) h += '<table class="g">' + D.tab.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
    h += "</div><div class=\"card\"><h3>💬 Beispiele</h3>" + E("Examples") + D.eg.map(function (e) { return '<div class="ex"><div style="flex:1"><div class="de">' + esc(e[0]) + '</div><div class="mut sm">' + esc(e[1]) + "</div></div>" + sayBtn(e[0]) + "</div>"; }).join("") + "</div>";
    h += '<div class="card"><a class="mut" href="#" onclick="App.yt(' + q(D.g) + ');return false">📺 Video zu „' + esc(D.g) + '" auf YouTube</a></div>';
    return h;
  }
  function stepGrammar() { set(stepHead() + grammarHtml(DAYS[LS.d]) + '<button class="btn" onclick="App.next()">Weiter → Übungen' + E("Next → exercises") + '</button>'); }

  // practice = auto word drills + the day's grammar drills
  function autoDrills(D) {
    var pool = Object.keys(ALLW).map(function (k) { return ALLW[k].w; });
    var out = [];
    pick(D.w, 4).forEach(function (w) {
      var wrong = pick(pool.filter(function (x) { return x[1] !== w[1]; }), 2).map(function (x) { return x[1]; });
      var o = shuffle([w[1]].concat(wrong));
      out.push({ k: "mc", q: "Was bedeutet „" + w[0] + "“?", en: "What does it mean?", o: o, a: o.indexOf(w[1]), say: w[0], why: w[2] + " — " + w[3], word: w[0] });
    });
    pick(D.w, 2).forEach(function (w) {
      var wrong = pick(D.w.filter(function (x) { return x[0] !== w[0]; }), 2).map(function (x) { return x[0]; });
      var o = shuffle([w[0]].concat(wrong));
      out.push({ k: "mc", q: "🎧 Hör zu — welches Wort?", en: "Listen — which word?", o: o, a: o.indexOf(w[0]), audio: w[0], hear: 1, word: w[0] });
    });
    pick(D.w, 2).forEach(function (w) {
      var bare = w[0].replace(/^(der|die|das)\s+/, "");
      out.push({ k: "gap", q: "✍️ Auf Deutsch: „" + w[1] + "“", a: [w[0], bare], en: "Write it in German", ex: w[2] + " — " + w[3], h: /^(der|die|das)\s/.test(w[0]) ? "Noun — write it with der/die/das" : "", word: w[0] });
    });
    return out;
  }
  function stepPractice() {
    var D = DAYS[LS.d];
    LS.items = shuffle(autoDrills(D)).concat(D.d.map(function (x) { return Object.assign({ gram: 1 }, x); }));
    LS.i = 0; LS.right = 0;
    drillPage();
  }
  function drillPage() {
    if (LS.i >= LS.items.length) {
      var pct = Math.round(100 * LS.right / LS.items.length);
      set(stepHead() + '<div class="card flash"><div class="big">' + (pct >= 80 ? "🎉" : "💪") + " " + pct + '%</div><div class="mut">' + LS.right + " / " + LS.items.length + " richtig · Fehler landen in 🔁 Review → Fehler</div></div>" +
        '<button class="btn" onclick="App.next()">Weiter → Sprechen' + E("Next → speaking") + '</button><button class="btn alt" onclick="App.redoPractice()">Nochmal üben</button>');
      return;
    }
    var it = LS.items[LS.i];
    set(stepHead() + '<div class="mut sm">' + (LS.i + 1) + " / " + LS.items.length + "</div>" + drillHtml(it));
    if (it.audio) setTimeout(function () { speak(it.audio); }, 250);
  }
  function drillHtml(it) {
    var h = '<div class="card"><h3>' + esc(it.q) + "</h3>" + (it.k !== "order" ? E(it.en) : "");
    if (it.say && !it.hear) h += sayBtn(it.say);
    if (it.audio) h += '<button class="btn alt" onclick="App.say(' + q(it.audio) + ')">🔊 Nochmal hören</button>';
    if (it.k === "mc") h += it.o.map(function (o, j) { return '<button class="opt" onclick="App.mc(' + j + ',this)">' + esc(o) + "</button>"; }).join("");
    if (it.k === "gap") h += '<input class="t" id="gap" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Antwort…" onkeydown="if(event.key===\'Enter\')App.gapCheck()"><button class="btn" onclick="App.gapCheck()">Prüfen</button>' + (it.h ? '<div class="mut sm">💡 ' + esc(it.h) + "</div>" : "");
    if (it.k === "order") {
      it._sh = it._sh || shuffle(it.w.map(function (w, j) { return j; }));
      it._ans = [];
      h += E(it.en) + '<div class="ans" id="ans"></div><div class="chips" id="chips">' + it._sh.map(function (j) { return '<button class="chip" id="c' + j + '" onclick="App.chip(' + j + ')">' + esc(it.w[j]) + "</button>"; }).join("") + '</div><button class="btn" onclick="App.orderCheck()">Prüfen</button><button class="btn alt" onclick="App.orderReset()">↺ Zurück</button>';
    }
    return h + '<div id="fb"></div></div>';
  }
  var drillDone = null;   // callback(right) for the current drill context
  function curItem() { return LS && LS.items ? LS.items[LS.i] : null; }
  function feedback(right, msg, it) {
    var fb = document.getElementById("fb");
    fb.innerHTML = '<div class="fb ' + (right ? "ok" : "bad") + '">' + msg + "</div>" + '<button class="btn" onclick="App.drillNext(' + (right ? 1 : 0) + ')">Weiter</button>';
    fb.scrollIntoView({ behavior: "smooth", block: "end" });
    [].forEach.call(document.querySelectorAll(".opt,#gap,.chip"), function (b) { b.disabled = true; });
    if (it.gram) { S.acc.g[1]++; if (right) S.acc.g[0]++; }
    if (it.hear) { S.acc.h[1]++; if (right) S.acc.h[0]++; }
    if (it.word && S.cards[it.word]) S.cards[it.word] = L.review(S.cards[it.word], right, T);
    if (!right) { var key = it.q + "|" + (it.w || []).join(" "); if (!S.mist.some(function (m) { return m.key === key; })) { var c = Object.assign({}, it); delete c._sh; delete c._ans; S.mist.push({ key: key, it: c }); if (S.mist.length > 200) S.mist.shift(); } }
    else { var key2 = it.q + "|" + (it.w || []).join(" "); S.mist = S.mist.filter(function (m) { return m.key !== key2; }); }
    save();
    if (right) speak(it.k === "order" ? it.w.join(" ") : it.k === "mc" && it.say ? it.say : "Richtig");
  }
  function mc(j, el) {
    var it = curItem(); var right = j === it.a;
    el.classList.add(right ? "ok" : "bad");
    document.querySelectorAll(".opt")[it.a].classList.add("ok");
    feedback(right, (right ? "✅ Richtig!" : "❌ Richtig ist: " + esc(it.o[it.a])) + (it.why ? '<div class="sm" style="font-weight:400;margin-top:4px">💡 ' + esc(it.why) + "</div>" : ""), it);
  }
  function gapCheck() {
    var it = curItem(), v = document.getElementById("gap").value, g = L.grade(v, it.a);
    if (g === "no" && !v.trim()) return;
    var full = it.k === "gap" && it.q.indexOf("___") >= 0 ? it.q.replace(/_+/, it.a[0]) : it.a[0];
    feedback(g !== "no", (g === "ok" ? "✅ Richtig!" : g === "typo" ? "🟡 Fast! Tippfehler — richtig: " + esc(it.a[0]) : "❌ Richtig: " + esc(it.a[0])) +
      '<div class="sm" style="font-weight:400;margin-top:4px">' + esc(it.ex || full) + "</div>", it);
  }
  function chip(j) {
    var it = curItem(), b = document.getElementById("c" + j);
    if (b.classList.contains("used")) return;
    b.classList.add("used"); it._ans.push(j);
    document.getElementById("ans").innerHTML = it._ans.map(function (k) { return '<span class="chip">' + esc(it.w[k]) + "</span>"; }).join("");
  }
  function orderReset() { var it = curItem(); it._ans = []; document.getElementById("ans").innerHTML = ""; [].forEach.call(document.querySelectorAll("#chips .chip"), function (b) { b.classList.remove("used"); }); }
  function orderCheck() {
    var it = curItem(); if (it._ans.length < it.w.length) { toast("Use all words 🧩"); return; }
    var mine = it._ans.map(function (k) { return it.w[k]; }).join(" "), right = L.norm(mine) === L.norm(it.w.join(" "));
    feedback(right, (right ? "✅ Perfekt!" : "❌ Richtig: " + esc(it.w.join(" "))) + '<div class="sm" style="font-weight:400;margin-top:4px">' + esc(it.en) + "</div>", it);
  }
  function drillNext(right) {
    if (right) LS.right++;
    if (drillDone) return drillDone(right);
    xp(right ? 10 : 2); LS.i++; drillPage();
  }

  function stepSpeak() {
    var D = DAYS[LS.d];
    LS.sp = D.eg.map(function (e) { return e[0]; }).concat(pick(D.w, 3).map(function (w) { return w[2]; })).slice(0, 5);
    LS.spEn = {}; D.eg.forEach(function (e) { LS.spEn[e[0]] = e[1]; }); D.w.forEach(function (w) { LS.spEn[w[2]] = w[3]; });
    LS.spScore = {};
    speakPage();
  }
  function speakPage() {
    var h = stepHead() + '<div class="mut">🔊 Listen → 🎤 say it → see your score. 70%+ = 🟢. (Uses Google speech recognition, German.)</div>';
    LS.sp.forEach(function (s, k) {
      var sc = LS.spScore[k];
      h += '<div class="card"><div class="ex" style="border:0"><div style="flex:1"><div class="de">' + esc(s) + "</div>" + E(LS.spEn[s]) + "</div>" + sayBtn(s) + sayBtn(s, 1) + "</div>" +
        '<button class="btn alt" onclick="App.speakTry(' + k + ')">🎤 Jetzt sprechen</button>' + (sc ? '<div class="fb ' + (sc.p >= 70 ? "ok" : "gold") + '">' + sc.p + "% · gehört: „" + esc(sc.h) + "“</div>" : "") + "</div>";
    });
    set(h + '<button class="btn" onclick="App.next()">Weiter → Mein Leben' + E("Next → my life") + '</button>');
  }
  function speakTry(k) {
    var target = LS.sp[k];
    listen(target, function (list) {
      var p = L.bestSimilarity(list, target);
      LS.spScore[k] = { p: p, h: list[0] || "—" };
      S.acc.sp[0] += p; S.acc.sp[1]++; xp(p >= 70 ? 8 : 3);
      speakPage();
    });
  }

  // ---------- ✍️ Mein Leben ----------
  function writeHtml(d, free) {
    WD = free ? -1 : d;
    var D = DAYS[d], task = free ? { words: 30 } : D.my, old = S.my.filter(function (e) { return e.day === d && !free; }).pop();
    var h = '<div class="card"><span class="tag">' + (free ? "Freies Thema" : "Tag " + (d + 1) + " · " + esc(D.g)) + '</span><h3 style="margin-top:6px">' + (free ? "Schreib über irgendwas aus deinem Leben 🙂" : esc(task.p)) + "</h3>" +
      (task.tip ? '<div class="mut sm">💡 ' + esc(task.tip) + "</div>" : "") + "</div>";
    h += '<textarea id="txt" placeholder="Ich …" oninput="App.wc()">' + esc(old ? old.text : (localStorage.getItem("draft" + (free ? -1 : d)) || "")) + '</textarea><div class="mut sm" id="wc"></div>';
    h += '<div class="row"><button class="btn" onclick="App.checkText(' + d + "," + (free ? 1 : 0) + ')">🔍 Prüfen</button><button class="btn alt" onclick="App.sayText()">🔊 Vorlesen</button></div>';
    h += '<div class="row"><button class="btn alt" onclick="App.readAloud()">🎤 Laut lesen</button>' + (free ? "" : '<button class="btn alt" onclick="App.model(' + d + ')">👀 Musterlösung</button>') + "</div>";
    h += '<div id="chk"></div>';
    return h;
  }
  function write(d) { sub = "write"; LS = null; set('<h2>✍️ Mein Leben</h2>' + writeHtml(d)); wc(); }
  function stepWrite() { set(stepHead() + writeHtml(LS.d) + '<button class="btn ok" onclick="App.next()">🎉 Lektion abschließen' + E("Finish lesson") + '</button>'); wc(); }
  function wc() { var t = document.getElementById("txt"); if (!t) return; document.getElementById("wc").textContent = L.words(t.value) + " Wörter"; try { localStorage.setItem("draft" + WD, t.value); } catch (e) { } }
  function checkText(d, free) {
    var t = document.getElementById("txt").value, D = DAYS[d];
    var r = L.check(t, free ? { words: 30 } : D.my, D.w);
    var h = '<div class="card"><h3>🔍 Feedback · ' + r.score + "%</h3>" + r.notes.map(function (n) { return '<div class="note">' + esc(n.m) + "</div>"; }).join("") +
      '<div class="mut sm" style="margin-top:8px">ℹ️ Automatic hints catch common A2 mistakes, not everything. Compare with the model, then read it aloud.</div></div>';
    if (L.words(t) >= 8) {
      var e = { date: T, day: free ? -1 : d, text: t, score: r.score };
      var ix = free ? -1 : S.my.findIndex(function (x) { return x.day === d && x.date === T; });
      var first = !S.my.some(function (x) { return x.day === d && d >= 0 && !free; });
      if (ix >= 0) S.my[ix] = e; else S.my.push(e);
      xp(first || free ? 30 + 5 * r.used.length : 5);
      h += '<div class="fb ok">💾 Gespeichert in „Mein Buch“ · +' + (first || free ? 30 + 5 * r.used.length : 5) + " XP</div>";
    }
    document.getElementById("chk").innerHTML = h;
    document.getElementById("chk").scrollIntoView({ behavior: "smooth" });
  }
  function model(d) {
    var m = DAYS[d].my.m;
    openModal('<h3>👀 Musterlösung</h3>' + E("Model answer") + '<div class="entry" style="margin-top:8px">' + esc(m) + '</div>' + (MY_EN[d] ? '<div class="en" style="margin:8px 0">🇬🇧 ' + esc(MY_EN[d]) + "</div>" : "") + '<div><div class="row">' + '<button class="btn alt" onclick="App.say(' + q(m) + ')">🔊 Hören</button><button class="btn" onclick="App.closeModal()">OK</button></div><div class="mut sm">Steal good phrases — then rewrite them with YOUR details.</div></div>');
  }
  function sayText() { var t = document.getElementById("txt").value; if (t.trim()) speak(t); }
  function readAloud() {
    var t = document.getElementById("txt").value.trim(); if (!t) return;
    var first = t.split(/(?<=[.!?])\s+/)[0];
    listen(first, function (list) {
      var p = L.bestSimilarity(list, first); S.acc.sp[0] += p; S.acc.sp[1]++; save();
      openModal('<h3>🎤 ' + p + "%</h3><div class=\"mut\">Sentence: " + esc(first) + '</div><div class="fb ' + (p >= 70 ? "ok" : "gold") + '">Heard: „' + esc(list[0] || "—") + '“</div><button class="btn" onclick="App.closeModal()">OK</button>');
    });
  }
  function leben() {
    var h = '<div class="card hero"><h2>✍️ Mein Leben</h2><div class="mut">Learning sticks when it\'s about YOU. Every day: write about your life with the day\'s grammar → instant hints → model → read it aloud. All texts = your own German book 📖.</div></div>';
    h += '<button class="btn" onclick="App.write(' + S.cur + ')">✍️ Heutiges Thema (Tag ' + (S.cur + 1) + ")</button>";
    h += '<button class="btn alt" onclick="App.freeWrite()">💭 Freies Thema</button>';
    h += '<div class="card"><h3>📖 Mein Buch · ' + S.my.length + " Texte</h3>";
    if (!S.my.length) h += '<div class="mut">Noch leer. Dein erster Text wartet!</div>';
    S.my.slice().reverse().forEach(function (e, k) {
      var real = S.my.length - 1 - k;
      h += '<div class="note"><div class="row"><div class="mut sm">' + esc(e.date) + " · " + (e.day >= 0 ? "Tag " + (e.day + 1) + " — " + esc(DAYS[e.day].t) : "Freies Thema") + " · " + e.score + '%</div><div style="flex:none">' + sayBtn(e.text) + '</div></div><div class="entry">' + esc(e.text) + "</div>" + (e.day >= 0 ? '<a href="#" class="sm" onclick="App.write(' + e.day + ');return false">✏️ bearbeiten</a>' : "") + "</div>";
    });
    set(h + "</div>");
  }
  function freeWrite() { sub = "write"; LS = null; set('<h2>💭 Freies Thema</h2>' + writeHtml(S.cur, 1)); wc(); }

  function finishLesson() {
    var first = !S.done[LS.d];
    S.done[LS.d] = T; S.steps[LS.d] = 0;
    if (first) xp(50);
    if (S.cur === LS.d && LS.d < 29) S.cur = LS.d + 1;
    save();
    set('<div class="card flash"><div class="big">🎉 Tag ' + (LS.d + 1) + " geschafft!</div><div class=\"mut\">" + (first ? "+50 XP · " : "") + "🔥 " + L.liveStreak(S.st, T) + " Tage Streak</div><div style=\"margin-top:10px\">„Mach ich!“ — und du hast es gemacht.</div>" + E("“I'll do it!” — and you did it.") + "</div>" +
      '<button class="btn" onclick="App.go(\'home\')">🏠 Zurück</button>' + (L.dueKeys(S.cards, T).length ? '<button class="btn alt" onclick="App.flash()">🔁 Noch schnell wiederholen</button>' : ""));
    speak("Super! Tag " + (LS.d + 1) + " geschafft!");
    LS = null; sub = "done";
  }

  // ---------- 🔁 Review ----------
  function review() {
    var due = L.dueKeys(S.cards, T), learned = Object.keys(S.cards).length;
    var h = '<div class="card"><h2>🔁 Review</h2><div class="mut">Spaced repetition: words come back right before you\'d forget them (1 → 2 → 4 → 8 → 16 → 35 days).</div></div>';
    h += '<button class="btn" ' + (due.length ? "" : "disabled") + ' onclick="App.flash()">🃏 Karteikarten · ' + due.length + " fällig</button>";
    h += '<button class="btn alt" ' + (S.mist.length ? "" : "disabled") + ' onclick="App.mistakes()">❌ Meine Fehler · ' + S.mist.length + "</button>";
    h += '<button class="btn alt" ' + (learned >= 5 ? "" : "disabled") + ' onclick="App.diktat()">🎧 Diktat — hören & schreiben</button>';
    h += '<button class="btn alt" onclick="App.bank()">📚 Wortschatz · ' + learned + " / " + Object.keys(ALLW).length + "</button>";
    h += '<button class="btn alt" onclick="App.library()">📐 Grammatik-Bibliothek</button>';
    set(h);
  }
  var FC = null;
  function flash() {
    sub = "flash";
    var keys = L.dueKeys(S.cards, T).slice(0, 20);
    if (!keys.length) { toast("🎉 Nichts fällig!"); return go("review"); }
    FC = { keys: shuffle(keys), i: 0, ok: 0 }; flashCard();
  }
  function flashCard() {
    if (FC.i >= FC.keys.length) { set('<div class="card flash"><div class="big">✅ ' + FC.ok + " / " + FC.keys.length + '</div><div class="mut">Review fertig</div></div><button class="btn" onclick="App.go(\'review\')">OK</button>'); return; }
    var k = FC.keys[FC.i], info = ALLW[k], rev = FC.i % 3 === 2, c = S.cards[k];
    var front = rev ? info.w[1] : k;
    set('<div class="mut sm">' + (FC.i + 1) + " / " + FC.keys.length + " · Stärke " + L.strength(c) + '%</div><div class="card flash" onclick="App.flip()"><div class="mut">' + (rev ? "🇬🇧 → 🇩🇪" : "🇩🇪 → 🇬🇧") + '</div><div class="big">' + esc(front) + '</div><div id="back" class="mut">Tippen zum Umdrehen 👆</div></div><div id="fbtn"></div>');
    if (!rev) speak(k);
  }
  function flip() {
    var k = FC.keys[FC.i], w = ALLW[k].w, b = document.getElementById("back");
    if (b.dataset.f) return; b.dataset.f = 1;
    b.innerHTML = '<div style="font-size:21px;font-weight:700;color:var(--ink)">' + esc(w[0]) + " = " + esc(w[1]) + '</div><div style="margin-top:8px">' + esc(w[2]) + "<br><span class=sm>" + esc(w[3]) + "</span></div>";
    speak(w[2]);
    document.getElementById("fbtn").innerHTML = '<div class="row"><button class="btn" style="background:var(--bad)" onclick="App.grade(0)">❌ Nochmal</button><button class="btn ok" onclick="App.grade(1)">✅ Gewusst</button></div>';
  }
  function fcGrade(r) {
    var k = FC.keys[FC.i]; S.cards[k] = L.review(S.cards[k], !!r, T); if (r) FC.ok++; else FC.keys.push(k);
    xp(r ? 3 : 1); FC.i++;
    if (FC.keys.length > 40) FC.keys = FC.keys.slice(0, 40);
    flashCard();
  }
  function mistakes() {
    sub = "mist";
    var list = shuffle(S.mist).slice(0, 15).map(function (m) { return Object.assign({}, m.it); });
    LS = { d: S.cur, step: 2, items: list, i: 0, right: 0, mistMode: 1 };
    drillDone = function (right) { LS.i++; xp(right ? 5 : 1); if (LS.i >= LS.items.length) { drillDone = null; set('<div class="card flash"><div class="big">💪 ' + LS.right + " / " + LS.items.length + '</div><div class="mut">Richtige Antworten sind aus der Fehlerliste raus.</div></div><button class="btn" onclick="App.go(\'review\')">OK</button>'); LS = null; } else mistPage(); };
    mistPage();
  }
  function mistPage() { var it = LS.items[LS.i]; set('<h2>❌ Meine Fehler</h2><div class="mut sm">' + (LS.i + 1) + " / " + LS.items.length + "</div>" + drillHtml(it)); if (it.audio) setTimeout(function () { speak(it.audio); }, 250); }
  var DK = null;
  function diktat() {
    sub = "diktat";
    var learned = Object.keys(S.cards).map(function (k) { return ALLW[k].w[2]; });
    DK = { list: pick(learned, 6), i: 0, ok: 0 }; diktatPage();
  }
  function diktatPage() {
    if (DK.i >= DK.list.length) { set('<div class="card flash"><div class="big">🎧 ' + DK.ok + " / " + DK.list.length + '</div></div><button class="btn" onclick="App.go(\'review\')">OK</button>'); return; }
    var s = DK.list[DK.i];
    set('<h2>🎧 Diktat</h2><div class="mut sm">' + (DK.i + 1) + " / " + DK.list.length + '</div><div class="card"><div class="row"><button class="btn" onclick="App.say(' + q(s) + ')">🔊 Hören</button><button class="btn alt" onclick="App.say(' + q(s) + ',1)">🐢 Langsam</button></div><textarea id="dk" style="min-height:90px" placeholder="Schreib, was du hörst…"></textarea><button class="btn" onclick="App.dkCheck()">Prüfen</button><div id="fb"></div></div>');
    setTimeout(function () { speak(s); }, 300);
  }
  function dkCheck() {
    var s = DK.list[DK.i], p = L.similarity(document.getElementById("dk").value, s), ok = p >= 85;
    S.acc.h[1]++; if (ok) { S.acc.h[0]++; DK.ok++; } xp(ok ? 8 : 2);
    document.getElementById("fb").innerHTML = '<div class="fb ' + (ok ? "ok" : "bad") + '">' + p + "% · " + esc(s) + '</div><button class="btn" onclick="App.dkNext()">Weiter</button>';
  }
  function bank(filter) {
    sub = "bank";
    var f = L.norm(filter || ""), keys = Object.keys(S.cards).filter(function (k) { return !f || L.norm(k + " " + ALLW[k].w[1]).indexOf(f) >= 0; });
    var h = '<h2>📚 Wortschatz</h2><input class="t" placeholder="🔎 Suchen…" value="' + esc(filter || "") + '" oninput="App.bankF(this.value)">';
    keys.sort(function (a, b) { return S.cards[a].b - S.cards[b].b; }).forEach(function (k) {
      var w = ALLW[k].w;
      h += '<div class="card"><div class="row"><div><b>' + esc(w[0]) + '</b> <span class="mut">' + esc(w[1]) + '</span></div><div style="flex:none">' + sayBtn(w[0]) + "</div></div>" + bar(L.strength(S.cards[k])) + "</div>";
    });
    if (!keys.length) h += '<div class="card mut">Noch keine Wörter — starte eine Lektion.</div>';
    set(h);
    var inp = V().querySelector("input"); if (filter != null) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
  function library() { sub = "lib"; set('<h2>📐 Grammatik-Bibliothek</h2>' + DAYS.map(function (D, i) { return '<div class="card" onclick="App.gram(' + i + ')"><b>' + (i + 1) + ". " + esc(D.g) + '</b><div class="mut sm">' + esc(D.t) + " · " + esc(D.lv) + "</div></div>"; }).join("")); }
  function gram(i) { sub = "gram"; set("<h2>" + esc(DAYS[i].t) + "</h2>" + grammarHtml(DAYS[i]) + '<button class="btn alt" onclick="App.lesson(' + i + ',2)">✏️ Übungen dazu</button>'); }

  // ---------- 🏆 Prüfung ----------
  var EX = null;
  function exam() {
    stopTimer();
    var h = '<div class="card hero"><h2>🏆 Goethe-Zertifikat A2</h2><div class="mut">Mock exam in the real format. Lesen 30′ · Hören 30′ · Schreiben 30′ · Sprechen ~15′. Pass = 60 / 100.</div></div>';
    h += '<button class="btn gold" onclick="App.examStart(\'all\')">🚀 Komplette Prüfung starten</button>';
    [["lesen", "📖 Lesen", 30], ["hoeren", "🎧 Hören", 30], ["schreiben", "✍️ Schreiben", 30], ["sprechen", "🗣️ Sprechen", 15]].forEach(function (m) { h += '<button class="btn alt" onclick="App.examStart(\'' + m[0] + "')\">" + m[1] + " · " + m[2] + " Min.</button>"; });
    if (S.exam.length) {
      h += '<div class="card"><h3>📈 Ergebnisse</h3>' + S.exam.slice().reverse().map(function (e) {
        return '<div class="note"><b>' + esc(e.date) + "</b> · " + (e.total != null ? e.total + " / 100 " + (e.total >= 60 ? "✅" : "⚠️") : "") + '<div class="mut sm">' + ["l:📖", "h:🎧", "s:✍️", "sp:🗣️"].map(function (x) { var p = x.split(":"); return e[p[0]] != null ? p[1] + " " + e[p[0]] + "/25" : ""; }).join("  ") + "</div></div>";
      }).join("") + "</div>";
    }
    h += '<div class="card"><h3>💡 Tipps</h3><div class="mut sm">• Lesen: questions first, then scan.<br>• Hören: „nicht …, sondern …“ → answer after sondern.<br>• Schreiben: cover EVERY point.<br>• Sprechen: ask back „Und Sie?“, never freeze.</div></div>';
    set(h);
  }
  function examStart(which) {
    sub = "exam";
    var mods = which === "all" ? ["lesen", "hoeren", "schreiben", "sprechen"] : [which];
    EX = { mods: mods, m: 0, t: 0, res: { date: T }, plays: {} };
    modStart();
  }
  function modStart() {
    var m = EX.mods[EX.m], mins = { lesen: 30, hoeren: 30, schreiben: 30, sprechen: 15 }[m];
    EX.t = 0; EX.right = 0; EX.n = 0; EX.end = Date.now() + mins * 60000; EX.sp = [];
    stopTimer(); timerId = setInterval(tick, 1000);
    teilPage();
  }
  function tick() {
    var el = document.getElementById("tmr"); var s = Math.max(0, Math.round((EX.end - Date.now()) / 1000));
    if (el) el.textContent = "⏱️ " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    if (s === 0) { stopTimer(); toast("⏰ Zeit ist um!"); }
  }
  function exHead(title) { return '<div class="row"><div class="mut sm">' + esc(title) + '</div><div class="timer" id="tmr" style="flex:none">⏱️</div></div>'; }
  function teilPage() {
    var m = EX.mods[EX.m], P = EXAM[m][EX.t], h;
    if (!P) return modEnd();
    if (m === "lesen") {
      h = exHead("📖 Lesen · " + P.teil) + '<div class="card"><div class="mut sm">' + esc(P.info) + '</div><div class="entry" style="margin-top:8px">' + esc(P.text || P.ads.join("\n\n")) + "</div></div>";
      P.q.forEach(function (x, k) { h += '<div class="card"><b>' + (k + 1) + ". " + esc(x.q) + "</b>" + x.o.map(function (o, j) { return '<button class="opt" data-k="' + k + '" data-j="' + j + '" onclick="App.exPick(this)">' + String.fromCharCode(97 + j) + ") " + esc(o) + "</button>"; }).join("") + "</div>"; });
      h += '<button class="btn" onclick="App.exSubmit()">Abgeben ✔️</button>';
    } else if (m === "hoeren") {
      h = exHead("🎧 Hören · " + P.teil) + '<div class="card mut sm">' + esc(P.info) + " Each audio: max. 2×.</div>";
      P.items.forEach(function (x, k) {
        var id = EX.t + "_" + k, n = EX.plays[id] || 0;
        h += '<div class="card"><button class="btn alt" id="pl' + k + '" ' + (n >= 2 ? "disabled" : "") + ' onclick="App.exPlay(' + k + ')">▶️ Abspielen (' + n + "/2)</button><b>" + (k + 1) + ". " + esc(x.q) + "</b>" + x.o.map(function (o, j) { return '<button class="opt" data-k="' + k + '" data-j="' + j + '" onclick="App.exPick(this)">' + esc(o) + "</button>"; }).join("") + "</div>";
      });
      h += '<button class="btn" onclick="App.exSubmit()">Abgeben ✔️</button>';
    } else if (m === "schreiben") {
      h = exHead("✍️ Schreiben · " + P.teil) + '<div class="card"><div class="entry">' + esc(P.task) + '</div></div><textarea id="extxt" oninput="document.getElementById(\'exwc\').textContent=L.words(this.value)+\' Wörter (min. ' + P.min + ')\'"></textarea><div class="mut sm" id="exwc">0 Wörter</div><button class="btn" onclick="App.exWrite()">Abgeben ✔️</button><div id="exfb"></div>';
    } else {
      h = exHead("🗣️ Sprechen · " + P.teil) + '<div class="card mut sm">' + esc(P.info) + "</div>";
      if (P.cards) P.cards.forEach(function (c, k) { h += '<div class="card"><div class="row"><b style="font-size:20px">🃏 ' + esc(c[0]) + '</b><button class="btn alt" style="flex:none;width:auto" onclick="App.exSpeak(' + k + ')">🎤 Frage stellen</button></div><div id="sp' + k + '"></div></div>'; });
      if (P.prompts) h += '<div class="card"><h3>„' + esc(P.topic) + '“</h3><div class="chips">' + P.prompts.map(function (p) { return '<span class="chip">' + esc(p) + "</span>"; }).join("") + '</div><button class="btn alt" onclick="App.exSpeak(-1)">🎤 Sprechen (1–2 Min.)</button><div id="sp-1"></div><button class="btn alt" onclick="App.say(' + q(P.m) + ')">🔊 Beispiel hören</button></div>';
      if (P.cal) h += '<div class="card"><h3>📅 Dein Kalender</h3>' + P.cal.map(function (c) { return '<div class="note">' + esc(c) + "</div>"; }).join("") + "</div>" + P.lines.map(function (l, k) { return '<div class="card"><div class="ex" style="border:0"><div style="flex:1" class="de">' + esc(l) + "</div>" + sayBtn(l) + '</div><button class="btn alt" onclick="App.exLine(' + k + ')">🎤 Nachsprechen</button><div id="ln' + k + '"></div></div>'; }).join("");
      h += '<button class="btn" onclick="App.exSpeakDone()">Weiter ✔️</button>';
    }
    set(h); tick();
  }
  function exPick(el) { [].forEach.call(document.querySelectorAll('.opt[data-k="' + el.dataset.k + '"]'), function (b) { b.classList.remove("ok"); b.style.borderColor = ""; }); el.style.borderColor = "var(--brand)"; el.dataset.sel = 1; [].forEach.call(document.querySelectorAll('.opt[data-k="' + el.dataset.k + '"]'), function (b) { if (b !== el) delete b.dataset.sel; }); }
  function exPlay(k) {
    var P = EXAM.hoeren[EX.t], id = EX.t + "_" + k; EX.plays[id] = (EX.plays[id] || 0) + 1;
    speak(P.items[k].say);
    var b = document.getElementById("pl" + k); b.textContent = "▶️ Abspielen (" + EX.plays[id] + "/2)"; if (EX.plays[id] >= 2) b.disabled = true;
  }
  function exSubmit() {
    var m = EX.mods[EX.m], P = EXAM[m][EX.t], qs = m === "lesen" ? P.q : P.items, right = 0;
    qs.forEach(function (x, k) {
      var sel = document.querySelector('.opt[data-k="' + k + '"][data-sel]'), all = document.querySelectorAll('.opt[data-k="' + k + '"]');
      all[x.a].classList.add("ok"); if (sel && +sel.dataset.j !== x.a) sel.classList.add("bad");
      if (sel && +sel.dataset.j === x.a) right++;
      [].forEach.call(all, function (b) { b.disabled = true; });
    });
    EX.right += right; EX.n += qs.length;
    var en = m === "lesen" ? EXAM_EN.lesen[EX.t] : null, hen = m === "hoeren" ? EXAM_EN.hoeren[EX.t] : null;
    qs.forEach(function (x, k) {
      var card = document.querySelector('.opt[data-k="' + k + '"]').parentNode;
      var t = en ? en.q[k] : hen ? hen[k] : "";
      if (m === "hoeren") card.insertAdjacentHTML("beforeend", '<div class="note sm"><b>📜 Transkript:</b> ' + esc(x.say) + E(t) + "</div>");
      else card.querySelector("b").insertAdjacentHTML("afterend", E(t));
    });
    if (en) V().querySelector(".card .entry").insertAdjacentHTML("afterend", '<div class="en" style="margin-top:8px">🇬🇧 ' + esc(en.text) + "</div>");
    if (m === "hoeren") { S.acc.h[0] += right; S.acc.h[1] += qs.length; save(); }
    var last = V().querySelector(".btn:last-child"); last.outerHTML = '<div class="fb ' + (right >= qs.length * 0.6 ? "ok" : "bad") + '">' + right + " / " + qs.length + ' richtig</div><button class="btn" onclick="App.exNext()">Weiter →</button>';
    window.scrollTo(0, 0);
  }
  function exNext() { EX.t++; teilPage(); }
  function exWrite() {
    var P = EXAM.schreiben[EX.t], t = document.getElementById("extxt").value, r = L.check(t, { words: P.min }, []);
    var h = '<div class="card"><h3>✅ Hast du alle Punkte? (ehrlich ankreuzen)</h3>' + P.points.map(function (p, k) { return '<label class="note" style="display:flex;gap:8px"><input type="checkbox" class="pt"> ' + esc(p) + "</label>"; }).join("") +
      '<h3 style="margin-top:10px">🔍 Hinweise</h3>' + r.notes.map(function (n) { return '<div class="note">' + esc(n.m) + "</div>"; }).join("") +
      '<h3 style="margin-top:10px">👀 Musterlösung</h3><div class="entry">' + esc(P.m) + '</div></div><button class="btn" onclick="App.exWriteScore(' + L.words(t) + ')">Bewerten & weiter →</button>';
    document.getElementById("exfb").innerHTML = h;
    document.getElementById("exfb").scrollIntoView({ behavior: "smooth" });
  }
  function exWriteScore(n) {
    var P = EXAM.schreiben[EX.t], pts = document.querySelectorAll(".pt"), got = [].filter.call(pts, function (b) { return b.checked; }).length;
    var ratio = got / pts.length * (n >= P.min ? 1 : 0.7);
    EX.right += ratio; EX.n += 1;
    EX.t++; teilPage();
  }
  function exSpeak(k) {
    var P = EXAM.sprechen[EX.t], target = k >= 0 ? P.cards[k][1] : P.m;
    listen(k >= 0 ? P.cards[k][0] : P.topic, function (list) {
      var heard = list[0] || "", p = k >= 0 ? L.bestSimilarity(list, target) : Math.min(100, L.words(heard) * 3);
      EX.sp.push(p);
      document.getElementById("sp" + k).innerHTML = '<div class="fb ' + (p >= 60 ? "ok" : "gold") + '">' + (k >= 0 ? p + "% · " : L.words(heard) + " Wörter · ") + "„" + esc(heard || "—") + "“" + (k >= 0 ? '<div class="sm" style="font-weight:400">Model: ' + esc(target) + "</div>" : "") + "</div>";
    });
  }
  function exLine(k) {
    var P = EXAM.sprechen[EX.t], target = P.lines[k];
    listen(target, function (list) { var p = L.bestSimilarity(list, target); EX.sp.push(p); document.getElementById("ln" + k).innerHTML = '<div class="fb ' + (p >= 70 ? "ok" : "gold") + '">' + p + "% · „" + esc(list[0] || "—") + "“</div>"; });
  }
  function exSpeakDone() {
    var avg = EX.sp.length ? EX.sp.reduce(function (a, b) { return a + b; }, 0) / EX.sp.length / 100 : 0;
    EX.right += avg; EX.n += 1; EX.t++; teilPage();
  }
  function modEnd() {
    stopTimer();
    var m = EX.mods[EX.m], key = { lesen: "l", hoeren: "h", schreiben: "s", sprechen: "sp" }[m];
    EX.res[key] = Math.round(25 * EX.right / Math.max(1, EX.n));
    EX.m++;
    if (EX.m < EX.mods.length) { toast("✅ " + m + ": " + EX.res[key] + "/25"); return modStart(); }
    var r = EX.res, parts = ["l", "h", "s", "sp"].filter(function (k) { return r[k] != null; });
    if (parts.length === 4) r.total = r.l + r.h + r.s + r.sp;
    S.exam.push(r); xp(40); save();
    var pass = r.total != null ? r.total >= 60 : null;
    set('<div class="card flash"><div class="big">' + (r.total != null ? (pass ? "🎉 " : "💪 ") + r.total + " / 100" : "✅ " + r[parts[0]] + " / 25") + '</div><div class="mut">' + (pass === true ? "Bestanden! You're ready." : pass === false ? "Noch nicht — 60 needed. Redo your mistakes and try again." : "Module done.") + "</div></div>" +
      '<div class="card">' + parts.map(function (k) { return '<div class="note">' + { l: "📖 Lesen", h: "🎧 Hören", s: "✍️ Schreiben", sp: "🗣️ Sprechen" }[k] + ": <b>" + r[k] + "/25</b>" + bar(r[k] * 4) + "</div>"; }).join("") + "</div>" +
      '<button class="btn" onclick="App.go(\'exam\')">OK</button>');
    sub = "examdone";
  }

  // ---------- ⚙️ Settings ----------
  function settings() {
    sub = "settings"; tab = ""; tabs();
    var h = '<h2>⚙️ Einstellungen</h2><div class="card"><h3>🎯 Tagesziel</h3><div class="row">' + [20, 50, 100].map(function (g) { return '<button class="btn ' + (S.goal === g ? "" : "alt") + '" onclick="App.goal(' + g + ')">' + g + " XP</button>"; }).join("") + "</div></div>";
    h += '<div class="card"><h3>⏰ Tägliche Erinnerung</h3><div class="mut sm">Only if you haven\'t studied yet that day.</div><div class="row"><input class="t" type="time" id="rem" value="' + (pref("remind", "19:00") === "off" ? "19:00" : pref("remind", "19:00")) + '"><button class="btn" style="flex:none;width:auto" onclick="App.remind(1)">Speichern</button><button class="btn alt" style="flex:none;width:auto" onclick="App.remind(0)">Aus</button></div><div class="mut sm">Now: ' + esc(pref("remind", "19:00")) + "</div></div>";
    h += '<div class="card"><h3>🔊 Sprechtempo</h3><div class="row">' + [["0.75", "🐢 langsam"], ["0.95", "normal"], ["1.1", "🐇 schnell"]].map(function (r) { return '<button class="btn ' + (pref("rate", "0.95") === r[0] ? "" : "alt") + '" onclick="App.rate(\'' + r[0] + "')\">" + r[1] + "</button>"; }).join("") + '</div><button class="btn alt" onclick="App.say(\'Guten Tag! Ich lerne Deutsch. Mach ich!\')">▶️ Test</button>' + (M && !M.hasVoice() ? '<div class="fb gold">🔇 No German voice found: Android Settings → Text-to-speech → install German.</div>' : "") + "</div>";
    h += '<div class="card"><h3>🏆 Prüfungsdatum</h3><input class="t" type="date" id="exd" value="' + esc(pref("examDate", "")) + '" onchange="App.examDate(this.value)"></div>';
    h += '<div class="card"><h3>📅 Kursstart</h3><div class="mut sm">Day 1 = ' + esc(S.start) + '</div><button class="btn alt" onclick="App.restartPlan()">Plan ab heute neu starten</button></div>';
    h += '<div class="card"><h3>🔄 Updates</h3><label class="note" style="display:flex;gap:8px"><input type="checkbox" ' + (pref("auto", "true") === "true" ? "checked" : "") + ' onchange="App.pref(\'auto\',this.checked)"> 🤫 Automatisch & leise (1× pro Tag)</label><label class="note" style="display:flex;gap:8px"><input type="checkbox" ' + (pref("wifi", "true") === "true" ? "checked" : "") + ' onchange="App.pref(\'wifi\',this.checked)"> 📶 Nur im WLAN</label><button class="btn alt" onclick="App.checkNow()">Jetzt prüfen</button><div id="upd" class="mut sm"></div></div>';
    h += '<div class="card"><button class="btn alt" style="color:var(--bad)" onclick="App.reset()">🗑️ Fortschritt löschen</button></div>';
    h += '<div class="foot">Mach ich! · Version ' + esc(M ? M.version() : "web") + "<br>Designed by Muhammad Toffaha</div>";
    set(h);
  }

  // ---------- update pop-up ----------
  var manualCheck = false;
  function onUpdate(json) {
    var r = null; try { r = json ? JSON.parse(json) : null; } catch (e) { }
    var el = document.getElementById("upd");
    if (!r || !M || r.code <= M.versionCode()) { if (manualCheck && el) el.textContent = "✅ Neueste Version (" + (M ? M.version() : "") + ")"; manualCheck = false; return; }
    manualCheck = false;
    openModal('<h3>🎁 Update verfügbar</h3><div class="mut">' + esc(r.name) + '</div><div class="sm entry" style="margin:8px 0">' + esc((r.notes || "").slice(0, 300)) + '</div><div id="prog"></div><div class="row"><button class="btn alt" onclick="App.closeModal()">Später</button><button class="btn" onclick="App.install(' + q(r.url) + ')">⬇️ Aktualisieren</button></div>');
  }
  function onProgress(p) { var e = document.getElementById("prog"); if (e) e.innerHTML = bar(p * 100); }
  function onInstallMsg(m) { toast(m); var e = document.getElementById("prog"); if (e) e.insertAdjacentHTML("beforeend", '<div class="mut sm">' + esc(m) + "</div>"); }
  function openModal(h) { document.getElementById("mbox").innerHTML = h; document.getElementById("modal").classList.add("on"); }
  function closeModal() { document.getElementById("modal").classList.remove("on"); }

  // ---------- navigation ----------
  function go(t) {
    stopTimer(); drillDone = null;
    if (t === "settings") return settings();
    tab = t; sub = null; LS = null; tabs();
    ({ home: home, plan: plan, review: review, leben: leben, exam: exam })[t]();
  }
  function back() {
    if (document.getElementById("modal").classList.contains("on")) { closeModal(); return true; }
    if (sub === "lesson" && LS && LS.step > 0) { LS.step--; runStep(); return true; }
    if (sub) { var t = tab || "home"; if (sub === "exam" && !confirm("Prüfung abbrechen?")) return true; go(t); return true; }
    if (tab !== "home") { go("home"); return true; }
    return false;
  }

  function init() {
    load(); head(); go("home");
    if (M) setTimeout(function () { M.checkUpdate(); }, 1500);
  }

  return {
    init: init, go: go, back: back, lesson: lesson, next: nextStep, write: write, freeWrite: freeWrite,
    say: function (t, slow) { speak(t, slow); }, toast: toast, yt: function (g) { var u = "https://www.youtube.com/results?search_query=" + encodeURIComponent("German grammar " + g + " A2"); if (M) M.openUrl(u); else open(u); },
    mc: mc, gapCheck: gapCheck, chip: chip, orderReset: orderReset, orderCheck: orderCheck, drillNext: drillNext,
    redoPractice: function () { stepPractice(); }, speakTry: speakTry,
    wc: wc, checkText: checkText, model: model, sayText: sayText, readAloud: readAloud,
    flash: flash, flip: flip, grade: fcGrade, mistakes: mistakes, diktat: diktat, dkCheck: dkCheck, dkNext: function () { DK.i++; diktatPage(); },
    bank: function () { bank(); }, bankF: function (v) { bank(v); }, library: library, gram: gram,
    examStart: examStart, exPick: exPick, exPlay: exPlay, exSubmit: exSubmit, exNext: exNext, exWrite: exWrite, exWriteScore: exWriteScore,
    exSpeak: exSpeak, exLine: exLine, exSpeakDone: exSpeakDone,
    goal: function (g) { S.goal = g; save(); settings(); },
    remind: function (on) { setPref("remind", on ? document.getElementById("rem").value : "off"); toast(on ? "⏰ Erinnerung gespeichert" : "🔕 Erinnerung aus"); settings(); },
    rate: function (r) { setPref("rate", r); settings(); speak("So klinge ich jetzt."); },
    examDate: function (v) { setPref("examDate", v); toast("📅 Gespeichert"); },
    restartPlan: function () { if (confirm("Day 1 = today?")) { S.start = T; save(); settings(); } },
    pref: function (k, v) { setPref(k, String(v)); },
    checkNow: function () { manualCheck = true; document.getElementById("upd").textContent = "⏳ …"; if (M) M.checkUpdate(); },
    install: function (u) { M.installUpdate(u); },
    reset: function () { if (confirm("Wirklich alles löschen?")) { S = null; if (M) M.save(""); else localStorage.removeItem("machich"); load(); save(); go("home"); } },
    onHeard: function (json) { var l = []; try { l = JSON.parse(json); } catch (e) { } var cb = heardCb; heardCb = null; if (cb) cb(l); },
    onUpdate: onUpdate, onProgress: onProgress, onInstallMsg: onInstallMsg, closeModal: closeModal,
    _state: function () { return S; }, _item: function () { return LS && LS.items ? LS.items[LS.i] : null; }
  };
})();
document.addEventListener("DOMContentLoaded", App.init);
