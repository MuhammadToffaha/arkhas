// 🤖 A robot kid plays every game in a real (headless) browser, easy → extreme, and must win each time.
//    npm i playwright && npx playwright install chromium && node tests/play.test.js
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const LEVELS = (process.env.LEVELS || '1,2,8,16,24,32,40').split(',').map(Number);
const GAMES = ['pipes', 'lights', 'seq', 'odd', 'math', 'sudoku', 'words', 'mem'];
const url = 'file://' + path.resolve(__dirname, '../app/src/main/assets/www/index.html');
let failed = 0; const ok = (c, m) => { if (!c) { failed++; console.log('❌', m); } else if (process.env.VERBOSE) console.log('✅', m); };

// runs inside the page: solve the level that is on screen using the engine's known answers
async function robot({ game, lvl, useHint }) {
  const L = window.ZL, sleep = ms => new Promise(r => setTimeout(r, ms)), q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const until = async (f, ms = 15000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout ' + game + ' ' + lvl); await sleep(40); } };
  App.unpop(); q('#stage').dataset.round = ''; App.play(lvl);
  for (let rd = 0; rd < L.ROUNDS[game]; rd++) {
    await until(() => q('#stage').dataset.round === String(rd) && q('#stage').children.length > 0); await sleep(60);
    const p = L.GEN[game](lvl, rd);
    if (useHint && rd === 0) { if (game === 'mem') await until(() => q('#mAsk').textContent.includes('دورك')); App.hint(); await sleep(80); }
    if (game === 'seq') q(`.opt[data-v="${p.answer}"]`).click();
    if (game === 'math') qa('.opt').find(b => b.dataset.v === p.answer).click();
    if (game === 'odd') { qa('.bub')[p.wrongIdx].click(); await sleep(50); q(`.opt[data-v="${p.correct}"]`).click(); }
    if (game === 'pipes') for (let i = 0; i < p.cur.length; i++) {
      if (q(`.tile[data-i="${i}"]`).classList.contains('lk')) continue;
      let m = p.cur[i], k = 0; while (m !== p.sol[i]) { m = L.rotMask(m); k++; }
      while (k--) q(`.tile[data-i="${i}"]`).click();
    }
    if (game === 'lights') for (const i of p.sol) q(`.lamp[data-i="${i}"]`).click();
    if (game === 'sudoku') p.grid.forEach((v, i) => { if (!v && !q(`.sud button[data-i="${i}"]`).textContent) { q(`.sud button[data-i="${i}"]`).click(); q(`.pad button[data-v="${p.sol[i]}"]`).click(); } });
    if (game === 'words') for (let j = 0; j < p.word.length; j++) {
      if (qa('.slot')[j].classList.contains('lk')) continue;
      qa('.let').find(b => !b.classList.contains('used') && b.textContent === p.word[j]).click();
    }
    if (game === 'mem') { await until(() => q('#mAsk').textContent.includes('دورك'), 30000); for (const i of p.seq) { q(`.mem button[data-i="${i}"]`).click(); await sleep(30); } }
  }
  await until(() => q('#popBg').classList.contains('show') && q('.stars'));
  return { stars: qa('.stars span.on').length, gift: (q('.gift') || {}).textContent || '', tip: !!q('.tip'), hints: Number(q('#pHint').textContent.replace(/\D/g, '')) };
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const errs = [];
  const open = async (state) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/fonts.g*/**', r => r.abort());
    if (state) await p.addInitScript(s => { if (!localStorage.zakaa) localStorage.zakaa = s; }, JSON.stringify(state));
    await p.goto(url); return p;
  };
  const allOpen = () => {                                         // a 9-year-old with every level unlocked
    const prog = {}; for (const g of GAMES) { prog[g] = {}; for (let i = 1; i < 40; i++) prog[g][i] = 1; }
    return { v: 1, sound: false, current: '', kids: [{ id: 'k1', name: 'روبوت', age: 9, av: '🤖', hints: 50, prog, gift: new Date().toISOString().slice(0, 10) }] };
  };

  // 1) fresh install: three kids, start levels by age, locked levels stay locked, first win pays a hint
  let p = await open();
  ok(await p.locator('.kid').count() === 3, 'three players on first open');
  ok((await p.textContent('#kids')).includes('9 سنين') && (await p.textContent('#kids')).includes('6 سنين'), 'ages 9, 8, 6');
  await p.locator('.kid').nth(2).click();                          // the 6-year-old
  ok((await p.textContent('#hHints')).includes('7'), 'daily gift: 5 + 2 hints');
  await p.evaluate(() => App.openGame('seq'));
  ok(await p.locator('.lv button.lock').count() === 39, '6-year-old starts at level 1, the rest locked');
  await p.locator('.lv button').nth(5).click();
  ok(!(await p.evaluate(() => document.getElementById('v-play').classList.contains('on'))), 'a locked level does not open');
  await p.evaluate(() => { App.play(1); });
  const wrong = await p.evaluate(() => { const a = window.ZL.genSeq(1, 0).answer; const b = [...document.querySelectorAll('.opt')].find(x => x.dataset.v !== String(a)); b.click(); return b.className; });
  ok(wrong.includes('bad'), 'wrong answer turns red');
  let r = await p.evaluate(robot, { game: 'seq', lvl: 1 });
  ok(r.stars === 3 && r.gift.includes('+2') && r.tip && r.hints === 9, 'first perfect pass → 3⭐, +2 💡, smart tip ' + JSON.stringify(r));
  await p.evaluate(() => { App.unpop(); App.go('levels'); });
  ok(await p.locator('.lv button.lock').count() === 38, 'level 2 unlocked after passing level 1');
  await p.evaluate(() => { App.go('who'); }); await p.locator('.kid').nth(0).click(); await p.evaluate(() => App.openGame('math'));
  ok(await p.locator('.lv button.lock').count() === 33, '9-year-old starts with 7 levels open');
  await p.evaluate(() => App.settings());
  ok((await p.textContent('#pop')).includes('Designed by Muhammad Toffaha'), 'credit line in settings');
  await p.evaluate(() => App.onUpdate(JSON.stringify({ code: 9, name: 'x', notes: '', url: 'u' })));
  ok((await p.textContent('#pop')).includes('1.0.9'), 'update pop-up');

  // 1b) 👨‍👧‍👦 family time: charades round + activity ideas
  await p.evaluate(() => { App.unpop(); App.go('who'); });
  await p.locator('#v-who .fam').click();
  ok(await p.locator('.cats button').count() === 7, 'charades: 6 categories + mix');
  await p.evaluate(() => App.startCharades('food', 4));
  await p.waitForTimeout(2700);
  const w1 = await p.textContent('#chAr'), en1 = await p.textContent('#chEn');
  ok(/[ء-ي]/.test(w1) && /[A-Za-z]/.test(en1), 'charades card shows Arabic + English: ' + w1 + ' / ' + en1);
  await p.locator('.ch-btns .yes').click(); await p.locator('.ch-btns .yes').click(); await p.locator('.ch-btns button').first().click();
  ok((await p.textContent('#chAr')) !== w1, 'next word after a tap');
  await p.waitForFunction(() => !document.getElementById('chOv').classList.contains('show') && document.getElementById('popBg').classList.contains('show'), null, { timeout: 9000 });
  const res = await p.textContent('#pop');
  ok(res.includes('2 كلمة صح') && res.includes('رقم قياسي') && res.includes(w1), 'round ends on time with score + word list');
  await p.evaluate(() => { App.unpop(); App.famSet('tab', 'ideas'); });
  ok(await p.locator('.idea').count() >= 24 && await p.locator('.today').count() === 1, 'ideas list + idea of the day');
  await p.evaluate(() => App.famSet('type', 'sci')); ok(await p.locator('.idea').count() === 8, 'filter by type');
  await p.locator('.idea').first().click();
  ok((await p.textContent('#pop')).includes('الخطوات') && (await p.textContent('#pop')).includes('ليه؟'), 'idea shows materials, steps and why');
  await p.evaluate(() => App.ideaMark('volcano', 'done'));
  ok(await p.evaluate(() => JSON.parse(localStorage.zakaa).family.done.volcano === 1), 'done idea is saved');
  await p.evaluate(() => { App.unpop(); App.startCharades('mix', 30); }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => App.back()) && !(await p.evaluate(() => document.getElementById('chOv').classList.contains('show'))), 'back button stops a round');
  await p.close();

  // 2) the robot wins every game at every difficulty, with 3 stars
  await Promise.all(GAMES.map(async game => {
    const pg = await open(allOpen()); await pg.locator('.kid').first().click(); await pg.evaluate(g => App.openGame(g), game);
    for (const lvl of LEVELS) {
      try { const res = await pg.evaluate(robot, { game, lvl }); ok(res.stars === 3, `${game} level ${lvl} → ${res.stars}⭐`); }
      catch (e) { ok(false, `${game} level ${lvl}: ${e.message.split('\n')[0]}`); }
    }
    // 3) a hint costs one 💡, never breaks the level, and drops the result to 2 stars
    try {
      const before = await pg.evaluate(() => Number(document.getElementById('pHint').textContent.replace(/\D/g, '')));
      const res = await pg.evaluate(robot, { game, lvl: 12, useHint: true });
      ok(res.stars === 2, `${game} with a hint → ${res.stars}⭐ (expected 2)`);
      ok(res.hints === before - 1, `${game} hint cost exactly one 💡 (${before} → ${res.hints})`);
    } catch (e) { ok(false, `${game} hint: ${e.message.split('\n')[0]}`); }
    await pg.close(); console.log('🎮', game, 'done');
  }));

  ok(!errs.length, 'no JS errors: ' + errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failed ? `\n❌ ${failed} failed` : `\n🎉 robot won ${GAMES.length * LEVELS.length} levels + hint checks, no errors`);
  process.exit(failed ? 1 : 0);
})();
