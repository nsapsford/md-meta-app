(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CARDS = JSON.parse($('card-data').textContent);
  const E = window.Engine;
  E.init(CARDS);
  const P = E.P, S = E.S, N = E.N;
  const TEXT = {};
  for (const c of CARDS) { const id = E.BY_NAME[c.name]; if (id) TEXT[id] = c; }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const anim = (el, frames, opts) => (RM.matches || !el || !el.animate ? null : el.animate(frames, opts));
  const isPhone = () => window.matchMedia && window.matchMedia('(max-width: 900px)').matches;

  // ── Deck ──
  const ORIGINAL = {};
  for (const c of CARDS) { const id = E.BY_NAME[c.name]; if (id) ORIGINAL[id] = { count: c.count, zone: c.zone }; }
  const PASS = {};
  for (const c of CARDS) PASS[c.pass_] = E.BY_NAME[c.name];
  const freshCounts = () => Object.fromEntries(Object.entries(ORIGINAL).map(([k, v]) => [k, v.count]));
  let counts = freshCounts();
  let blanks = 0;

  function frameClass(id) {
    const p = P[id];
    if (!p || id === 'UNK') return 'f-other';
    if (p.kind === 'S') return 'f-spell';
    if (p.kind === 'T') return 'f-trap';
    if (p.sub === 'Fusion') return 'f-fusion';
    if (p.sub === 'Synchro') return 'f-synchro';
    if (p.sub === 'Link') return 'f-link';
    if (p.sub === 'Normal') return 'f-normal';
    if (p.sub === 'Ritual') return 'f-ritual';
    return 'f-effect';
  }
  const short = (id) => (id === 'UNK' ? 'Blank' : S(id));
  function bandText(id) {
    if (id === 'UNK') return 'Any';
    const p = P[id];
    if (p.kind === 'S') return p.st === 'Quick-Play' ? 'Quick' : p.st === 'Continuous' ? 'Cont.' : 'Spell';
    if (p.kind === 'T') return 'Trap';
    if (p.sub === 'Link') return 'Link-' + p.link;
    return '★ ' + p.lv;
  }
  function footText(id) {
    const p = P[id];
    if (!p || id === 'UNK' || p.kind !== 'M') return '';
    return p.sub === 'Link' ? String(p.atk) : `${p.atk}/${p.def}`;
  }
  // A mini card. tag: 'button' (acts) or 'div'.
  function cardHtml(id, o = {}) {
    const tag = o.button ? 'button' : 'div';
    const full = id === 'UNK' ? 'A card the line does not use' : N(id);
    return `<${tag} class="card ${frameClass(id)} ${o.cls || ''}" data-card="${id}" ${o.attrs || ''} title="${esc(o.title || full)}">`
      + `<span class="band">${esc(bandText(id))}</span><span class="nm">${esc(short(id))}</span><span class="ft num">${esc(o.foot != null ? o.foot : footText(id))}</span>${o.extra || ''}</${tag}>`;
  }

  // ── State ──
  const HT_LIST = [['ash', 'Ash Blossom'], ['imperm', 'Infinite Impermanence'], ['veiler', 'Effect Veiler'], ['droll', 'Droll & Lock Bird'], ['nibiru', 'Nibiru'], ['belle', 'Ghost Belle'], ['fuwalos', 'Mulcharmy Fuwalos'], ['purulia', 'Mulcharmy Purulia'], ['maxxc', 'Maxx "C"']];
  // Draw effects: [kind, full name, engine bit, short name]
  const DRAW_FX = [['fuwalos', 'Mulcharmy Fuwalos', 1, 'Fuwalos'], ['purulia', 'Mulcharmy Purulia', 2, 'Purulia'], ['maxxc', 'Maxx "C"', 4, 'Maxx "C"']];
  const DRAW_KIND = Object.fromEntries(DRAW_FX.map((x) => [x[0], x]));
  const DPENS = [15, 55, 110];        // how much a card for them costs, in points (100 = one hard interruption); 55 picks the suggestion
  const INTR_OPTS = [
    ['', 'Does nothing on your turn'],
    ['negAny', 'Negates a card or effect'],
    ['negMon', 'Negates a monster effect'],
    ['negST', 'Negates a Spell/Trap'],
    ['imperm', 'Negates a monster effect on the field'],
    ['negSummon', 'Negates a summon'],
    ['negSummon+negST', 'Negates a summon or a Spell/Trap'],
    ['negSummon+negMon', 'Negates a summon or a monster effect'],
    ['negSummon+negAny', 'Negates a summon or any effect'],
    ['pop', 'Removes a monster you summon'],
    ['floodExtra', 'Floodgate: no Extra Deck summons'],
    ['floodSpell', 'Floodgate: no Spells'],
    ['floodMon', 'Floodgate: monster effects negated'],
  ];
  const ATTRS = ['?', 'DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
  const KINDS = [['main', 'Main Deck'], ['fusion', 'Fusion'], ['synchro', 'Synchro'], ['xyz', 'Xyz'], ['link', 'Link']];
  const KIND_FRAME = { main: 'f-effect', fusion: 'f-fusion', synchro: 'f-synchro', xyz: 'f-xyz', link: 'f-link' };

  let uidN = 1;
  let mode = 'first';
  let hand = [];             // [{ id, u }]
  let hts = new Set(['ash']);
  let live = new Set();
  let oppHand = 5;          // cards in their hand, or null when unknown
  let setAssume = '';       // what an unnamed Set card of theirs is assumed to do     // draw effects already resolved against you this turn
  let opp = { lp: 8000, mons: [], st: [] };
  const newMon = (o = {}) => Object.assign({ uid: 'o' + uidN++, name: '', atk: 0, def: 0, pos: 'atk', attr: '?', race: '', kind: 'main', intr: '', uses: 1, noDestroy: false, noTarget: false, open: false }, o);
  const newST = (o = {}) => Object.assign({ uid: 'o' + uidN++, name: '', intr: '', uses: 1, noDestroy: false, noTarget: false, open: false, stype: 'T' }, o);

  function snapshot() {
    return { v: 2, mode, hand: hand.map((h) => h.id), hts: [...hts], live: [...live], oppHand, setAssume, opp: { lp: opp.lp, mons: opp.mons.map((m) => ({ ...m, open: false })), st: opp.st.map((x) => ({ ...x, open: false })) }, counts, blanks };
  }
  function persist() { try { localStorage.setItem('dm-azamina-finder', JSON.stringify(snapshot())); } catch (e) { /* storage may be unavailable */ } }
  function restore(d) {
    if (!d || d.v !== 2) return false;
    try {
      mode = d.mode === 'second' ? 'second' : 'first';
      if (d.counts) { counts = {}; for (const k in d.counts) if (ORIGINAL[k]) counts[k] = d.counts[k]; blanks = d.blanks || 0; }
      hand = (d.hand || []).filter((id) => id === 'UNK' || counts[id]).slice(0, 7).map((id) => ({ id, u: uidN++ }));
      hts = new Set((d.hts || []).filter((k) => HT_LIST.some((x) => x[0] === k)));
      live = new Set((d.live || []).filter((k) => DRAW_KIND[k]));
      oppHand = d.oppHand == null ? null : +d.oppHand; setAssume = d.setAssume || '';
      const o = d.opp || {};
      opp = { lp: +o.lp || 8000, mons: (o.mons || []).map((m) => newMon({ ...m, uid: 'o' + uidN++ })), st: (o.st || []).map((x) => newST({ ...x, uid: 'o' + uidN++ })) };
      return true;
    } catch (e) { return false; }
  }

  // ── Toast ──
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

  // ── Workers ──
  // A task is a pure function of its message, so any worker (or the page) can run it.
  function runTask(Engine, m, post) {
    if (m.type === 'solve') {
      const r = Engine.solveBeam(m.cfg.base && m.cfg.base.length ? Engine.replay(m.cfg, m.cfg.base) : Engine.newState(m.cfg), {
        timeMs: m.timeMs, top: m.top || 4, policy: m.policy, width: 60, growth: 4,
        onRound: m.policy || !post ? null : (x) => post(Engine.serialize(x, m.hand)),
      });
      if (!m.policy) return Engine.serialize(r, m.hand);
      return { paths: r.lines.map((l) => l.state.path), nodes: r.nodes };
    }
    if (m.type === 'plan') {
      const sl = Engine.serializeLine(Engine.planOf(m.cfg, m.path), m.hand, 'Bait');
      sl.bait = true;
      return sl;
    }
    if (m.type === 'branch') return Engine.branchTask(m);
    return null;
  }
  function workerMain(e) {
    const m = e.data;
    if (m.type === 'init') { self.Engine.init(m.cards); return; }
    try {
      const result = runTask(self.Engine, m, (p) => self.postMessage({ type: 'partial', id: m.id, result: p }));
      self.postMessage({ type: 'done', id: m.id, result });
    } catch (err) { self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) }); }
  }
  const CANCEL = { cancelled: true };
  const Pool = (() => {
    const size = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    let url = null, workersOk = true, slots = [], queue = [], seq = 0;
    function make() {
      if (!url) {
        const src = $('engine').textContent + '\nconst runTask = ' + runTask.toString() + ';\nself.onmessage = ' + workerMain.toString() + ';';
        url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      }
      const w = new Worker(url);
      const slot = { w, job: null };
      w.onmessage = (ev) => {
        const m = ev.data, job = slot.job;
        if (!job || m.id !== job.id) return;
        if (m.type === 'partial') { if (job.onPartial) job.onPartial(m.result); return; }
        slot.job = null;
        if (m.type === 'error') job.reject(new Error(m.message)); else job.resolve(m.result);
        pump();
      };
      w.onerror = (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        const job = slot.job;
        slot.job = null;
        slots = slots.filter((s) => s !== slot);
        try { w.terminate(); } catch (e) { /* already gone */ }
        if (!slots.length) workersOk = false;
        if (job) queue.unshift(job);
        pump();
      };
      w.postMessage({ type: 'init', cards: CARDS });
      slots.push(slot);
      return slot;
    }
    function local(job) {
      setTimeout(() => {
        if (job.dead) return;
        try { job.resolve(runTask(E, Object.assign({}, job.msg, { timeMs: Math.min(job.msg.timeMs || 250, 700) }), job.onPartial)); } catch (e) { job.reject(e); }
      }, 0);
    }
    function pump() {
      while (queue.length) {
        if (!workersOk) { local(queue.shift()); continue; }
        let slot = slots.find((s) => !s.job);
        if (!slot && slots.length < size) { try { slot = make(); } catch (e) { workersOk = false; continue; } }
        if (!slot) break;
        const job = queue.shift();
        slot.job = job;
        slot.w.postMessage(Object.assign({}, job.msg, { id: job.id }));
      }
    }
    function run(msg, onPartial, front) {
      const p = new Promise((resolve, reject) => {
        const job = { msg, resolve, reject, onPartial, id: ++seq, dead: false };
        if (front) queue.unshift(job); else queue.push(job);
        pump();
      });
      p.catch(() => {});
      return p;
    }
    function cancelAll() {
      for (const s of slots) if (s.job) { try { s.w.terminate(); } catch (e) { /* gone */ } s.job.dead = true; s.job.reject(CANCEL); s.dead = true; }
      slots = slots.filter((s) => !s.dead);
      for (const j of queue) { j.dead = true; j.reject(CANCEL); }
      queue = [];
    }
    return { run, cancelAll, size };
  })();

  // ── Your hand ──
  const GROUPS = [
    ['Starters and monsters', ['ROD', 'DIA', 'SOULS', 'SERV', 'DMG', 'DMBM', 'DM', 'IOC', 'GAND']],
    ['Spells', ['CURT', 'GAZE', 'CIRC', 'PREP', 'HALL', 'DECE', 'SARC', 'SPOLY', 'SSRV', 'WANT', 'FSIL']],
    ['Trap', ['TALI']],
    ['Hand traps', ['ASH', 'DROLL', 'FUWA', 'MAXX']],
    ['Anything else', ['UNK']],
  ];
  const inHand = (id) => hand.reduce((n, h) => n + (h.id === id ? 1 : 0), 0);
  const left = (id) => (id === 'UNK' ? 9 : (counts[id] || 0) - inHand(id));
  const slotTarget = () => (mode === 'first' ? 5 : 6);

  function renderHand(fly) {
    const el = $('hand');
    const before = new Map();
    el.querySelectorAll('[data-u]').forEach((c) => before.set(c.dataset.u, c.getBoundingClientRect()));
    const target = slotTarget();
    let html = hand.map((h) => cardHtml(h.id, { button: true, attrs: `data-u="${h.u}"`, title: `Remove ${short(h.id)}`, extra: '<span class="x" aria-hidden="true">×</span>' })).join('');
    for (let i = hand.length; i < target; i++) html += `<div class="slot ${i === hand.length ? 'next' : ''}" aria-hidden="true">${i + 1}</div>`;
    el.innerHTML = html;
    $('hand-count').textContent = `${hand.length} / ${target}`;
    el.querySelectorAll('[data-u]').forEach((c) => {
      const a = before.get(c.dataset.u), b = c.getBoundingClientRect();
      if (a) {
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) anim(c, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 240, easing: EASE });
      } else if (fly && String(fly.u) === c.dataset.u && fly.rect) {
        const r = fly.rect;
        const dx = (r.left + r.width / 2) - (b.left + b.width / 2), dy = (r.top + r.height / 2) - (b.top + b.height / 2);
        anim(c, [{ transform: `translate(${dx}px,${dy}px) scale(${Math.max(.3, r.width / b.width)}, ${Math.max(.2, r.height / b.height)})`, opacity: .5 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE });
      } else {
        anim(c, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: EASE });
      }
    });
  }

  let findQ = '';
  function matchScore(id, q) {
    if (!q) return 0;
    const s = short(id).toLowerCase(), n = (id === 'UNK' ? 'blank other unknown' : N(id)).toLowerCase();
    if (s.startsWith(q)) return 4;
    if (s.split(/[\s'-]+/).some((w) => w.startsWith(q)) || id.toLowerCase() === q) return 3;
    if (n.split(/[\s',:-]+/).some((w) => w.startsWith(q))) return 2;
    if (n.includes(q) || s.includes(q)) return 1;
    return 0;
  }
  function bestMatch() {
    if (!findQ) return null;
    let best = null, bs = 0;
    for (const [, ids] of GROUPS) for (const id of ids) {
      if (id !== 'UNK' && !counts[id]) continue;
      if (left(id) <= 0) continue;
      const sc = matchScore(id, findQ);
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  }
  function renderPicker() {
    const hit = bestMatch();
    $('picker').innerHTML = GROUPS.map(([label, ids]) => {
      const chips = ids.filter((id) => id === 'UNK' || counts[id]).map((id) => {
        const n = left(id);
        const dim = findQ && !matchScore(id, findQ);
        return `<button class="chip ${frameClass(id)} ${dim ? 'dim' : ''} ${hit === id ? 'hit' : ''}" data-add="${id}" data-card="${id}" ${n <= 0 ? 'disabled' : ''} title="${esc(id === 'UNK' ? 'A card the line will not use: a brick, a side card or an unknown draw' : N(id))}">${esc(id === 'UNK' ? 'Blank / other' : S(id))}${id === 'UNK' ? '' : `<span class="n num">${n}</span>`}</button>`;
      }).join('');
      return chips ? `<div class="group"><div class="lab">${label}</div><div class="chips">${chips}</div></div>` : '';
    }).join('');
    const hint = $('find-hint');
    if (findQ) { hint.hidden = false; hint.textContent = hit ? `Enter adds ${short(hit)}` : 'No match'; } else hint.hidden = true;
  }
  function addCard(id, fromEl) {
    if (hand.length >= 7) { toast('Seven cards is the most this hand can hold.'); return; }
    if (left(id) <= 0) { toast(`No copies of ${short(id)} left in the deck.`); return; }
    const h = { id, u: uidN++ };
    hand.push(h);
    renderHand({ u: h.u, rect: fromEl ? fromEl.getBoundingClientRect() : null });
    renderPicker();
    clearBase(); changed();
  }
  function removeCard(u) {
    const i = hand.findIndex((h) => String(h.u) === String(u));
    if (i < 0) return;
    hand.splice(i, 1);
    renderHand(); renderPicker(); clearBase(); changed();
  }
  $('hand').addEventListener('click', (e) => { const b = e.target.closest('[data-u]'); if (b && !suppressClick()) removeCard(b.dataset.u); });
  $('picker').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b && !b.disabled && !suppressClick()) addCard(b.dataset.add, b); });
  $('clear').addEventListener('click', () => { hand = []; renderHand(); renderPicker(); clearBase(); changed(); });
  $('find').addEventListener('input', (e) => { findQ = e.target.value.trim().toLowerCase(); renderPicker(); });
  $('find').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const id = bestMatch();
      if (id) { addCard(id, $('picker').querySelector(`[data-add="${id}"]`)); e.target.value = ''; findQ = ''; renderPicker(); }
      e.preventDefault();
    } else if (e.key === 'Escape') { e.target.value = ''; findQ = ''; renderPicker(); e.target.blur(); }
    else if (e.key === 'Backspace' && !e.target.value && hand.length) { removeCard(hand[hand.length - 1].u); }
  });

  // ── Turn order ──
  function setMode(m, quiet) {
    mode = m;
    $('seg').dataset.on = m === 'second' ? '1' : '0';
    $('m-first').setAttribute('aria-pressed', m === 'first');
    $('m-second').setAttribute('aria-pressed', m === 'second');
    $('their').hidden = m !== 'second';
    renderHand();
    if (!quiet) { oppHand = m === 'first' ? 5 : null; renderUnseen(); clearBase(); changed(); }
  }
  $('m-first').addEventListener('click', () => setMode('first'));
  $('m-second').addEventListener('click', () => setMode('second'));

  // ── Their field ──
  let INDEX = null;
  function loadIndex() {
    if (INDEX) return INDEX;
    INDEX = { all: [], by: new Map() };
    try {
      const parts = $('card-index').textContent.split('\n===\n');
      const meta = JSON.parse(parts[0]);
      const kinds = ['main', 'fusion', 'synchro', 'xyz', 'link'];
      for (const r of parts[1].split('\n')) {
        const f = r.split('\t');
        if (f.length < 7) continue;
        INDEX.all.push({ mon: true, name: f[0], lc: f[0].toLowerCase(), atk: +f[1], def: +f[2], attr: meta.attrs[+f[3]] || '?', race: meta.races[+f[4]] || '', kind: kinds[+f[5]] || 'main', intr: meta.intrs[+f[6]] || '' });
      }
      for (const r of parts[2].split('\n')) {
        const f = r.split('\t');
        if (f.length < 3) continue;
        INDEX.all.push({ mon: false, name: f[0], lc: f[0].toLowerCase(), intr: meta.intrs[+f[1]] || '', stype: f[2] });
      }
      for (const c of INDEX.all) INDEX.by.set(c.lc, c);
    } catch (e) { /* no index: names are typed by hand */ }
    return INDEX;
  }
  function fromIndex(c) {
    if (c.mon) return newMon({ name: c.name, atk: c.atk, def: c.def, attr: c.attr, race: c.race, kind: c.kind, intr: c.intr, uses: /apollousa/i.test(c.name) ? 3 : 1 });
    return newST({ name: c.name, intr: c.intr, stype: c.stype });
  }
  const intrLabel = (v) => (INTR_OPTS.find((o) => o[0] === v) || INTR_OPTS[0])[1];

  function oppCardHtml(c, k, i) {
    const isMon = k === 'mons';
    const frame = isMon ? KIND_FRAME[c.kind] || 'f-effect' : (c.stype === 'S' ? 'f-spell' : 'f-trap');
    const intrSel = `<select data-f="intr" aria-label="What it can do on your turn">${INTR_OPTS.map(([v, l]) => `<option value="${v}" ${c.intr === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const usesSel = `<select data-f="uses" aria-label="Times per turn" title="Times per turn">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${+c.uses === n ? 'selected' : ''}>×${n}</option>`).join('')}</select>`;
    const flags = `<div class="flags"><label><input type="checkbox" data-f="noDestroy" ${c.noDestroy ? 'checked' : ''}> can't be destroyed</label><label><input type="checkbox" data-f="noTarget" ${c.noTarget ? 'checked' : ''}> can't be targeted</label></div>`;
    const unsure = c.unsure ? `<div class="unsure">Scanner not sure.${(c.alts || []).length ? ' Is it ' + c.alts.slice(0, 3).map((a, q) => `<button class="btn sm" data-alt="${q}">${esc(a)}</button>`).join(' ') + '?' : ''} <button class="btn sm quiet" data-ok>Looks right</button></div>` : '';
    if (isMon) {
      return `<div class="opp-card ${frame} ${c.unsure ? 'is-unsure' : ''}" data-k="mons" data-i="${i}" data-uid="${c.uid}">${unsure}
        <div class="l1"><input class="name" data-f="name" value="${esc(c.name)}" placeholder="Monster" aria-label="Monster name">
          <div class="stats"><input data-f="atk" type="number" inputmode="numeric" class="num" value="${c.atk}" aria-label="ATK" title="ATK"><input data-f="def" type="number" inputmode="numeric" class="num" value="${c.def}" aria-label="DEF" title="DEF"></div>
          <button class="xbtn" data-del aria-label="Remove ${esc(c.name || 'monster')}">×</button></div>
        <div class="l2"><button class="pos" data-pos title="Position: tap to change">${c.pos === 'def' ? 'DEF' : c.pos === 'set' ? 'SET' : 'ATK'}</button>${intrSel}${usesSel}<button class="btn sm quiet" data-more aria-expanded="${c.open}">${c.open ? 'Less' : 'More'}</button></div>
        ${c.open ? `<div class="more"><select data-f="attr" aria-label="Attribute">${ATTRS.map((a) => `<option ${c.attr === a ? 'selected' : ''}>${a}</option>`).join('')}</select><input data-f="race" value="${esc(c.race || '')}" placeholder="Type" aria-label="Type" list="races"><select data-f="kind" aria-label="Card kind">${KINDS.map(([v, l]) => `<option value="${v}" ${c.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${flags}</div>` : ''}
      </div>`;
    }
    return `<div class="opp-card ${frame} ${c.unsure ? 'is-unsure' : ''}" data-k="st" data-i="${i}" data-uid="${c.uid}">${unsure}
      <div class="l1" style="grid-template-columns:minmax(0,1fr) auto"><input class="name" data-f="name" value="${esc(c.name)}" placeholder="Set Spell/Trap" aria-label="Spell or Trap name"><button class="xbtn" data-del aria-label="Remove ${esc(c.name || 'card')}">×</button></div>
      <div class="l2" style="grid-template-columns:minmax(0,1fr) 58px auto">${intrSel}${usesSel}<button class="btn sm quiet" data-more aria-expanded="${c.open}">${c.open ? 'Less' : 'More'}</button></div>
      ${c.open ? `<div class="more">${flags}</div>` : ''}
    </div>`;
  }
  function renderOpp(newUid) {
    $('opp-lp').value = opp.lp;
    const el = $('opp-list');
    const before = new Map();
    el.querySelectorAll('[data-uid]').forEach((c) => before.set(c.dataset.uid, c.getBoundingClientRect()));
    el.innerHTML = opp.mons.map((m, i) => oppCardHtml(m, 'mons', i)).join('') + opp.st.map((x, i) => oppCardHtml(x, 'st', i)).join('')
      || '<p class="fine">Empty field. Add what they ended on, or leave it empty.</p>';
    el.querySelectorAll('[data-uid]').forEach((c) => {
      const a = before.get(c.dataset.uid), b = c.getBoundingClientRect();
      if (a) { const dy = a.top - b.top; if (dy) anim(c, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 220, easing: EASE }); }
      else if (c.dataset.uid === newUid) anim(c, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE });
    });
  }
  $('opp-list').addEventListener('input', (e) => {
    const row = e.target.closest('[data-k]'); const f = e.target.dataset.f;
    if (!row || !f) return;
    const o = opp[row.dataset.k][+row.dataset.i];
    o[f] = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' || f === 'uses') ? Number(e.target.value || 0) : e.target.value;
    if (f === 'kind') renderOpp();
    changed(f === 'name' || f === 'race' ? 700 : 350);
  });
  $('opp-list').addEventListener('change', (e) => {
    // Picking a known name from the keyboard fills the rest in.
    if (e.target.dataset.f !== 'name') return;
    const row = e.target.closest('[data-k]');
    const hit = loadIndex().by.get(e.target.value.trim().toLowerCase());
    if (!hit || !row) return;
    const list = opp[row.dataset.k], i = +row.dataset.i;
    if (hit.mon !== (row.dataset.k === 'mons')) return;
    if (hit.mon ? (list[i].atk || list[i].def) : list[i].intr) return;   // don't overwrite what was typed in
    const fresh = fromIndex(hit);
    list[i] = Object.assign(fresh, { uid: list[i].uid, pos: list[i].pos || 'atk' });
    renderOpp(); changed();
  });
  $('opp-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-k]');
    if (!row) return;
    const list = opp[row.dataset.k], i = +row.dataset.i;
    const alt = e.target.closest('[data-alt]');
    if (alt) {
      const name = list[i].alts[+alt.dataset.alt];
      const hit = loadIndex().by.get(String(name).toLowerCase());
      list[i] = Object.assign(hit && hit.mon === (row.dataset.k === 'mons') ? fromIndex(hit) : list[i], { uid: list[i].uid, pos: list[i].pos, name, unsure: false });
      renderOpp(); changed(); return;
    }
    if (e.target.closest('[data-ok]')) { list[i].unsure = false; renderOpp(); return; }
    if (e.target.closest('[data-del]')) { list.splice(i, 1); renderOpp(); changed(); }
    else if (e.target.closest('[data-pos]')) { list[i].pos = list[i].pos === 'atk' ? 'def' : list[i].pos === 'def' ? 'set' : 'atk'; renderOpp(); changed(); }
    else if (e.target.closest('[data-more]')) { list[i].open = !list[i].open; renderOpp(); }
  });
  $('opp-lp').addEventListener('input', (e) => { opp.lp = Number(e.target.value || 0); changed(500); });
  $('add-mon').addEventListener('click', () => { const m = newMon({ open: true }); opp.mons.push(m); renderOpp(m.uid); changed(); });
  $('add-st').addEventListener('click', () => { const x = newST(); opp.st.push(x); renderOpp(x.uid); changed(); });
  $('clear-opp').addEventListener('click', () => { opp = { lp: opp.lp, mons: [], st: [] }; renderOpp(); changed(); });

  // Autocomplete over every Master Duel card.
  let acItems = [], acSel = 0;
  function acSearch(q) {
    const out = [];
    if (q.length < 2) return out;
    for (const c of loadIndex().all) {
      const at = c.lc.indexOf(q);
      if (at < 0) continue;
      const sc = at === 0 ? 0 : /[\s\-,:"']/.test(c.lc[at - 1]) ? 1 : 2;
      out.push([sc, c.intr ? 0 : 1, c.name.length, c]);
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    return out.slice(0, 8).map((x) => x[3]);
  }
  function renderAc() {
    const ul = $('opp-ac');
    $('opp-add').setAttribute('aria-expanded', acItems.length > 0);
    if (!acItems.length) { ul.hidden = true; ul.innerHTML = ''; return; }
    ul.hidden = false;
    ul.innerHTML = acItems.map((c, i) => `<li role="option" class="${c.mon ? KIND_FRAME[c.kind] : c.stype === 'S' ? 'f-spell' : 'f-trap'}" aria-selected="${i === acSel}" data-ac="${i}"><span>${esc(c.name)}</span><small>${c.mon ? `${c.atk}/${c.def}` : c.stype === 'S' ? 'Spell' : 'Trap'}${c.intr ? ' · ' + esc(intrLabel(c.intr).replace(/^Negates /, 'negates ').replace(/^Floodgate: /, '')) : ''}</small></li>`).join('');
  }
  function acPick(i) {
    const c = acItems[i];
    if (!c) return;
    const o = fromIndex(c);
    (c.mon ? opp.mons : opp.st).push(o);
    $('opp-add').value = ''; acItems = []; renderAc(); renderOpp(o.uid); changed();
  }
  $('opp-add').addEventListener('input', (e) => { acItems = acSearch(e.target.value.trim().toLowerCase()); acSel = 0; renderAc(); });
  $('opp-add').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { acSel = Math.min(acItems.length - 1, acSel + 1); renderAc(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { acSel = Math.max(0, acSel - 1); renderAc(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (acItems.length) acPick(acSel); e.preventDefault(); }
    else if (e.key === 'Escape') { acItems = []; renderAc(); }
  });
  $('opp-add').addEventListener('blur', () => setTimeout(() => { acItems = []; renderAc(); }, 160));
  $('opp-ac').addEventListener('mousedown', (e) => { const li = e.target.closest('[data-ac]'); if (li) { e.preventDefault(); acPick(+li.dataset.ac); } });

  // ── Their hand traps ──
  function renderHts() {
    $('hts').innerHTML = HT_LIST.map(([k, l]) => `<button class="tog" data-ht="${k}" aria-pressed="${hts.has(k) && !live.has(k)}" ${live.has(k) ? 'disabled title="Already live this turn"' : ''}>${esc(l)}</button>`).join('');
    $('live').innerHTML = DRAW_FX.map(([k, l]) => `<button class="tog live" data-live="${k}" aria-pressed="${live.has(k)}">${esc(l)}</button>`).join('');
  }
  $('hts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ht]');
    if (!b || b.disabled) return;
    const k = b.dataset.ht;
    if (hts.has(k)) hts.delete(k); else hts.add(k);
    b.setAttribute('aria-pressed', hts.has(k));
    renderUnseen();
    changed();
  });
  $('live').addEventListener('click', (e) => {
    const b = e.target.closest('[data-live]');
    if (!b) return;
    const k = b.dataset.live;
    if (live.has(k)) live.delete(k); else live.add(k);
    renderHts();
    changed();
  });
  const ASSUME = [['', 'do nothing'], ['negSummon', 'negate a summon'], ['negAny', 'negate a card or effect'], ['imperm', 'negate a monster on the field'], ['pop', 'remove a monster you summon']];
  function renderUnseen() {
    $('opp-hand').value = oppHand == null ? '' : oppHand;
    $('set-assume').innerHTML = ASSUME.map(([v, l]) => `<option value="${v}" ${setAssume === v ? 'selected' : ''}>${l}</option>`).join('');
    const on = HT_LIST.filter(([k]) => hts.has(k) && !live.has(k)).length;
    $('unseen-note').textContent = oppHand == null ? 'Hand size unknown: every hand trap switched on can be used.' : on > oppHand ? `They hold ${oppHand}, so at most ${oppHand} of the ${on} hand traps switched on are used against a line.` : `They hold ${oppHand}. Recording a hand trap they used lowers this.`;
  }
  $('opp-hand').addEventListener('input', (e) => { oppHand = e.target.value === '' ? null : Math.max(0, +e.target.value || 0); renderUnseen(); changed(500); });
  $('set-assume').addEventListener('change', (e) => { setAssume = e.target.value; changed(); });
  const liveBits = () => DRAW_FX.reduce((t, x) => t | (live.has(x[0]) ? x[2] : 0), 0);
  const drawNames = (bits) => DRAW_FX.filter((x) => bits & x[2]).map((x) => x[3]).join(' + ');

  // ── Building the search ──
  function buildCfg() {
    const deck = {}, extra = {};
    for (const [id, n] of Object.entries(counts)) {
      if (!n || !ORIGINAL[id]) continue;
      if (ORIGINAL[id].zone === 'extra') extra[id] = n; else deck[id] = n;
    }
    const h = {};
    for (const { id } of hand) { h[id] = (h[id] || 0) + 1; if (id !== 'UNK' && deck[id]) { deck[id]--; if (!deck[id]) delete deck[id]; } }
    const cfg = { mode, hand: h, deck, extra, mul: liveBits() };
    if (mode === 'second') {
      cfg.opp = {
        lp: Math.max(1, opp.lp || 8000),
        mons: opp.mons.map((m) => ({ uid: m.uid, kind: 'mon', name: m.name || 'monster', atk: +m.atk || 0, def: +m.def || 0, pos: m.pos, attr: m.attr || '?', race: (m.race || '?').trim() || '?', noDestroy: !!m.noDestroy, noTarget: !!m.noTarget, faceDown: m.pos === 'set', ext: m.kind && m.kind !== 'main', intr: m.intr || null })),
        st: opp.st.map((x) => ({ uid: x.uid, kind: 'st', name: x.name || 'Set card', noDestroy: !!x.noDestroy, noTarget: !!x.noTarget, intr: x.intr || (!x.name && setAssume) || null })),
      };
    }
    return cfg;
  }
  function buildIntrs() {
    const out = HT_LIST.filter(([k]) => hts.has(k) && !live.has(k)).map(([kind, label]) => ({ kind, src: 'hand', label }));
    if (mode === 'second') {
      for (const m of opp.mons) if (m.intr && !m.intr.startsWith('flood') && m.pos !== 'set') for (let i = 0; i < (+m.uses || 1); i++) out.push({ kind: m.intr, src: 'board', uid: m.uid, cardKind: 'mon', label: m.name || 'Their monster' });
      for (const x of opp.st) { const k = x.intr || (!x.name && setAssume) || ''; if (k && !k.startsWith('flood')) for (let i = 0; i < (+x.uses || 1); i++) out.push({ kind: k, src: 'board', uid: x.uid, cardKind: 'st', label: x.name || 'An unknown Set card' }); }
    }
    return out;
  }
  const intrNames = (intrs) => { const seen = []; for (const it of intrs) { const l = it.label.replace(' Blossom', '').replace('Infinite Impermanence', 'Imperm').replace(' & Lock Bird', '').replace('Effect Veiler', 'Veiler').replace('Mulcharmy ', ''); if (!seen.includes(l)) seen.push(l); } return seen.length > 3 ? seen.slice(0, 3).join(', ') + ` +${seen.length - 3}` : seen.join(' + '); };

  // ── Solving ──
  const sol = {
    gen: 0, phase: 'idle', lines: [], byKey: new Map(), selKey: null, shownKey: null, interacted: false, showWorst: false,
    prog: new Map(), branch: null, cfg: null, intrs: [], handIds: [], mode: 'first', t0: 0, ms: 0, nodes: 0, tested: 0, total: 0, deep: false, msg: '', ranked: false, better: null,
  };
  let sidN = 1;
  let debounceT = 0;
  const base = { path: [], steps: 0, events: [], stack: [] };
  function clearBase() { base.path = []; base.steps = 0; base.events = []; base.stack = []; sol.rec = null; }
  function changed(delay) {
    persist();
    clearTimeout(debounceT);
    debounceT = setTimeout(() => startSolve(false), delay == null ? 260 : delay);
  }
  const hard = (l) => l.items.filter((x) => x[1] >= 0.9).length;

  // Turn worker lines into line objects; a line seen before keeps its identity (and its test results).
  function prepList(raw) {
    const out = [];
    for (const r of raw) {
      if (!r) continue;
      const key = r.path.join('>');
      let l = sol.byKey.get(key);
      if (!l) { l = r; l.key = key; l.sid = sidN++; sol.byKey.set(key, l); }
      if (r.safest) l.safest = true;
      if (r.bait) l.bait = true;
      if (r.trade) l.trade = true;
      if (!out.includes(l)) out.push(l);
    }
    return out;
  }
  const prep = (res) => prepList(res.lines.concat(res.safest ? [res.safest] : []));
  // Under a draw effect: one line per number of cards they draw, the best board for that price,
  // kept only if it beats every cheaper one. Scores are put on the same scale (55 points a card).
  const tradeScore = (l) => (l.summary.lethal ? l.summary.raw : l.summary.raw - 55 * (l.summary.eff || 0));
  function tradeOptions(list) {
    const by = new Map();
    for (const l of list) {
      if (!l || l.summary.raw == null) continue;
      const d = l.summary.draws || 0, c = by.get(d);
      if (!c || l.summary.raw > c.summary.raw + 1e-9) by.set(d, l);
    }
    let out = [], top = -Infinity;
    for (const d of [...by.keys()].sort((a, b) => a - b)) {
      const l = by.get(d);
      if (l.summary.raw <= top + 0.5) continue;
      top = l.summary.raw; l.score = tradeScore(l); l.trade = true;
      out.push(l);
    }
    if (out.length > 6) {
      const keep = new Set([out[0]].concat(out.slice().sort((a, b) => b.score - a.score).slice(0, 5)));
      out = out.filter((l) => keep.has(l));
    }
    return out;
  }
  const bestOf = (lines) => { let b = null; for (const l of lines) if (!b || l.score > b.score) b = l; return b ? b.key : null; };
  function adopt(lines, bestKey) {
    sol.bestKey = bestKey || (lines.length ? lines[0].key : null);
    const prev = sol.byKey.get(sol.selKey);
    if (sol.interacted && prev && sol.lines.includes(prev)) {
      if (!lines.includes(prev)) { prev.kept = true; lines = lines.concat([prev]); }
    } else {
      sol.selKey = sol.bestKey;
      sol.showWorst = false;
    }
    sol.lines = lines;
    $('line').classList.remove('stale');
    renderResults();
  }
  const branchCache = new Map();
  function branchRun(t) {
    const k = t.prefix.join('>') + '|' + t.key + '|' + t.it.kind + '|' + t.it.src + '|' + (t.it.uid || '') + (t.quick ? '|q' : '|f') + (t.start ? '|start' : '');
    let p = branchCache.get(k);
    if (!p) { p = Pool.run(t); branchCache.set(k, p); }
    return p;
  }
  const lethalBonus = (l, w) => (l.summary.lethal && !(w && w.line.summary.lethal) ? 30 : 0);

  async function startSolve(deep) {
    clearTimeout(debounceT);
    const my = ++sol.gen;
    Pool.cancelAll();
    branchCache.clear();
    sol.byKey = new Map();
    Object.assign(sol, { branch: null, interacted: false, showWorst: false, ranked: false, better: null, tested: 0, total: 0, deep, nodes: 0, fresh: true });
    sol.prog = new Map();
    if (!hand.length) { sol.phase = 'idle'; sol.lines = []; sol.selKey = null; renderResults(); renderStatus(); return; }
    const cfg = buildCfg(), intrs = buildIntrs(), handIds = hand.map((h) => h.id);
    if (base.path.length) cfg.base = base.path;
    Object.assign(sol, { cfg, intrs, handIds, mode, phase: 'search', t0: performance.now() });
    $('line').classList.add('stale');
    renderStatus();
    const alive = () => my === sol.gen;
    try {
      const budget = deep ? 6000 : 1000;
      const tradeOf = (rs) => { const c = prepList(tradeOptions(rs.flatMap((r) => (r.frontier || []).concat(r.lines)))); return { c, best: bestOf(c) }; };
      // Under a live draw effect, three searches value a card for them differently, so the trade-off has both ends.
      const pA = cfg.mul
        ? Promise.all(DPENS.map((dpen) => Pool.run({ type: 'solve', cfg: Object.assign({}, cfg, { dpen }), hand: handIds, timeMs: budget, top: 3 },
          dpen === 55 ? (part) => { if (alive()) { sol.nodes = part.nodes; const t = tradeOf([part]); if (t.c.length) adopt(t.c, t.best); } } : null)))
          .then((rs) => ({ trade: rs, nodes: rs.reduce((t, r) => t + r.nodes, 0) }))
        : Pool.run({ type: 'solve', cfg, hand: handIds, timeMs: budget, top: 4 }, (part) => { if (alive()) { sol.nodes = part.nodes; adopt(prep(part)); } });
      const pB = intrs.length ? Pool.run({ type: 'solve', cfg, hand: handIds, timeMs: deep ? 2500 : 700, top: 3, policy: intrs }) : null;
      const A = await pA;
      if (!alive()) return;
      sol.nodes = A.nodes;
      let cands, bestKey = null;
      if (A.trade) { const t = tradeOf(A.trade); cands = t.c; bestKey = t.best; } else cands = prep(A);
      if (!intrs.length) { adopt(cands, bestKey); return finish(my); }
      cands.forEach((l) => { l.testing = true; });
      sol.phase = 'test';
      adopt(cands, bestKey); renderStatus();
      const B = await pB;
      if (!alive()) return;
      sol.nodes += B.nodes;
      const plans = await Promise.all(B.paths.map((path) => Pool.run({ type: 'plan', cfg, path, hand: handIds }).catch(() => null)));
      if (!alive()) return;
      for (const p of plans) {
        if (!p) continue;
        const l = prep({ lines: [p] })[0];
        if (!cands.includes(l)) { l.testing = true; cands.push(l); }
      }
      cands = cands.slice(0, 8);
      adopt(cands, bestKey);
      let bestW = -Infinity;
      const deadline = performance.now() + (deep ? 20000 : 7000);
      const counted = (t) => { sol.total++; return branchRun(t).finally(() => { sol.tested++; if (alive()) renderStatus(); }); };
      const test = async (l, prune) => {
        const w = await E.robust(cfg, l, intrs, counted, { branchMs: deep ? 500 : 250, hand: handIds, firstMoves: deep ? 5 : 3, from: base.steps, handMax: oppHand == null ? null : oppHand, stopBelow: prune ? () => bestW - 30 : null, expired: () => performance.now() > deadline });
        if (!alive()) return;
        l.worst = w; l.testing = false; l.rscore = w.score + lethalBonus(l, w);
        if (!w.pruned && l.rscore > bestW) bestW = l.rscore;
        renderTabs();
        if (l.key === sol.selKey) renderLine('none');
        renderDock();
      };
      const firstL = cands.find((l) => l.key === bestKey) || cands[0];
      await test(firstL, false);
      await Promise.all(cands.filter((l) => l !== firstL).map((l) => test(l, true)));
      if (!alive()) return;
      const ranked = cands.slice().sort((a, b) => (b.rscore - a.rscore) || (b.score - a.score));
      sol.ranked = true;
      const top = ranked[0];
      let keep = ranked.slice(0, cfg.mul ? 6 : 5);
      if (cfg.mul) keep = keep.sort((a, b) => ((a.summary.draws || 0) - (b.summary.draws || 0)) || (b.score - a.score));   // keep the scale readable: fewest draws first
      const cur = sol.byKey.get(sol.selKey);
      if (sol.interacted && cur && top.key !== cur.key) sol.better = top.key;
      adopt(keep, top.key);
      finish(my);
    } catch (e) {
      if (!alive() || e === CANCEL) return;
      if (base.path.length) {            // the recorded events no longer fit (their field or the last event changed things)
        const msg = (e && e.message) || '';
        if (base.stack.length) undoEvent(true); else clearBase();
        toast(`That can't have happened at that point${msg ? ': ' + msg : ''}. Last record removed.`);
        return startSolve(false);
      }
      sol.phase = 'error'; sol.msg = (e && e.message) || 'unknown error';
      $('line').classList.remove('stale');
      renderStatus();
    }
  }
  function finish(my) {
    if (my !== sol.gen) return;
    sol.phase = 'done';
    sol.ms = performance.now() - sol.t0;
    $('line').classList.remove('stale');
    renderStatus(); renderTabs(); renderDock();
  }
  $('deeper').addEventListener('click', () => startSolve(true));

  function renderStatus() {
    const st = $('status'), bar = $('bar'), spin = $('spin');
    spin.hidden = !(sol.phase === 'search' || sol.phase === 'test');
    bar.className = 'bar ' + (sol.phase === 'search' ? 'indet' : sol.phase === 'test' ? '' : 'idle');
    $('deeper').disabled = sol.phase === 'search' || sol.phase === 'test' || !hand.length;
    if (sol.phase === 'idle') st.textContent = 'Add the cards in your hand to see lines.';
    else if (sol.phase === 'search') st.textContent = sol.deep ? 'Searching deeper…' : 'Finding lines…';
    else if (sol.phase === 'test') {
      st.textContent = `Testing against ${intrNames(sol.intrs)}…`;
      bar.firstElementChild.style.width = Math.round(100 * (sol.total ? sol.tested / sol.total : 0.05)) + '%';
    } else if (sol.phase === 'done') {
      st.textContent = `${(sol.ms / 1000).toFixed(1)} s · ${fmt(sol.nodes)} positions${sol.cfg && sol.cfg.mul ? ` · under ${drawNames(sol.cfg.mul)}` : ''}${sol.intrs.length ? ` · tested against ${intrNames(sol.intrs)}` : ''}`;
    } else if (sol.phase === 'error') st.textContent = `The search failed (${sol.msg}). Change a card or press Search deeper to retry.`;
  }

  // ── Results ──
  const current = () => sol.byKey.get(sol.selKey) || sol.lines.find((l) => l.key === sol.selKey) || null;
  function headline(l) {
    if (sol.mode === 'second') {
      const s = l.summary;
      if (s.lethal) return { big: 'Lethal', small: `${fmt(s.battle + s.burn)} dmg`, cls: 'good word' };
      const leftLp = Math.max(0, s.oppLp - s.battle);
      return { big: fmt(leftLp), small: 'LP left', cls: 'warn' };
    }
    const n = hard(l);
    return { big: String(n), small: n === 1 ? 'interruption' : 'interruptions', cls: '' };
  }
  // The board in a few words: hard interruptions, plus softer plays.
  function boardShort(l) {
    if (sol.mode === 'second') { const h = headline(l); return `${h.big} ${h.small}`; }
    const hd = hard(l), sf = l.items.filter((x) => x[1] >= 0.3 && x[1] < 0.9).length;
    return `${plural(hd, 'interruption')}${sf ? ` + ${sf} soft` : ''}`;
  }
  function worstVerdict(l) {
    const w = l.worst && l.worst.line;
    if (!w) return null;
    // Did spending their interruptions leave you worse off at all?
    const used = l.worst.score < l.score - 0.5 ? l.worst.applied.filter((a) => a.step != null) : [];
    const names = intrNames(sol.intrs);
    // A line dropped early (clearly weaker) or cut off by the time limit may be even worse than shown.
    const dw = w.summary.draws || 0, dp = l.summary.draws || 0;
    const soft = (dw > dp ? `, and they draw ${dw}` : '') + (l.worst.pruned ? ', or worse' : l.worst.partial ? ' (not fully tested)' : '');
    const plus = dw > dp ? ` +${plural(dw - dp, 'draw')}` : '';
    if (sol.mode === 'second') {
      const lpLeft = fmt(Math.max(0, w.summary.oppLp - w.summary.battle));
      if (w.summary.lethal) return { cls: 'good', short: 'worst case: lethal', long: `Still lethal through ${names}` };
      if (l.summary.lethal) return { cls: 'bad', short: 'worst case: not lethal', long: `Not lethal if they use ${names} well: they keep ${lpLeft} LP${soft}` };
      return { cls: used.length ? 'warn' : 'good', short: `worst case: ${lpLeft} LP`, long: used.length ? `Through ${names}: they keep ${lpLeft} LP${soft}` : `${names} doesn't change this line` };
    }
    const hp = hard(l), hw = hard(w);
    if (!used.length || hw >= hp) return { cls: used.length && dw > dp ? 'warn' : 'good', short: `worst case: ${hw}${plus}`, long: used.length ? `Through ${names}: still ${plural(hw, 'interruption')}${soft}` : `${names} can't make this line worse` };
    return { cls: hw >= hp - 1 ? 'warn' : 'bad', short: `worst case: ${hw}${plus}`, long: `Through ${names}: drops to ${plural(hw, 'interruption')}${soft}` };
  }

  // How the line area updates: a cascade for a new search or a tab you picked, a soft crossfade when
  // the top line changes by itself, nothing when the same line is refreshed.
  function renderResults(how) {
    renderTabs();
    renderLine(how || (sol.shownKey === sol.selKey ? 'none' : sol.fresh ? 'cascade' : 'fade'));
    sol.fresh = false;
    renderDock();
  }

  function renderTabs() {
    const el = $('tabs');
    const before = new Map();
    el.querySelectorAll('[data-sid]').forEach((t) => before.set(t.dataset.sid, t.getBoundingClientRect()));
    el.innerHTML = sol.lines.map((l, i) => {
      const h = headline(l);
      const isBest = l.key === sol.bestKey, under = !!(sol.cfg && sol.cfg.mul);
      const badge = isBest && sol.ranked && sol.intrs.length ? '<span class="badge">Sturdiest</span>' : isBest && under ? '<span class="badge">Best trade</span>'
        : l.safest ? '<span class="badge alt">Safest</span>' : l.bait ? '<span class="badge alt">Bait</span>' : l.kept ? '<span class="badge alt">Earlier</span>' : '';
      const v = worstVerdict(l);
      const state = l.testing ? '<span class="dot live"></span><span>testing…</span>' : v ? `<span class="dot ${v.cls}"></span><span>${esc(v.short)}</span>` : '';
      const stepsTxt = `<span>${plural(l.steps.length, 'step')}</span>`;
      // Under a draw effect the price comes first: draws in big type, the board it buys underneath.
      const body = under
        ? `<span class="t2">${l.summary.draws || 0}<small>${(l.summary.draws || 0) === 1 ? 'draw' : 'draws'}</small></span><span class="t3"><span>${esc(boardShort(l))}</span></span><span class="t3">${state || stepsTxt}</span>`
        : `<span class="t2">${esc(h.big)}<small>${esc(h.small)}</small></span><span class="t3">${state}${state ? '<span>·</span>' : ''}${stepsTxt}</span>`;
      return `<button class="tab" role="tab" aria-selected="${l.key === sol.selKey}" data-sid="${l.sid}"><span class="t1"><span>Line ${i + 1}</span>${badge}</span>${body}</button>`;
    }).join('');
    el.querySelectorAll('[data-sid]').forEach((t) => {
      const a = before.get(t.dataset.sid), b = t.getBoundingClientRect();
      if (a) { const dx = a.left - b.left; if (Math.abs(dx) > 1) anim(t, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 320, easing: EASE }); }
      else anim(t, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
    });
    const b = $('banner');
    const better = sol.better && sol.byKey.get(sol.better);
    b.innerHTML = better && better.key !== sol.selKey ? `<div class="banner fade"><span>After testing, <b>Line ${sol.lines.indexOf(better) + 1}</b> holds up best against ${esc(intrNames(sol.intrs))}.</span><button class="btn sm primary" data-sid="${better.sid}">View it</button></div>` : '';
  }
  function selectLine(sid) {
    const l = sol.lines.find((x) => String(x.sid) === String(sid));
    if (!l) return;
    sol.interacted = true;
    sol.selKey = l.key; sol.showWorst = false; sol.branch = null;
    if (sol.better === l.key) sol.better = null;
    renderResults('cascade');
  }
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-sid]'); if (b) selectLine(b.dataset.sid); });
  $('banner').addEventListener('click', (e) => { const b = e.target.closest('[data-sid]'); if (b) selectLine(b.dataset.sid); });

  // Card names inside step text become tappable.
  const TOKENS = (() => {
    const list = [['Dark Magician Girl', 'DMG'], ['Souls', 'SOULS']];
    for (const id in E.NAMES) { if (id === 'UNK') continue; list.push([E.NAMES[id], id]); if (E.SHORT[id] && E.SHORT[id] !== E.NAMES[id]) list.push([E.SHORT[id], id]); }
    list.sort((a, b) => b[0].length - a[0].length);
    const map = new Map(list.map(([n, id]) => [n, id]));
    const re = new RegExp('(^|[^A-Za-z])(' + list.map(([n]) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![A-Za-z])', 'g');
    return { map, re };
  })();
  function rich(text) {
    let out = '', last = 0;
    text.replace(TOKENS.re, (m, pre, name, off) => {
      const at = off + pre.length;
      const id = TOKENS.map.get(name);
      out += esc(text.slice(last, at)) + `<button class="cn ${frameClass(id)}" data-card="${id}" data-insp tabindex="-1">${esc(name)}</button>`;
      last = at + name.length;
      return m;
    });
    return out + esc(text.slice(last));
  }

  function activeKinds() {
    const k = new Set();
    for (const it of sol.intrs) for (const x of String(it.kind).split('+')) k.add(x);
    return k;
  }
  function stepHtml(s, i, o) {
    const ak = o.active;
    const marks = [];
    const hit = o.hits && o.hits[i];
    if (hit) marks.push(`<span class="mk hitm">Worst case: ${esc(hit)}</span>`);
    if (s.draws) marks.push(`<span class="mk draw" title="A summon that their draw effect counts">They draw ${s.draws}</span>`);
    let risky = false;
    if (s.tags.ash) { risky = true; marks.push(`<span class="mk ${ak.has('ash') ? 'on' : ''}" title="Adds, summons or sends from the Deck">Ash</span>`); }
    if (s.tags.droll) { risky = true; marks.push(`<span class="mk ${ak.has('droll') ? 'on' : ''}" title="Droll can be chained to this search">Droll</span>`); }
    if (s.tags.field) { risky = true; marks.push(`<span class="mk ${ak.has('imperm') || ak.has('veiler') || ak.has('negMon') || ak.has('negAny') ? 'on' : ''}" title="A monster effect on the field">Imperm / Veiler</span>`); }
    if (s.nibiru) { risky = true; marks.push(`<span class="mk ${ak.has('nibiru') ? 'on' : ''}" title="Your fifth summon this turn">Nibiru window</span>`); }
    if (s.tags.noResp) marks.push('<span class="mk safe">No response possible</span>');
    if (risky && s.notes.length) marks.push(`<span class="mk safe" title="You have an answer ready at this point">${s.notes.includes('talisman') ? 'Talisman covers' : s.notes.includes('dragoon') ? 'Dragoon can answer' : 'Ilia can answer'}</span>`);
    const wi = [];
    const locked = o.lock != null && i < o.lock;
    if (o.whatIf && !locked && !s.ev) {
      if (s.canNeg) wi.push(`<button class="btn sm" data-w="force" data-s="${i}">Negated here</button>`);
      if (s.tags.droll) wi.push(`<button class="btn sm" data-w="droll" data-s="${i}">Droll here</button>`);
      if (s.nibiru) wi.push(`<button class="btn sm" data-w="nibiru" data-s="${i}">Nibiru here</button>`);
      // A draw effect can come down at any step. The Mulcharmy cards need their side of the field to be empty.
      for (const [k, , bit, sh] of DRAW_FX) {
        if ((o.mul || 0) & bit) continue;
        if (k !== 'maxxc' && s.oppCount) continue;
        wi.push(`<button class="btn sm" data-w="${k}" data-s="${i}">${esc(sh)} here</button>`);
      }
      if (wi.length) marks.push(`<button class="mk wi" data-wi="${i}" aria-expanded="false">What if?</button>`);
      marks.push(`<button class="mk wi rec" data-rec="${i}">This happened</button>`);
    }
    const notes = [];
    if (s.interrupted) notes.push(`<div class="note hitn">${esc(s.interrupted)}.</div>`);
    if (s.curtain) notes.push('<div class="note">They may also Special Summon a DARK Spellcaster from hand or Deck.</div>');
    if (s.gaze) notes.push('<div class="note">This Fusion is banished at the end of their next turn.</div>');
    const cls = [s.interrupted ? 'hit' : '', o.preTo != null && i < o.preTo ? 'pre' : '', s.ev ? 'evrow' : ''].join(' ');
    const form = o.rec && o.rec.idx === i ? recFormHtml(s, o.rec) : '';
    return `<li class="step ${cls}" data-s="${i}" style="--i:${i}"><button class="hex" data-hex="${i}" aria-label="Step ${i + 1}: mark done"><span>${i + 1}</span></button><div class="body"><div class="txt">${rich(s.text)}</div>${marks.length ? `<div class="marks">${marks.join('')}</div>` : ''}${notes.join('')}${wi.length ? `<div class="wi-menu" data-menu="${i}" hidden>${wi.join('')}</div>` : ''}${form}</div></li>`;
  }

  // ── Recording what really happened ──
  const cardNamed = (n) => { const q = String(n || '').trim().toLowerCase(); return q ? HT_LIST.find(([, l]) => l.toLowerCase() === q || l.toLowerCase().split(' ')[0] === q || l.toLowerCase().replace('mulcharmy ', '') === q) : null; };
  function recTypes(s) {
    const t = [];
    if (s.canNeg) t.push(['stop', 'This step was stopped (negated or destroyed)']);
    if (s.tags.droll) t.push(['droll', 'Droll & Lock Bird resolved on this step']);
    if (s.summonsAfter >= 5) t.push(['nibiru', 'Nibiru resolved after this step']);
    for (const [k, l] of DRAW_FX) if (k === 'maxxc' || !s.oppCount) t.push([k, `${l} resolved on this step`]);
    if (s.mons.length + s.sts.length) t.push(['lose', 'I lost a card from my field after this step']);
    t.push(['gain', 'I drew or added a card after this step']);
    t.push(['oppAdd', 'They summoned a monster after this step']);
    return t;
  }
  function recFormHtml(s, r) {
    const types = recTypes(s);
    if (!types.some((x) => x[0] === r.type)) r.type = types[0][0];
    let f = '';
    if (r.type === 'stop') f = `<label>By which card? <input data-rf="by" value="${esc(r.by || '')}" placeholder="Ash Blossom, their Baronne… (optional)" list="ht-names"></label>`;
    else if (r.type === 'lose') {
      const ids = [...new Set(s.mons.concat(s.sts))];
      if (!ids.includes(r.id)) r.id = ids[0];
      f = `<label>Card <select data-rf="id">${ids.map((id) => `<option value="${id}" ${r.id === id ? 'selected' : ''}>${esc(S(id))}</option>`).join('')}</select></label><label>It went to <select data-rf="to">${[['gy', 'the GY'], ['ban', 'banishment'], ['hand', 'my hand or Extra Deck']].map(([v, l]) => `<option value="${v}" ${r.to === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    } else if (r.type === 'gain') {
      const ids = Object.keys(ORIGINAL).filter((id) => ORIGINAL[id].zone === 'main' && counts[id]);
      if (!ids.includes(r.id)) r.id = ids[0];
      f = `<label>Card <select data-rf="id">${ids.map((id) => `<option value="${id}" ${r.id === id ? 'selected' : ''}>${esc(S(id))}</option>`).join('')}</select></label><label class="chk"><input type="checkbox" data-rf="replace" ${r.replace ? 'checked' : ''}> it is the unknown card already counted in my hand</label>`;
    } else if (r.type === 'oppAdd') f = `<label>Monster name <input data-rf="name" value="${esc(r.name || '')}" placeholder="Exact name fills in its stats"></label>`;
    return `<div class="recform" data-recform><label>What happened <select data-rf="type">${types.map(([v, l]) => `<option value="${v}" ${r.type === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${f}<div class="row"><button class="btn sm primary" data-rf-ok>Record and re-solve</button><button class="btn sm quiet" data-rf-cancel>Cancel</button></div></div>`;
  }
  function commitEvent() {
    const l = current(), r = sol.rec;
    if (!l || !r) return;
    const idx = r.idx, st = l.steps[idx];
    let path, steps, text;
    const snap = { path: base.path, steps: base.steps, n: base.events.length, hts: [...hts], oppHand };
    const usedHT = (kind) => { if (hts.has(kind)) hts.delete(kind); if (oppHand != null) oppHand = Math.max(0, oppHand - 1); };
    if (r.type === 'lose' || r.type === 'gain' || r.type === 'oppAdd') {
      let ev;
      if (r.type === 'lose') { ev = { t: 'lose', id: r.id, to: r.to || 'gy' }; text = `After step ${idx + 1}: lost ${S(r.id)}`; }
      else if (r.type === 'gain') { ev = { t: 'gain', id: r.id, replace: !!r.replace }; text = `After step ${idx + 1}: ${S(r.id)} in hand`; }
      else {
        const hit = loadIndex().by.get(String(r.name || '').trim().toLowerCase());
        const m = hit && hit.mon ? { name: hit.name, atk: hit.atk, def: hit.def, attr: hit.attr, race: hit.race || '?', ext: hit.kind !== 'main', intr: hit.intr && !hit.intr.startsWith('flood') ? null : hit.intr || null } : { name: (r.name || '').trim() || 'a monster' };
        m.uid = 'e' + uidN++;
        ev = { t: 'oppAdd', mon: m }; text = `After step ${idx + 1}: they summoned ${m.name}`;
      }
      const cut = l.steps[idx + 1] ? l.steps[idx + 1].pathIdx : l.path.length;
      path = l.path.slice(0, cut).concat(['@' + JSON.stringify(ev)]); steps = idx + 2;
    } else {
      let it;
      if (r.type === 'stop') {
        const by = (r.by || '').trim(), ht = cardNamed(by);
        it = { kind: 'force', src: 'hand', label: by || 'Negate' };
        if (ht) usedHT(ht[0]);
        text = `Step ${idx + 1} stopped${by ? ' by ' + by : ''}`;
      } else {
        const lab = (HT_LIST.find((x) => x[0] === r.type) || [])[1];
        it = { kind: r.type, src: 'hand', label: lab, force: true };
        usedHT(r.type);
        text = `${lab} on step ${idx + 1}`;
      }
      path = l.path.slice(0, st.pathIdx).concat(['!' + JSON.stringify({ k: st.key, it })]); steps = idx + 1;
    }
    base.stack.push(snap);
    base.path = path; base.steps = steps; base.events.push(text);
    sol.rec = null;
    renderHts(); renderUnseen();
    changed(0);
  }
  function undoEvent(quiet) {
    const sn = base.stack.pop();
    if (!sn) return;
    base.path = sn.path; base.steps = sn.steps; base.events.length = sn.n;
    hts = new Set(sn.hts); oppHand = sn.oppHand;
    renderHts(); renderUnseen();
    if (!quiet) changed(0);
  }

  function boardRows(l) {
    const mons = l.board.mons.map((m) => cardHtml(m.id, { button: true, attrs: 'data-insp', extra: m.id === 'DRAG' && m.uses ? `<span class="tag">${m.uses} destroy</span>` : '' })).join('');
    const st = l.board.st.map((x) => cardHtml(x.id, { button: true, cls: x.up ? '' : 'facedown', attrs: 'data-insp', extra: x.up ? '' : '<span class="tag">Set</span>' })).join('');
    const hd = Object.entries(l.board.hand).flatMap(([id, n]) => Array(n).fill(id)).map((id) => cardHtml(id, { button: id !== 'UNK', attrs: 'data-insp' })).join('');
    const none = '<div class="none">None</div>';
    return `<div class="board"><div class="brow"><div class="lab">Monsters</div>${mons ? `<div class="cards">${mons}</div>` : none}</div><div class="brow"><div class="lab">Spells / Traps</div>${st ? `<div class="cards">${st}</div>` : none}</div><div class="brow"><div class="lab">Hand</div>${hd ? `<div class="cards">${hd}</div>` : '<div class="none">Empty</div>'}</div></div>`
      + (sol.mode === 'second' ? `<p class="fine">Left on their field: ${l.board.opp.length ? esc(l.board.opp.join(', ')) : 'nothing'}.</p>` : '');
  }
  function turnList(l) {
    const items = l.items.filter((x) => x[1] >= 0.3);
    if (!items.length) return '';
    return `<ul class="turn">${items.map((x) => `<li class="${x[1] >= 0.9 ? 'hard' : ''}"><span>${rich(x[0])}</span></li>`).join('')}</ul>`;
  }

  function verdictHtml(l) {
    const h = headline(l);
    const hardItems = l.items.filter((x) => x[1] >= 0.9), soft = l.items.filter((x) => x[1] >= 0.3 && x[1] < 0.9);
    let title, pills;
    if (sol.mode === 'second') {
      const s = l.summary;
      title = s.lethal ? `${fmt(s.battle)} battle damage${s.burn ? ` + ${fmt(s.burn)} burn` : ''} into ${fmt(s.oppLp + s.burn)} LP` : `${fmt(s.battle + s.burn)} damage this turn, then you pass`;
      pills = `<span class="pill">Removes ${plural(s.removed, 'card')}</span>` + hardItems.map((x) => `<span class="pill q">${esc(x[0].split(':')[0])}</span>`).join('');
    } else {
      title = `hard ${hard(l) === 1 ? 'interruption' : 'interruptions'} on their turn`;
      pills = hardItems.map((x) => `<span class="pill">${esc(x[0].split(':')[0])}</span>`).join('') + soft.map((x) => `<span class="pill q">${esc(x[0].split(/[:(]/)[0].trim())}</span>`).join('');
    }
    const ash = l.steps.filter((s) => s.tags.ash).length;
    const nib = l.steps.findIndex((s) => s.nibiru);
    const facts = `<div class="facts"><span><b class="num">${l.steps.length}</b> steps</span><span><b class="num">${l.summons}</b> summons</span><span><b class="num">${ash}</b> Ash points</span><span>${nib >= 0 ? `Nibiru from step <b class="num">${nib + 1}</b>` : 'No Nibiru window'}</span></div>`;
    let trade = '';
    const mul = sol.cfg ? sol.cfg.mul || 0 : 0;
    if (mul) {
      const d = l.summary.draws || 0, eff = l.summary.eff || 0;
      const rules = DRAW_FX.filter((x) => mul & x[2]).map((x) => `${x[3]}: ${E.MUL_TEXT[x[0]]}.`).join(' ');
      trade = `<div class="worst ${d ? 'warn' : 'good'}"><div><div class="wt">${d ? `They draw ${plural(d, 'card')} for this board` : 'They draw nothing for this board'}</div><div class="ws">${esc(rules)}${eff < d ? ` They keep ${eff} of them after the End Phase hand limit.` : ''}</div></div></div>`;
    }
    const stepWhere = (a) => (a.step < 0 ? 'at the start of your turn' : `on step ${a.step + 1}`);
    let worst = '';
    if (l.testing) worst = `<div class="worst"><div class="row" style="gap:8px"><span class="spin"></span><span class="ws">Testing this line against ${esc(intrNames(sol.intrs))}…</span></div></div>`;
    else if (l.worst) {
      const v = worstVerdict(l);
      const hurtL = l.worst.score < l.score - 0.5;
      const usedI = l.worst.applied.filter((a) => a.step != null);
      const where = usedI.length ? `${esc(usedI[0].it.label)} ${stepWhere(usedI[0])}${usedI.length > 1 ? ', then ' + usedI.slice(1).map((a) => esc(a.it.label)).join(' and ') : ''}` : '';
      const dead = l.worst.applied.filter((a) => a.step == null).map((a) => esc(a.it.label));
      const sub = hurtL ? [where ? `Their best play: ${where}.` : '', dead.length ? `${[...new Set(dead)].join(', ')} has nothing left to hit.` : ''].filter(Boolean).join(' ')
        : (where ? `Even with ${where}, you have another route to the same result.` : '');
      worst = `<div class="worst ${v.cls}"><div><div class="wt">${esc(v.long)}</div>${sub ? `<div class="ws">${sub}</div>` : ''}</div>${where ? `<button class="btn sm" id="toggle-worst">${sol.showWorst ? 'Back to the plan' : 'See that line'}</button>` : ''}</div>`;
    }
    return `<div class="panel verdict"><div class="vmain"><div class="vnum num ${h.cls}">${esc(h.big)}</div><div class="vtext"><div class="vh">${esc(title)}</div><div class="pills">${pills}</div></div></div>${facts}${trade}${worst}</div>`;
  }

  function progKey() { return sol.selKey + (sol.showWorst ? '|w' : ''); }
  function shownLine() { const l = current(); return l && sol.showWorst && l.worst ? l.worst.line : l; }

  function renderLine(how) {
    const animate = how === 'cascade';
    const el = $('line');
    const l = current();
    if (!l) {
      sol.shownKey = null;
      el.innerHTML = hand.length ? '<div class="panel"><div class="skel" style="width:40%"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:70%"></div></div>'
        : '<div class="panel"><h3>No hand yet</h3><p class="muted">Tap the cards you opened on the left. Lines appear as you go, and update with every card.</p></div>';
      return;
    }
    sol.shownKey = sol.selKey;
    const shown = shownLine();
    // Only their first interruption is certain to land on a step of the plan; later ones hit the adjusted line.
    const hits = {};
    const hurt = l.worst && l.worst.score < l.score - 0.5;
    if (hurt && !sol.showWorst) { const first = l.worst.applied.find((a) => a.step != null); if (first && first.step >= 0) hits[first.step] = first.it.label; }
    const active = activeKinds();
    let preTo = null;
    if (sol.showWorst) { const fi = shown.steps.findIndex((s) => s.interrupted); preTo = fi >= 0 ? fi : null; }
    const steps = shown.steps.map((s, i) => stepHtml(s, i, { active, hits, whatIf: !sol.showWorst, preTo, mul: shown.mul || 0, lock: base.steps, rec: sol.showWorst ? null : sol.rec })).join('');
    const opening = (shown.opening || []).map((t) => `<p class="opening">${esc(t)}.</p>`).join('');
    const n = Math.min(sol.prog.get(progKey()) || 0, shown.steps.length);
    let html = verdictHtml(l);
    if (base.events.length) html += `<div class="panel happened"><div class="row spread"><h2>What has happened</h2><div class="row"><button class="btn sm" id="ev-undo">Undo last</button><button class="btn sm quiet" id="ev-clear">Start the turn over</button></div></div><ul class="turn">${base.events.map((t) => `<li class="hard"><span>${esc(t)}</span></li>`).join('')}</ul><p class="fine">Steps up to here are locked. The lines below continue from this position.</p></div>`;
    html += `<div class="panel" id="steps-panel"><div class="row spread"><h2>${sol.showWorst ? 'Worst case: what you do instead' : 'Steps'}</h2><div class="row"><div class="stepper inline-stepper" id="stepper-inline"></div><button class="btn sm quiet" id="copy-text">Copy</button><button class="btn sm quiet" id="copy-json" title="Paste into the md-meta-app Line Trainer import">Line Trainer JSON</button></div></div>`
      + `${opening}<ol class="steps ${animate ? 'cascade' : ''}" id="steps">${steps}</ol>${shown.sets.length ? `<p class="sets">Then Set ${shown.sets.map((id) => rich(S(id))).join(', ')}.</p>` : ''}</div>`;
    html += '<div id="branch"></div>';
    html += `<div class="panel ${animate ? 'fade' : ''}"><div class="row spread"><h2>${sol.showWorst ? 'Worst-case end board' : 'End board'}</h2></div>${boardRows(shown)}</div>`;
    const tl = turnList(shown);
    if (tl) html += `<div class="panel ${animate ? 'fade' : ''}"><h2>What it does on their turn</h2>${tl}</div>`;
    el.innerHTML = html;
    if (how === 'fade') { el.classList.remove('xfade'); void el.offsetWidth; el.classList.add('xfade'); }
    applyProgress(n, false);
    renderBranch();
  }

  // ── Stepping through a line ──
  function stepperHtml(n, total) {
    return `<button class="btn sm" data-step="-1" aria-label="Previous step" ${n <= 0 ? 'disabled' : ''}><svg class="icon"><use href="#i-prev"/></svg></button>`
      + `<span class="where num">${n >= total ? 'All done' : `Step ${n + 1} of ${total}`}</span><span class="track"><i style="width:${total ? (n / total) * 100 : 0}%"></i></span>`
      + `<button class="btn sm primary" data-step="1" ${n >= total ? 'disabled' : ''} title="Space or the right arrow key">Next <svg class="icon"><use href="#i-next"/></svg></button>`;
  }
  function applyProgress(n, scroll) {
    const shown = shownLine();
    if (!shown) return;
    const total = shown.steps.length;
    n = Math.max(Math.min(base.steps, total), Math.min(total, n));
    sol.prog.set(progKey(), n);
    const lis = document.querySelectorAll('#steps > .step');
    lis.forEach((li, i) => {
      li.classList.toggle('done', i < n);
      li.classList.toggle('cur', i === n);
      const hx = li.querySelector('.hex > span');
      const want = i < n ? 'check' : 'num';
      if (hx && hx.dataset.v !== want) {
        hx.dataset.v = want;
        hx.innerHTML = i < n ? '<svg class="icon" style="vertical-align:0"><use href="#i-check"/></svg>' : String(i + 1);
        if (scroll && i === n - 1) anim(hx, [{ transform: 'scale(.3) rotate(-40deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE });
      }
    });
    const inl = $('stepper-inline');
    if (inl) inl.innerHTML = stepperHtml(n, total);
    renderDock();
    if (scroll && lis[Math.min(n, total - 1)]) lis[Math.min(n, total - 1)].scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
  }
  function stepBy(d) {
    if (!shownLine()) return;
    sol.interacted = true;
    applyProgress((sol.prog.get(progKey()) || 0) + d, true);
  }

  $('line').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-insp]')) return;                 // card text handled globally
    const stepBtn = t.closest('[data-step]');
    if (stepBtn) { stepBy(+stepBtn.dataset.step); return; }
    if (t.closest('#toggle-worst')) { sol.interacted = true; sol.showWorst = !sol.showWorst; sol.branch = null; renderLine('cascade'); return; }
    if (t.closest('#copy-text')) { copy(lineText(shownLine()), 'Steps copied.'); return; }
    if (t.closest('#copy-json')) { const l = current(); copy(JSON.stringify({ lines: [Object.assign({}, l.generated, { name: lineName(l) })] }, null, 1), 'Line Trainer JSON copied.'); return; }
    if (t.closest('#close-branch')) { sol.branch = null; renderBranch(); return; }
    if (t.closest('#ev-undo')) { undoEvent(); return; }
    if (t.closest('#ev-clear')) { while (base.stack.length > 1) base.stack.pop(); undoEvent(); return; }
    const rc = t.closest('[data-rec]');
    if (rc) { sol.interacted = true; sol.rec = sol.rec && sol.rec.idx === +rc.dataset.rec ? null : { idx: +rc.dataset.rec, type: '' }; renderLine('none'); return; }
    if (t.closest('[data-recform]')) {
      if (t.closest('[data-rf-ok]')) commitEvent();
      else if (t.closest('[data-rf-cancel]')) { sol.rec = null; renderLine('none'); }
      return;
    }
    const wi = t.closest('[data-wi]');
    if (wi) {
      const menu = document.querySelector(`[data-menu="${wi.dataset.wi}"]`);
      if (menu) { menu.hidden = !menu.hidden; wi.setAttribute('aria-expanded', !menu.hidden); if (!menu.hidden) anim(menu, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE }); }
      return;
    }
    const w = t.closest('[data-w]');
    if (w) { if (DRAW_KIND[w.dataset.w]) whatIfDraw(+w.dataset.s, w.dataset.w); else whatIf(+w.dataset.s, w.dataset.w); return; }
    const opt = t.closest('[data-opt]');
    if (opt && sol.branch && sol.branch.options) { sol.branch.sel = +opt.dataset.opt; renderBranch(true); return; }
    const li = t.closest('#steps > .step');
    if (li) {
      const i = +li.dataset.s, n = sol.prog.get(progKey()) || 0;
      sol.interacted = true;
      applyProgress(n === i + 1 ? i : i + 1, true);
    }
  });

  $('line').addEventListener('change', (e) => {
    const f = e.target.dataset && e.target.dataset.rf;
    if (!f || !sol.rec) return;
    sol.rec[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (f === 'type') renderLine('none');
  });
  $('line').addEventListener('input', (e) => { const f = e.target.dataset && e.target.dataset.rf; if (f && sol.rec && e.target.type === 'text') sol.rec[f] = e.target.value; });

  // ── Manual what-if ──
  const WI = { force: ['is negated', { kind: 'force', src: 'hand', label: 'Negate' }], droll: ['gets Droll chained to it', { kind: 'droll', src: 'hand', label: 'Droll & Lock Bird' }], nibiru: ['is followed by Nibiru', { kind: 'nibiru', src: 'hand', label: 'Nibiru' }] };
  async function whatIf(idx, kind) {
    const l = current();
    if (!l) return;
    sol.interacted = true;
    const st = l.steps[idx];
    const my = sol.gen;
    const b = { idx, kind, loading: true, result: null, error: null };
    sol.branch = b;
    renderBranch();
    const br = $('branch');
    if (br) br.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
    try {
      b.result = await Pool.run({ type: 'branch', cfg: sol.cfg, prefix: l.path.slice(0, st.pathIdx), key: st.key, it: WI[kind][1], timeMs: 1500, width: 60, maxWidth: 4000, hand: sol.handIds }, null, true);
    } catch (e) { if (e === CANCEL) return; b.error = (e && e.message) || 'unknown error'; }
    b.loading = false;
    if (my === sol.gen && sol.branch === b) renderBranch();
  }
  // A draw effect lands on a step: re-solve from there three ways (a card for them is cheap, normal, dear)
  // and show the best board for each number of draws.
  async function whatIfDraw(idx, kind) {
    const l = current();
    if (!l) return;
    sol.interacted = true;
    const st = l.steps[idx], fx = DRAW_KIND[kind];
    const my = sol.gen;
    const b = { idx, kind, draw: true, inherent: !!st.tags.inherent, loading: true, options: null, sel: 0, error: null };
    sol.branch = b;
    renderBranch();
    const br = $('branch');
    if (br) br.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
    const it = { kind, src: 'hand', label: fx[1], force: true };
    try {
      const res = await Promise.all(DPENS.map((dpen) => Pool.run({ type: 'branch', cfg: sol.cfg, dpen, prefix: l.path.slice(0, st.pathIdx), key: st.key, it, frontier: true, timeMs: 1200, width: 60, maxWidth: 4000, hand: sol.handIds }, null, true)));
      const all = [];
      for (const r of res) if (r) { all.push(r.best); for (const f of r.frontier) all.push(f); }
      b.options = tradeOptions(all);
      let best = 0;
      b.options.forEach((o, i) => { if (o.score > b.options[best].score) best = i; });
      b.sel = best; b.best = best;
    } catch (e) { if (e === CANCEL) return; b.error = (e && e.message) || 'unknown error'; }
    b.loading = false;
    if (my === sol.gen && sol.branch === b) renderBranch();
  }
  function renderBranch(quiet) {
    const el = $('branch');
    if (!el) return;
    const b = sol.branch;
    if (!b) { el.innerHTML = ''; return; }
    const fx = b.draw ? DRAW_KIND[b.kind] : null;
    const title = b.draw ? (b.inherent ? `If they answer step ${b.idx + 1} with ${fx[3]}` : `If they chain ${fx[3]} to step ${b.idx + 1}`) : `If step ${b.idx + 1} ${WI[b.kind][0]}`;
    let html = `<div class="panel branch ${quiet ? '' : 'fade'}"><div class="row spread"><h3>${esc(title)}</h3><button class="btn sm quiet" id="close-branch">Close</button></div>`;
    if (b.loading) html += '<div class="skel" style="width:55%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div>';
    else if (b.error) html += `<p>That search failed (${esc(b.error)}). Try it again.</p>`;
    else if (b.draw) {
      if (!b.options || !b.options.length) html += '<p>Nothing useful follows. Pass with what you have.</p>';
      else {
        const r = b.options[b.sel];
        html += `<p class="fine">From ${b.inherent ? 'the next summon' : 'this step'} on, ${esc(E.MUL_TEXT[b.kind])}. Choose how many cards you give them:</p>`;
        html += `<div class="trade">${b.options.map((o, i) => { return `<button class="opt" data-opt="${i}" aria-pressed="${i === b.sel}"><span class="od num">${plural(o.summary.draws || 0, 'draw')}</span><span class="ob">${esc(boardShort(o))}</span>${i === b.best ? '<span class="badge">Best trade</span>' : ''}</button>`; }).join('')}</div>`;
        html += `<ol class="steps ${quiet ? '' : 'cascade'}">${r.steps.map((s, i) => stepHtml(s, i, { active: activeKinds(), preTo: b.idx })).join('')}</ol>`;
        if (r.sets.length) html += `<p class="sets">Then Set ${r.sets.map((id) => rich(S(id))).join(', ')}.</p>`;
        html += boardRows(r);
        const tl = turnList(r);
        if (tl) html += `<h2>What it does on their turn</h2>${tl}`;
      }
    } else if (!b.result) html += '<p>Nothing useful follows. Pass with what you have.</p>';
    else {
      const r = b.result, h = headline(r);
      html += `<p><b class="num" style="font-family:var(--f-display)">${esc(h.big)} ${esc(h.small)}</b> <span class="muted">is the best you can still reach.</span></p>`;
      html += `<ol class="steps cascade">${r.steps.map((s, i) => stepHtml(s, i, { active: activeKinds(), preTo: b.idx })).join('')}</ol>`;
      if (r.sets.length) html += `<p class="sets">Then Set ${r.sets.map((id) => rich(S(id))).join(', ')}.</p>`;
      html += boardRows(r);
    }
    el.innerHTML = html + '</div>';
  }

  // ── Dock (phones) ──
  function setView(v) {
    document.body.dataset.view = v;
    const vs = $('viewseg');
    vs.dataset.on = v === 'line' ? '1' : '0';
    vs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.go === v));
    window.scrollTo(0, 0);
    renderDock();
  }
  $('viewseg').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) setView(b.dataset.go); });
  function renderDock() {
    const el = $('dock');
    const l = current();
    if (document.body.dataset.view === 'line') {
      const shown = shownLine();
      const n = shown ? Math.min(sol.prog.get(progKey()) || 0, shown.steps.length) : 0;
      el.innerHTML = `<button class="btn" data-go="setup"><svg class="icon"><use href="#i-prev"/></svg> Hand</button><div class="stepper">${shown ? stepperHtml(n, shown.steps.length) : ''}</div>`;
      return;
    }
    let big = 'Add your hand', sub = 'Lines appear as you pick cards';
    if (l) {
      const h = headline(l), v = worstVerdict(l);
      big = `${h.big} ${h.small}`;
      if (sol.cfg && sol.cfg.mul) big = `${plural(l.summary.draws || 0, 'draw')} for ${boardShort(l)}`;
      sub = `${plural(l.steps.length, 'step')}${l.testing ? ' · testing…' : v ? ' · ' + v.short : ''}`;
    } else if (hand.length) { big = 'Finding lines…'; sub = ''; }
    el.innerHTML = `<button class="peek" data-go="line" ${l ? '' : 'disabled'}><b class="num">${esc(big)}</b><span>${esc(sub)}</span></button><button class="btn primary" data-go="line" ${l ? '' : 'disabled'}>View line <svg class="icon"><use href="#i-next"/></svg></button>`;
  }
  $('dock').addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go && !go.disabled) { setView(go.dataset.go); return; }
    const st = e.target.closest('[data-step]');
    if (st) stepBy(+st.dataset.step);
  });

  // ── Copy ──
  function lineName(l) {
    return `${sol.mode === 'second' ? 'Going second' : 'Going first'}: ${sol.handIds.map((id) => (id === 'UNK' ? 'blank' : S(id))).join(' + ')}${l.safest ? ' (safest lethal)' : ''}`;
  }
  function lineText(l) {
    const out = [lineName(current()), ''];
    l.steps.forEach((s, i) => out.push(`${i + 1}. ${s.text}${s.interrupted ? ` [${s.interrupted}]` : ''}`));
    if (l.sets.length) out.push(`Then Set ${l.sets.map(S).join(', ')}.`);
    out.push('', 'End board: ' + l.board.mons.map((m) => S(m.id)).concat(l.board.st.map((x) => S(x.id) + (x.up ? '' : ' (Set)'))).join(', '));
    const it = l.items.filter((x) => x[1] >= 0.3).map((x) => x[0]);
    if (it.length) out.push('Their turn: ' + it.join('; '));
    return out.join('\n');
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      toast(ok ? msg : 'Copy was blocked. Select the steps and copy them by hand.');
    }
  }

  // ── Card text tray ──
  let inspId = null;
  function openInspect(id) {
    const c = TEXT[id];
    if (!c) return;
    inspId = id;
    const el = $('inspect');
    const isMon = /Monster/.test(c.type);
    const line = isMon ? `${c.attr} ${c.race} · ${/Link/.test(c.type) ? 'Link-' + c.level : 'Level ' + c.level} · ${c.atk}${c.dfn != null ? ' / ' + c.dfn : ''}` : `${c.race} ${c.type.replace(' Card', '')}`;
    el.className = `inspect open ${frameClass(id)}`;
    el.innerHTML = `<div class="ih"><div><h3>${esc(c.name)}</h3><div class="type">${esc(line)} · ${c.count} in deck</div></div><button class="xbtn" id="insp-close" aria-label="Close card text">×</button></div><div class="text">${esc(c.desc)}</div>`;
  }
  function closeInspect() { inspId = null; $('inspect').classList.remove('open'); }
  let lpT = 0, lpFired = 0;
  const suppressClick = () => Date.now() - lpFired < 600;
  document.addEventListener('click', (e) => {
    if (e.target.closest('#insp-close')) { closeInspect(); return; }
    const t = e.target.closest('[data-insp]');
    if (t && t.dataset.card) { e.preventDefault(); openInspect(t.dataset.card); return; }
    if (inspId && !e.target.closest('#inspect')) closeInspect();
  });
  document.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('[data-card]');
    if (t && TEXT[t.dataset.card]) { e.preventDefault(); openInspect(t.dataset.card); }
  });
  document.addEventListener('touchstart', (e) => {
    const t = e.target.closest('[data-card]');
    clearTimeout(lpT);
    if (!t || t.dataset.insp != null || !TEXT[t.dataset.card]) return;
    lpT = setTimeout(() => { lpFired = Date.now(); openInspect(t.dataset.card); }, 480);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => document.addEventListener(ev, () => clearTimeout(lpT), { passive: true }));

  // ── Keyboard ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (inspId) closeInspect(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return;
    const onControl = t && t.closest && t.closest('button, summary, a');
    if (e.key === 'ArrowRight' || (e.key === ' ' && !onControl)) { if (current()) { stepBy(1); e.preventDefault(); } return; }
    if (e.key === 'ArrowLeft') { if (current()) { stepBy(-1); e.preventDefault(); } return; }
    if (e.key.length === 1 && /[a-z]/i.test(e.key) && !isPhone()) $('find').focus();
  });

  // ── Deck list (YDKE) ──
  function deckSummary() {
    const main = Object.entries(counts).filter(([id]) => ORIGINAL[id] && ORIGINAL[id].zone === 'main').reduce((t, [, n]) => t + n, 0) + blanks;
    const extra = Object.entries(counts).filter(([id]) => ORIGINAL[id] && ORIGINAL[id].zone === 'extra').reduce((t, [, n]) => t + n, 0);
    $('deck-sum').textContent = `${main} main + ${extra} extra${blanks ? ` (${plural(blanks, 'card')} the solver doesn't know, counted as blanks)` : ''}.`;
    $('deck-meta').textContent = `Dark Magician / Azamina · ${main} + ${extra}`;
  }
  function parseYdke(text) {
    const m = /ydke:\/\/([^!]*)!([^!]*)!/.exec(text.trim());
    if (!m) throw new Error("That isn't a YDKE link. It starts with ydke://");
    const dec = (b64) => { if (!b64) return []; const bin = atob(b64); const out = []; for (let i = 0; i + 3 < bin.length; i += 4) out.push((bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8) | (bin.charCodeAt(i + 2) << 16) | (bin.charCodeAt(i + 3) << 24)) >>> 0); return out; };
    return { main: dec(m[1]), extra: dec(m[2]) };
  }
  $('ydke-apply').addEventListener('click', () => {
    try {
      const d = parseYdke($('ydke').value);
      const c = {}; let b = 0;
      for (const p of d.main.concat(d.extra)) { const id = PASS[p]; if (id) c[id] = (c[id] || 0) + 1; else b++; }
      counts = c; blanks = b;
      hand = hand.filter((h) => h.id === 'UNK' || (counts[h.id] || 0) > 0);
      renderHand(); renderPicker(); deckSummary(); toast('Deck updated.'); clearBase(); changed();
    } catch (e) { toast(e.message); }
  });
  $('ydke-reset').addEventListener('click', () => { counts = freshCounts(); blanks = 0; renderPicker(); deckSummary(); toast('Back to the original list.'); changed(); });

  // ── Reading a screenshot (asks Claude; the page asks your permission the first time) ──
  let sample = null;
  (async () => {
    try {
      if (!window.claude || !window.claude.use) return;
      sample = await window.claude.use('sample');
      if (!sample) return;
      const lim = sample.limits ? await sample.limits() : { images: true };
      if (!lim || !lim.images) { sample = null; return; }
      $('shot-btn').hidden = false;
    } catch (e) { sample = null; }
  })();
  let reading = false;
  async function readShot(file) {
    if (!file || !/^image\//.test(file.type)) return;
    if (!sample) { toast('Screenshot reading is not available here. Pick the cards by hand.'); return; }
    if (reading) return;
    reading = true;
    const names = Object.keys(ORIGINAL).filter((id) => ORIGINAL[id].zone === 'main' && counts[id]).map(N);
    const prompt = `You are reading a Yu-Gi-Oh! Master Duel screenshot. The player's own hand is the row of face-up cards along the bottom edge.
List every card in the player's hand, left to right. Each must be one of these exact names, or "Other" if it is none of them:
${names.join('\n')}
goingFirst: true if the opponent's field is empty and it is the player's first turn; false if the opponent already has cards on the field or took the first turn; null if unclear.
If the opponent has monsters on the field, list them with the exact English card name if you can read it, ATK, DEF and position ("attack", "defense" or "set"). List the opponent's face-up Spell/Trap names, and count their face-down Set cards.
Reply with JSON only:
{"hand":["..."],"goingFirst":true,"opponent":{"lp":8000,"monsters":[{"name":"","atk":0,"def":0,"position":"attack"}],"spellTraps":[""],"setCards":0}}`;
    $('status').textContent = 'Reading the screenshot…'; $('spin').hidden = false;
    try {
      const res = await sample(prompt, { images: [file], modelTier: 'default' });
      const txt = (res && res.text) || '';
      const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      const got = [];
      const used = {};
      for (const n of (j.hand || [])) {
        let id = E.BY_NAME[n] || 'UNK';
        if (id !== 'UNK') { used[id] = (used[id] || 0) + 1; if (used[id] > (counts[id] || 0)) id = 'UNK'; }
        got.push(id);
      }
      if (!got.length) throw new Error('no cards');
      hand = got.slice(0, 7).map((id) => ({ id, u: uidN++ }));
      const o = j.opponent || {};
      const second = j.goingFirst === false || (o.monsters && o.monsters.length) || (o.spellTraps && o.spellTraps.length) || o.setCards;
      if (second) {
        const ix = loadIndex();
        const mons = (o.monsters || []).map((m) => {
          const hit = m.name && ix.by.get(String(m.name).toLowerCase());
          const base = hit && hit.mon ? fromIndex(hit) : newMon({ name: m.name || '', atk: +m.atk || 0, def: +m.def || 0 });
          base.pos = m.position === 'defense' ? 'def' : m.position === 'set' ? 'set' : 'atk';
          if (+m.atk && !hit) base.atk = +m.atk;
          return base;
        });
        const st = (o.spellTraps || []).filter(Boolean).map((n) => { const hit = ix.by.get(String(n).toLowerCase()); return hit && !hit.mon ? fromIndex(hit) : newST({ name: String(n) }); });
        for (let i = 0; i < Math.min(5, +o.setCards || 0); i++) st.push(newST());
        opp = { lp: +o.lp || 8000, mons, st };
        setMode('second', true); renderOpp();
      } else if (j.goingFirst === true) setMode('first', true);
      renderHand(); renderPicker();
      clearBase();
      toast('Read the screenshot. Check the hand before you trust the line.');
      changed(0);
    } catch (err) {
      renderStatus();
      toast(err && err.code === 'rate_limited' ? 'Too many screenshot reads just now. Pick the cards by hand.' : "Couldn't read that screenshot. Pick the cards by hand.");
    } finally { reading = false; }
  }
  $('shot-btn').addEventListener('click', () => $('shot-file').click());
  $('shot-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; readShot(f); });
  // A board copied by MD Board Scanner (the Windows tool): {"mdboard":1,"mons":[...],"st":[...]}
  function importBoard(j) {
    const ix = loadIndex();
    const conv = (c, mon) => {
      const name = c.name || c.guess || '';
      const hit = name && ix.by.get(name.toLowerCase());
      let o;
      if (hit && hit.mon === mon) o = fromIndex(hit);
      else o = mon ? newMon({ name: c.set && !c.guess ? '' : name }) : newST({ name: c.set && !c.guess ? '' : name });
      if (mon) o.pos = c.pos === 'def' ? 'def' : c.pos === 'set' && !c.guess ? 'set' : 'atk';
      if (c.guess) { o.unsure = true; o.alts = [c.guess].concat(c.alts || []); }
      else if (c.name && c.conf != null && c.conf < 0.58) { o.unsure = true; o.alts = [c.name].concat(c.alts || []); }
      return o;
    };
    opp = { lp: opp.lp, mons: (j.mons || []).map((c) => conv(c, true)), st: (j.st || []).map((c) => conv(c, false)) };
    clearBase();
    setMode('second', true);
    renderOpp(); renderUnseen();
    const unsure = opp.mons.concat(opp.st).filter((c) => c.unsure).length;
    const n = opp.mons.length + opp.st.length;
    toast(n ? `Their field: ${plural(n, 'card')} from the scanner${unsure ? `, ${unsure} to check` : ''}.` : 'The scanner saw an empty field.');
    changed(0);
  }
  document.addEventListener('paste', (e) => {
    const txt = e.clipboardData && e.clipboardData.getData && e.clipboardData.getData('text');
    if (txt && txt.indexOf('"mdboard"') >= 0) {
      try { const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); if (j.mdboard) { e.preventDefault(); importBoard(j); return; } } catch (err) { /* not a board */ }
    }
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) if (it.kind === 'file' && /^image\//.test(it.type)) { e.preventDefault(); readShot(it.getAsFile()); return; }
  });
  const mat = $('mat');
  mat.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); mat.classList.add('drop'); } });
  mat.addEventListener('dragleave', () => mat.classList.remove('drop'));
  mat.addEventListener('drop', (e) => { mat.classList.remove('drop'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); readShot(f); } });

  // ── Start ──
  function start(data) {
    let saved = data && data.v === 2 ? data : null;
    if (!saved) { try { saved = JSON.parse(localStorage.getItem('dm-azamina-finder') || 'null'); } catch (e) { saved = null; } }
    if (!restore(saved)) {
      mode = 'first';
      hand = ['SOULS', 'DIA', 'SERV', 'GAZE', 'CURT'].map((id) => ({ id, u: uidN++ }));
    }
    $('ydke').value = 'ydke://sfTMAv2JnAX9iZwFR7zRBSqVZQFhGGwAYRhsAGEYbACvI94AryPeAK8j3gA1B4MCNQeDAjUHgwL4KyYA+CsmAPgrJgADwk4EA8JOBAPCTgSROgUAk3hHBRqbIwD1KrsADPrDBQz6wwUM+sMFlDqnBQiP0AIGh8EESBf0A11p3gJdad4CeENfAeqY0QS6jLAExANUAcQDVAER9XYCEfV2AhH1dgJRF0IE!folDA2I29wNIiLMAOvPDAlrfXwSqEUECUukRBbpiigNWLQ4FjqxcAdoj6wPrK/8Cyhq/AaMwTADq66MB!!';
    setMode(mode, true);
    renderPicker(); renderOpp(); renderHts(); renderUnseen(); deckSummary(); renderStatus(); renderLine('none'); renderDock();
    startSolve(false);
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) { try { hot.snapshot(() => snapshot()); } catch (e) { /* optional */ } }
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : null);
})();
