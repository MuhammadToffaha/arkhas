/* 🧠 ذكاء — UI. Native bridge = window.Zk (Kotlin). Falls back to localStorage in a normal browser. */
(function () {
  'use strict';
  const L = window.ZL;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = window.Zk || {
    load: () => localStorage.getItem('zakaa') || '', save: s => localStorage.setItem('zakaa', s),
    version: () => '1.0.dev', versionCode: () => 0, checkUpdate: () => App.onUpdate(''), installUpdate: () => {},
    getPref: (k, d) => localStorage.getItem('p_' + k) ?? d, setPref: (k, v) => localStorage.setItem('p_' + k, v), openUrl: u => window.open(u)
  };

  const GAMES = {
    pipes: { name: 'صلّح الكهرباء', icon: '🔌', c: '#e08a00', cd: '#a86700', how: 'دوس على أي قطعة عشان تلف. وصّل كل الأسلاك بالبطارية ⚡ لحد ما كله ينوّر.',
      tips: ['ابدأ من الأركان والحواف: السلك مينفعش يطلع بره اللوحة.', 'القطعة اللي ليها طرف واحد دي لمبة… لازم طرفها يبص على سلك.', 'لو قطعة مالهاش غير وضع واحد ينفع، ثبّتها وكمّل من عندها.', 'كل الأسلاك لازم تبقى شبكة واحدة من غير أطراف سايبة.'] },
    lights: { name: 'نوّر اللمبات', icon: '💡', c: '#f97316', cd: '#c2530a', how: 'كل دوسة بتقلب اللمبة واللي حواليها (فوق وتحت ويمين وشمال). نوّرهم كلهم!',
      tips: ['الدوس على نفس اللمبة مرتين كأنك ماعملتش حاجة.', 'الترتيب مش مهم! المهم أنهي لمبات تدوس عليها.', 'ابدأ بالصف اللي فوق، وصلّح كل صف باللي تحته.', 'اللمبة اللي في الركن بتقلب 3 بس، واللي في النص بتقلب 5.'] },
    seq: { name: 'الرقم اللي جاي', icon: '🔢', c: '#7c5cff', cd: '#5a3fd6', how: 'الأرقام ماشية بسر معيّن. اكتشف السر واختار الرقم اللي جاي.',
      tips: ['احسب الفرق بين كل رقم واللي بعده… ده أول مفتاح.', 'لو الفرق مش ثابت، شوف الفرق نفسه بيكبر إزاي.', 'لو الأرقام بتكبر بسرعة أوي، يبقى في ضرب مش جمع.', 'ساعات بيبقوا سلسلتين داخلين في بعض: بُص على رقم وسيب رقم.'] },
    odd: { name: 'صلّح السلسلة', icon: '🔧', c: '#e83e8c', cd: '#b82468', how: 'في رقم واحد بايظ في السلسلة! دوس عليه، وبعدين اختار الرقم الصح.',
      tips: ['أول رقم وآخر رقم دايماً سليمين… البايظ في النص.', 'دوّر على المكان اللي الفرق فيه «مختلف» عن الباقي.', 'الرقم البايظ بيبوّظ الفرق اللي قبله واللي بعده مع بعض.', 'بعد ما تصلّح، راجع السلسلة كلها من الأول.'] },
    math: { name: 'صلّح المعادلة', icon: '🧮', c: '#0ea5e9', cd: '#0b7fb5', how: 'في حاجة ناقصة من المعادلة. كمّلها عشان الناحيتين يبقوا زي بعض.',
      tips: ['امشي بالعكس: الجمع عكسه الطرح، والضرب عكسه القسمة.', 'جرّب الاختيارات واحد واحد لو احترت.', 'احسب اللي جوه القوس الأول دايماً.', 'لو نفس الرقم مكرر في كل ❓، جرّب أرقام صغيرة وكبّر.'] },
    sudoku: { name: 'سودوكو', icon: '🧩', c: '#22b573', cd: '#17875a', how: 'كل صف، وكل عمود، وكل مربع ملوّن لازم يبقى فيه كل الأرقام من غير تكرار.',
      tips: ['ابدأ بالصف أو العمود اللي ناقصه خانة واحدة بس.', 'اسأل نفسك: الرقم ده ينفع يتحط فين في المربع ده؟', 'لو خانة مينفعش فيها غير رقم واحد… هو ده!', 'متخمّنش. كل خانة ليها سبب.'] },
    words: { name: 'رتّب الحروف', icon: '🔤', c: '#a855f7', cd: '#7e36c9', how: 'الحروف متلخبطة! رتّبها عشان تكتب اسم الصورة.',
      tips: ['قول اسم الصورة بصوت عالي واسمع أول حرف.', 'دوّر على الحرف الأخير… ساعات بيبقى «ة».', 'في المستويات الصعبة في حروف زيادة مالهاش لازمة!', 'لو غلطت، دوس على الحرف في الخانة عشان يرجع.'] },
    mem: { name: 'الذاكرة الخارقة', icon: '🧠', c: '#14b8a6', cd: '#0d8a7c', how: 'ركّز في المربعات وهي بتنوّر، وبعدين دوس عليهم بنفس الترتيب.',
      tips: ['قسّم الترتيب لمجموعات صغيرة: 3 و 3.', 'قول الألوان في سرّك زي أغنية.', 'ارسم الطريق بعينك كأنه خط واحد.', 'خد نَفَس وركّز… السرعة مش مهمة.'] }
  };
  const AVATARS = ['🦁', '🦊', '🐼', '🐯', '🐰', '🦄', '🐸', '🐵', '🦖', '🐙', '🚀', '⚽', '🌟', '👑'];

  let S, kid = null, game = null, lvl = 0, round = 0, ctl = null, stats = null, timers = [];
  const today = () => new Date().toISOString().slice(0, 10);
  const later = (f, ms) => { const h = setTimeout(f, ms); timers.push(h); return h; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function load() {
    let raw = ''; try { raw = N.load(); } catch (e) {} try { S = L.migrate(raw ? JSON.parse(raw) : null); } catch (e) { S = L.newState(); }
    if (!S.family || typeof S.family !== 'object') S.family = {}; S.family.done = S.family.done || {}; S.family.fav = S.family.fav || {}; S.family.best = S.family.best || 0;
  }
  function save() { try { N.save(JSON.stringify(S)); } catch (e) {} }
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), 2400); }
  function pop(html) { $('pop').innerHTML = html; $('popBg').classList.add('show'); }
  function unpop() { $('popBg').classList.remove('show'); }

  // ---------- 🔊 sound ----------
  let ac;
  function tone(f, d, type, when) {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + (when || 0);
      o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
    } catch (e) {}
  }
  const sfx = {
    tap: () => tone(520, 0.06), ok: () => { tone(660, 0.1); tone(880, 0.16, 'sine', 0.1); }, bad: () => tone(170, 0.22, 'square'),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', i * 0.12)), note: i => tone(330 + i * 45, 0.25, 'triangle')
  };

  // ---------- navigation ----------
  function go(v) {
    clearTimers(); ctl = null;
    for (const x of ['who', 'home', 'levels', 'play', 'family']) $('v-' + x).classList.toggle('on', x === v);
    const g = GAMES[game]; const plain = v === 'who' || v === 'home' || v === 'family' || !g; document.documentElement.style.setProperty('--c', plain ? '#7c5cff' : g.c);
    document.documentElement.style.setProperty('--cd', plain ? '#5a3fd6' : g.cd);
    if (v === 'who') renderWho(); if (v === 'home') renderHome(); if (v === 'levels') renderLevels(); if (v === 'family') renderFamily();
    window.scrollTo(0, 0);
  }

  function renderWho() {
    $('kids').innerHTML = S.kids.map(k => `<div class="toy kid" onclick="App.pickKid('${k.id}')">
      <div class="av" style="background:${['#ffe1b3', '#d9ceff', '#c6f1dd'][S.kids.indexOf(k) % 3]}">${k.av}</div>
      <div><b>${esc(k.name)}</b><span>${k.age} سنين • ⭐ ${L.totalStars(k)} • 💡 ${k.hints}</span></div>
      <button class="ed" onclick="event.stopPropagation();App.editKid('${k.id}')">✏️</button></div>`).join('');
  }
  function pickKid(id) {
    kid = S.kids.find(k => k.id === id); S.current = id;
    const gift = L.dailyGift(kid, today()); save(); go('home');
    if (gift) toast(`🎁 هدية النهارده يا ${kid.name}: +${gift} 💡`);
  }
  function editKid(id) {
    const k = S.kids.find(x => x.id === id); App._av = k.av;
    pop(`<h3>✏️ بيانات اللاعب</h3>
      <div class="field"><label>الاسم</label><input id="kName" maxlength="14" value="${esc(k.name)}"></div>
      <div class="field"><label>السن</label><select id="kAge">${[4, 5, 6, 7, 8, 9, 10, 11, 12].map(a => `<option ${a === k.age ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="field"><label>الصورة</label><div class="avs">${AVATARS.map(a => `<button class="${a === k.av ? 'on' : ''}" onclick="App._av='${a}';this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this))">${a}</button>`).join('')}</div></div>
      <div class="row2"><button class="btn" onclick="App.saveKid('${id}')">💾 حفظ</button><button class="btn ghost" onclick="App.unpop()">إلغاء</button></div>
      <button style="margin-top:14px;color:var(--bad);font-weight:700" onclick="App.askReset('${id}')">🗑️ امسح تقدّم اللاعب ده</button>`);
  }
  function saveKid(id) {
    const k = S.kids.find(x => x.id === id);
    k.name = $('kName').value.trim() || k.name; k.age = Number($('kAge').value) || k.age; k.av = App._av || k.av;
    save(); unpop(); renderWho();
  }
  function askReset(id) {
    pop(`<div class="big">⚠️</div><p>تمسح كل النجوم والمستويات بتاعة اللاعب ده؟</p>
      <div class="row2"><button class="btn" style="background:var(--bad);box-shadow:0 6px 0 #b82c3a" onclick="App.doReset('${id}')">امسح</button><button class="btn ghost" onclick="App.unpop()">لا</button></div>`);
  }
  function doReset(id) { const k = S.kids.find(x => x.id === id); k.prog = {}; k.hints = 5; save(); unpop(); renderWho(); toast('🧹 اتمسح'); }

  function hud() {
    $('hAv').textContent = kid.av; $('hName').textContent = kid.name;
    $('hStars').textContent = '⭐ ' + L.totalStars(kid); $('hHints').textContent = '💡 ' + kid.hints;
    $('lHints').textContent = '💡 ' + kid.hints; $('pHint').textContent = '💡 ' + kid.hints;
  }
  function renderHome() {
    hud();
    $('games').innerHTML = L.GAME_IDS.map(id => {
      const g = GAMES[id], done = L.passed(kid, id), next = L.unlocked(kid, id);
      return `<button class="toy game" style="--c:${g.c}" onclick="App.openGame('${id}')"><div class="gi">${g.icon}</div><b>${g.name}</b>
        <span>${done >= L.MAX ? '🏆 خلّصتها!' : 'مستوى ' + next + ' • ' + L.TIERS[L.tier(next)]}</span><div class="bar"><i style="width:${done / L.MAX * 100}%"></i></div></button>`;
    }).join('');
  }
  function openGame(id) { game = id; go('levels'); }
  function renderLevels() {
    const g = GAMES[game], open = L.unlocked(kid, game); hud();
    $('lTitle').textContent = g.icon + ' ' + g.name; $('lHow').textContent = g.how;
    const ICON = ['🌱', '🌿', '🔥', '⚡', '👑'];
    $('lBody').innerHTML = L.TIERS.map((name, t) => `<div class="tier">${ICON[t]} ${name}<i></i></div><div class="lv">` +
      Array.from({ length: 8 }, (_, i) => {
        const n = t * 8 + i + 1, st = L.starsOf(kid, game, n), cls = st ? 'done' : n <= open ? (n === open ? 'open' : '') : 'lock';
        return `<button class="${cls}" ${n <= open ? `onclick="App.play(${n})"` : `onclick="App.locked()"`}>${n <= open ? n : '🔒'}<small>${st ? '⭐'.repeat(st) : ''}</small></button>`;
      }).join('') + '</div>').join('');
    const el = document.querySelector('#lBody .open'); if (el) later(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
  }

  // ---------- ▶️ playing ----------
  function play(n) {
    lvl = n; round = 0; stats = { hints: 0, mistakes: 0, moves: 0, par: 0 };
    go('play'); $('pTitle').textContent = `مستوى ${lvl}`; hud(); startRound();
  }
  function startRound() {
    $('pDots').innerHTML = L.ROUNDS[game] > 1 ? Array.from({ length: L.ROUNDS[game] }, (_, i) => `<i class="${i < round ? 'on' : ''}"></i>`).join('') : '';
    const host = $('stage'); host.innerHTML = ''; host.dataset.round = round;
    ctl = MODS[game](L.GEN[game](lvl, round), host);
  }
  function roundDone() {
    sfx.ok(); round++;
    $('pDots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < round));
    if (round < L.ROUNDS[game]) later(startRound, 900); else later(finish, 700);
  }
  function mistake(el) { stats.mistakes++; sfx.bad(); if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } }
  function hint() {
    if (!ctl || !ctl.hint) return;
    if (kid.hints <= 0) return toast('💡 خلصت التلميحات! عدّي مستوى جديد عشان تكسب تلميح');
    if (ctl.hint() === false) return;
    kid.hints--; stats.hints++; save(); hud();
  }
  function quit() { clearTimers(); go('levels'); }
  function finish() {
    const s = L.stars(stats), r = L.passLevel(kid, game, lvl, s), g = GAMES[game], last = lvl >= L.MAX;
    save(); hud(); sfx.win(); confetti();
    const newTier = !last && L.tier(lvl + 1) !== L.tier(lvl);
    pop(`<div class="stars">${[1, 2, 3].map(i => `<span class="${i <= s ? 'on' : ''}">⭐</span>`).join('')}</div>
      <h3>${last ? '🏆 بطل الأبطال!' : s === 3 ? 'ممتاز يا ' + esc(kid.name) + '!' : s === 2 ? 'برافو يا ' + esc(kid.name) + '!' : 'عدّيت يا ' + esc(kid.name) + '!'}</h3>
      ${r.gained ? `<div class="gift">+${r.gained} 💡 تلميح هدية</div>` : ''}
      ${newTier ? `<p>🚀 فتحت مرحلة «${L.TIERS[L.tier(lvl + 1)]}»</p>` : last ? '<p>خلّصت كل مستويات اللعبة دي 🎉</p>' : ''}
      <div class="tip">🧠 <b>سر ذكي:</b> ${g.tips[(lvl - 1) % g.tips.length]}</div>
      ${last ? '' : `<button class="btn" onclick="App.unpop();App.play(${lvl + 1})">المستوى اللي بعده ◀</button>`}
      <div class="row2" style="margin-top:12px"><button class="btn ghost" onclick="App.unpop();App.play(${lvl})">🔁 تاني</button><button class="btn ghost" onclick="App.unpop();App.go('levels')">📋 المستويات</button></div>`);
  }
  function confetti() {
    for (let i = 0; i < 18; i++) {
      const c = document.createElement('div'); c.className = 'confetti'; c.textContent = ['🎉', '⭐', '✨', '🎈', '💡'][i % 5];
      c.style.left = Math.random() * 96 + 'vw'; c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; c.style.animationDelay = Math.random() * 0.5 + 's';
      document.body.appendChild(c); setTimeout(() => c.remove(), 4000);
    }
  }

  // shared: answer buttons
  function options(host, opts, answer, onRight) {
    const box = host.querySelector('.opts'); let done = false;
    box.innerHTML = opts.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    box.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
      if (done || b.classList.contains('bad') || b.classList.contains('gone')) return;
      if (b.dataset.v === String(answer)) { done = true; b.classList.add('good'); onRight(); }
      else { b.classList.add('bad'); mistake(b); }
    }; });
    return { remove(k) { [...box.querySelectorAll('.opt')].filter(b => b.dataset.v !== String(answer) && !b.classList.contains('bad') && !b.classList.contains('gone')).slice(0, k).forEach(b => b.classList.add('gone')); } };
  }
  const explain = (host, text) => { const e = host.querySelector('.explain'); e.hidden = false; e.textContent = '💡 ' + text; };

  const MODS = {
    seq(q, host) {
      host.innerHTML = `<div class="ask">إيه الرقم اللي جاي؟ 🤔</div><div class="bubbles">${q.terms.map(t => `<span class="bub">${t}</span>`).join('')}<span class="bub q">❓</span></div>
        <div class="explain" hidden></div><div class="opts"></div>`;
      const o = options(host, q.options, q.answer, () => { const b = host.querySelector('.q'); b.textContent = q.answer; b.className = 'bub good'; roundDone(); });
      let used = 0; return { hint() { if (used++ > 1) return false; explain(host, q.explain); o.remove(used === 1 ? 1 : 2); } };
    },

    odd(q, host) {
      host.innerHTML = `<div class="ask">🔧 في رقم واحد بايظ… دوس عليه!</div><div class="bubbles">${q.terms.map((t, i) => `<button class="bub" data-i="${i}">${t}</button>`).join('')}</div>
        <div class="explain" hidden></div><div class="opts"></div>`;
      let found = false, o = null, used = 0;
      const bubs = [...host.querySelectorAll('.bub')];
      const reveal = () => {
        found = true; const b = bubs[q.wrongIdx]; b.classList.remove('pulse'); b.textContent = '❓'; b.classList.add('q');
        host.querySelector('.ask').textContent = '👍 لقيته! إيه الرقم الصح مكانه؟';
        o = options(host, q.options, q.correct, () => { b.textContent = q.correct; b.className = 'bub good'; roundDone(); });
      };
      bubs.forEach((b, i) => { b.onclick = () => { if (found || b.classList.contains('dead')) return; if (i === q.wrongIdx) { sfx.tap(); reveal(); } else { b.classList.add('dead'); mistake(b); } }; });
      return { hint() {
        if (used++ > 2) return false; explain(host, q.explain);
        if (!found) { if (used > 1) bubs[q.wrongIdx].classList.add('pulse'); } else o.remove(2);
      } };
    },

    math(q, host) {
      const show = t => esc(t).replace(/❓/g, '<span style="color:var(--c)">❓</span>');
      host.innerHTML = `<div class="ask">🧮 كمّل المعادلة</div>${q.same ? '<div class="note">نفس الرقم في كل ❓</div>' : q.pair ? '<div class="note">اختار العلامتين بالترتيب</div>' : ''}
        <div class="eq">${show(q.text)}</div><div class="explain" hidden></div><div class="opts"></div>`;
      const o = options(host, q.options, q.answer, () => {
        let t = q.text; if (q.pair) q.answer.split(' ').forEach(op => { t = t.replace('❓', op); }); else t = t.split('❓').join(q.answer);
        const e = host.querySelector('.eq'); e.textContent = t; e.classList.add('good'); roundDone();
      });
      let used = 0; return { hint() { if (used++ > 1) return false; if (used === 1) o.remove(2); else explain(host, q.explain); } };
    },

    pipes(p, host) {
      const cur = p.cur.slice(), locked = new Set(); let done = false;
      host.innerHTML = `<div class="ask">🔌 لف القطع ووصّل الكهرباء</div><div class="board" style="grid-template-columns:repeat(${p.n},1fr)"></div>`;
      const board = host.querySelector('.board');
      const svg = (m, lit, src) => {
        const c = lit ? '#ffb703' : '#8f97ad', leaf = !src && (m & (m - 1)) === 0;
        const ln = (x, y) => `<line x1="50" y1="50" x2="${x}" y2="${y}"/>`;
        return `<svg viewBox="0 0 100 100"><g stroke="${c}" stroke-width="18">${m & 1 ? ln(50, 0) : ''}${m & 2 ? ln(100, 50) : ''}${m & 4 ? ln(50, 100) : ''}${m & 8 ? ln(0, 50) : ''}</g>` +
          (src ? '<circle cx="50" cy="50" r="30" fill="#22b573"/><text x="50" y="66" text-anchor="middle" font-size="44">⚡</text>'
            : leaf ? `<circle cx="50" cy="50" r="26" fill="${lit ? '#fff3c9' : '#5b528c'}" stroke="${c}" stroke-width="8"/><text x="50" y="65" text-anchor="middle" font-size="40" opacity="${lit ? 1 : 0.35}">💡</text>`
              : `<circle cx="50" cy="50" r="9" fill="${c}"/>`) + '</svg>';
      };
      const draw = () => {
        const st = L.pipesState(p.n, cur, p.src);
        board.innerHTML = cur.map((m, i) => `<button class="tile${locked.has(i) ? ' lk' : ''}" data-i="${i}">${svg(m, st.lit[i], i === p.src)}</button>`).join('');
        if (st.solved && !done) { done = true; roundDone(); }
      };
      board.onclick = e => {
        const b = e.target.closest('.tile'); if (!b || done) return; const i = Number(b.dataset.i);
        if (locked.has(i)) return toast('📌 القطعة دي متثبتة صح');
        cur[i] = L.rotMask(cur[i]); stats.moves++; sfx.tap(); draw();
      };
      draw();
      return { hint() {
        const bad = cur.map((m, i) => i).filter(i => cur[i] !== p.sol[i] && !locked.has(i)); if (!bad.length || done) return false;
        const i = bad[Math.floor(Math.random() * bad.length)]; cur[i] = p.sol[i]; locked.add(i); draw();
      } };
    },

    lights(g, host) {
    const cells = g.cells.slice(), pressed = new Set(); let done = false, mark = -1; stats.par = g.par;
    host.innerHTML = `<div class="ask">💡 نوّر كل اللمبات!</div><div class="note">أحسن حل: ${g.par} ${g.par === 1 ? 'دوسة' : 'دوسات'} • دوساتك: <b id="mv">0</b></div>
      <div class="board" style="grid-template-columns:repeat(${g.n},1fr);gap:8px;padding:12px"></div>`;
    const board = host.querySelector('.board');
    const draw = () => { board.innerHTML = cells.map((on, i) => `<button class="lamp${on ? ' on' : ''}${i === mark ? ' pulse' : ''}" data-i="${i}">💡</button>`).join(''); };
    board.onclick = e => {
      const b = e.target.closest('.lamp'); if (!b || done) return; const i = Number(b.dataset.i);
      L.lightsPress(cells, g.n, i); if (pressed.has(i)) pressed.delete(i); else pressed.add(i);
      if (i === mark) mark = -1;
      stats.moves++; host.querySelector('#mv').textContent = stats.moves; sfx.tap(); draw();
      if (cells.every(Boolean)) { done = true; roundDone(); }
    };
    draw();
    return { hint() {
      if (done || mark >= 0) return false;
      const left = g.sol.filter(i => !pressed.has(i)).concat([...pressed].filter(i => !g.sol.includes(i))); if (!left.length) return false;
      mark = left[0]; draw(); toast('👆 دوس على اللمبة اللي بتنبض');
    } };
    },

    sudoku(s, host) {
      const g = s.grid.slice(), n = s.n, fruit = lvl <= 4 ? ['', '🍎', '🍌', '🍇', '🍓'] : null; let sel = -1, done = false;
      const face = v => (v ? (fruit ? fruit[v] : v) : '');
      host.innerHTML = `<div class="ask">🧩 كمّل المربع</div><div class="note">دوس على خانة فاضية وبعدين اختار ${fruit ? 'الفاكهة' : 'الرقم'}</div>
        <div class="sud" style="grid-template-columns:repeat(${n},1fr)"></div><div class="pad" style="grid-template-columns:repeat(${n <= 6 ? n : 5},minmax(0,54px))"></div>`;
      const board = host.querySelector('.sud'), pad = host.querySelector('.pad');
      pad.innerHTML = Array.from({ length: n }, (_, i) => `<button data-v="${i + 1}">${face(i + 1)}</button>`).join('');
      const draw = () => {
        board.innerHTML = g.map((v, i) => {
          const x = i % n, y = (i / n) | 0, alt = (((x / s.bw) | 0) + ((y / s.bh) | 0)) % 2;
          return `<button data-i="${i}" class="${s.grid[i] ? 'gv ' : ''}${alt ? 'b2 ' : ''}${i === sel ? 'sel ' : ''}${(x + 1) % s.bw === 0 && x < n - 1 ? 'bx ' : ''}${(y + 1) % s.bh === 0 && y < n - 1 ? 'by' : ''}">${face(v)}</button>`;
        }).join('');
      };
      const check = () => { if (!done && g.every(Boolean)) { done = true; roundDone(); } };
      board.onclick = e => { const b = e.target.closest('button'); if (!b || done) return; const i = Number(b.dataset.i); if (g[i]) return; sel = i; sfx.tap(); draw(); };
      pad.onclick = e => {
        const b = e.target.closest('button'); if (!b || done) return; const v = Number(b.dataset.v);
        if (sel < 0) return toast('👆 اختار خانة فاضية الأول');
        if (s.sol[sel] === v) { g[sel] = v; sel = -1; sfx.tap(); draw(); check(); }
        else { const c = board.children[sel]; c.classList.add('no'); mistake(c); later(() => c.classList.remove('no'), 500); }
      };
      draw();
      return { hint() {
        const empty = g.map((v, i) => i).filter(i => !g[i]); if (!empty.length || done) return false;
        const i = sel >= 0 && !g[sel] ? sel : empty[Math.floor(Math.random() * empty.length)];
        g[i] = s.sol[i]; sel = -1; draw(); board.children[i].classList.add('sel'); check();
      } };
    },

    words(w, host) {
      const len = w.word.length, slots = new Array(len).fill(-1), lock = new Set(); let done = false;
      host.innerHTML = `<div class="pic">${w.emoji}</div><div class="ask">🔤 رتّب الحروف واكتب اسم الصورة</div>${w.extra ? `<div class="note">خلّي بالك: في ${w.extra === 1 ? 'حرف زيادة' : w.extra + ' حروف زيادة'}!</div>` : ''}
        <div class="slots"></div><div class="letters"></div>`;
      const sl = host.querySelector('.slots'), lt = host.querySelector('.letters');
      const draw = () => {
        sl.innerHTML = slots.map((t, j) => `<button class="slot${lock.has(j) ? ' lk' : ''}" data-j="${j}">${t >= 0 ? w.letters[t] : ''}</button>`).join('');
        lt.innerHTML = w.letters.map((ch, t) => `<button class="let${slots.includes(t) ? ' used' : ''}" data-t="${t}">${ch}</button>`).join('');
      };
      const check = () => {
        if (slots.includes(-1)) return;
        if (slots.map(t => w.letters[t]).join('') === w.word) {
          done = true; sl.innerHTML = `<div class="word">${w.word} ✅</div>`; lt.innerHTML = ''; roundDone();
        } else { mistake(sl); later(() => { slots.forEach((t, j) => { if (!lock.has(j)) slots[j] = -1; }); draw(); }, 600); }
      };
      lt.onclick = e => { const b = e.target.closest('.let'); if (!b || done) return; const t = Number(b.dataset.t); if (slots.includes(t)) return; const j = slots.indexOf(-1); if (j < 0) return; slots[j] = t; sfx.tap(); draw(); check(); };
      sl.onclick = e => { const b = e.target.closest('.slot'); if (!b || done) return; const j = Number(b.dataset.j); if (lock.has(j) || slots[j] < 0) return; slots[j] = -1; sfx.tap(); draw(); };
      draw();
      return { hint() {
        if (done) return false;
        const j = slots.findIndex((t, k) => !lock.has(k) && (t < 0 || w.letters[t] !== w.word[k])); if (j < 0) return false;
        const lockedTiles = [...lock].map(k => slots[k]);
        const t = w.letters.findIndex((ch, i) => ch === w.word[j] && !lockedTiles.includes(i));
        const from = slots.indexOf(t); if (from >= 0) slots[from] = -1;
        slots[j] = t; lock.add(j); draw(); check();
      } };
    },

    mem(m, host) {
      const cols = m.tiles <= 4 ? 2 : m.tiles <= 9 ? 3 : m.tiles === 12 ? 3 : 4;
      const COLORS = ['#ef4b5a', '#0ea5e9', '#22b573', '#ffb703', '#a855f7', '#f97316', '#14b8a6', '#e83e8c', '#6366f1', '#84cc16', '#06b6d4', '#f43f5e', '#8b5cf6', '#eab308', '#10b981', '#3b82f6'];
      host.innerHTML = `<div class="ask" id="mAsk"></div><div class="note">${m.seq.length} خطوات</div><div class="mem" style="grid-template-columns:repeat(${cols},1fr)">${
        Array.from({ length: m.tiles }, (_, i) => `<button data-i="${i}" style="background:${COLORS[i]}"></button>`).join('')}</div>`;
      const grid = host.querySelector('.mem'), ask = host.querySelector('#mAsk'); let input = false, pos = 0, done = false;
      const flash = (i, ms) => { const b = grid.children[i]; b.classList.add('lit'); sfx.note(i); later(() => b.classList.remove('lit'), ms); };
      const showSeq = () => {
        input = false; pos = 0; ask.textContent = '👀 ركّز…';
        m.seq.forEach((i, k) => later(() => flash(i, m.speed * 0.6), 700 + k * m.speed));
        later(() => { input = true; ask.textContent = '👆 دورك!'; }, 700 + m.seq.length * m.speed);
      };
      grid.onclick = e => {
        const b = e.target.closest('button'); if (!b || !input || done) return; const i = Number(b.dataset.i);
        if (i === m.seq[pos]) { flash(i, 200); pos++; if (pos === m.seq.length) { done = true; input = false; ask.textContent = '🎯 صح!'; roundDone(); } }
        else { input = false; mistake(grid); ask.textContent = '😅 مش كده… شوف تاني'; later(showSeq, 1100); }
      };
      showSeq();
      return { hint() { if (done || !input) return false; toast('🔁 هعرضهولك تاني'); showSeq(); } };
    }
  };

  // ---------- 🏡 family time: charades + ideas to do together ----------
  const F = window.ZF;
  let famTab = 'char', famFrom = 'who', chCat = 'mix', chSec = 60, ch = null, idType = 'all';
  const mmss = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  function family(tab) { if (tab) famTab = tab; famFrom = $('v-home').classList.contains('on') ? 'home' : $('v-who').classList.contains('on') ? 'who' : famFrom; go('family'); }
  function famSet(k, v) { if (k === 'tab') famTab = v; if (k === 'cat') chCat = v; if (k === 'sec') chSec = v; if (k === 'type') idType = v; renderFamily(); }
  function renderFamily() {
    $('fTabs').innerHTML = [['char', '🎭 مثّل الكلمة'], ['ideas', '💡 أفكار نعملها']].map(([id, n]) => `<button class="${famTab === id ? 'on' : ''}" onclick="App.famSet('tab','${id}')">${n}</button>`).join('');
    if (famTab === 'char') {
      $('fBody').innerHTML = `<div class="lbl">اختاروا نوع الكلمات</div>
        <div class="cats">${[{ id: 'mix', name: 'كله مع بعض', icon: '🎲' }].concat(F.CATS).map(c => `<button class="${chCat === c.id ? 'on' : ''}" onclick="App.famSet('cat','${c.id}')"><i>${c.icon}</i>${c.name}</button>`).join('')}</div>
        <div class="lbl">الوقت</div>
        <div class="chips">${[30, 60, 90, 120].map(t => `<button class="${chSec === t ? 'on' : ''}" onclick="App.famSet('sec',${t})">${t} ثانية</button>`).join('')}</div>
        <button class="btn" onclick="App.startCharades()">▶️ يلا نبدأ</button>
        ${S.family.best ? `<p style="text-align:center;font-weight:800;margin:14px 0 0">🏆 أحسن رقم للعيلة: ${S.family.best} كلمة</p>` : ''}
        <div class="howto"><b>إزاي نلعب؟</b><br>1️⃣ واحد يمسك الموبايل بالعرض على راسه، والشاشة للباقيين.<br>2️⃣ الباقي يمثّلوا الكلمة من غير كلام، وهو يخمّن.<br>3️⃣ عرفها؟ دوسوا <b>✅ صح</b>. صعبة؟ <b>⏭️ تخطّي</b>.<br>🇬🇧 كل كلمة مكتوبة عربي وإنجليزي… قولوها بالاتنين!</div>`;
    } else {
      const day = F.ideaOfDay(today()), list = F.ideas(idType), doneN = Object.keys(S.family.done).length;
      const col = t => F.TYPES.find(x => x.id === t).c;
      $('fBody').innerHTML = `<button class="today" onclick="App.idea('${day.id}')"><i>${day.e}</i><span><small>⭐ فكرة النهارده • ${day.min} دقيقة</small><b>${day.title}</b></span></button>
        <div class="chips">${[{ id: 'all', name: 'الكل', icon: '✨' }, { id: 'fav', name: 'المفضلة', icon: '❤️' }].concat(F.TYPES).map(t => `<button class="${idType === t.id ? 'on' : ''}" onclick="App.famSet('type','${t.id}')">${t.icon} ${t.name}</button>`).join('')}</div>
        <div class="ideas">${(idType === 'fav' ? F.IDEAS.filter(i => S.family.fav[i.id]) : list).map(i => `<button class="idea" style="background:${col(i.t)}" onclick="App.idea('${i.id}')">
          <i>${i.e}</i>${S.family.done[i.id] ? '<span class="tick">✅</span>' : ''}<b>${i.title}</b><small>⏱️ ${i.min} دقيقة • ${i.mood === 'calm' ? '😌 هادية' : '⚡ حركة'}</small></button>`).join('') || '<p style="grid-column:1/-1;text-align:center;font-weight:700;color:var(--mute)">لسه مفيش مفضلة. افتح أي فكرة ودوس ❤️</p>'}</div>
        <p style="text-align:center;font-weight:800;color:var(--mute);margin-top:16px">عملتوا ${doneN} من ${F.IDEAS.length} فكرة 👏</p>`;
    }
  }
  function idea(id) {
    const i = F.IDEAS.find(x => x.id === id), t = F.TYPES.find(x => x.id === i.t), d = S.family.done[id], f = S.family.fav[id];
    pop(`<div class="big">${i.e}</div><h3>${i.title}</h3><p style="color:var(--mute);margin:0">${t.icon} ${t.name} • ⏱️ ${i.min} دقيقة</p>
      <div class="det"><h4>🧺 هنحتاج</h4><ul>${i.need.map(n => `<li>${n}</li>`).join('')}</ul>
      <h4>👣 الخطوات</h4><ol>${i.steps.map(n => `<li>${n}</li>`).join('')}</ol>
      <div class="why">🧠 <b>ليه؟</b> ${i.why}</div>${i.safe ? `<div class="safe">⚠️ ${i.safe}</div>` : ''}</div>
      <div class="row2" style="margin-top:16px"><button class="btn" style="${d ? 'background:var(--good);box-shadow:0 6px 0 #17875a' : ''}" onclick="App.ideaMark('${id}','done')">${d ? '✅ عملناها' : '☑️ عملناها؟'}</button>
      <button class="btn ghost" onclick="App.ideaMark('${id}','fav')">${f ? '❤️ في المفضلة' : '🤍 مفضلة'}</button></div>
      <button class="btn ghost" style="margin-top:12px" onclick="App.unpop()">رجوع</button>`);
  }
  function ideaMark(id, k) {
    if (S.family[k][id]) delete S.family[k][id]; else { S.family[k][id] = 1; if (k === 'done') { sfx.win(); confetti(); } }
    save(); renderFamily(); idea(id);
  }

  function startCharades(cat, sec) {
    clearTimers(); if (cat) chCat = cat; if (sec) chSec = sec;
    ch = { deck: F.deck(chCat), i: 0, left: chSec, ok: [], skip: [], on: false };
    $('chOv').className = 'ch-ov show'; $('chTime').textContent = mmss(ch.left); $('chAr').textContent = 'استعدّوا…'; $('chEn').textContent = '';
    [3, 2, 1].forEach((n, k) => later(() => { $('chEmoji').textContent = n; tone(440, 0.15); }, k * 800));
    later(() => { ch.on = true; chCard(); later(chTick, 1000); }, 2400);
  }
  function chCard() { const w = ch.deck[ch.i]; $('chEmoji').textContent = w.e; $('chAr').textContent = w.ar; $('chEn').textContent = w.en; }
  function chMark(good) {
    if (!ch || !ch.on) return;
    (good ? ch.ok : ch.skip).push(ch.deck[ch.i]); if (good) sfx.ok(); else sfx.tap();
    const ov = $('chOv'); ov.className = 'ch-ov show ' + (good ? 'good' : 'skip'); setTimeout(() => { if (ch) ov.className = 'ch-ov show'; }, 220);
    ch.i++; if (ch.i >= ch.deck.length) return chEnd(); chCard();
  }
  function chTick() {
    if (!ch || !ch.on) return;
    ch.left--; $('chTime').textContent = mmss(Math.max(0, ch.left));
    if (ch.left <= 0) return chEnd();
    if (ch.left <= 5) tone(700, 0.08);
    later(chTick, 1000);
  }
  function chEnd() {
    const r = ch; clearTimers(); ch = null; $('chOv').className = 'ch-ov';
    const best = r.ok.length > S.family.best; if (best) { S.family.best = r.ok.length; save(); }
    sfx.win(); if (r.ok.length) confetti();
    const row = (w, m) => `<div>${m} ${w.e} ${w.ar}<span>${w.en}</span></div>`;
    pop(`<div class="big">${r.ok.length ? '🎉' : '😅'}</div><h3>${r.ok.length} كلمة صح!</h3>${best ? '<div class="gift">🏆 رقم قياسي جديد للعيلة</div>' : ''}
      ${r.ok.length + r.skip.length ? `<div class="res">${r.ok.map(w => row(w, '✅')).join('')}${r.skip.map(w => row(w, '⏭️')).join('')}</div>` : ''}
      <div class="row2"><button class="btn" onclick="App.unpop();App.startCharades()">🔁 جولة تانية</button><button class="btn ghost" onclick="App.unpop();App.famSet()">تمام</button></div>`);
  }
  function chStop() { clearTimers(); ch = null; $('chOv').className = 'ch-ov'; }

  // ---------- ⚙️ settings & 🎁 updates ----------
  const prefOn = (k, d) => String(N.getPref(k, d)) === 'true';
  function settings() {
    pop(`<h3>⚙️ الإعدادات</h3>
      <div class="set"><span>🔊 الصوت</span><label class="switch"><input type="checkbox" ${S.sound ? 'checked' : ''} onchange="App.setSound(this.checked)"><span></span></label></div>
      <div class="set"><span>🤫 تحديث تلقائي صامت (مرة يومياً)</span><label class="switch"><input type="checkbox" ${prefOn('auto', 'true') ? 'checked' : ''} onchange="App.pref('auto',this.checked)"><span></span></label></div>
      <div class="set"><span>📶 التحديث على الواي فاي فقط</span><label class="switch"><input type="checkbox" ${prefOn('wifi', 'true') ? 'checked' : ''} onchange="App.pref('wifi',this.checked)"><span></span></label></div>
      <div class="set"><span>🔍 البحث عن تحديث</span><button class="btn ghost sm" onclick="App.checkNow()">افحص الآن</button></div>
      <div class="set"><span>ℹ️ الإصدار</span><b style="direction:ltr">${esc(N.version())}</b></div>
      <div class="credit">Designed by Muhammad Toffaha</div>
      <button class="btn" style="margin-top:14px" onclick="App.unpop()">تمام</button>`);
  }
  function setSound(on) { S.sound = on; save(); if (on) sfx.ok(); }
  function pref(k, v) { N.setPref(k, String(v)); }
  function checkNow() { App._manual = true; toast('🔍 بندوّر…'); N.checkUpdate(); }
  function onUpdate(json) {
    let u = null; try { u = json ? JSON.parse(json) : null; } catch (e) {}
    App._upd = u && u.code > Number(N.versionCode()) ? u : null;
    if (App._upd) {
      const inGame = $('v-play').classList.contains('on') || $('chOv').classList.contains('show');                       // never interrupt a puzzle
      if (App._manual || (!inGame && String(N.getPref('seen', '')) !== String(App._upd.code))) showUpdate();
    } else if (App._manual) toast('✅ عندك أحدث نسخة ' + N.version());
    App._manual = false;
  }
  function showUpdate() {
    const u = App._upd; if (!u) return; N.setPref('seen', String(u.code));
    pop(`<div class="big">🎁</div><h3>تحديث جديد!</h3><p dir="ltr" style="color:var(--mute)">${esc(N.version())} → <b>1.0.${u.code}</b></p>
      <div class="prog" id="uProg" hidden><i></i></div>
      <div class="row2" id="uBtns"><button class="btn" onclick="App.doUpdate()">⬇️ حدّث</button><button class="btn ghost" onclick="App.unpop()">بعدين</button></div>`);
  }
  function doUpdate() { $('uProg').hidden = false; $('uBtns').innerHTML = '<span style="grid-column:1/-1;font-weight:700">⏳ بينزّل…</span>'; N.installUpdate(App._upd.url); }
  function onProgress(p) { const i = document.querySelector('#uProg i'); if (i) i.style.width = Math.round(p * 100) + '%'; }
  function onInstallMsg(m) { toast(m); if (/فشل|⚠️|🔐/.test(m)) unpop(); }

  window.App = {
    go, pickKid, editKid, saveKid, askReset, doReset, openGame, play, hint, quit, unpop, settings, setSound, pref, checkNow,
    onUpdate, showUpdate, doUpdate, onProgress, onInstallMsg,
    family, famSet, idea, ideaMark, startCharades, chMark, chStop,
    locked() { toast('🔒 عدّي المستوى اللي قبله الأول'); },
    back() {
      if ($('chOv').classList.contains('show')) { chStop(); return true; }
      if ($('popBg').classList.contains('show')) { unpop(); return true; }
      if ($('v-family').classList.contains('on')) { go(famFrom === 'home' && kid ? 'home' : 'who'); return true; }
      if ($('v-play').classList.contains('on')) { quit(); return true; }
      if ($('v-levels').classList.contains('on')) { go('home'); return true; }
      if ($('v-home').classList.contains('on')) { go('who'); return true; }
      return false;
    }
  };
  if (!window.Zk) window.Zk = N;

  load(); go('who');
  setTimeout(() => { try { N.checkUpdate(); } catch (e) {} }, 1500);
})();
