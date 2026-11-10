// 🧪 node tests/logic.test.js — proves every one of the 320 levels is fair and solvable
const assert = require('assert');
const L = require('../app/src/main/assets/www/logic.js');

let n = 0; const t = (name, f) => { f(); n++; console.log('✅', name); };
const levels = Array.from({ length: L.MAX }, (_, i) => i + 1);
const each = (g, f) => { for (const lvl of levels) for (let rd = 0; rd < L.ROUNDS[g]; rd++) f(lvl, rd, L.GEN[g](lvl, rd)); };
const uniq = a => new Set(a).size === a.length;

t('same level = same puzzle (deterministic)', () => {
  for (const g of L.GAME_IDS) for (const lvl of [1, 13, 40]) assert.deepStrictEqual(L.GEN[g](lvl, 0), L.GEN[g](lvl, 0));
});

t('🔢 next number: 4 different choices, right one inside, rule really holds', () => {
  const kinds = new Set();
  each('seq', (lvl, rd, q) => {
    assert.strictEqual(q.options.length, 4); assert.ok(uniq(q.options)); assert.ok(q.options.includes(q.answer));
    const all = q.terms.concat(q.answer); assert.ok(all.every(v => Number.isInteger(v) && v > 0 && v < 100000), `seq ${lvl}`);
    kinds.add(q.kind);
    const d = all.slice(1).map((v, i) => v - all[i]);
    if (q.kind === 'add') assert.ok(d.every(x => x === q.p[1]));
    if (q.kind === 'sub') assert.ok(d.every(x => x === -q.p[1]));
    if (q.kind === 'mul') assert.ok(all.slice(1).every((v, i) => v === all[i] * q.p[1]));
    if (q.kind === 'fib') assert.ok(all.slice(2).every((v, i) => v === all[i] + all[i + 1]));
    if (q.kind === 'sq') assert.ok(all.every((v, i) => v === (q.p[0] + i) ** 2 + q.p[1]));
    if (q.kind === 'cube') assert.ok(all.every((v, i) => v === (q.p[0] + i) ** 3));
    if (q.kind === 'prime') assert.ok(all.every(v => v > 1 && [...Array(v).keys()].slice(2).every(k => v % k)));
    if (lvl <= 4) assert.ok(Math.max(...all) <= 80, 'easy levels stay small');
  });
  assert.ok(kinds.size >= 12, 'many kinds of rules: ' + kinds.size);
});

t('🔧 fix the row: exactly one wrong number, fix is among the choices', () => {
  each('odd', (lvl, rd, q) => {
    const diff = q.terms.map((v, i) => v !== q.fixed[i]);
    assert.strictEqual(diff.filter(Boolean).length, 1); assert.ok(diff[q.wrongIdx]);
    assert.ok(q.wrongIdx > 0 && q.wrongIdx < q.terms.length - 1, 'never the first or last');
    assert.ok(q.terms[q.wrongIdx] > 0 && !q.fixed.includes(q.terms[q.wrongIdx]));
    assert.ok(q.options.includes(q.correct) && uniq(q.options) && q.options.length === 4);
    assert.ok(!q.options.includes(q.terms[q.wrongIdx]), 'the broken number is not offered as the fix');
    assert.ok(!['alt', 'inter', 'interGeo', 'altMul'].includes(q.kind), 'only rules with one clear fix');
  });
});

t('🧮 equations: the answer works and no other choice does', () => {
  const ev = (text, ans) => {
    let s = text;
    if (ans.includes(' ')) ans.split(' ').forEach(op => { s = s.replace('❓', op); }); else s = s.split('❓').join(ans);
    const [l, r] = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').split('=');
    return Function(`return (${l}) === (${r})`)();
  };
  each('math', (lvl, rd, q) => {
    assert.ok(q.options.includes(q.answer) && uniq(q.options), `math ${lvl}`);
    assert.ok(ev(q.text, q.answer), `math ${lvl}/${rd}: ${q.text} with ${q.answer}`);
    assert.strictEqual(q.options.filter(o => ev(q.text, o)).length, 1, `math ${lvl}/${rd} one right choice: ${q.text}`);
    if (lvl <= 4) assert.ok(Number(q.answer) <= 10);
  });
});

t('🔌 pipes: stored solution lights everything, start is broken, pieces only rotated', () => {
  let last = 0;
  each('pipes', (lvl, rd, p) => {
    assert.ok(L.pipesState(p.n, p.sol, p.src).solved, `pipes ${lvl} solvable`);
    assert.ok(!L.pipesState(p.n, p.cur, p.src).solved, `pipes ${lvl} starts broken`);
    p.cur.forEach((m, i) => { let v = m, ok = false; for (let k = 0; k < 4; k++) { if (v === p.sol[i]) ok = true; v = L.rotMask(v); } assert.ok(ok); assert.ok(p.sol[i] > 0); });
    assert.ok(p.n >= last); last = p.n;
  });
  assert.strictEqual(L.genPipes(1).n, 3); assert.strictEqual(L.genPipes(40).n, 8);
});

t('💡 lights: pressing the stored solution turns every lamp on', () => {
  each('lights', (lvl, rd, g) => {
    assert.ok(g.cells.some(c => !c), `lights ${lvl} not already solved`);
    const c = g.cells.slice(); g.sol.forEach(i => L.lightsPress(c, g.n, i));
    assert.ok(c.every(Boolean), `lights ${lvl}`); assert.ok(uniq(g.sol)); assert.strictEqual(g.par, g.sol.length);
  });
  assert.strictEqual(L.genLights(1).sol.length, 1, 'level 1 = one tap');
});

t('🔢 sudoku: valid, exactly ONE solution, gets emptier', () => {
  const t0 = Date.now(); let last = { n: 0, blanks: 0 };
  each('sudoku', (lvl, rd, s) => {
    const { n, bw, bh } = s;
    for (let i = 0; i < n; i++) {
      assert.strictEqual(new Set(s.sol.slice(i * n, i * n + n)).size, n);
      assert.strictEqual(new Set(s.sol.filter((_, k) => k % n === i)).size, n);
    }
    for (let by = 0; by < n; by += bh) for (let bx = 0; bx < n; bx += bw) {
      const box = []; for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) box.push(s.sol[(by + y) * n + bx + x]);
      assert.strictEqual(new Set(box).size, n);
    }
    s.grid.forEach((v, i) => assert.ok(v === 0 || v === s.sol[i]));
    assert.strictEqual(L.sudSolve(s.grid.slice(), s, 2), 1, `sudoku ${lvl} unique`);
    assert.strictEqual(s.grid.filter(v => !v).length, s.blanks);
    if (n === last.n) assert.ok(s.blanks >= last.blanks - 1, `sudoku ${lvl} not easier than before`);
    last = s;
  });
  assert.strictEqual(L.genSudoku(1).blanks, 4); assert.ok(L.genSudoku(40).blanks >= 48, '9×9 extreme: ' + L.genSudoku(40).blanks);
  assert.ok(Date.now() - t0 < 20000, 'generation is fast');
});

t('🔤 words: letters make the word, scrambled, long + extra letters at the end', () => {
  const seen = new Set();
  each('words', (lvl, rd, w) => {
    const pool = w.letters.slice(); for (const ch of w.word) { const i = pool.indexOf(ch); assert.ok(i >= 0, w.word); pool.splice(i, 1); }
    assert.strictEqual(pool.length, w.extra); assert.notStrictEqual(w.letters.join(''), w.word);
    assert.ok(!seen.has(w.word), 'no word twice: ' + w.word); seen.add(w.word);
  });
  assert.ok(L.genWord(1, 0).word.length <= 3); assert.ok(L.genWord(40, 1).word.length >= 7);
  assert.ok(L.WORDS.every(w => /^[ء-ي]+$/.test(w.word) && w.emoji));
});

t('🧠 memory: grows longer and faster', () => {
  each('mem', (lvl, rd, m) => { assert.ok(m.seq.every(i => i >= 0 && i < m.tiles)); assert.ok(m.seq.every((v, i) => v !== m.seq[i - 1])); });
  assert.strictEqual(L.genMem(1, 0).seq.length, 2); assert.ok(L.genMem(40, 1).seq.length >= 12); assert.ok(L.genMem(40, 0).speed < L.genMem(1, 0).speed);
});

t('⭐ stars, 💡 hints, 🔓 unlocks', () => {
  const s = L.newState(), [k9, k8, k6] = s.kids;
  assert.deepStrictEqual([k9.age, k8.age, k6.age], [9, 8, 6]);
  assert.strictEqual(L.unlocked(k6, 'seq'), 1); assert.strictEqual(L.unlocked(k8, 'seq'), 4); assert.strictEqual(L.unlocked(k9, 'seq'), 7);
  assert.strictEqual(L.stars({ hints: 0, mistakes: 1 }), 3); assert.strictEqual(L.stars({ hints: 1, mistakes: 0 }), 2); assert.strictEqual(L.stars({ hints: 3, mistakes: 0 }), 1);
  assert.strictEqual(L.stars({ hints: 0, mistakes: 0, par: 2, moves: 9 }), 2);
  let r = L.passLevel(k6, 'seq', 1, 2); assert.deepStrictEqual([r.first, r.gained, k6.hints], [true, 1, 6]);      // pass → +1 hint
  r = L.passLevel(k6, 'seq', 1, 3); assert.deepStrictEqual([r.first, r.gained, k6.hints], [false, 1, 7]);          // first perfect → +1
  r = L.passLevel(k6, 'seq', 1, 3); assert.strictEqual(r.gained, 0);                                              // no farming
  r = L.passLevel(k6, 'seq', 1, 1); assert.strictEqual(L.starsOf(k6, 'seq', 1), 3);                               // best is kept
  assert.strictEqual(L.unlocked(k6, 'seq'), 2); assert.strictEqual(L.totalStars(k6), 3);
  L.passLevel(k6, 'seq', 40, 1); assert.strictEqual(L.unlocked(k6, 'seq'), 40);
  assert.strictEqual(L.dailyGift(k8, '2026-11-10'), 2); assert.strictEqual(L.dailyGift(k8, '2026-11-10'), 0);
  assert.strictEqual(L.migrate(null).kids.length, 3); assert.deepStrictEqual(L.migrate({ kids: [{ id: 'a', name: 'x' }] }).kids[0].prog, {});
});

console.log(`\n🎉 ${n} test groups passed — ${L.GAME_IDS.length} games × ${L.MAX} levels`);
