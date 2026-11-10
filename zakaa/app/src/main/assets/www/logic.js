/* 🧠 ذكاء — puzzle engine (no DOM). Tested by tests/logic.test.js with node.
   Every level is generated from a fixed seed, so level N is the same puzzle for every kid (they can compare). */
(function (root) {
  'use strict';

  const MAX = 40;
  const GAME_IDS = ['pipes', 'lights', 'seq', 'odd', 'math', 'sudoku', 'words', 'mem'];
  const TIERS = ['سهل', 'متوسط', 'صعب', 'صعب جداً', 'خارق'];
  const tier = l => Math.min(4, Math.floor((l - 1) / 8));          // 8 levels per tier

  // ---------- seeded random ----------
  function rng(seed) {                                              // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seedOf = (g, lvl, round) => (GAME_IDS.indexOf(g) + 1) * 100003 + lvl * 1009 + (round || 0) * 97 + 12345;
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  /** 4 different answers around the right one */
  function numOptions(r, ans, step, avoid) {
    const set = new Set([ans]);
    const deltas = shuffle(r, [1, -1, 2, -2, 3, -3, step, -step, step + 1, step - 1, 10, -10, 5, -5].filter(Boolean));
    for (const d of deltas) { if (set.size >= 4) break; const v = ans + d; if (v > 0 && v !== avoid) set.add(v); }
    for (let x = 4; set.size < 4; x++) if (ans + x !== avoid) set.add(ans + x);
    return shuffle(r, [...set]);
  }

  // ---------- 🔢 number rules (shared by "what comes next" and "fix the sequence") ----------
  const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
  const seqOf = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  function iter(n, first, step) { const a = first.slice(); while (a.length < n) a.push(step(a, a.length)); return a.slice(0, n); }
  const sign = c => (c >= 0 ? '+' : '−') + Math.abs(c);

  const K = {
    add: (s, k) => ({ kind: 'add', p: [s, k], gen: n => seqOf(n, i => s + k * i), explain: `كل مرة بنزوّد ${k}` }),
    sub: (s, k) => ({ kind: 'sub', p: [s, k], gen: n => seqOf(n, i => s - k * i), explain: `كل مرة بننقص ${k}` }),
    mul: (s, k) => ({ kind: 'mul', p: [s, k], gen: n => seqOf(n, i => s * Math.pow(k, i)), explain: `كل مرة بنضرب في ${k}` }),
    grow: (s, d, inc) => ({ kind: 'grow', gen: n => iter(n, [s], (a, i) => a[i - 1] + d + inc * (i - 1)),
      explain: `الزيادة نفسها بتكبر: ${sign(d)} وبعدين ${sign(d + inc)} وبعدين ${sign(d + 2 * inc)}…` }),
    sq: (s, c) => ({ kind: 'sq', p: [s, c], gen: n => seqOf(n, i => (s + i) * (s + i) + c),
      explain: c ? `رقم مضروب في نفسه (زي ${s}×${s}) وبعدين ${sign(c)}` : `كل رقم مضروب في نفسه: ${s}×${s}، ${s + 1}×${s + 1}، ${s + 2}×${s + 2}…` }),
    cube: s => ({ kind: 'cube', p: [s], gen: n => seqOf(n, i => Math.pow(s + i, 3)), explain: `رقم مضروب في نفسه 3 مرات: ${s}×${s}×${s}، ${s + 1}×${s + 1}×${s + 1}…` }),
    oblong: s => ({ kind: 'oblong', gen: n => seqOf(n, i => (s + i) * (s + i + 1)), explain: `رقم × اللي بعده: ${s}×${s + 1}، ${s + 1}×${s + 2}، ${s + 2}×${s + 3}…` }),
    prime: s => ({ kind: 'prime', p: [s], gen: n => PRIMES.slice(s, s + n), explain: 'أرقام أولية: مابتتقسمش غير على نفسها وعلى 1' }),
    alt: (s, a, b) => ({ kind: 'alt', odd: false, gen: n => iter(n, [s], (x, i) => x[i - 1] + (i % 2 ? a : b)), explain: `مرة ${sign(a)} ومرة ${sign(b)}` }),
    mulAdd: (s, k, c) => ({ kind: 'mulAdd', gen: n => iter(n, [s], (x, i) => x[i - 1] * k + c), explain: `كل مرة نضرب في ${k} وبعدين ${sign(c)}` }),
    fib: (a, b) => ({ kind: 'fib', gen: n => iter(n, [a, b], (x, i) => x[i - 1] + x[i - 2]), explain: 'كل رقم = مجموع الرقمين اللي قبله' }),
    fib3: (a, b, c) => ({ kind: 'fib3', show: 6, gen: n => iter(n, [a, b, c], (x, i) => x[i - 1] + x[i - 2] + x[i - 3]), explain: 'كل رقم = مجموع التلات أرقام اللي قبله' }),
    inter: (a, da, b, db) => ({ kind: 'inter', odd: false, show: 6, gen: n => seqOf(n, i => i % 2 ? b + db * ((i - 1) / 2) : a + da * (i / 2)),
      explain: `سلسلتين داخلين في بعض: واحدة ${sign(da)} والتانية ${sign(db)} (بُص على رقم وسيب رقم)` }),
    interGeo: (a, k, b, d) => ({ kind: 'interGeo', odd: false, show: 6, gen: n => seqOf(n, i => i % 2 ? b + d * ((i - 1) / 2) : a * Math.pow(k, i / 2)),
      explain: `سلسلتين داخلين في بعض: واحدة ×${k} والتانية ${sign(d)}` }),
    altMul: (s, a, b) => ({ kind: 'altMul', odd: false, show: 6, gen: n => iter(n, [s], (x, i) => i % 2 ? x[i - 1] * a : x[i - 1] + b), explain: `مرة نضرب في ${a} ومرة ${sign(b)}` })
  };

  function rule(r, lvl, forOdd) {
    let c;
    if (lvl <= 2) c = [() => K.add(ri(r, 1, 5), 1)];
    else if (lvl <= 4) c = [() => K.add(ri(r, 1, 6), 2), () => K.add(ri(r, 1, 3) * 10, 10), () => K.add(5, 5)];
    else if (lvl <= 8) c = [() => K.add(ri(r, 1, 20), ri(r, 2, 5)), () => { const k = ri(r, 1, 3); return K.sub(k * 7 + ri(r, 1, 9), k); }];
    else if (lvl <= 12) c = [() => K.add(ri(r, 3, 30), ri(r, 6, 12)), () => { const k = ri(r, 3, 9); return K.sub(k * 7 + ri(r, 1, 20), k); },
      () => K.mul(ri(r, 1, 3), 2), () => K.alt(ri(r, 1, 9), ri(r, 1, 3), ri(r, 4, 6))];
    else if (lvl <= 16) c = [() => K.grow(ri(r, 1, 9), ri(r, 1, 3), 1), () => K.mul(ri(r, 1, 2), 3), () => K.mul(ri(r, 3, 7), 2),
      () => K.add(ri(r, 10, 60), ri(r, 11, 19)), () => K.alt(ri(r, 5, 20), ri(r, 4, 8), -ri(r, 1, 3))];
    else if (lvl <= 24) c = [() => K.grow(ri(r, 1, 12), ri(r, 2, 5), ri(r, 2, 3)), () => K.sq(ri(r, 1, 4), 0), () => K.alt(ri(r, 10, 30), ri(r, 5, 9), -ri(r, 1, 4)),
      () => K.mulAdd(ri(r, 1, 3), 2, ri(r, 1, 3)), () => K.fib(ri(r, 1, 4), ri(r, 1, 5)), () => K.mul(ri(r, 2, 5), 3)];
    else if (lvl <= 32) c = [() => K.inter(ri(r, 1, 9), ri(r, 2, 5), ri(r, 20, 40), -ri(r, 1, 4)), () => K.sq(ri(r, 2, 6), pick(r, [-3, -2, -1, 1, 2, 3, 5])),
      () => K.mulAdd(ri(r, 2, 3), 3, pick(r, [-2, -1, 1, 2])), () => K.fib(ri(r, 3, 9), ri(r, 4, 12)), () => K.altMul(ri(r, 1, 3), 2, ri(r, 1, 4)),
      () => K.grow(ri(r, 2, 20), ri(r, 3, 9), ri(r, 3, 5)), () => K.oblong(ri(r, 1, 4))];
    else c = [() => K.cube(ri(r, 1, 3)), () => K.prime(ri(r, 0, 8)), () => K.fib3(ri(r, 1, 3), ri(r, 1, 4), ri(r, 2, 5)),
      () => K.interGeo(ri(r, 1, 3), pick(r, [2, 3]), ri(r, 5, 30), ri(r, 3, 9)), () => K.altMul(ri(r, 2, 4), 3, -ri(r, 1, 3)),
      () => K.sq(ri(r, 5, 11), pick(r, [-7, -4, 4, 6, 9])), () => K.grow(ri(r, 5, 30), ri(r, 4, 12), ri(r, 4, 9)), () => K.mulAdd(ri(r, 2, 3), pick(r, [3, 4]), ri(r, 1, 5)), () => K.mul(ri(r, 1, 3), 4)];
    for (;;) { const R = pick(r, c)(); if (!forOdd || R.odd !== false) return R; }
  }

  function genSeq(lvl, round) {
    const r = rng(seedOf('seq', lvl, round)), R = rule(r, lvl, false);
    const n = R.show || (tier(lvl) === 0 ? 4 : 5), all = R.gen(n + 1), answer = all[n];
    return { terms: all.slice(0, n), answer, options: numOptions(r, answer, all[n] - all[n - 1]), explain: R.explain, kind: R.kind, p: R.p };
  }

  /** one number in the row is broken: find it, then fix it */
  function genOdd(lvl, round) {
    const r = rng(seedOf('odd', lvl, round)), R = rule(r, lvl, true);
    const n = tier(lvl) === 0 ? 5 : 6, fixed = R.gen(n), idx = ri(r, 1, n - 2);
    let wrong = 0;
    for (const d of shuffle(r, [1, -1, 2, -2, 3, -3, 5, -5, 10, 4, 6, 7])) {
      const w = fixed[idx] + d; if (w > 0 && !fixed.includes(w)) { wrong = w; break; }
    }
    const terms = fixed.slice(); terms[idx] = wrong;
    return { terms, fixed, wrongIdx: idx, correct: fixed[idx], options: numOptions(r, fixed[idx], 4, wrong), explain: R.explain, kind: R.kind };
  }

  // ---------- 🧮 fix the equation ----------
  const Q = '❓';
  const OPS = { '+': (p, q) => p + q, '−': (p, q) => p - q, '×': (p, q) => p * q, '÷': (p, q) => (q && p % q === 0 ? p / q : NaN) };
  function genMath(lvl, round) {
    const r = rng(seedOf('math', lvl, round));
    const num = (text, ans, explain, same) => ({ text, answer: String(ans), options: numOptions(r, ans, 2).map(String), explain, same: !!same });
    const opQ = (ops, lo, hi) => {
      for (;;) {
        const a = ri(r, lo, hi), b = ri(r, 2, 12), op = pick(r, ops), res = OPS[op](a, b);
        if (!Number.isInteger(res) || res < 0) continue;
        if (ops.filter(o => OPS[o](a, b) === res).length !== 1) continue;
        return { text: `${a} ${Q} ${b} = ${res}`, answer: op, options: ops.slice(), explain: `جرّب كل علامة… ${a} ${op} ${b} = ${res}` };
      }
    };
    let a, b, c, d, x, v = r();
    if (lvl <= 4) { c = ri(r, 3, lvl <= 2 ? 6 : 10); x = ri(r, 1, c - 1); a = c - x; return num(`${a} + ${Q} = ${c}`, x, `عدّ من ${a} لحد ${c}… هتعدّ ${x}`); }
    if (lvl <= 8) {
      c = ri(r, 5, lvl <= 6 ? 12 : 20); x = ri(r, 1, c - 1);
      return v < 0.5 ? num(`${Q} + ${c - x} = ${c}`, x, `${c} − ${c - x} = ${x}`) : num(`${c} − ${Q} = ${c - x}`, x, `${c} − ${c - x} = ${x}`);
    }
    if (lvl <= 10) return opQ(['+', '−', '×'], 3, 12);
    if (lvl <= 12) { a = pick(r, [2, 3, 5, 10]); x = ri(r, 1, 10); return num(`${a} × ${Q} = ${a * x}`, x, `جدول ${a}: ${a} × ${x} = ${a * x}`); }
    if (lvl <= 14) {
      a = ri(r, 2, 9); x = ri(r, 2, 9);
      return v < 0.5 ? num(`${a} × ${Q} = ${a * x}`, x, `جدول ${a}: ${a} × ${x} = ${a * x}`) : num(`${a * x} ÷ ${Q} = ${a}`, x, `${a} × ${x} = ${a * x}، يبقى ${a * x} ÷ ${x} = ${a}`);
    }
    if (lvl <= 16) { a = ri(r, 8, 30); b = ri(r, 5, 30); x = ri(r, 2, a + b - 1); return num(`${a} + ${b} − ${Q} = ${a + b - x}`, x, `الأول ${a} + ${b} = ${a + b}، وبعدين ${a + b} − ${a + b - x} = ${x}`); }
    if (lvl <= 20) {
      if (v < 0.34) { a = ri(r, 2, 9); b = ri(r, 2, 9); x = ri(r, 1, 20); return num(`${a} × ${b} + ${Q} = ${a * b + x}`, x, `${a} × ${b} = ${a * b}، والباقي ${a * b + x} − ${a * b} = ${x}`); }
      if (v < 0.67) { b = ri(r, 2, 9); x = ri(r, 2, 9); c = ri(r, 1, b * x - 1); return num(`${Q} × ${b} − ${c} = ${b * x - c}`, x, `ارجع بالعكس: ${b * x - c} + ${c} = ${b * x}، و ${b * x} ÷ ${b} = ${x}`); }
      return opQ(['+', '−', '×', '÷'], 6, 60);
    }
    if (lvl <= 24) {                                           // two signs: (a ? b) ? c = d
      const ops = ['+', '−', '×'], pairs = []; for (const o1 of ops) for (const o2 of ops) pairs.push([o1, o2]);
      for (;;) {
        a = ri(r, 2, 9); b = ri(r, 2, 9); c = ri(r, 2, 9); const ans = pick(r, pairs);
        const val = p => OPS[p[1]](OPS[p[0]](a, b), c); d = val(ans);
        if (d < 0 || pairs.filter(p => val(p) === d).length !== 1) continue;
        const others = shuffle(r, pairs.filter(p => p !== ans)).slice(0, 3);
        return { text: `(${a} ${Q} ${b}) ${Q} ${c} = ${d}`, answer: ans.join(' '), options: shuffle(r, [ans, ...others]).map(p => p.join(' ')),
          explain: `ابدأ باللي جوه القوس: (${a} ${ans[0]} ${b}) = ${OPS[ans[0]](a, b)}، وبعدين ${ans[1]} ${c}`, pair: true };
      }
    }
    if (lvl <= 28) {
      if (v < 0.34) { x = ri(r, 1, 12); a = ri(r, 1, 9); b = ri(r, 2, 9); return num(`(${Q} + ${a}) × ${b} = ${(x + a) * b}`, x, `ارجع بالعكس: ${(x + a) * b} ÷ ${b} = ${x + a}، و ${x + a} − ${a} = ${x}`); }
      if (v < 0.67) { b = ri(r, 2, 9); x = ri(r, 2, 11); return num(`100 − ${Q} × ${b} = ${100 - b * x}`, x, `100 − ${100 - b * x} = ${b * x}، و ${b * x} ÷ ${b} = ${x}`); }
      c = ri(r, 4, 9); d = ri(r, 4, 9); a = ri(r, 2, 6); b = ri(r, 1, a); x = Math.floor((c * d - b) / a); b = c * d - a * x;
      return num(`${a} × ${Q} + ${b} = ${c} × ${d}`, x, `اليمين ${c} × ${d} = ${c * d}، شيل ${b} يبقى ${c * d - b}، واقسم على ${a}`);
    }
    if (lvl <= 32) {
      if (v < 0.34) { x = ri(r, 4, 12); return num(`${Q} × ${Q} = ${x * x}`, x, `رقم مضروب في نفسه… جرّب ${x} × ${x}`, true); }
      if (v < 0.67) { x = ri(r, 3, 9); return num(`${Q} × ${Q} + ${Q} = ${x * x + x}`, x, `جرّب أرقام: ${x} × ${x} = ${x * x}، و +${x} = ${x * x + x}`, true); }
      a = ri(r, 3, 9); b = ri(r, 15, 40); x = ri(r, 2, b - 2); return num(`${a} × (${b} − ${Q}) = ${a * (b - x)}`, x, `${a * (b - x)} ÷ ${a} = ${b - x}، و ${b} − ${b - x} = ${x}`);
    }
    const k = Math.floor(v * 5);
    if (k === 0) { x = ri(r, 2, lvl >= 37 ? 9 : 6); return num(`${Q} × ${Q} × ${Q} = ${x * x * x}`, x, `رقم مضروب في نفسه 3 مرات… جرّب ${x}`, true); }
    if (k === 1) { x = ri(r, 2, 12); a = ri(r, 2, 6); b = ri(r, 1, 9); c = ri(r, 2, 6); return num(`(${Q} × ${a} + ${b}) × ${c} = ${(x * a + b) * c}`, x, `بالعكس: ÷ ${c} وبعدين − ${b} وبعدين ÷ ${a}`); }
    if (k === 2) { x = ri(r, 5, 15); return num(`${Q} × (${Q} + 1) = ${x * (x + 1)}`, x, `رقمين ورا بعض مضروبين في بعض: ${x} × ${x + 1}`, true); }
    if (k === 3) { x = ri(r, 3, 12); return num(`(${Q} + ${Q}) × ${Q} = ${2 * x * x}`, x, `(${x} + ${x}) = ${2 * x}، و ${2 * x} × ${x} = ${2 * x * x}`, true); }
    c = ri(r, 2, 5); a = c + ri(r, 1, 4); x = ri(r, 3, 12); d = ri(r, 1, (a - c) * x - 1); b = (a - c) * x - d;
    return num(`${a} × ${Q} − ${b} = ${c} × ${Q} + ${d}`, x, `الفرق بين الناحيتين ${a - c} × ❓ = ${b} + ${d} = ${b + d}، يبقى ❓ = ${x}`, true);
  }

  // ---------- 🔌 pipes: rotate the pieces until everything is connected ----------
  const rotMask = m => ((m << 1) & 15) | (m >> 3);                 // clockwise. bits: 1=up 2=right 4=down 8=left
  const DIRS = [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]];   // bit, dx, dy, opposite bit
  const pipesSize = lvl => (lvl <= 4 ? 3 : lvl <= 10 ? 4 : lvl <= 18 ? 5 : lvl <= 28 ? 6 : lvl <= 36 ? 7 : 8);
  function pipesState(n, cur, src) {
    const lit = new Array(n * n).fill(false); let ok = true;
    const link = (i, dx, dy, opp) => { const x = (i % n) + dx, y = ((i / n) | 0) + dy; return x < 0 || y < 0 || x >= n || y >= n || !(cur[y * n + x] & opp) ? -1 : y * n + x; };
    for (let i = 0; i < n * n; i++) for (const [bit, dx, dy, opp] of DIRS) if ((cur[i] & bit) && link(i, dx, dy, opp) < 0) ok = false;
    const q = [src]; lit[src] = true;
    while (q.length) { const i = q.pop(); for (const [bit, dx, dy, opp] of DIRS) if (cur[i] & bit) { const j = link(i, dx, dy, opp); if (j >= 0 && !lit[j]) { lit[j] = true; q.push(j); } } }
    return { lit, solved: ok && lit.every(Boolean) };
  }
  function genPipes(lvl) {
    const r = rng(seedOf('pipes', lvl, 0)), n = pipesSize(lvl), N = n * n;
    const sol = new Array(N).fill(0), seen = new Array(N).fill(false), src = ((n / 2) | 0) * n + ((n / 2) | 0);
    const active = [src]; seen[src] = true; const branchy = 0.15 + r() * 0.35;
    while (active.length) {
      const k = r() < branchy ? Math.floor(r() * active.length) : active.length - 1, cur = active[k], x = cur % n, y = (cur / n) | 0;
      const opts = DIRS.filter(([, dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen[ny * n + nx]; });
      if (!opts.length) { active.splice(k, 1); continue; }
      const [bit, dx, dy, opp] = pick(r, opts), nb = (y + dy) * n + x + dx;
      sol[cur] |= bit; sol[nb] |= opp; seen[nb] = true; active.push(nb);
    }
    const frac = lvl <= 2 ? 0.45 : lvl <= 4 ? 0.7 : 1;        // the first levels only break a few pieces
    let cur;
    do { cur = sol.map(m => { if (r() > frac) return m; let v = m; for (let k = ri(r, 1, 3); k > 0; k--) v = rotMask(v); return v; }); }
    while (pipesState(n, cur, src).solved);
    return { n, src, sol, cur };
  }

  // ---------- 💡 lights: every tap flips the lamp and its neighbours ----------
  function lightsPress(cells, n, i) {
    const x = i % n, y = (i / n) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < n && b < n) cells[b * n + a] = !cells[b * n + a]; }
    return cells;
  }
  function genLights(lvl) {
    const r = rng(seedOf('lights', lvl, 0));
    const n = lvl <= 6 ? 3 : lvl <= 16 ? 4 : lvl <= 32 ? 5 : 6;
    const k = lvl <= 6 ? Math.ceil(lvl / 2) : lvl <= 16 ? 2 + ((lvl - 7) >> 1) : lvl <= 32 ? 4 + ((lvl - 17) >> 1) : 8 + (lvl - 33);
    for (;;) {
      const sol = shuffle(r, seqOf(n * n, i => i)).slice(0, k), cells = new Array(n * n).fill(true);
      sol.forEach(i => lightsPress(cells, n, i));
      if (cells.filter(c => !c).length >= Math.min(3, k + 2)) return { n, cells, sol, par: k };
    }
  }

  // ---------- 🔢 sudoku (4×4 → 6×6 → 9×9), always exactly one solution ----------
  const sudokuShape = lvl => (lvl <= 12 ? { n: 4, bw: 2, bh: 2 } : lvl <= 28 ? { n: 6, bw: 3, bh: 2 } : { n: 9, bw: 3, bh: 3 });
  /** counts solutions up to `limit`. With r: random order, and the first solution stays in g. */
  function sudSolve(g, S, limit, r) {
    const { n, bw, bh } = S, per = n / bw, full = (1 << (n + 1)) - 2;
    const rows = new Array(n).fill(0), cols = new Array(n).fill(0), boxes = new Array(n).fill(0);
    const boxOf = i => (((i / n) | 0) / bh | 0) * per + (((i % n) / bw) | 0);
    for (let i = 0; i < n * n; i++) if (g[i]) { const bit = 1 << g[i]; rows[(i / n) | 0] |= bit; cols[i % n] |= bit; boxes[boxOf(i)] |= bit; }
    let count = 0;
    const go = () => {
      let best = -1, bestC = 0, bestN = 99;
      for (let i = 0; i < n * n; i++) if (!g[i]) {
        const c = full & ~(rows[(i / n) | 0] | cols[i % n] | boxes[boxOf(i)]); let k = 0; for (let t = c; t; t &= t - 1) k++;
        if (k < bestN) { best = i; bestC = c; bestN = k; if (k <= 1) break; }
      }
      if (best < 0) return ++count >= limit;
      if (!bestN) return false;
      let vals = []; for (let v = 1; v <= n; v++) if ((bestC >> v) & 1) vals.push(v);
      if (r) vals = shuffle(r, vals);
      const y = (best / n) | 0, x = best % n, bx = boxOf(best);
      for (const v of vals) {
        const bit = 1 << v; g[best] = v; rows[y] |= bit; cols[x] |= bit; boxes[bx] |= bit;
        if (go()) return true;
        g[best] = 0; rows[y] &= ~bit; cols[x] &= ~bit; boxes[bx] &= ~bit;
      }
      return false;
    };
    go(); return count;
  }
  function genSudoku(lvl) {
    const S = sudokuShape(lvl), n = S.n, r = rng(seedOf('sudoku', lvl, 0));
    const sol = new Array(n * n).fill(0); sudSolve(sol, S, 1, r);
    const target = n === 4 ? 4 + Math.floor((lvl - 1) * 0.6) : n === 6 ? 12 + Math.floor((lvl - 13) * 0.75) : Math.min(52, 36 + Math.floor((lvl - 29) * 1.6));
    const grid = sol.slice(); let blanks = 0;
    for (const i of shuffle(r, seqOf(n * n, k => k))) {
      if (blanks >= target) break;
      const keep = grid[i]; grid[i] = 0;
      if (sudSolve(grid.slice(), S, 2) === 1) blanks++; else grid[i] = keep;
    }
    return { n, bw: S.bw, bh: S.bh, sol, grid, blanks };
  }

  // ---------- 🔤 fix the word ----------
  const WORDS = ('قط🐱 يد✋ فم👄 دب🐻 كلب🐶 أسد🦁 بطة🦆 شمس☀️ قمر🌙 باب🚪 بحر🌊 جمل🐫 فيل🐘 موز🍌 تاج👑 نجم⭐ سمك🐟 قلم✏️ بيت🏠 ديك🐓 جبل⛰️ نار🔥 كرة⚽ عنب🍇 حوت🐋 جرس🔔 ' +
    'تفاح🍎 كتاب📖 حصان🐴 أرنب🐰 نحلة🐝 زهرة🌸 شجرة🌳 قطار🚆 خروف🐑 بقرة🐄 ساعة⏰ كرسي🪑 بطيخ🍉 هدية🎁 نملة🐜 سحاب☁️ مظلة☂️ ثعلب🦊 غزال🦌 خيمة⛺ قلعة🏰 كوكب🪐 بومة🦉 ' +
    'سيارة🚗 مفتاح🔑 طيارة✈️ فراشة🦋 زرافة🦒 مدرسة🏫 تمساح🐊 بطريق🐧 دراجة🚲 سفينة🚢 نظارة👓 صاروخ🚀 حقيبة🎒 ليمون🍋 ثعبان🐍 طماطم🍅 جيتار🎸 بركان🌋 روبوت🤖 مصباح💡 شاحنة🚚 عصفور🐦 سنجاب🐿️ طاووس🦚 ' +
    'برتقال🍊 سلحفاة🐢 تليفون📱 أخطبوط🐙 عنكبوت🕷️ مستشفى🏥 بالونة🎈 أناناس🍍 فراولة🍓 تلسكوب🔭 دولفين🐬 كاميرا📷 ' +
    'ديناصور🦖 كمبيوتر💻 مغناطيس🧲 أوتوبيس🚌 تلفزيون📺 باذنجان🍆 شوكولاتة🍫 هليكوبتر🚁 ميكروسكوب🔬')
    .split(' ').map(s => { const m = s.match(/^([ء-ي]+)(.+)$/); return { word: m[1], emoji: m[2], len: m[1].length }; })
    .sort((a, b) => a.len - b.len);
  const LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
  function genWord(lvl, round) {
    const r = rng(seedOf('words', lvl, round));
    const W = WORDS[Math.floor((lvl - 1) * (WORDS.length - 2) / (MAX - 1)) + (round || 0)];
    const extra = lvl >= 38 ? 3 : lvl >= 33 ? 2 : lvl >= 25 ? 1 : 0, chars = W.word.split('');
    const pool = LETTERS.split('').filter(ch => !chars.includes(ch));
    const all = chars.concat(shuffle(r, pool).slice(0, extra));
    let letters = shuffle(r, all);
    for (let t = 0; t < 20 && letters.slice(0, chars.length).join('') === W.word; t++) letters = shuffle(r, all);
    if (letters.join('') === W.word) letters.reverse();
    return { word: W.word, emoji: W.emoji, letters, extra };
  }

  // ---------- 🧠 memory ----------
  function genMem(lvl, round) {
    const r = rng(seedOf('mem', lvl, round));
    const tiles = lvl <= 6 ? 4 : lvl <= 14 ? 6 : lvl <= 24 ? 9 : lvl <= 32 ? 12 : 16;
    const len = 2 + Math.floor((lvl - 1) / 4) + (round || 0), seq = [];
    while (seq.length < len) { const t = ri(r, 0, tiles - 1); if (t !== seq[seq.length - 1]) seq.push(t); }
    return { tiles, seq, speed: Math.max(300, 800 - lvl * 12) };
  }

  const ROUNDS = { pipes: 1, lights: 1, sudoku: 1, seq: 3, odd: 3, math: 3, words: 2, mem: 2 };
  const GEN = { pipes: genPipes, lights: genLights, seq: genSeq, odd: genOdd, math: genMath, sudoku: genSudoku, words: genWord, mem: genMem };

  // ---------- 👧👦 players, stars, hints ----------
  const START = age => (age >= 9 ? 7 : age >= 8 ? 4 : 1);        // older kids may skip the baby levels
  const newKid = (id, name, age, av) => ({ id, name, age, av, hints: 5, prog: {}, gift: '' });
  function newState() {
    return { v: 1, current: '', sound: true, kids: [newKid('k1', 'اللاعب الأول', 9, '🦁'), newKid('k2', 'اللاعب التاني', 8, '🦊'), newKid('k3', 'اللاعب التالت', 6, '🐼')] };
  }
  function migrate(s) {
    if (!s || !Array.isArray(s.kids) || !s.kids.length) return newState();
    for (const k of s.kids) { if (!k.prog || typeof k.prog !== 'object') k.prog = {}; k.hints = Math.max(0, Number(k.hints) || 0); k.age = Number(k.age) || 8; if (!k.av) k.av = '🙂'; }
    if (s.sound === undefined) s.sound = true;
    return s;
  }
  const starsOf = (kid, g, lvl) => (kid.prog[g] && kid.prog[g][lvl]) || 0;
  function unlocked(kid, g) {
    let top = 0; const p = kid.prog[g] || {};
    for (const l in p) if (p[l] > 0) top = Math.max(top, Number(l));
    return Math.min(MAX, Math.max(START(kid.age), top + 1));
  }
  const totalStars = kid => GAME_IDS.reduce((s, g) => s + Object.values(kid.prog[g] || {}).reduce((a, b) => a + b, 0), 0);
  const passed = (kid, g) => Object.values(kid.prog[g] || {}).filter(v => v > 0).length;
  /** 3 ⭐ = no hints and at most one slip */
  function stars(st) {
    let s = 3;
    if (st.hints > 0 || st.mistakes > 1) s = 2;
    if (st.hints > 2 || st.mistakes > 4) s = 1;
    if (st.par && st.moves > st.par * 3) s = Math.min(s, 2);
    return s;
  }
  /** every first pass earns a hint 💡, a first perfect pass earns one more */
  function passLevel(kid, g, lvl, s) {
    const prev = starsOf(kid, g, lvl), gained = (prev === 0 ? 1 : 0) + (s === 3 && prev < 3 ? 1 : 0);
    if (!kid.prog[g]) kid.prog[g] = {};
    kid.prog[g][lvl] = Math.max(prev, s); kid.hints += gained;
    return { first: prev === 0, gained, best: kid.prog[g][lvl] };
  }
  function dailyGift(kid, today) { if (kid.gift === today) return 0; kid.gift = today; kid.hints += 2; return 2; }

  const api = { MAX, GAME_IDS, TIERS, tier, rng, seedOf, shuffle, ROUNDS, GEN, genSeq, genOdd, genMath, genPipes, pipesState, rotMask, pipesSize,
    genLights, lightsPress, genSudoku, sudSolve, sudokuShape, genWord, WORDS, genMem, OPS, PRIMES,
    START, newState, migrate, starsOf, unlocked, totalStars, passed, stars, passLevel, dailyGift };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZL = api;
})(this);
