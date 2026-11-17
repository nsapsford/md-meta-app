// Line solver for the Dark Magician / Azamina deck. Models each card's effects
// on a small game state, searches Main Phase 1 lines, and scores the end
// position (going first: interruptions for their turn; going second: damage
// and removal). Plain script: works in the page and under Node for tests.
(function (root) {
  'use strict';

  const NAMES = {
    DM: 'Dark Magician', DROLL: 'Droll & Lock Bird', SOULS: "Magicians' Souls", MAXX: 'Maxx "C"',
    ROD: "Magician's Rod", ASH: 'Ash Blossom & Joyous Spring', FUWA: 'Mulcharmy Fuwalos',
    DMG: "Dark Magician Girl the Magician's Apprentice", DIA: 'Diabellstar the Black Witch',
    DMBM: 'Dark Magician the Magician of Black Magic', SERV: "Dark Magician, the Pharaoh's Servant",
    GAND: 'Gandora-G the Dragon of Destruction', IOC: 'Illusion of Chaos', PREP: 'Preparation of Rites',
    HALL: 'The Hallowed Azamina', CIRC: 'Dark Magical Circle', SARC: 'Shining Sarcophagus',
    DECE: 'Deception of the Sinful Spoils', SPOLY: 'Super Polymerization', SSRV: 'Soul Servant',
    WANT: 'WANTED: Seeker of Sinful Spoils', FSIL: 'Future Silence', GAZE: 'The Gaze of Timaeus',
    CURT: 'Dark Magical Curtain', TALI: 'Dark Magic Talisman',
    MUD: 'Mudragon of the Swamp', CHOR: 'Magistus Chorozo', GAR: 'Garura, Wings of Resonant Life',
    ILIA: 'Azamina Ilia Silvia', RCIE: 'Azamina Mu Rcielago', DRAG: 'Red-Eyes Dark Dragoon',
    MOC: 'Master of Chaos', DMOD: 'Dark Magician of Destruction', BAR: 'Baronne de Fleur',
    CANG: 'Chaos Angel', MASQ: 'I:P Masquerena', SHEEP: 'Cross-Sheep', SPLK: 'S:P Little Knight',
    FANCY: 'W:P Fancy Ball', CHARM: 'Charmer Quartet in Bloom', UNK: '?',
  };
  const SHORT = {
    DM: 'Dark Magician', DROLL: 'Droll', SOULS: "Magicians' Souls", MAXX: 'Maxx "C"', ROD: 'Rod',
    ASH: 'Ash', FUWA: 'Fuwalos', DMG: 'DMG Apprentice', DIA: 'Diabellstar', DMBM: 'DM of Black Magic',
    SERV: "Pharaoh's Servant", GAND: 'Gandora-G', IOC: 'Illusion of Chaos', PREP: 'Preparation of Rites',
    HALL: 'Hallowed Azamina', CIRC: 'Circle', SARC: 'Sarcophagus', DECE: 'Deception', SPOLY: 'Super Poly',
    SSRV: 'Soul Servant', WANT: 'WANTED', FSIL: 'Future Silence', GAZE: 'Gaze', CURT: 'Curtain',
    TALI: 'Talisman', MUD: 'Mudragon', CHOR: 'Chorozo', GAR: 'Garura', ILIA: 'Ilia Silvia',
    RCIE: 'Rcielago', DRAG: 'Dragoon', MOC: 'Master of Chaos', DMOD: 'DM of Destruction', BAR: 'Baronne',
    CANG: 'Chaos Angel', MASQ: 'Masquerena', SHEEP: 'Cross-Sheep', SPLK: 'Little Knight',
    FANCY: 'Fancy Ball', CHARM: 'Charmer Quartet', UNK: 'unknown card',
  };
  const BY_NAME = {};
  for (const k in NAMES) BY_NAME[NAMES[k]] = k;

  // Card properties, filled from the page's card data by init().
  const P = {};
  function init(cardData) {
    for (const c of cardData) {
      const id = BY_NAME[c.name];
      if (!id) continue;
      const t = c.type;
      P[id] = {
        id, name: c.name,
        kind: /Monster/.test(t) ? 'M' : /Trap/.test(t) ? 'T' : 'S',
        st: /Monster/.test(t) ? null : c.race,                  // Normal | Continuous | Quick-Play
        ext: /Fusion|Synchro|Link|XYZ/.test(t),
        sub: /Normal Monster/.test(t) ? 'Normal' : /Ritual/.test(t) ? 'Ritual' : /Fusion/.test(t) ? 'Fusion'
          : /Synchro/.test(t) ? 'Synchro' : /Link/.test(t) ? 'Link' : 'Effect',
        tuner: /Tuner/.test(t),
        race: /Monster/.test(t) ? c.race : null, attr: c.attr || null,
        lv: /Link/.test(t) ? null : c.level, link: /Link/.test(t) ? c.level : null,
        atk: c.atk || 0, def: c.dfn || 0,
      };
    }
    P.UNK = { id: 'UNK', name: '?', kind: '?', ext: false, sub: '?' };
  }

  // ── Card groups used by searches ──
  const DM_ST = ['CIRC', 'CURT', 'GAZE', 'TALI', 'SSRV'];                       // Spell/Trap that lists "Dark Magician"
  const DMOD_SEARCH = ['DM', 'ROD', 'SOULS', 'SERV', 'DMBM', 'IOC', 'CIRC', 'CURT', 'GAZE', 'TALI', 'SSRV'];
  const IOC_ADD = ['DM', 'ROD', 'SOULS', 'SERV', 'DMBM'];
  const SSRV_PLACE = ['DM', 'ROD', 'SOULS', 'SERV', 'DMBM', 'IOC', 'CIRC', 'CURT', 'GAZE', 'TALI', 'DMG'];
  const CIRC_ADD = ['DM', 'CURT', 'GAZE', 'TALI', 'SSRV'];
  const SARC_ADD = ['DMG', 'DMBM', 'GAND', 'FSIL'];
  const SARC_MON = ['DMG', 'DMBM', 'GAND'];
  const SOULS_SEND = ['DM', 'DMG', 'DIA', 'DMBM', 'SERV', 'IOC'];
  const CURT_SS = ['DM', 'SERV', 'DMBM', 'DIA', 'DMG', 'ROD', 'SOULS'];
  const SINFUL = ['DECE', 'WANT'];
  const MENTIONS_DM = new Set(['ROD', 'SOULS', 'SERV', 'DMBM', 'IOC', 'CIRC', 'CURT', 'GAZE', 'TALI', 'SSRV', 'DMOD', 'DRAG', 'MOC']);
  const HANDTRAPS = { ASH: 1.0, DROLL: 0.9, FUWA: 0.8, MAXX: 0.8 };
  const SPELLCASTER_IN_HAND = ['DM', 'DROLL', 'SOULS', 'ROD', 'DMG', 'DIA', 'DMBM', 'SERV', 'IOC'];

  // ── Small helpers ──
  // A zone (hand, Deck, Extra Deck, GY, banished) is a byte array of copies per card.
  const IDS = Object.keys(NAMES);
  const NID = IDS.length;
  const IX = {};
  IDS.forEach((id, i) => { IX[id] = i; });
  const zone = (obj) => { const z = new Uint8Array(NID); if (obj) for (const k in obj) if (IX[k] !== undefined) z[IX[k]] = obj[k]; return z; };
  const toObj = (z) => { const o = {}; for (let i = 0; i < NID; i++) if (z[i]) o[IDS[i]] = z[i]; return o; };
  const inc = (o, k, n = 1) => { o[IX[k]] += n; };
  const dec = (o, k) => { const i = IX[k]; if (!o[i]) throw new Error('missing ' + k); o[i]--; };
  const has = (o, k) => o[IX[k]] > 0;
  const cnt = (o, k) => o[IX[k]] || 0;
  const keys = (o) => { const out = []; for (let i = 0; i < NID; i++) if (o[i]) out.push(IDS[i]); return out; };
  const total = (o) => { let t = 0; for (let i = 0; i < NID; i++) t += o[i]; return t; };
  const N = (id) => NAMES[id];
  const S = (id) => SHORT[id] || id;
  const isSpell = (id) => P[id] && P[id].kind === 'S';
  const isST = (id) => P[id] && (P[id].kind === 'S' || P[id].kind === 'T');
  const gyName = (id) => (id === 'SERV' || id === 'DMOD' ? 'DM' : id);

  // Once-per-turn flags live in two bit masks (o1, o2).
  const OPT_NAMES = ['barNeg', 'circ1', 'circ2', 'curt', 'dec1', 'dec2', 'dia1', 'diaP', 'dmbm1', 'dmg1', 'dmgP', 'dmodS', 'dmodSS', 'dragNeg', 'fsil', 'gand1', 'gand2', 'gar', 'gaze', 'hallG', 'iliaNeg', 'ioc1', 'moc1', 'moc2', 'rcie1', 'rod1', 'sarc1', 'serv', 'souls1', 'souls2', 'splk1', 'ssrv2', 'tali3', 'want1', 'want2'];
  const OB = {};
  OPT_NAMES.forEach((n, i) => { OB[n] = i; });
  function GO(s, n) { const b = OB[n]; return b < 30 ? (s.o1 >>> b) & 1 : (s.o2 >>> (b - 30)) & 1; }
  function SO(s, n) { const b = OB[n]; if (b < 30) s.o1 |= (1 << b); else s.o2 |= (1 << (b - 30)); }

  // Card zones are shared between a position and the positions made from it; a zone is
  // copied the first time it is written (W), and the opponent's side likewise (OW).
  const ZBIT = { hand: 1, deck: 2, extra: 4, gy: 8, ban: 16 };
  const ZKEY = { hand: 'k1', deck: 'k2', extra: 'k3', gy: 'k4', ban: 'k5' };
  function W(s, z) {
    const b = ZBIT[z];
    if (!(s.own & b)) { s[z] = s[z].slice(); s.own |= b; }
    s[ZKEY[z]] = 0;
    return s[z];
  }
  function OW(s) {
    if (!s.oppOwn) { const o = s.opp; s.opp = { mons: o.mons.slice(), st: o.st.slice(), lp: o.lp, lp0: o.lp0, k: null, k2: 0 }; s.oppOwn = true; }
    s.opp.k = null;
    return s.opp;
  }

  function newState(cfg) {
    return {
      mode: cfg.mode || 'first',
      hand: zone(cfg.hand), deck: zone(cfg.deck), extra: zone(cfg.extra), gy: zone(), ban: zone(),
      own: 31, k1: 0, k2: 0, k3: 0, k4: 0, k5: 0,
      mons: [], st: [], top: [],
      ns: false, o1: 0, o2: 0, spell: false, summons: 0, lp: 8000, droll: false, pend: [],
      opp: cfg.opp ? { mons: cfg.opp.mons.map((m, i) => ({ ...m, ui: i + 1 })), st: cfg.opp.st.map((x, i) => ({ ...x, ui: i + 1 })), lp: cfg.opp.lp, lp0: cfg.opp.lp, k: null, k2: 0 } : null,
      oppOwn: true,
      burn: 0, removed: 0, noDirect: false, deceReset: false, log: [], uid: 1, path: [], spent: null, cur: null, cAsh: 0, cDroll: 0, cMon: 0,
      mul: cfg.mul || 0, oppDraws: 0, dpen: cfg.dpen == null ? 55 : cfg.dpen, opening: null,
    };
  }

  function clone(s) {
    s.own = 0; s.oppOwn = false;
    return {
      mode: s.mode, hand: s.hand, deck: s.deck, extra: s.extra, gy: s.gy, ban: s.ban,
      own: 0, k1: s.k1, k2: s.k2, k3: s.k3, k4: s.k4, k5: s.k5,
      mons: s.mons.slice(), st: s.st.slice(), top: s.top.slice(),
      ns: s.ns, o1: s.o1, o2: s.o2, spell: s.spell, summons: s.summons, lp: s.lp, droll: s.droll, pend: s.pend.slice(),
      opp: s.opp, oppOwn: false,
      burn: s.burn, removed: s.removed, noDirect: s.noDirect, deceReset: s.deceReset, log: s.log, uid: s.uid, path: s.path, spent: s.spent, cur: null, cAsh: s.cAsh, cDroll: s.cDroll, cMon: s.cMon,
      mul: s.mul, oppDraws: s.oppDraws, dpen: s.dpen, opening: s.opening,
    };
  }

  // Position keys: each zone hashes to a 53-bit number, cached until the zone is written.
  const RA = new Int32Array(64), RB = new Int32Array(64);
  (() => { let x = 0x9e3779b9 | 0; const nx = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; }; for (let i = 0; i < 64; i++) { RA[i] = nx() | 1; RB[i] = nx() | 1; } })();
  function zkey(o) {
    let a = 0x1234567, b = 0x7654321;
    for (let i = 0; i < NID; i++) { const v = o[i]; if (v) { a = (a + Math.imul(RA[i], v + 7 * i + 1)) | 0; b = (Math.imul(b ^ RB[i], 0x85ebca6b) + v) | 0; } }
    return (a >>> 0) * 2097152 + (b >>> 11) + 1;
  }
  const PT = { rod: 1, dia: 2, dmg: 3, dmod: 4, rcie: 5, moc1: 6, circ2: 7, cang: 8, splk: 9, tali3: 10, gar: 11 };
  function mix(h, v) { h = Math.imul(h ^ v, 0x9e3779b1); return h ^ (h >>> 15); }
  function stateKey(s) {
    if (!s.k1) s.k1 = zkey(s.hand);
    if (!s.k2) s.k2 = zkey(s.deck);
    if (!s.k3) s.k3 = zkey(s.extra);
    if (!s.k4) s.k4 = zkey(s.gy);
    if (!s.k5) s.k5 = zkey(s.ban);
    let a = 0x2545f491, b = 0x6a09e667;
    a = mix(a, s.k1 | 0); b = mix(b, (s.k1 / 4294967296) | 0);
    a = mix(a, s.k2 | 0); b = mix(b, (s.k2 / 4294967296) | 0);
    a = mix(a, s.k3 | 0); b = mix(b, (s.k3 / 4294967296) | 0);
    a = mix(a, s.k4 | 0); b = mix(b, (s.k4 / 4294967296) | 0);
    a = mix(a, s.k5 | 0); b = mix(b, (s.k5 / 4294967296) | 0);
    let m1 = 0, m2 = 0;
    for (let i = 0; i < s.mons.length; i++) {
      const m = s.mons[i];
      const v = IX[m.id] | (IX[m.nm] << 6) | ((m.noEff ? 1 : 0) << 12) | ((m.uses & 7) << 13) | ((m.lvl & 63) << 16) | (m.emz ? 1 << 22 : 0);
      m1 = (m1 + mix(0x1b873593, v)) | 0; m2 = (m2 + mix(0x5bd1e995, v + 0x7f4a7c15)) | 0;
    }
    a = mix(a, m1); b = mix(b, m2); a = mix(a, s.mons.length);
    m1 = 0; m2 = 0;
    for (let i = 0; i < s.st.length; i++) {
      const x = s.st[i];
      const v = IX[x.id] | (x.up ? 64 : 0) | (x.now ? 128 : 0);
      m1 = (m1 + mix(0x27d4eb2f, v)) | 0; m2 = (m2 + mix(0x165667b1, v + 0x3c6ef372)) | 0;
    }
    a = mix(a, m1); b = mix(b, m2); b = mix(b, s.st.length);
    for (let i = 0; i < s.top.length; i++) { const v = IX[s.top[i]]; a = mix(a, v + 1); b = mix(b, v + 77); }
    a = mix(a, 0x100 | (s.ns ? 1 : 0) | (s.spell ? 2 : 0) | (s.droll ? 4 : 0) | (s.noDirect ? 8 : 0) | (s.deceReset ? 16 : 0));
    a = mix(a, s.o1); b = mix(b, s.o2 ^ 0x5bf03635); b = mix(b, s.o1 + 0x1f83d9ab);
    for (let i = 0; i < s.pend.length; i++) { const v = PT[s.pend[i].t] || 15; a = mix(a, v); b = mix(b, v * 31 + 7); }
    if (s.opp) {
      const o = s.opp;
      if (o.k === null) {
        let x = 0x811c9dc5 | 0, y = 0x01000193;
        for (let i = 0; i < o.mons.length; i++) { x = mix(x, o.mons[i].ui); y = mix(y, o.mons[i].ui * 131 + 1); }
        x = mix(x, 0xfff);
        for (let i = 0; i < o.st.length; i++) { x = mix(x, o.st[i].ui + 64); y = mix(y, o.st[i].ui * 137 + 5); }
        o.k = x; o.k2 = y;
      }
      a = mix(a, o.k); b = mix(b, o.k2); a = mix(a, s.burn);
    }
    a = mix(a, s.lp);
    if (s.mul) b = mix(b, 0x4000 | (s.mul << 8) | s.oppDraws);
    if (s.spent) { let sp = 0; for (const q in s.spent) sp |= 1 << q; b = mix(b, sp + 0x9999); }
    return (a >>> 0) * 2097152 + (b >>> 11);
  }

  // ── Step recording (text, interruption tags, ledger for the app) ──
  const NOTAGS = Object.freeze({});
  function step(s, text, tags) {
    s.cur = { text, tags: tags || NOTAGS, seq: null, ns: 0, xs: 0, summonsAfter: 0, interrupted: null, pre: null, act: null, fD: false, fH: false, fS: false, draws: 0 };
    return s.cur;
  }
  function done(s) {
    const c = s.cur, t = c.tags;
    c.summonsAfter = s.summons;
    if (t.ash) s.cAsh++;
    if (t.droll) s.cDroll++;
    if (t.field) s.cMon++;
    if (s.mul) {
      // Fuwalos: Special Summons from the Deck or Extra Deck. Purulia: Normal or Special Summons from the hand. Maxx "C": any Special Summon.
      let d = 0;
      if ((s.mul & 1) && c.fD) d++;
      if ((s.mul & 2) && c.fH) d++;
      if ((s.mul & 4) && c.fS) d++;
      if (d) { c.draws = d; s.oppDraws += d; }
    }
    const lg = s.log.slice(); lg.push(c); s.log = lg;
    s.cur = null;
    return s;
  }
  // Ledger entries for the app's rule checker, kept as tuples until a line is exported.
  const L = {
    act(s, id, effect, from) { const c = s.cur; (c.seq || (c.seq = [])).push(['a', id, effect || 0, from || null]); },
    sum(s, id, method, from, mats, extra) {
      const c = s.cur; c.ns++; if (from === 'extra') c.xs++;
      const special = method !== 'normal' && method !== 'tribute', origin = from || 'hand';
      if (special) c.fS = true;
      if (origin === 'hand') c.fH = true; else if (special && (origin === 'deck' || origin === 'extra')) c.fD = true;
      (c.seq || (c.seq = [])).push(['s', id, method, from || null, mats || null, extra || null]);
    },
    mv(s, id, from, to) { const c = s.cur; (c.seq || (c.seq = [])).push(['m', id, from, to]); },
  };
  function ledObjs(st) {
    return (st.seq || []).map((t) => (t[0] === 'a' ? ['a', { card: N(t[1]), ...(t[2] ? { effect: t[2] } : {}), ...(t[3] ? { from: t[3] } : {}) }]
      : t[0] === 's' ? ['s', { card: N(t[1]), method: t[2], ...(t[3] ? { from: t[3] } : {}), ...(t[4] && t[4].length ? { materials: t[4].map(N) } : {}), ...(t[5] || {}) }]
        : ['m', { card: t[1] === 'UNK' ? '?' : N(t[1]), from: t[2], to: t[3] }]));
  }

  // ── Zone operations ──
  function shuffle(s) { for (const id of s.top) inc(W(s, 'deck'), id); s.top = []; }
  function fromDeck(s, id) { dec(W(s, 'deck'), id); shuffle(s); }
  function draw(s, n) {
    const got = [];
    for (let i = 0; i < n; i++) {
      if (s.top.length) { const id = s.top.shift(); inc(W(s, 'hand'), id); L.mv(s, id, 'deck', 'hand'); got.push(id); }
      else { inc(W(s, 'hand'), 'UNK'); L.mv(s, 'UNK', 'deck', 'hand'); got.push('UNK'); }
    }
    return got;
  }
  function stFree(s) { return 5 - s.st.length; }
  function monFree(s) { return 5 - s.mons.filter((m) => !m.emz).length; }

  // Monster leaves the field to the GY (cost, material, tribute).
  function monToGY(s, idx, ledger = true) {
    const m = s.mons.splice(idx, 1)[0];
    inc(W(s, 'gy'), m.id);
    if (ledger) L.mv(s, m.id, 'field', 'gy');
    if (m.id === 'GAR' && !GO(s, 'gar')) s.pend.push({ t: 'gar' });
    return m;
  }
  function stToGY(s, idx) {
    const x = s.st.splice(idx, 1)[0];
    inc(W(s, 'gy'), x.id);
    L.mv(s, x.id, 'field', 'gy');
    if (x.id === 'DECE' && x.up) s.deceReset = true;
    return x;
  }

  function fieldName(id, ownProc) {
    if (id === 'SERV' || id === 'DMBM' || id === 'DMOD') return 'DM';
    if (id === 'DMG' && ownProc) return 'DMG';
    return id;
  }

  // Put a monster on the field and queue its triggers.
  function place(s, id, opts = {}) {
    const m = { id, emz: !!opts.emz, nm: opts.nm || fieldName(id, opts.ownProc), noEff: !!opts.noEff, uses: opts.uses || 0, lvl: opts.lvl || P[id].lv || 0, gaze: !!opts.gaze, uid: s.uid++ };
    s.mons.push(m);
    s.summons++;
    // Circle: "If Dark Magician is Normal or Special Summoned"; Talisman (GY): "If you Special Summon Dark Magician".
    if (m.nm === 'DM') {
      if (s.st.some((x) => x.id === 'CIRC' && x.up) && !GO(s, 'circ2') && oppTargets(s).length) s.pend.push({ t: 'circ2' });
      if (opts.special !== false && has(s.gy, 'TALI') && !GO(s, 'tali3') && s.lp > 2500) s.pend.push({ t: 'tali3' });
    }
    return m;
  }

  // ── Opponent ──
  function oppTargets(s) {
    if (!s.opp) return [];
    return [...s.opp.mons.filter((m) => !m.noTarget), ...s.opp.st.filter((x) => !x.noTarget)];
  }
  function oppRemove(s, uid, how) {
    const o = OW(s);
    let i = o.mons.findIndex((m) => m.uid === uid);
    if (i >= 0) {
      const m = o.mons.splice(i, 1)[0];
      s.removed++;
      if (how === 'destroy' || how === 'material') toOppGY(s);
      return m;
    }
    i = o.st.findIndex((x) => x.uid === uid);
    if (i >= 0) { s.removed++; return o.st.splice(i, 1)[0]; }
    return null;
  }
  function toOppGY(s) {
    // Deception: a monster sent to their GY while you control an Azamina.
    if (!GO(s, 'dec2') && s.st.some((x) => x.id === 'DECE' && x.up) && s.mons.some((m) => m.id === 'ILIA' || m.id === 'RCIE')) {
      SO(s, 'dec2');
      s.burn += 1500; OW(s).lp -= 1500; s.lp += 1500;
      if (s.cur) s.cur.text += ' Deception drains 1500.';
    }
  }
  const oppLabel = (x) => (x.name || (x.kind === 'st' ? 'Spell/Trap' : 'monster'));

  // ── Action generation ──
  // Each action: { k, neg, tags, run(state, negated) -> new state }
  function gen(s) {
    const A = [];
    const seenK = {};
    const flood = floodgates(s);
    const push = (k0, tags, run, neg = true) => {
      if (flood.extra && EXTRA_KEY.test(k0)) return;
      if (flood.spell && SPELL_KEY.test(k0)) return;
      if (flood.mon && tags && tags.field) return;
      const c = seenK[k0] || 0; seenK[k0] = c + 1;
      const k = c ? k0 + '#' + c : k0;
      A.push({ k, tags, neg, run });
    };
    if (s.pend.length) { genPending(s, A, push); return A; }
    const hand = keys(s.hand);
    const otherHand = (exceptId) => hand.filter((id) => id !== exceptId || cnt(s.hand, id) > 1);

    // Normal Summon (Level 4 or lower) / Tribute Summon a Level 5-6.
    if (!s.ns && monFree(s) > 0) {
      for (const id of hand) {
        const p = P[id];
        if (!p || p.kind !== 'M' || p.sub === 'Ritual') continue;
        if (p.lv <= 4) {
          if (HANDTRAPS[id] && id !== 'ASH') continue; // only Ash (a Tuner) is worth Normal Summoning
          push('ns:' + id, { inherent: true }, (s0) => {
            const n = clone(s0); step(n, `Normal Summon ${S(id)}.`, { inherent: true });
            dec(W(n, 'hand'), id); n.ns = true; L.sum(n, id, 'normal');
            place(n, id, { special: false });
            if (id === 'ROD' && !GO(n, 'rod1')) n.pend.unshift({ t: 'rod' });
            return done(n);
          }, false);
        } else if (p.lv <= 6 && s.mons.length) {
          s.mons.forEach((t, i) => {
            if (s.mons.findIndex((x) => x.id === t.id) !== i) return;
            push('tri:' + id + ':' + t.id, { inherent: true }, (s0) => {
              const n = clone(s0); step(n, `Tribute ${S(t.id)} to Tribute Summon ${S(id)}.`, { inherent: true });
              dec(W(n, 'hand'), id); n.ns = true;
              const m = n.mons.splice(i, 1)[0]; inc(W(n, 'gy'), m.id);
              if (m.id === 'GAR' && !GO(n, 'gar')) n.pend.push({ t: 'gar' });
              L.sum(n, id, 'tribute', 'hand', [m.id]);
              place(n, id, { special: false });
              if (id === 'DMG' && !GO(n, 'dmg1') && has(n.deck, 'SARC') && !n.droll) n.pend.unshift({ t: 'dmg' });
              return done(n);
            }, false);
          });
        }
      }
    }

    // Diabellstar: Special Summon from hand by sending 1 card from hand or field.
    if (has(s.hand, 'DIA') && !GO(s, 'diaP') && monFree(s) > 0) {
      for (const c of otherHand('DIA')) {
        push('dia:h:' + c, { inherent: true }, (s0) => {
          const n = clone(s0); step(n, `Diabellstar: send ${S(c)} from hand to Special Summon it.`, { inherent: true });
          SO(n, 'diaP'); dec(W(n, 'hand'), 'DIA'); dec(W(n, 'hand'), c); inc(W(n, 'gy'), c); L.mv(n, c, 'hand', 'gy');
          L.sum(n, 'DIA', 'special', 'hand'); place(n, 'DIA', { special: true });
          if (!GO(n, 'dia1')) n.pend.unshift({ t: 'dia' });
          return done(n);
        }, false);
      }
      s.mons.forEach((m, i) => {
        push('dia:m:' + m.id + i, { inherent: true }, (s0) => {
          const n = clone(s0); step(n, `Diabellstar: send ${S(m.id)} from the field to Special Summon it.`, { inherent: true });
          SO(n, 'diaP'); dec(W(n, 'hand'), 'DIA'); monToGY(n, i);
          L.sum(n, 'DIA', 'special', 'hand'); place(n, 'DIA', { special: true });
          if (!GO(n, 'dia1')) n.pend.unshift({ t: 'dia' });
          return done(n);
        }, false);
      });
      s.st.forEach((x, i) => {
        push('dia:s:' + x.id + i, { inherent: true }, (s0) => {
          const n = clone(s0); step(n, `Diabellstar: send ${S(x.id)} from the field to Special Summon it.`, { inherent: true });
          SO(n, 'diaP'); dec(W(n, 'hand'), 'DIA'); stToGY(n, i);
          L.sum(n, 'DIA', 'special', 'hand'); place(n, 'DIA', { special: true });
          if (!GO(n, 'dia1')) n.pend.unshift({ t: 'dia' });
          return done(n);
        }, false);
      });
    }

    // DMG the Magician's Apprentice: Special Summon by discarding 1 card.
    if (has(s.hand, 'DMG') && !GO(s, 'dmgP') && monFree(s) > 0) {
      for (const c of otherHand('DMG')) {
        push('dmg:' + c, { inherent: true }, (s0) => {
          const n = clone(s0); step(n, `DMG Apprentice: discard ${S(c)} to Special Summon it (its name becomes Dark Magician Girl).`, { inherent: true });
          SO(n, 'dmgP'); dec(W(n, 'hand'), 'DMG'); dec(W(n, 'hand'), c); inc(W(n, 'gy'), c); L.mv(n, c, 'hand', 'gy');
          L.sum(n, 'DMG', 'special', 'hand'); place(n, 'DMG', { special: true, ownProc: true });
          if (!GO(n, 'dmg1') && has(n.deck, 'SARC') && !n.droll) n.pend.unshift({ t: 'dmg' });
          return done(n);
        }, false);
      }
    }

    // Pharaoh's Servant: reveal a Spell, Special Summon it, then Set a DM Spell/Trap from Deck.
    if (has(s.hand, 'SERV') && !GO(s, 'serv') && monFree(s) > 0 && hand.some(isSpell)) {
      const reveal = hand.find(isSpell);
      const sets = DM_ST.filter((id) => has(s.deck, id));
      for (const t of (stFree(s) > 0 && sets.length ? sets : [null])) {
        push('serv:' + t, { hand: true }, (s0, neg) => {
          const n = clone(s0);
          step(n, neg ? `Pharaoh's Servant (reveal ${S(reveal)}): negated.` : `Pharaoh's Servant: reveal ${S(reveal)}, Special Summon it${t ? `, Set ${S(t)} from Deck` : ''}.`, { handEff: true, dm: true });
          SO(n, 'serv'); L.act(n, 'SERV', 1, 'hand');
          if (neg) return done(n);
          dec(W(n, 'hand'), 'SERV'); L.sum(n, 'SERV', 'special', 'hand'); place(n, 'SERV', { special: true });
          if (t) { fromDeck(n, t); n.st.push({ id: t, up: false, now: true }); L.mv(n, t, 'deck', 'field'); }
          return done(n);
        });
      }
    }

    // Magicians' Souls (hand): send a Level 6+ Spellcaster from Deck, then SS it or revive DM.
    if (has(s.hand, 'SOULS') && !GO(s, 'souls2')) {
      for (const sent of SOULS_SEND.filter((id) => has(s.deck, id))) {
        const gyDM = (g) => keys(g).filter((id) => gyName(id) === 'DM' && id !== 'DMOD');
        // Option a: Special Summon Souls.
        if (monFree(s) > 0) {
          push('souls:a:' + sent, { ash: true, handEff: true, dm: true }, (s0, neg) => {
            const n = clone(s0); SO(n, 'souls2');
            step(n, neg ? `Magicians' Souls (hand effect): negated.` : `Magicians' Souls: send ${S(sent)} from Deck to GY, Special Summon Souls.`, { ash: true, handEff: true, dm: true });
            L.act(n, 'SOULS', 2, 'hand');
            if (neg) return done(n);
            fromDeck(n, sent); inc(W(n, 'gy'), sent); L.mv(n, sent, 'deck', 'gy');
            dec(W(n, 'hand'), 'SOULS'); L.sum(n, 'SOULS', 'special', 'hand'); place(n, 'SOULS', { special: true });
            return done(n);
          });
        }
        // Option b: send Souls, then revive DM (or Servant, named DM) from GY.
        const g2 = s.gy.slice(); inc(g2, sent);
        const targets = monFree(s) > 0 ? gyDM(g2) : [];
        for (const t of targets.length ? targets : [null]) {
          push('souls:b:' + sent + ':' + t, { ash: true, handEff: true, dm: true }, (s0, neg) => {
            const n = clone(s0); SO(n, 'souls2');
            step(n, neg ? `Magicians' Souls (hand effect): negated.` : `Magicians' Souls: send ${S(sent)} from Deck to GY, send Souls to GY${t ? `, Special Summon ${S(t)} from GY` : ''}.`, { ash: true, handEff: true, dm: true, gy: !!t });
            L.act(n, 'SOULS', 2, 'hand');
            if (neg) return done(n);
            fromDeck(n, sent); inc(W(n, 'gy'), sent); L.mv(n, sent, 'deck', 'gy');
            dec(W(n, 'hand'), 'SOULS'); inc(W(n, 'gy'), 'SOULS'); L.mv(n, 'SOULS', 'hand', 'gy');
            if (t) { dec(W(n, 'gy'), t); L.sum(n, t, 'special', 'gy'); place(n, t, { special: true }); }
            return done(n);
          });
        }
      }
    }
    // Magicians' Souls (field): send up to 2 Spells/Traps from hand/field, draw that many.
    if (s.mons.some((m) => m.id === 'SOULS' && !m.noEff) && !GO(s, 'souls1')) {
      const pool = [];
      for (const id of hand) if (isST(id)) { pool.push({ z: 'h', id }); if (cnt(s.hand, id) > 1) pool.push({ z: 'h', id }); }
      s.st.forEach((x, i) => pool.push({ z: 'f', id: x.id, i }));
      const combos = [];
      for (let a = 0; a < pool.length; a++) {
        combos.push([pool[a]]);
        for (let b = a + 1; b < pool.length; b++) combos.push([pool[a], pool[b]]);
      }
      const seenC = new Set();
      for (const c of combos) {
        const sig = c.map((x) => x.z + x.id + (x.z === 'f' ? x.i : '')).sort().join('+');
        const sigK = c.map((x) => x.z + x.id).sort().join('+');
        if (seenC.has(sigK) && !c.some((x) => x.z === 'f')) continue;
        seenC.add(sigK);
        push('souls1:' + sig, { field: true, dm: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'souls1');
          step(n, `Magicians' Souls: send ${c.map((x) => S(x.id)).join(' + ')} to draw ${c.length}${neg ? ' (draw negated)' : ''}.`, { field: true, dm: true });
          L.act(n, 'SOULS', 1, 'field');
          const fIdx = c.filter((x) => x.z === 'f').map((x) => x.i).sort((p, q) => q - p);
          for (const i of fIdx) stToGY(n, i);
          for (const x of c.filter((x) => x.z === 'h')) { dec(W(n, 'hand'), x.id); inc(W(n, 'gy'), x.id); L.mv(n, x.id, 'hand', 'gy'); }
          if (!neg) draw(n, c.length);
          return done(n);
        });
      }
    }

    // Dark Magical Curtain: SS a DARK Spellcaster from hand/Deck; if it's DM, add a DM Spell/Trap.
    const curtAt = has(s.hand, 'CURT') ? 'hand' : s.st.findIndex((x) => x.id === 'CURT' && !x.now) >= 0 ? 'field' : null;
    if (curtAt && !GO(s, 'curt') && monFree(s) > 0 && (curtAt === 'field' || stFree(s) > 0)) {
      const opts = [];
      for (const id of CURT_SS) {
        if (has(s.hand, id) && !(id === 'CURT')) opts.push({ id, z: 'hand' });
        if (has(s.deck, id)) opts.push({ id, z: 'deck' });
      }
      for (const o of opts) {
        const adds = o.id === 'DM' && !s.droll ? DM_ST.filter((x) => x !== 'CURT' && has(s.deck, x)) : [];
        for (const a of adds.length ? adds : [null]) {
          push('curt:' + o.id + o.z + ':' + a, { ash: o.z === 'deck' || !!a, droll: !!a, dm: true }, (s0, neg) => {
            const n = clone(s0); SO(n, 'curt'); n.spell = true;
            step(n, neg ? 'Dark Magical Curtain: negated.' : `Dark Magical Curtain: Special Summon ${S(o.id)} from ${o.z === 'deck' ? 'Deck' : 'hand'}${a ? `, add ${S(a)}` : ''}.`, { ash: o.z === 'deck' || !!a, droll: !!a, dm: true, spell: true });
            if (curtAt === 'hand') { dec(W(n, 'hand'), 'CURT'); inc(W(n, 'gy'), 'CURT'); L.act(n, 'CURT', 0, 'hand'); }
            else { const i = n.st.findIndex((x) => x.id === 'CURT' && !x.now); n.st.splice(i, 1); inc(W(n, 'gy'), 'CURT'); L.act(n, 'CURT', 0, 'field'); }
            if (neg) return done(n);
            if (o.z === 'deck') fromDeck(n, o.id); else dec(W(n, 'hand'), o.id);
            L.sum(n, o.id, 'special', o.z);
            place(n, o.id, { special: true, noEff: true });
            if (a) { fromDeck(n, a); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand'); }
            return done(n);
          });
        }
      }
    }

    // Dark Magical Circle: activate (look at the top 3), stays face-up.
    const circAt = has(s.hand, 'CIRC') ? 'hand' : s.st.findIndex((x) => x.id === 'CIRC' && !x.up) >= 0 ? 'field' : null;
    if (circAt && !GO(s, 'circ1') && (circAt === 'field' || stFree(s) > 0)) {
      const seen = s.top.slice(0, 3).filter((id) => CIRC_ADD.includes(id));
      for (const a of s.droll ? [null] : [...new Set(seen), null]) {
        if (a === null && seen.length && !s.droll) continue;
        push('circ1:' + a, { ash: !!a, droll: !!a, dm: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'circ1'); n.spell = true;
          step(n, neg ? 'Dark Magical Circle: activation effect negated (Circle stays).' : a ? `Activate Dark Magical Circle: add ${S(a)} from the top 3.` : 'Activate Dark Magical Circle: look at the top 3 (add Dark Magician or a DM Spell/Trap if one shows).', { ash: !!a, droll: !!a, dm: true, spell: true, dig: !a });
          if (circAt === 'hand') { dec(W(n, 'hand'), 'CIRC'); n.st.push({ id: 'CIRC', up: true }); L.act(n, 'CIRC', 1, 'hand'); }
          else { const ci = n.st.findIndex((x) => x.id === 'CIRC'); n.st[ci] = { ...n.st[ci], up: true }; L.act(n, 'CIRC', 1, 'field'); }
          if (!neg && a) { const i = n.top.indexOf(a); n.top.splice(i, 1); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand'); }
          return done(n);
        });
      }
    }

    // The Gaze of Timaeus: DM/DMG on field or in GY -> a Fusion that lists it, by shuffling it in.
    const gazeAt = has(s.hand, 'GAZE') ? 'hand' : s.st.findIndex((x) => x.id === 'GAZE' && !x.now) >= 0 ? 'field' : null;
    if (gazeAt && !GO(s, 'gaze') && (gazeAt === 'field' || stFree(s) > 0)) {
      const tg = [];
      s.mons.forEach((m, i) => { if (m.nm === 'DM' && !tg.some((t) => t.z === 'f' && t.id === m.id)) tg.push({ z: 'f', id: m.id, i }); });
      for (const id of keys(s.gy)) if (gyName(id) === 'DM') tg.push({ z: 'g', id });
      const fus = ['DRAG', 'DMOD', 'MOC'].filter((f) => has(s.extra, f) && !(f === 'DMOD' && GO(s, 'dmodSS')));
      for (const t of tg) for (const f of fus) {
        if (t.z === 'g' && monFree(s) <= 0) continue;
        push('gaze:' + t.z + t.id + ':' + f, { dm: true, spell: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'gaze'); n.spell = true;
          const uses = f === 'DRAG' ? (t.id === 'DM' ? 1 : 0) : 0;
          step(n, neg ? 'The Gaze of Timaeus: negated.' : `The Gaze of Timaeus on ${S(t.id)}${t.z === 'g' ? ' in GY' : ''}: Fusion Summon ${S(f)}${f === 'DRAG' ? ` (${uses} destroy${uses === 1 ? '' : 's'})` : ''}.`, { dm: true, spell: true });
          if (gazeAt === 'hand') { dec(W(n, 'hand'), 'GAZE'); inc(W(n, 'gy'), 'GAZE'); L.act(n, 'GAZE', 0, 'hand'); }
          else { n.st.splice(n.st.findIndex((x) => x.id === 'GAZE' && !x.now), 1); inc(W(n, 'gy'), 'GAZE'); L.act(n, 'GAZE', 0, 'field'); }
          if (neg) return done(n);
          if (t.z === 'f') {
            const i = n.mons.findIndex((m) => m.id === t.id && m.nm === 'DM');
            const m = n.mons.splice(i, 1)[0];
            if (P[m.id].ext) inc(W(n, 'extra'), m.id); else { inc(W(n, 'deck'), m.id); shuffle(n); }
            L.sum(n, f, 'fusion', 'extra', [m.id], { materialsTo: 'deck' });
          } else {
            dec(W(n, 'gy'), t.id);
            if (P[t.id].ext) inc(W(n, 'extra'), t.id); else { inc(W(n, 'deck'), t.id); shuffle(n); }
            L.sum(n, f, 'fusion', 'extra', [t.id], { materialsFrom: 'gy', materialsTo: 'deck' });
          }
          dec(W(n, 'extra'), f);
          place(n, f, { special: true, uses, gaze: true });
          afterExtraSummon(n, f);
          return done(n);
        });
      }
    }

    // Dark Magician of Destruction: banish a Level 6+ DARK Spellcaster (a Spell was activated this turn).
    if (s.spell && !GO(s, 'dmodSS') && has(s.extra, 'DMOD')) {
      s.mons.forEach((m, i) => {
        const p = P[m.id];
        if (p.race !== 'Spellcaster' || p.attr !== 'DARK' || (m.lvl || 0) < 6) return;
        if (s.mons.findIndex((x) => x.id === m.id) !== i) return;
        push('dmod:' + m.id, { inherent: true }, (s0) => {
          const n = clone(s0);
          step(n, `Dark Magician of Destruction: banish ${S(m.id)} from the field (a Spell was activated this turn).`, { inherent: true });
          const mm = n.mons.splice(i, 1)[0]; inc(W(n, 'ban'), mm.id);
          L.sum(n, 'DMOD', 'special', 'extra', [mm.id], { materialsTo: 'banished' });
          dec(W(n, 'extra'), 'DMOD'); place(n, 'DMOD', { special: true });
          afterExtraSummon(n, 'DMOD');
          return done(n);
        }, false);
      });
    }

    // Super Polymerization: discard 1, Fusion Summon using monsters from either field. Can't be responded to.
    if (has(s.hand, 'SPOLY') && stFree(s) > 0) {
      const pool = s.mons.map((m, i) => ({ side: 'me', i, id: m.id, nm: m.nm, race: P[m.id].race, attr: m.id === 'MUD' ? '*' : P[m.id].attr, sub: P[m.id].sub, ext: P[m.id].ext, normal: P[m.id].sub === 'Normal', dragonEff: P[m.id].race === 'Dragon' && P[m.id].sub !== 'Normal' }));
      if (s.opp) s.opp.mons.forEach((m) => { if (!m.faceDown) pool.push({ side: 'op', uid: m.uid, id: 'OPP', nm: 'opp:' + (m.name || m.uid), race: m.race || '?', attr: m.attr || '?', sub: 'Effect', ext: !!m.ext, normal: false, dragonEff: m.race === 'Dragon', label: oppLabel(m) }); });
      const discards = otherHand('SPOLY');
      if (discards.length && pool.length >= 2) {
        const fusions = [];
        for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) {
          const x = pool[a], y = pool[b];
          const pair = [x, y];
          const sameAttr = x.attr !== '?' && y.attr !== '?' && (x.attr === y.attr || x.attr === '*' || y.attr === '*');
          if (has(s.extra, 'DMOD') && !GO(s, 'dmodSS') && pair.some((m, j) => m.nm === 'DM' && ['LIGHT', 'DARK', '*'].includes(pair[1 - j].attr))) fusions.push({ f: 'DMOD', pair });
          if (has(s.extra, 'DRAG') && pair.some((m, j) => m.nm === 'DM' && pair[1 - j].dragonEff)) fusions.push({ f: 'DRAG', pair });
          if (has(s.extra, 'GAR') && x.race !== '?' && x.race === y.race && sameAttr && x.nm !== y.nm) fusions.push({ f: 'GAR', pair });
          if (has(s.extra, 'MUD') && sameAttr && x.race !== '?' && y.race !== '?' && x.race !== y.race) fusions.push({ f: 'MUD', pair });
          if (has(s.extra, 'CHOR') && pair.some((m, j) => m.ext && pair[1 - j].race === 'Spellcaster')) fusions.push({ f: 'CHOR', pair });
          for (const az of ['ILIA', 'RCIE']) if (has(s.extra, az) && pair.some((m, j) => m.race === 'Illusion' && pair[1 - j].race === 'Spellcaster' && pair[1 - j].attr === 'LIGHT')) fusions.push({ f: az, pair });
        }
        // Keep one discard choice per kind to limit branching: prefer an unknown/dead card.
        const dPick = pickFodder(s, discards, 2);
        for (const fu of fusions) for (const d of dPick) {
          const usesOpp = fu.pair.some((m) => m.side === 'op');
          push('spoly:' + fu.f + ':' + fu.pair.map((m) => m.side + (m.uid || m.id)).join('+') + ':' + d, { noResp: true, spell: true }, (s0) => {
            const n = clone(s0); n.spell = true;
            step(n, `Super Polymerization (discard ${S(d)}): ${fu.pair.map((m) => (m.side === 'op' ? `their ${m.label}` : S(m.id))).join(' + ')} into ${S(fu.f)}.`, { noResp: true, spell: true });
            dec(W(n, 'hand'), 'SPOLY'); inc(W(n, 'gy'), 'SPOLY'); L.act(n, 'SPOLY', 0, 'hand');
            dec(W(n, 'hand'), d); inc(W(n, 'gy'), d); L.mv(n, d, 'hand', 'gy');
            const mine = fu.pair.filter((m) => m.side === 'me').map((m) => m.i).sort((p, q) => q - p);
            const matIds = [];
            let normals = 0;
            for (const i of mine) { const m = n.mons.splice(i, 1)[0]; inc(W(n, 'gy'), m.id); matIds.push(m.id); if (P[m.id].sub === 'Normal') normals++; if (m.id === 'GAR' && !GO(n, 'gar')) n.pend.push({ t: 'gar' }); }
            for (const m of fu.pair.filter((m) => m.side === 'op')) oppRemove(n, m.uid, 'material');
            L.sum(n, fu.f, 'fusion', 'extra', matIds);
            dec(W(n, 'extra'), fu.f);
            place(n, fu.f, { special: true, uses: fu.f === 'DRAG' ? normals : 0 });
            afterExtraSummon(n, fu.f);
            if (usesOpp) n.cur.tags.removal = true;
            return done(n);
          }, false);
        }
      }
    }

    // The Hallowed Azamina: send 1 "Sinful Spoils" card, Special Summon an Azamina Fusion (Level 6 = 1 card).
    if (has(s.hand, 'HALL') && stFree(s) > 0 && monFree(s) > 0) {
      const costs = [];
      for (const id of SINFUL) if (has(s.hand, id)) costs.push({ z: 'h', id });
      s.st.forEach((x, i) => { if (SINFUL.includes(x.id)) costs.push({ z: 'f', id: x.id, i }); });
      for (const az of ['ILIA', 'RCIE'].filter((f) => has(s.extra, f))) for (const c of costs) {
        push('hall:' + az + ':' + c.z + c.id, { spell: true }, (s0, neg) => {
          const n = clone(s0); n.spell = true;
          step(n, neg ? 'The Hallowed Azamina: negated.' : `The Hallowed Azamina: send ${S(c.id)} from ${c.z === 'h' ? 'hand' : 'the field'}, Special Summon ${S(az)}.`, { spell: true });
          dec(W(n, 'hand'), 'HALL'); inc(W(n, 'gy'), 'HALL'); L.act(n, 'HALL', 0, 'hand');
          if (neg) return done(n);
          if (c.z === 'h') { dec(W(n, 'hand'), c.id); inc(W(n, 'gy'), c.id); L.mv(n, c.id, 'hand', 'gy'); } else stToGY(n, c.i);
          dec(W(n, 'extra'), az); L.sum(n, az, 'special', 'extra');
          place(n, az, { special: true });
          afterExtraSummon(n, az);
          return done(n);
        });
      }
    }
    // Hallowed Azamina (GY): shuffle an Azamina monster into the Deck, add this card.
    if (has(s.gy, 'HALL') && !GO(s, 'hallG')) {
      const tg = [];
      s.mons.forEach((m, i) => { if (m.id === 'ILIA' || m.id === 'RCIE') tg.push({ z: 'f', id: m.id, i }); });
      for (const id of ['ILIA', 'RCIE']) if (has(s.gy, id)) tg.push({ z: 'g', id });
      for (const t of tg) {
        push('hallG:' + t.z + t.id, { gy: true, spell: true }, (s0) => {
          const n = clone(s0); SO(n, 'hallG');
          step(n, `The Hallowed Azamina (GY): shuffle ${S(t.id)} into the Extra Deck, add Hallowed Azamina to hand.`, { gy: true, spell: true });
          L.act(n, 'HALL', 2, 'gy');
          if (t.z === 'f') { n.mons.splice(n.mons.findIndex((m) => m.id === t.id), 1); L.mv(n, t.id, 'field', 'extra'); }
          else { dec(W(n, 'gy'), t.id); L.mv(n, t.id, 'gy', 'extra'); }
          inc(W(n, 'extra'), t.id);
          dec(W(n, 'gy'), 'HALL'); inc(W(n, 'hand'), 'HALL'); L.mv(n, 'HALL', 'gy', 'hand');
          return done(n);
        }, false);
      }
    }

    // Deception of the Sinful Spoils: activate; Tribute 1 monster from hand/field to add an Azamina card.
    const deceSet = s.st.findIndex((x) => x.id === 'DECE' && !x.up);
    if (has(s.hand, 'DECE') && stFree(s) > 0 || deceSet >= 0) {
      push('dece:on', { spell: true }, (s0) => {
        const n = clone(s0); n.spell = true;
        step(n, 'Activate Deception of the Sinful Spoils.', { spell: true });
        const i = n.st.findIndex((x) => x.id === 'DECE' && !x.up);
        if (i >= 0) n.st[i] = { ...n.st[i], up: true }; else { dec(W(n, 'hand'), 'DECE'); n.st.push({ id: 'DECE', up: true }); L.mv(n, 'DECE', 'hand', 'field'); }
        return done(n);
      }, false);
    }
    if (s.st.some((x) => x.id === 'DECE' && x.up) && !GO(s, 'dec1') && !s.droll && has(s.deck, 'HALL')) {
      const tr = [];
      for (const id of hand) if (P[id] && P[id].kind === 'M') tr.push({ z: 'h', id });
      s.mons.forEach((m, i) => { if (s.mons.findIndex((x) => x.id === m.id) === i) tr.push({ z: 'f', id: m.id, i }); });
      for (const t of tr) {
        push('dece1:' + t.z + t.id, { ash: true, droll: true, spell: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'dec1'); n.spell = true;
          step(n, neg ? `Deception: Tribute ${S(t.id)}; search negated.` : `Deception: Tribute ${S(t.id)} from ${t.z === 'h' ? 'hand' : 'the field'}, add The Hallowed Azamina.`, { ash: true, droll: true, spell: true });
          L.act(n, 'DECE', 1, 'field');
          if (t.z === 'h') { dec(W(n, 'hand'), t.id); inc(W(n, 'gy'), t.id); L.mv(n, t.id, 'hand', 'gy'); } else monToGY(n, t.i);
          if (!neg) { fromDeck(n, 'HALL'); inc(W(n, 'hand'), 'HALL'); L.mv(n, 'HALL', 'deck', 'hand'); }
          return done(n);
        });
      }
    }

    // WANTED: add Diabellstar from Deck or GY. GY: recycle a Sinful Spoils card and draw 1.
    const wantAt = has(s.hand, 'WANT') ? 'hand' : s.st.findIndex((x) => x.id === 'WANT' && !x.now) >= 0 ? 'field' : null;
    if (wantAt && !GO(s, 'want1') && (wantAt === 'field' || stFree(s) > 0)) {
      const srcs = [];
      if (has(s.deck, 'DIA') && !s.droll) srcs.push('deck');
      if (has(s.gy, 'DIA')) srcs.push('gy');
      for (const z of srcs) {
        push('want:' + z, { ash: z === 'deck', droll: z === 'deck', spell: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'want1'); n.spell = true;
          step(n, neg ? 'WANTED: negated.' : `WANTED: add Diabellstar from ${z === 'deck' ? 'Deck' : 'GY'}.`, { ash: z === 'deck', droll: z === 'deck', spell: true, gy: z === 'gy' });
          if (wantAt === 'hand') { dec(W(n, 'hand'), 'WANT'); L.act(n, 'WANT', 1, 'hand'); } else { n.st.splice(n.st.findIndex((x) => x.id === 'WANT' && !x.now), 1); L.act(n, 'WANT', 1, 'field'); }
          inc(W(n, 'gy'), 'WANT');
          if (!neg) { if (z === 'deck') fromDeck(n, 'DIA'); else dec(W(n, 'gy'), 'DIA'); inc(W(n, 'hand'), 'DIA'); L.mv(n, 'DIA', z, 'hand'); }
          return done(n);
        });
      }
    }
    if (has(s.gy, 'WANT') && !GO(s, 'want2') && (has(s.gy, 'DECE') || has(s.ban, 'DECE'))) {
      push('want2', {}, (s0) => {
        const n = clone(s0); SO(n, 'want2');
        step(n, 'WANTED (GY): banish it, put Deception on the bottom of the Deck, draw 1.');
        L.act(n, 'WANT', 2, 'gy'); dec(W(n, 'gy'), 'WANT'); inc(W(n, 'ban'), 'WANT'); L.mv(n, 'WANT', 'gy', 'banished');
        if (has(n.gy, 'DECE')) { dec(W(n, 'gy'), 'DECE'); L.mv(n, 'DECE', 'gy', 'deck'); } else { dec(W(n, 'ban'), 'DECE'); L.mv(n, 'DECE', 'banished', 'deck'); }
        inc(W(n, 'deck'), 'DECE');
        draw(n, 1);
        return done(n);
      }, false);
    }

    // Soul Servant: place a DM card on top of the Deck. GY: banish, draw per DM/DMG name on field and GYs.
    if (has(s.hand, 'SSRV') && stFree(s) > 0 && s.top.length === 0) {
      const opts = [];
      for (const id of SSRV_PLACE) {
        if (has(s.deck, id)) opts.push({ z: 'deck', id });
        if (has(s.hand, id)) opts.push({ z: 'hand', id });
        if (has(s.gy, id)) opts.push({ z: 'gy', id });
      }
      for (const o of opts) {
        push('ssrv:' + o.z + o.id, { spell: true, dm: true }, (s0, neg) => {
          const n = clone(s0); n.spell = true;
          step(n, neg ? 'Soul Servant: negated.' : `Soul Servant: put ${S(o.id)} from ${o.z === 'gy' ? 'GY' : o.z} on top of the Deck.`, { spell: true, dm: true });
          dec(W(n, 'hand'), 'SSRV'); inc(W(n, 'gy'), 'SSRV'); L.act(n, 'SSRV', 1, 'hand');
          if (neg) return done(n);
          if (o.z === 'deck') { shuffle(n); dec(W(n, 'deck'), o.id); } else if (o.z === 'hand') { dec(W(n, 'hand'), o.id); L.mv(n, o.id, 'hand', 'deck'); } else { dec(W(n, 'gy'), o.id); L.mv(n, o.id, 'gy', 'deck'); }
          n.top.unshift(o.id);
          return done(n);
        });
      }
    }
    if (has(s.gy, 'SSRV') && !GO(s, 'ssrv2')) {
      const names = new Set();
      for (const m of s.mons) if (m.nm === 'DM' || m.nm === 'DMG') names.add(m.nm);
      for (const id of keys(s.gy)) if (gyName(id) === 'DM') names.add('DM');
      if (names.size) {
        push('ssrv2', {}, (s0) => {
          const n = clone(s0); SO(n, 'ssrv2');
          step(n, `Soul Servant (GY): banish it, draw ${names.size}.`);
          L.act(n, 'SSRV', 2, 'gy'); dec(W(n, 'gy'), 'SSRV'); inc(W(n, 'ban'), 'SSRV'); L.mv(n, 'SSRV', 'gy', 'banished');
          draw(n, names.size);
          return done(n);
        }, false);
      }
    }

    // Shining Sarcophagus: activate; search a card that lists it.
    const sarcSet = s.st.findIndex((x) => x.id === 'SARC' && !x.up);
    if (has(s.hand, 'SARC') && stFree(s) > 0 || sarcSet >= 0) {
      push('sarc:on', { spell: true }, (s0) => {
        const n = clone(s0); n.spell = true;
        step(n, 'Activate Shining Sarcophagus.', { spell: true });
        const i = n.st.findIndex((x) => x.id === 'SARC' && !x.up);
        if (i >= 0) n.st[i] = { ...n.st[i], up: true }; else { dec(W(n, 'hand'), 'SARC'); n.st.push({ id: 'SARC', up: true }); L.mv(n, 'SARC', 'hand', 'field'); }
        return done(n);
      }, false);
    }
    if (s.st.some((x) => x.id === 'SARC' && x.up) && !GO(s, 'sarc1') && !s.droll) {
      for (const a of SARC_ADD.filter((id) => has(s.deck, id))) {
        push('sarc1:' + a, { ash: true, droll: true, spell: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'sarc1'); n.spell = true;
          step(n, neg ? 'Sarcophagus search: negated.' : `Shining Sarcophagus: add ${S(a)}.`, { ash: true, droll: true, spell: true });
          L.act(n, 'SARC', 1, 'field');
          if (!neg) { fromDeck(n, a); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand'); }
          return done(n);
        });
      }
    }
    // Future Silence: add a monster that lists Sarcophagus.
    if (has(s.hand, 'FSIL') && !GO(s, 'fsil') && !s.droll && stFree(s) > 0) {
      for (const a of SARC_MON.filter((id) => has(s.deck, id))) {
        push('fsil:' + a, { ash: true, droll: true, spell: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'fsil'); n.spell = true;
          step(n, neg ? 'Future Silence: negated.' : `Future Silence: add ${S(a)}.`, { ash: true, droll: true, spell: true });
          dec(W(n, 'hand'), 'FSIL'); inc(W(n, 'gy'), 'FSIL'); L.act(n, 'FSIL', 0, 'hand');
          if (!neg) { fromDeck(n, a); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand'); }
          return done(n);
        });
      }
    }
    // Preparation of Rites: add Illusion of Chaos.
    if (has(s.hand, 'PREP') && has(s.deck, 'IOC') && !s.droll && stFree(s) > 0) {
      push('prep', { ash: true, droll: true, spell: true }, (s0, neg) => {
        const n = clone(s0); n.spell = true;
        step(n, neg ? 'Preparation of Rites: negated.' : 'Preparation of Rites: add Illusion of Chaos.', { ash: true, droll: true, spell: true });
        dec(W(n, 'hand'), 'PREP'); inc(W(n, 'gy'), 'PREP'); L.act(n, 'PREP', 0, 'hand');
        if (!neg) { fromDeck(n, 'IOC'); inc(W(n, 'hand'), 'IOC'); L.mv(n, 'IOC', 'deck', 'hand'); }
        return done(n);
      });
    }
    // Illusion of Chaos (reveal): add DM or a monster that mentions it, then put 1 card from hand on top.
    if (has(s.hand, 'IOC') && !GO(s, 'ioc1') && !s.droll) {
      for (const a of IOC_ADD.filter((id) => has(s.deck, id))) {
        const h2 = s.hand.slice(); inc(h2, a);
        for (const back of keys(h2)) {
          push('ioc:' + a + ':' + back, { ash: true, droll: true, handEff: true, dm: true }, (s0, neg) => {
            const n = clone(s0); SO(n, 'ioc1');
            step(n, neg ? 'Illusion of Chaos (reveal): negated.' : `Illusion of Chaos (reveal): add ${S(a)}, put ${S(back)} on top of the Deck.`, { ash: true, droll: true, handEff: true, dm: true });
            L.act(n, 'IOC', 1, 'hand');
            if (neg) return done(n);
            fromDeck(n, a); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand');
            dec(W(n, 'hand'), back); n.top.unshift(back); L.mv(n, back, 'hand', 'deck');
            return done(n);
          });
        }
      }
    }
    // DM the Magician of Black Magic: SS from hand if Sarcophagus is on the field.
    if (has(s.hand, 'DMBM') && !GO(s, 'dmbm1') && monFree(s) > 0 && s.st.some((x) => x.id === 'SARC' && x.up)) {
      push('dmbm', { handEff: true }, (s0, neg) => {
        const n = clone(s0); SO(n, 'dmbm1');
        step(n, neg ? 'DM of Black Magic: negated.' : 'DM the Magician of Black Magic: Special Summon it from hand (Sarcophagus is on the field).', { handEff: true });
        L.act(n, 'DMBM', 1, 'hand');
        if (neg) return done(n);
        dec(W(n, 'hand'), 'DMBM'); L.sum(n, 'DMBM', 'special', 'hand'); place(n, 'DMBM', { special: true });
        return done(n);
      });
    }
    // Gandora-G: SS from hand with Sarcophagus; pay half LP to wipe the field and banish it.
    if (has(s.hand, 'GAND') && !GO(s, 'gand1') && monFree(s) > 0 && s.st.some((x) => x.id === 'SARC' && x.up)) {
      push('gand', { handEff: true }, (s0, neg) => {
        const n = clone(s0); SO(n, 'gand1');
        step(n, neg ? 'Gandora-G: negated.' : 'Gandora-G: Special Summon it from hand (you control Sarcophagus).', { handEff: true });
        L.act(n, 'GAND', 1, 'hand');
        if (neg) return done(n);
        dec(W(n, 'hand'), 'GAND'); L.sum(n, 'GAND', 'special', 'hand'); place(n, 'GAND', { special: true });
        return done(n);
      });
    }
    if (s.mons.some((m) => m.id === 'GAND' && !m.noEff) && !GO(s, 'gand2') && s.opp && (s.opp.mons.length + s.opp.st.length) > 0) {
      for (const pick of SARC_MON.filter((id) => id !== 'GAND' && has(s.deck, id)).concat([null])) {
        push('gand2:' + pick, { ash: !!pick, field: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'gand2');
          n.lp = Math.floor(n.lp / 2);
          step(n, neg ? 'Gandora-G wipe: negated (LP already paid).' : `Gandora-G: pay half LP, destroy and banish every other card on the field${pick ? `, then Special Summon ${S(pick)} from Deck` : ''}.`, { ash: !!pick, field: true, removal: true });
          L.act(n, 'GAND', 2, 'field');
          if (neg) return done(n);
          let count = 0;
          for (let i = n.mons.length - 1; i >= 0; i--) {
            const m = n.mons[i];
            if (m.id === 'GAND' || m.id === 'DRAG') continue;
            n.mons.splice(i, 1); inc(W(n, 'ban'), m.id); L.mv(n, m.id, 'field', 'banished'); count++;
          }
          for (let i = n.st.length - 1; i >= 0; i--) {
            const x = n.st[i];
            if (x.id === 'SARC') continue;
            n.st.splice(i, 1); inc(W(n, 'ban'), x.id); L.mv(n, x.id, 'field', 'banished'); count++;
          }
          for (const m of n.opp.mons.slice()) if (!m.noDestroy) { oppRemove(n, m.uid, 'banish'); count++; }
          for (const x of n.opp.st.slice()) if (!x.noDestroy) { oppRemove(n, x.uid, 'banish'); count++; }
          if (pick) {
            fromDeck(n, pick); L.sum(n, pick, 'special', 'deck');
            const m = place(n, pick, { special: true, lvl: (P[pick].lv || 0) + count });
            if (pick === 'DMG' && !GO(n, 'dmg1') && has(n.deck, 'SARC') && !n.droll) n.pend.unshift({ t: 'dmg' });
            void m;
          }
          n.oppBanished = count;
          return done(n);
        });
      }
    }

    // Red-Eyes Dark Dragoon: destroy an opponent's monster and burn its original ATK (once per Normal material).
    s.mons.forEach((m, i) => {
      if (m.id !== 'DRAG' || m.uses <= 0 || !s.opp) return;
      for (const t of s.opp.mons) {
        if (t.noDestroy) continue;
        push('drag:' + t.uid, { field: true, removal: true }, (s0, neg) => {
          const n = clone(s0);
          n.mons[i] = { ...n.mons[i], uses: n.mons[i].uses - 1 };
          step(n, neg ? 'Dragoon destroy: negated.' : `Dragoon: destroy their ${oppLabel(t)}, burn ${t.atk}.`, { field: true, removal: true });
          L.act(n, 'DRAG', 0, 'field');
          if (neg) return done(n);
          oppRemove(n, t.uid, 'destroy');
          n.burn += t.atk || 0; OW(n).lp -= t.atk || 0;
          return done(n);
        });
      }
    });

    // Pharaoh's Servant (field): discard a Spell, destroy all their Spells/Traps.
    s.mons.forEach((m) => {
      if (m.id !== 'SERV' || m.noEff || GO(s, 'serv') || !s.opp || !s.opp.st.some((x) => !x.noDestroy)) return;
      const sp = hand.filter(isSpell);
      if (!sp.length) return;
      const d = pickFodder(s, sp, 1)[0];
      push('servwipe', { field: true, removal: true }, (s0, neg) => {
        const n = clone(s0); SO(n, 'serv');
        step(n, neg ? "Pharaoh's Servant wipe: negated." : `Pharaoh's Servant: discard ${S(d)}, destroy all their Spells/Traps.`, { field: true, removal: true });
        L.act(n, 'SERV', 2, 'field');
        dec(W(n, 'hand'), d); inc(W(n, 'gy'), d); L.mv(n, d, 'hand', 'gy');
        if (neg) return done(n);
        for (const x of n.opp.st.slice()) if (!x.noDestroy) oppRemove(n, x.uid, 'destroy');
        return done(n);
      });
    });

    // Master of Chaos: Tribute 1 LIGHT + 1 DARK, banish all their monsters.
    if (s.mons.some((m) => m.id === 'MOC') && !GO(s, 'moc2') && s.opp && s.opp.mons.length) {
      const light = s.mons.findIndex((m) => P[m.id].attr === 'LIGHT' || m.id === 'MUD');
      const dark = s.mons.findIndex((m, i) => i !== light && P[m.id].attr === 'DARK');
      if (light >= 0 && dark >= 0) {
        push('moc2', { field: true, removal: true }, (s0, neg) => {
          const n = clone(s0); SO(n, 'moc2');
          const a = n.mons[light].id, b = n.mons[dark].id;
          step(n, neg ? 'Master of Chaos: negated.' : `Master of Chaos: Tribute ${S(a)} and ${S(b)}, banish all their monsters.`, { field: true, removal: true });
          L.act(n, 'MOC', 2, 'field');
          for (const i of [light, dark].sort((p, q) => q - p)) monToGY(n, i);
          if (!neg) for (const m of n.opp.mons.slice()) oppRemove(n, m.uid, 'banish');
          return done(n);
        });
      }
    }

    // Synchro: Chaos Angel (treat 1 LIGHT/DARK as Tuner), Baronne (needs a real Tuner).
    genSynchro(s, push);
    // Links.
    genLinks(s, push);

    return A;
  }

  // Their face-up floodgates: no Extra Deck summons / no Spell activations while on the field.
  const EXTRA_KEY = /^(gaze|dmod|spoly|hall|syn|link):/;
  const SPELL_KEY = /^(curt|circ1|gaze|spoly|hall|dece|dece1|want|want2|ssrv|ssrv2|sarc|sarc1|fsil|prep|circ2)[:#]|^(want2|ssrv2|prep|dece:on|sarc:on)$/;
  function floodgates(s) {
    const f = { extra: false, spell: false, mon: false };
    if (!s.opp) return f;
    for (const c of s.opp.mons.concat(s.opp.st)) {
      if (c.faceDown) continue;
      if (c.intr === 'floodExtra') f.extra = true;
      if (c.intr === 'floodSpell') f.spell = true;
      if (c.intr === 'floodMon') f.mon = true;
    }
    return f;
  }

  // Run an action and record it on the line's path.
  function exec(s, a, neg) {
    const n = a.run(s, neg);
    if (n) { const pt = s.path.slice(); pt.push(neg ? '~' + a.k : a.k); n.path = pt; }
    return n;
  }

  function afterExtraSummon(n, f) {
    if (f === 'DMOD') { SO(n, 'dmodSS'); if (!GO(n, 'dmodS') && !n.droll) n.pend.unshift({ t: 'dmod' }); }
    if (f === 'MOC' && !GO(n, 'moc1')) n.pend.unshift({ t: 'moc1' });
    if (f === 'RCIE' && !GO(n, 'rcie1') && !n.droll) n.pend.unshift({ t: 'rcie' });
  }

  // Choose up to k cards to discard/send, least valuable first.
  function pickFodder(s, ids, k) {
    const val = (id) => (id === 'UNK' ? 0 : HANDTRAPS[id] ? 5 : ({ SPOLY: 1.5, CIRC: 1.2, PREP: 1, FSIL: 1, SSRV: 1.3, WANT: 1.4, DECE: 2, HALL: 2.5 })[id] || 3);
    return [...new Set(ids)].sort((a, b) => val(a) - val(b)).slice(0, k);
  }

  function genSynchro(s, push) {
    const ms = s.mons.map((m, i) => ({ m, i })).filter((x) => P[x.m.id].lv && x.m.lvl);
    if (ms.length < 2) return;
    const subsets = [];
    const n = ms.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const pick = ms.filter((_, j) => mask & (1 << j));
      if (pick.length < 2 || pick.length > 3) continue;
      const sum = pick.reduce((t, x) => t + x.m.lvl, 0);
      if (sum !== 10) continue;
      subsets.push(pick);
    }
    const seen = new Set();
    for (const pick of subsets) {
      const sig = pick.map((x) => x.m.id).sort().join('+');
      if (seen.has(sig)) continue; seen.add(sig);
      const tuners = pick.filter((x) => P[x.m.id].tuner);
      const allLD = pick.every((x) => ['LIGHT', 'DARK'].includes(P[x.m.id].attr));
      if (has(s.extra, 'CANG') && tuners.length <= 1 && allLD) mkSynchro(s, push, 'CANG', pick);
      if (has(s.extra, 'BAR') && tuners.length === 1) mkSynchro(s, push, 'BAR', pick);
    }
  }
  function mkSynchro(s, push, f, pick) {
    push('syn:' + f + ':' + pick.map((x) => x.m.id).sort().join('+'), { inherent: true }, (s0) => {
      const n = clone(s0);
      step(n, `Synchro Summon ${S(f)} with ${pick.map((x) => S(x.m.id)).join(' + ')}.`, { inherent: true });
      const ids = [];
      for (const i of pick.map((x) => x.i).sort((p, q) => q - p)) ids.push(monToGY(n, i, false).id);
      L.sum(n, f, 'synchro', 'extra', ids);
      dec(W(n, 'extra'), f); place(n, f, { special: true });
      if (f === 'CANG' && oppTargets(n).length) n.pend.unshift({ t: 'cang' });
      return done(n);
    }, false);
  }

  const BOTTOM_ARROWS = new Set(['MASQ', 'SHEEP', 'FANCY', 'CHARM']);
  const LINKS = {
    MASQ: { rating: 2, min: 2, max: 2, ok: (ms) => ms.every((m) => P[m.id].sub !== 'Link') },
    SHEEP: { rating: 2, min: 2, max: 2, ok: (ms) => new Set(ms.map((m) => m.nm)).size === ms.length },
    SPLK: { rating: 2, min: 2, max: 2, ok: (ms) => ms.every((m) => P[m.id].sub !== 'Normal') },
    FANCY: { rating: 3, min: 2, max: 3, ok: (ms) => ms.every((m) => P[m.id].sub !== 'Normal') },
    CHARM: { rating: 4, min: 2, max: 4, ok: () => true },
  };
  function genLinks(s, push) {
    const ms = s.mons.map((m, i) => ({ m, i }));
    if (ms.length < 2) return;
    const seen = new Set();
    const n = ms.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const pick = ms.filter((_, j) => mask & (1 << j));
      if (pick.length < 2 || pick.length > 4) continue;
      const sig = pick.map((x) => x.m.id).sort().join('+');
      if (seen.has(sig)) continue; seen.add(sig);
      const mons = pick.map((x) => x.m);
      for (const f in LINKS) {
        if (!has(s.extra, f)) continue;
        const L2 = LINKS[f];
        if (pick.length < L2.min || pick.length > L2.max || !L2.ok(mons)) continue;
        // Link rating: each material counts 1, or its Link rating.
        const lo = pick.length, hi = mons.reduce((t, m) => t + (P[m.id].link || 1), 0);
        const canExact = pick.length === L2.rating || (lo <= L2.rating && hi >= L2.rating && mons.some((m) => P[m.id].link));
        if (!canExact) continue;
        // Zones: a Link goes to the Extra Monster Zone, or to a Main Monster Zone the EMZ Link points to.
        const emzMon = s.mons.find((m) => m.emz);
        const emzFree = !emzMon || mons.includes(emzMon);
        const mainAfter = s.mons.filter((m) => !m.emz).length - mons.filter((m) => !m.emz).length;
        const toEmz = emzFree;
        if (!toEmz && !(BOTTOM_ARROWS.has(emzMon.id) && mainAfter < 5)) continue;
        push('link:' + f + ':' + sig, { inherent: true }, (s0) => {
          const nn = clone(s0);
          step(nn, `Link Summon ${S(f)} with ${pick.map((x) => S(x.m.id)).join(' + ')}.`, { inherent: true });
          const ids = [];
          const usedExtra = mons.some((m) => P[m.id].ext);
          for (const i of pick.map((x) => x.i).sort((p, q) => q - p)) ids.push(monToGY(nn, i, false).id);
          L.sum(nn, f, 'link', 'extra', ids);
          dec(W(nn, 'extra'), f); place(nn, f, { special: true, emz: toEmz });
          if (f === 'SPLK' && usedExtra && !GO(nn, 'splk1') && oppTargets(nn).length) nn.pend.unshift({ t: 'splk' });
          return done(nn);
        }, false);
      }
    }
  }

  // Pending triggers: resolved one at a time before anything else.
  function genPending(s, A, push) {
    const p = s.pend[0];
    const pop = (n) => { n.pend = n.pend.slice(1); return n; };
    const decline = (label) => push('dec:' + p.t, {}, (s0) => { const n = pop(clone(s0)); return n; }, false);
    if (p.t === 'rod') {
      const opts = s.droll ? [] : DM_ST.filter((id) => has(s.deck, id));
      for (const a of opts) push('rod:' + a, { ash: true, droll: true, field: true, dm: true }, (s0, neg) => {
        const n = pop(clone(s0)); SO(n, 'rod1');
        step(n, neg ? "Rod's search: negated." : `Rod: add ${S(a)}.`, { ash: true, droll: true, field: true, dm: true });
        L.act(n, 'ROD', 1, 'field');
        if (!neg) { fromDeck(n, a); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand'); }
        return done(n);
      });
      if (!opts.length) decline();
    } else if (p.t === 'dia') {
      const opts = SINFUL.filter((id) => has(s.deck, id));
      if (stFree(s) > 0) for (const a of opts) push('dia1:' + a, { field: true }, (s0, neg) => {
        const n = pop(clone(s0)); SO(n, 'dia1');
        step(n, neg ? "Diabellstar's Set: negated." : `Diabellstar: Set ${S(a)} from Deck.`, { field: true });
        L.act(n, 'DIA', 1, 'field');
        if (!neg) { fromDeck(n, a); n.st.push({ id: a, up: false, now: true }); L.mv(n, a, 'deck', 'field'); }
        return done(n);
      });
      if (!opts.length || stFree(s) <= 0) decline();
    } else if (p.t === 'dmg') {
      if (has(s.deck, 'SARC') && !s.droll) push('dmg1', { ash: true, droll: true, field: true }, (s0, neg) => {
        const n = pop(clone(s0)); SO(n, 'dmg1');
        step(n, neg ? "DMG Apprentice's search: negated." : 'DMG Apprentice: add Shining Sarcophagus.', { ash: true, droll: true, field: true });
        L.act(n, 'DMG', 1, 'field');
        if (!neg) { fromDeck(n, 'SARC'); inc(W(n, 'hand'), 'SARC'); L.mv(n, 'SARC', 'deck', 'hand'); }
        return done(n);
      });
      else decline();
    } else if (p.t === 'dmod') {
      const opts = s.droll ? [] : DMOD_SEARCH.filter((id) => has(s.deck, id));
      for (const a of opts) push('dmodS:' + a, { ash: true, droll: true, field: true, dm: true }, (s0, neg) => {
        const n = pop(clone(s0)); SO(n, 'dmodS');
        step(n, neg ? "DM of Destruction's search: negated." : `DM of Destruction: add ${S(a)}.`, { ash: true, droll: true, field: true, dm: true });
        L.act(n, 'DMOD', 0, 'field');
        if (!neg) { fromDeck(n, a); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand'); }
        return done(n);
      });
      if (!opts.length) decline();
    } else if (p.t === 'rcie') {
      const opts = s.droll ? [] : ['HALL', 'DECE', 'WANT'].filter((id) => has(s.deck, id));
      for (const a of opts) push('rcie:' + a, { ash: true, droll: true, field: true }, (s0, neg) => {
        const n = pop(clone(s0)); SO(n, 'rcie1');
        step(n, neg ? "Rcielago's search: negated." : `Rcielago: add ${S(a)}.`, { ash: true, droll: true, field: true });
        L.act(n, 'RCIE', 1, 'field');
        if (!neg) { fromDeck(n, a); inc(W(n, 'hand'), a); L.mv(n, a, 'deck', 'hand'); }
        return done(n);
      });
      if (!opts.length) decline();
    } else if (p.t === 'moc1') {
      const opts = keys(s.gy).filter((id) => P[id] && P[id].kind === 'M' && !P[id].ext && P[id].sub !== 'Ritual' && ['LIGHT', 'DARK'].includes(P[id].attr));
      if (monFree(s) > 0) for (const a of opts) push('moc1:' + a, { field: true }, (s0, neg) => {
        const n = pop(clone(s0)); SO(n, 'moc1');
        step(n, neg ? "Master of Chaos's revive: negated." : `Master of Chaos: Special Summon ${S(a)} from GY.`, { field: true, gy: true });
        L.act(n, 'MOC', 1, 'field');
        if (!neg) { dec(W(n, 'gy'), a); L.sum(n, a, 'special', 'gy'); place(n, a, { special: true }); }
        return done(n);
      });
      decline();
    } else if (p.t === 'circ2' || p.t === 'cang' || p.t === 'splk') {
      const label = { circ2: 'Circle', cang: 'Chaos Angel', splk: 'Little Knight' }[p.t];
      for (const t of oppTargets(s).slice().sort((a, b) => (b.intr ? 1 : 0) - (a.intr ? 1 : 0))) push(p.t + ':' + t.uid, { removal: true, field: p.t !== 'circ2' }, (s0, neg) => {
        const n = pop(clone(s0));
        if (p.t === 'circ2') SO(n, 'circ2');
        if (p.t === 'splk') { SO(n, 'splk1'); n.noDirect = true; }
        step(n, neg ? `${label}'s banish: negated.` : `${label}: banish their ${oppLabel(t)}${p.t === 'splk' ? ' (your monsters cannot attack directly this turn)' : ''}.`, { removal: true, field: p.t !== 'circ2', spell: p.t === 'circ2' });
        if (p.t === 'circ2') L.act(n, 'CIRC', 2, 'field');
        if (p.t === 'cang') L.act(n, 'CANG', 0, 'field');
        if (p.t === 'splk') L.act(n, 'SPLK', 1, 'field');
        if (!neg) oppRemove(n, t.uid, 'banish');
        return done(n);
      });
      if (!oppTargets(s).length) decline();
    } else if (p.t === 'tali3') {
      if (stFree(s) > 0 && has(s.gy, 'TALI')) push('tali3', {}, (s0) => {
        const n = pop(clone(s0)); SO(n, 'tali3'); n.lp -= 2500;
        step(n, 'Dark Magic Talisman (GY): pay 2500 LP, Set it.', { trap: true });
        L.act(n, 'TALI', 0, 'gy'); dec(W(n, 'gy'), 'TALI'); n.st.push({ id: 'TALI', up: false, now: true }); L.mv(n, 'TALI', 'gy', 'field');
        return done(n);
      }, false);
      decline();
    } else if (p.t === 'gar') {
      push('gar', {}, (s0) => {
        const n = pop(clone(s0)); SO(n, 'gar');
        step(n, 'Garura (sent to GY): draw 1.');
        L.act(n, 'GAR', 1, 'gy'); draw(n, 1);
        return done(n);
      }, false);
    } else {
      decline();
    }
    if (!A.length) decline();
  }

  // ── Scoring ──
  // Sets the cards a player would Set at the end of the turn and lists what the board does on their turn.
  const SET_ORDER = ['TALI', 'CURT', 'GAZE', 'SPOLY', 'SSRV', 'WANT', 'FSIL'];
  const NOSETS = Object.freeze([]);
  function finalize(s) {
    const n = { hand: s.hand, st: s.st, mons: s.mons, gy: s.gy, deck: s.deck, extra: s.extra, opp: s.opp, lp: s.lp, noDirect: s.noDirect, deceReset: s.deceReset };
    let any = false;
    for (let i = 0; i < SET_ORDER.length; i++) if (has(s.hand, SET_ORDER[i])) { any = true; break; }
    if (!any) return { n, sets: NOSETS };
    n.hand = s.hand.slice(); n.st = s.st.slice();
    const sets = [];
    const keepOne = n.mons.some((m) => m.id === 'DRAG' || m.id === 'SERV');
    outer: for (let q = 0; q < SET_ORDER.length; q++) {
      const id = SET_ORDER[q];
      const c = cnt(n.hand, id);
      for (let i = 0; i < c; i++) {
        if (stFree(n) <= 0) break outer;
        if (keepOne && total(n.hand) <= 1) break outer;
        if (id === 'GAZE' && !gazeLive(n)) continue;
        dec(n.hand, id); n.st.push({ id, up: false, now: false, endSet: true }); sets.push(id);
      }
    }
    return { n, sets };
  }
  function gazeLive(n) {
    const fus = ['DRAG', 'DMOD', 'MOC'].some((f) => has(n.extra, f));
    const target = n.mons.some((m) => m.nm === 'DM') || keys(n.gy).some((id) => gyName(id) === 'DM')
      || (has(n.deck, 'DM') && n.st.some((x) => x.id === 'CURT'));
    return fus && target;
  }

  let _items = null, _sum = 0;
  function add(label, v) { _sum += v; if (_items) _items.push([label, v]); }
  function interruptions(n, full) {
    _items = full ? [] : null; _sum = 0;
    const hk = keys(n.hand);
    const handN = total(n.hand);
    let spellsInHand = 0;
    for (let i = 0; i < hk.length; i++) if (isSpell(hk[i])) spellsInHand++;
    const circleUp = n.st.some((x) => x.id === 'CIRC' && x.up);
    for (const m of n.mons) {
      switch (m.id) {
        case 'DRAG': {
          const spare = hk.some((id) => !HANDTRAPS[id]);
          if (spare) add('Dragoon: discard 1 to negate', 1.0); else if (handN) add('Dragoon: negate (costs a hand trap as the discard)', 0.4); else add('Dragoon (no card left to discard)', 0.25);
          break;
        }
        case 'ILIA': add('Ilia Silvia: Tribute to negate', 1.0); break;
        case 'BAR': add('Baronne: negate', 1.0); break;
        case 'SPLK': add('Little Knight: banish 2 until End Phase', 0.9); break;
        case 'SERV': if (spellsInHand) add("Pharaoh's Servant: discard a Spell, destroy their Spells/Traps", 0.6); else add("Pharaoh's Servant (no Spell to discard)", 0.1); break;
        case 'MUD': add('Mudragon: protects same-Attribute monsters from targeting', 0.5); break;
        case 'MASQ': add('Masquerena: Link Summon on their turn', 0.4); break;
        case 'CHARM': add('Charmer Quartet: revive 2 on their turn', 0.4); break;
        case 'CANG': add('Chaos Angel: your monsters cannot be destroyed by battle', 0.3); break;
        case 'CHOR': add('Chorozo: negate an attack', 0.3); break;
        case 'DIA': add('Diabellstar: comes back if sent to GY on their turn', 0.2); break;
        default: add(_items ? S(m.id) : '', Math.min(0.2, (P[m.id].atk || 0) / 15000));
      }
    }
    let gazeCounted = false, curtCounted = false;
    for (const x of n.st) {
      if (x.id === 'GAZE' && !x.up) { if (gazeCounted) { add('Gaze (second copy: only 1 Gaze per turn)', 0.05); continue; } gazeCounted = true; }
      if (x.id === 'CURT' && !x.up) { if (curtCounted) { add('Curtain (second copy: only 1 Curtain per turn)', 0.05); continue; } curtCounted = true; }
      if (x.id === 'TALI' && !x.up) add('Talisman (Set): negates a monster effect chained to a DM card', 0.5);
      if (x.id === 'CURT' && !x.up) {
        let v = has(n.deck, 'DM') ? 0.4 : 0.1; let t = 'Curtain (Set): Dark Magician from Deck + search on their turn';
        if (circleUp && has(n.deck, 'DM')) { v += 0.6; t += ', Circle banishes 1'; }
        if (has(n.gy, 'TALI') && has(n.deck, 'DM')) { v += 0.2; t += ', re-Set Talisman'; }
        add(t, v);
      }
      if (x.id === 'GAZE' && !x.up) { const gl = gazeLive(n); add(gl ? 'Gaze (Set): Fusion Summon on their turn' : 'Gaze (Set, no target yet)', gl ? 0.6 : 0.1); }
      if (x.id === 'SPOLY' && !x.up) add('Super Poly (Set): fuse their monster on their turn', handN ? 0.6 : 0.1);
      if (x.id === 'SARC' && x.up) add('Sarcophagus: answers a monster revived from their GY', spellsInHand ? 0.3 : 0.1);
      if (x.id === 'DECE') add('Deception', 0.1);
      if (x.id === 'WANT' && !x.up) add('WANTED (Set)', 0.1);
    }
    if (n.deceReset) add('Deception re-Sets in the End Phase', 0.1);
    for (let q = 0; q < hk.length; q++) {
      const id = hk[q];
      if (!HANDTRAPS[id]) continue;
      const k = cnt(n.hand, id);
      for (let i = 0; i < k; i++) add(_items ? `${S(id)} in hand` : '', HANDTRAPS[id]);
    }
    return _items;
  }

  function battle(n) {
    const ours = [];
    for (const m of n.mons) { const a = P[m.id].atk || 0; if (a > 0) ours.push(a); }
    ours.sort((a, b) => b - a);
    const theirs = n.opp ? n.opp.mons : [];
    const T = theirs.length;
    if (!T) return n.noDirect ? 0 : ours.reduce((t, a) => t + a, 0);
    const full = (1 << T) - 1;
    const memo = new Map();
    const f = (i, mask) => {
      if (i === ours.length) return 0;
      const key = i * 64 + mask;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      const a = ours[i];
      let best = f(i + 1, mask);
      if (mask === 0) { if (!n.noDirect) best = Math.max(best, a + f(i + 1, 0)); } else {
        for (let j = 0; j < T; j++) {
          if (!(mask & (1 << j))) continue;
          const t = theirs[j];
          const isAtk = (t.pos || 'atk') === 'atk';
          const val = isAtk ? (t.atk || 0) : (t.def || 0);
          if (a > val) best = Math.max(best, (isAtk ? a - val : 0) + f(i + 1, mask & ~(1 << j)));
        }
      }
      memo.set(key, best);
      return best;
    };
    return f(0, full);
  }

  // Scores a position. `full` also builds the labelled list of what the board does on their turn.
  function evaluate(s, full) {
    const { n, sets } = finalize(s);
    const items = interruptions(n, full);
    const val = _sum;
    const nlog = s.log.length;
    const draws = s.oppDraws;
    let eff = draws;
    // Mulcharmy: in the End Phase they shuffle back down to (cards you control + 6). Going first they hold 4 after discarding it.
    if (draws && (s.mul & 3) && !(s.mode === 'second' && s.opp)) eff = Math.min(draws, n.mons.length + n.st.length + 2);
    const pen = eff * s.dpen;
    let score, summary;
    if (s.mode === 'second' && s.opp) {
      const dmg = battle(n);
      const lethal = dmg >= n.opp.lp;
      let live = 0;
      for (let i = 0; i < n.opp.mons.length; i++) { const m = n.opp.mons[i]; if (m.intr && !m.faceDown) live++; }
      for (let i = 0; i < n.opp.st.length; i++) if (n.opp.st[i].intr) live++;
      score = lethal ? 1000 + Math.min(6, (dmg - n.opp.lp) / 500) + val * 0.5 - nlog * 0.5 - Math.max(0, s.summons - 4) * 0.5 - s.cAsh * 0.6 - s.cDroll * 0.3 - live * 2
        : 300 * (1 - Math.max(0, n.opp.lp - dmg) / n.opp.lp0) + 25 * s.removed + 12 * val - live * 15;
      const raw = score;
      if (!lethal) score -= pen;                                   // a dead opponent draws nothing useful
      summary = { lethal, battle: dmg, burn: s.burn, oppLp: n.opp.lp, removed: s.removed, defense: val, draws, eff, raw };
    } else {
      const raw = val * 100 - nlog * 1.5 - Math.max(0, nlog - 12) * 2.5 - s.cAsh * 2 - Math.max(0, s.summons - 5) * 3;
      score = raw - pen;
      summary = { value: val, draws, eff, raw };
    }
    return { score, summary, items, sets, final: n, chokes: full ? { ash: s.cAsh, droll: s.cDroll, mon: s.cMon } : null };
  }

  function boardSig(e) {
    const n = e.final;
    return n.mons.map((m) => m.id).sort().join('+') + '|' + n.st.map((x) => x.id + (x.up ? '+' : '')).sort().join(',') + '|' + (e.summary.lethal ? 'L' : '')
      + (n.opp ? '|' + n.opp.mons.map((m) => m.uid).concat(n.opp.st.map((x) => x.uid)).join('.') : '') + (e.summary.draws ? '|d' + e.summary.draws : '');
  }

  // ── Search ──
  // Heuristic for ranking partial lines: value now plus resources still unused.
  function potential(s) {
    let h = 0, lowMon = false;
    const hd = s.hand;
    for (let i = 0; i < NID; i++) {
      const c = hd[i];
      if (!c) continue;
      const id = IDS[i];
      if (id === 'UNK' || HANDTRAPS[id]) continue;
      h += 14 * c;
      const p = P[id];
      if (p && p.kind === 'M' && p.lv <= 4) lowMon = true;
    }
    let setN = 0;
    for (let i = 0; i < s.st.length; i++) if (!s.st[i].up) setN++;
    h += 9 * s.mons.length + 6 * setN;
    if (!s.ns && lowMon) h += 20;
    h += 10 * s.pend.length;
    return h;
  }

  // Indices of the k largest values of h, best first (ties: earlier index first).
  function topK(h, m, k) {
    const ord = new Int32Array(m);
    for (let i = 0; i < m; i++) ord[i] = i;
    if (m > k) {
      let lo = 0, hi = m - 1;
      while (lo < hi) {
        const p = ord[(lo + hi) >> 1], hp = h[p];
        let i = lo, j = hi;
        while (i <= j) {
          while (h[ord[i]] > hp || (h[ord[i]] === hp && ord[i] < p)) i++;
          while (hp > h[ord[j]] || (hp === h[ord[j]] && p < ord[j])) j--;
          if (i <= j) { const t = ord[i]; ord[i] = ord[j]; ord[j] = t; i++; j--; }
        }
        if (k - 1 <= j) hi = j; else if (k - 1 >= i) lo = i; else break;
      }
    }
    const top = Array.from(ord.subarray(0, Math.min(k, m)));
    top.sort((x, y) => (h[y] - h[x]) || (x - y));
    return top;
  }

  // Beam search, repeated with a wider beam until time runs out (or the answer stops improving).
  function solveBeam(root, opts = {}) {
    const timeMs = opts.timeMs || 2500;
    const K = opts.top || 3;
    const t0 = Date.now();
    const growth = opts.growth || 2;
    let nodes = 0, width = opts.width || 150, rounds = 0, iter = 0;
    const maxWidth = opts.maxWidth || Infinity;
    const best = [];
    let safest = null, safestRisk = Infinity;
    const cap = K * 6;
    const front = [];
    function consider(s) {
      const e = evaluate(s, false);
      if (s.mul) {
        const d = Math.min(s.oppDraws, 15), f = front[d], raw = e.summary.raw;
        if (!f || raw > f.raw + 1e-9 || (raw > f.raw - 1e-9 && s.log.length < f.s.log.length)) front[d] = { raw, s };
      }
      if (e.summary.lethal) {
        const rk = s.cAsh * 3 + s.cDroll * 2 + s.cMon + s.log.length * 0.5;
        if (rk < safestRisk) { safestRisk = rk; safest = evaluate(s, true); safest.state = s; safest.sig = boardSig(safest); }
      }
      if (best.length >= cap && e.score <= best[best.length - 1].score) return e;
      const sig = boardSig(e);
      const j = best.findIndex((b) => b.sig === sig);
      if (j >= 0) { if (best[j].score >= e.score) return e; best.splice(j, 1); }
      const fe = evaluate(s, true);
      fe.sig = sig; fe.state = s;
      best.push(fe); best.sort((a, b) => b.score - a.score);
      if (best.length > cap) best.length = cap;
      return e;
    }
    function result() {
      const lines = best.slice(0, K);
      for (const b of best) b.safest = false;
      let sf = safest;
      if (sf) { const hit = lines.find((x) => x.state === sf.state); if (hit) { hit.safest = true; sf = hit; } else sf.safest = true; }
      // Draw trade-off: for each number of draws, the best board reachable, kept only if it beats every cheaper one.
      let frontier = null;
      if (front.length) {
        frontier = [];
        let top = -Infinity;
        for (let d = 0; d < front.length; d++) {
          const f = front[d];
          if (!f || f.raw <= top + 0.5) continue;
          top = f.raw;
          const fe = evaluate(f.s, true); fe.state = f.s;
          frontier.push(fe);
        }
      }
      return { lines, safest: sf, frontier, all: best, nodes, ms: Date.now() - t0, width, rounds };
    }
    if (!root.pend.length) consider(root);
    let timeUp = false, lastTop = -Infinity;
    while (!timeUp) {
      rounds++;
      let layer = [root];
      const seen = new Set([stateKey(root)]);
      for (let depth = 0; depth < 26 && layer.length && !timeUp; depth++) {
        const nextS = [], nextH = [];
        for (let li = 0; li < layer.length; li++) {
          const s = layer[li];
          let acts;
          try { acts = gen(s); } catch (e) { continue; }
          const sLast = s.log.length ? s.log[s.log.length - 1] : null;
          for (let ai = 0; ai < acts.length; ai++) {
            const a = acts[ai];
            let n;
            try { n = exec(s, a, false); } catch (e) { if (opts.debug) console.error(a.k, e); continue; }
            if (!n) continue;
            nodes++;
            const last = n.log.length ? n.log[n.log.length - 1] : null;
            if (last && last !== sLast) {
              last.pre = s; last.act = a;
              if (opts.policy) {
                // Greedy opponent: spends the first unspent interruption that can hit this step.
                const view = { tags: last.tags, canNeg: a.neg, summonsAfter: n.summons, summoned: last.ns > 0, oppCount: s.opp ? s.opp.mons.length + s.opp.st.length : 0,
                  oppPresent: s.opp ? s.opp.mons.filter((m) => !m.faceDown).map((m) => m.uid).concat(s.opp.st.map((x) => x.uid)) : [] };
                const j = opts.policy.findIndex((it, q) => !(s.spent && s.spent[q]) && eligible(view, it));
                if (j >= 0) {
                  try { n = interrupt(s, a, opts.policy[j]); n.spent = { ...(s.spent || {}), [j]: true }; } catch (e) { if (opts.debug) console.error('interrupt', a.k, e); continue; }
                }
              }
            }
            const k = stateKey(n);
            if (seen.has(k)) continue;
            seen.add(k);
            const sc = n.pend.length ? evaluate(n, false).score : consider(n).score;
            nextS.push(n); nextH.push(sc + potential(n));
          }
          if ((++iter & 7) === 0 && Date.now() - t0 > timeMs) { timeUp = true; break; }
        }
        const pick = topK(nextH, nextS.length, width);
        layer = pick.map((i) => nextS[i]);
      }
      const top = best.length ? best[0].score : -Infinity;
      if (opts.onRound) opts.onRound(result());
      if (opts.rounds && rounds >= opts.rounds) break;
      if (opts.converge && rounds >= 2 && !timeUp && top <= lastTop + 1e-9) break;
      lastTop = top;
      if (width * growth > maxWidth) break;
      width *= growth;
      if (Date.now() - t0 > timeMs) break;
    }
    return result();
  }

  // ── Export for the md-meta-app Line Trainer (GeneratedLine JSON) ──
  function toGenerated(line, name, hand) {
    const n = line.final;
    const steps = [];
    for (const st of line.state.log) steps.push(...ledgerParts(st));
    for (const id of line.sets) steps.push({ text: `Set ${S(id)}.`, moves: [{ card: N(id), from: 'hand', to: 'field' }] });
    const starters = [];
    let free = 0;
    for (const id of hand) { if (id === 'UNK') free++; else starters.push([N(id)]); }
    return {
      name, starters, freeCards: free, steps,
      endBoard: n.mons.map((m) => N(m.id)).concat(n.st.map((x) => N(x.id))),
      endBoardText: line.items.filter((x) => x[1] >= 0.3).map((x) => x[0]).join('; '),
    };
  }
  // The app's ledger applies a step's activations, then summons, then moves. Split a step
  // where a summon needs a card that a move in the same step put in place.
  function ledgerParts(st) {
    const parts = [];
    let cur = { acts: [], sums: [], mvs: [] };
    for (const [k, v] of ledObjs(st)) {
      if (k === 'a' && (cur.sums.length || cur.mvs.length)) { parts.push(cur); cur = { acts: [], sums: [], mvs: [] }; }
      if (k === 's') {
        const needs = [[v.card, v.from || 'hand'], ...(v.materials || []).map((m) => [m, v.materialsFrom || 'field'])];
        if (cur.mvs.some((m) => needs.some(([c, z]) => m.card === c && m.to === z))) { parts.push(cur); cur = { acts: [], sums: [], mvs: [] }; }
      }
      (k === 'a' ? cur.acts : k === 's' ? cur.sums : cur.mvs).push(v);
    }
    parts.push(cur);
    return parts.map((p, i) => ({
      text: i === 0 ? st.text : `(continued) ${p.sums.map((x) => `Special Summon ${x.card}`).join(', ') || 'resolve the rest'}.`,
      ...cleanLed({ activations: p.acts, summons: p.sums, moves: p.mvs }),
    }));
  }
  function cleanLed(led) {
    const o = {};
    if (led.activations.length) o.activations = led.activations;
    if (led.summons.length) o.summons = led.summons;
    if (led.moves.length) o.moves = led.moves;
    return o;
  }

  // ── Their interruptions ──
  // intr: { kind, src: 'hand'|'board', uid?, cardKind?: 'mon'|'st', label }
  const HT_MONSTER = { ash: true, veiler: true, belle: true, droll: true, nibiru: true, fuwalos: true, purulia: true, maxxc: true };
  // Draw effects: once live, they draw for your summons for the rest of the turn.
  const MUL = { fuwalos: 1, purulia: 2, maxxc: 4 };
  const MUL_TEXT = {
    fuwalos: 'they draw 1 each time you Special Summon from the Deck or Extra Deck',
    purulia: 'they draw 1 each time you Normal or Special Summon from your hand',
    maxxc: 'they draw 1 each time you Special Summon',
  };
  function startMul(s0, it) {
    const s = clone(s0);
    s.mul |= MUL[it.kind];
    s.opening = (s.opening || []).concat([`${it.label || INTR_LABEL[it.kind]} at the start of your turn: ${MUL_TEXT[it.kind]}`]);
    s.path = s0.path.concat(['^' + JSON.stringify(it)]);
    return s;
  }
  const INTR_LABEL = {
    ash: 'Ash Blossom', imperm: 'Infinite Impermanence', veiler: 'Effect Veiler', droll: 'Droll & Lock Bird',
    nibiru: 'Nibiru', belle: 'Ghost Belle', negMon: 'negates a monster effect', negST: 'negates a Spell/Trap',
    negAny: 'negates a card or effect', negSummon: 'negates a summon', pop: 'removes a monster', force: 'Negate',
    fuwalos: 'Mulcharmy Fuwalos', purulia: 'Mulcharmy Purulia', maxxc: 'Maxx "C"',
  };
  // A card can do more than one thing (Solemn Judgment: 'negSummon+negST'); 'force' is a manual "negated here".
  const KIND_CACHE = {};
  const kindsOf = (kind) => KIND_CACHE[kind] || (KIND_CACHE[kind] = String(kind).split('+'));
  function kindEligible(kind, st, t) {
    switch (kind) {
      case 'ash': return !!t.ash && st.canNeg;
      case 'imperm': case 'veiler': return !!t.field && st.canNeg;
      case 'belle': return !!t.gy && st.canNeg;
      case 'droll': return !!t.droll;
      case 'nibiru': return st.summonsAfter >= 5;
      case 'negMon': return !!(t.field || t.handEff) && st.canNeg;
      case 'negST': return !!(t.spell || t.trap) && !t.noResp && st.canNeg;
      case 'negAny': return !!(t.field || t.handEff || t.spell || t.trap) && !t.noResp && st.canNeg;
      case 'negSummon': return !!t.inherent;
      case 'pop': return !!st.summoned;
      case 'force': return !!st.canNeg;
      case 'fuwalos': case 'purulia': return !st.oppCount;        // "If you control no cards"
      case 'maxxc': return true;
      default: return false;
    }
  }
  function eligible(st, it) {
    if (st.interrupted || st.ev) return false;
    if (it.src === 'board' && !(st.oppPresent || []).includes(it.uid)) return false;
    const t = st.tags || NOTAGS;
    const ks = kindsOf(it.kind);
    for (let i = 0; i < ks.length; i++) if (kindEligible(ks[i], st, t)) return true;
    return false;
  }
  // Which of a card's abilities applies to this action.
  function pickKind(it, act) {
    const ks = kindsOf(it.kind);
    if (ks.length === 1) return ks[0];
    const view = { canNeg: act.neg, summonsAfter: 0, summoned: !!(act.tags && act.tags.inherent) };
    for (let i = 0; i < ks.length; i++) if (ks[i] !== 'pop' && kindEligible(ks[i], view, act.tags || NOTAGS)) return ks[i];
    return ks[ks.length - 1];
  }
  // Which of your cards answers their interruption here, if any (cheapest first).
  function protectionFor(pre, it, tags) {
    const isMon = it.src === 'hand' ? !!HT_MONSTER[it.kind] : it.cardKind === 'mon';
    const inResponse = !['droll', 'nibiru', 'pop', 'negSummon', 'force'].includes(it.kind);
    if (isMon && inResponse && tags.dm && pre.st.some((x) => x.id === 'TALI' && !x.up) && keys(pre.hand).some((id) => SPELLCASTER_IN_HAND.includes(id))) return 'TALI';
    if (pre.mons.some((m) => m.id === 'BAR') && !GO(pre, 'barNeg')) return 'BAR';
    if (pre.mons.some((m) => m.id === 'DRAG') && !GO(pre, 'dragNeg') && keys(pre.hand).length) return 'DRAG';
    if (pre.mons.some((m) => m.id === 'ILIA') && !GO(pre, 'iliaNeg')) return 'ILIA';
    return null;
  }
  const PROT_LABEL = { TALI: 'Talisman', BAR: 'Baronne', DRAG: 'Dragoon (discard 1)', ILIA: 'Ilia Silvia (Tribute)' };
  function consumeProtection(pre, p, it) {
    const n = clone(pre);
    if (p === 'TALI') { const i = n.st.findIndex((x) => x.id === 'TALI' && !x.up); n.st.splice(i, 1); inc(W(n, 'gy'), 'TALI'); }
    if (p === 'BAR') SO(n, 'barNeg');
    if (p === 'DRAG') {
      SO(n, 'dragNeg');
      const d = pickFodder(n, keys(n.hand), 1)[0]; dec(W(n, 'hand'), d); inc(W(n, 'gy'), d);
      if (it.src === 'board' && n.opp && (n.opp.mons.some((m) => m.uid === it.uid) || n.opp.st.some((x) => x.uid === it.uid))) oppRemove(n, it.uid, 'destroy');
    }
    if (p === 'ILIA') { const i = n.mons.findIndex((m) => m.id === 'ILIA'); n.mons.splice(i, 1); inc(W(n, 'gy'), 'ILIA'); SO(n, 'iliaNeg'); }
    return n;
  }
  function interrupt(pre, act, it0) {
    const kind = pickKind(it0, act);
    const it = kind === it0.kind ? it0 : { ...it0, kind };
    const label = it.label || INTR_LABEL[it.kind];
    let n, note;
    let a = act;
    if (MUL[kind]) {
      // Chained to an activation: live before it resolves, and you are committed to that step.
      // In response to a summon that starts no chain: live from the next summon on.
      const bit = MUL[kind];
      if (act.tags && act.tags.inherent) {
        n = exec(pre, act, false);
        const pr = it.force ? null : protectionFor(n, it, NOTAGS);
        if (pr) { n = consumeProtection(n, pr, it); note = `${label} in response to this summon; ${PROT_LABEL[pr]} negates it`; }
        else { n.mul |= bit; note = `${label} in response to this summon: ${MUL_TEXT[kind]} from here on`; }
      } else {
        const pr = it.force ? null : protectionFor(pre, it, act.tags || NOTAGS);
        const c = pr ? consumeProtection(pre, pr, it) : clone(pre);
        if (!pr) c.mul |= bit;
        a = gen(c).find((x) => x.k === act.k) || act;
        n = exec(c, a, false);
        note = pr ? `${label} chained to this; ${PROT_LABEL[pr]} negates it` : `${label} chained to this: ${MUL_TEXT[kind]}, this step included`;
      }
    }
    const p = n || kind === 'force' || it.force ? null : protectionFor(pre, it, act.tags || NOTAGS);
    if (p) {
      const c = consumeProtection(pre, p, it);
      a = gen(c).find((x) => x.k === act.k);
      if (a) { n = exec(c, a, false); note = `${label} here; ${PROT_LABEL[p]} negates it`; }
    }
    if (!n) {
      a = act;
      if (kind === 'force') {
        n = exec(pre, act, true); note = it.label && it.label !== 'Negate' ? `Stopped by ${it.label}` : 'Negated here';
      } else if (['ash', 'imperm', 'veiler', 'belle', 'negMon', 'negST', 'negAny'].includes(it.kind)) {
        n = exec(pre, act, true); note = `${label} negates this`;
      } else {
        n = exec(pre, act, false);
        const before = new Set(pre.mons.map((m) => m.uid));
        const fresh = n.mons.filter((m) => !before.has(m.uid));
        if (it.kind === 'negSummon') {
          for (const m of fresh) { n.mons.splice(n.mons.indexOf(m), 1); inc(W(n, 'gy'), m.id); }
          n.pend = n.pend.filter((x) => pre.pend.includes(x));
          note = `${label}: the summon is negated and the monster destroyed`;
        } else if (it.kind === 'droll') {
          n.droll = true; note = 'Droll resolves after this: no more adds from the Deck';
        } else if (it.kind === 'nibiru') {
          const ids = n.mons.map((m) => m.id);
          for (let i = n.mons.length - 1; i >= 0; i--) { const m = n.mons.splice(i, 1)[0]; inc(W(n, 'gy'), m.id); }
          n.pend = [];
          note = `Nibiru after this: ${ids.map(S).join(', ')} tributed`;
        } else if (it.kind === 'pop') {
          const tg = fresh.filter((m) => m.id !== 'DRAG').sort((x, y) => (P[y.id].atk || 0) - (P[x.id].atk || 0))[0];
          if (tg) { n.mons.splice(n.mons.indexOf(tg), 1); inc(W(n, 'gy'), tg.id); note = `${label}: ${S(tg.id)} is removed`; } else note = `${label}: nothing it can hit`;
        }
      }
    }
    const last = n.log[n.log.length - 1];
    if (last && last !== pre.log[pre.log.length - 1]) {
      n.log = n.log.slice(0, -1).concat([{ ...last, interrupted: note, pre, act: a }]);
    }
    n.path = pre.path.concat(['!' + JSON.stringify({ k: act.k, it: it0 })]);
    return n;
  }

  // Something that really happened, recorded by the player: a card lost, a card drawn or added, a monster they summoned.
  function applyEvent(s0, ev) {
    const n = clone(s0);
    let text;
    if (ev.t === 'lose') {
      let i = n.mons.findIndex((m) => m.id === ev.id);
      if (i >= 0) n.mons.splice(i, 1);
      else { i = n.st.findIndex((x) => x.id === ev.id); if (i < 0) throw new Error(S(ev.id) + ' is not on your field at that point'); n.st.splice(i, 1); }
      if (ev.to === 'hand') inc(W(n, P[ev.id].ext ? 'extra' : 'hand'), ev.id); else inc(W(n, ev.to === 'ban' ? 'ban' : 'gy'), ev.id);
      text = `Recorded: ${S(ev.id)} ${ev.to === 'hand' ? 'went back to your hand' : ev.to === 'ban' ? 'was banished' : 'was sent to the GY'}${ev.by ? ' by ' + ev.by : ''}.`;
    } else if (ev.t === 'gain') {
      if (!has(n.deck, ev.id)) throw new Error('No ' + S(ev.id) + ' left in the Deck at that point');
      dec(W(n, 'deck'), ev.id);
      const rep = ev.replace && has(n.hand, 'UNK');
      if (rep) dec(W(n, 'hand'), 'UNK');
      inc(W(n, 'hand'), ev.id);
      text = `Recorded: ${S(ev.id)} is in your hand${rep ? ' (it was the unknown card)' : ''}.`;
    } else if (ev.t === 'oppAdd') {
      if (!n.opp) { n.opp = { mons: [], st: [], lp: 8000, lp0: 8000, k: null, k2: 0 }; n.oppOwn = true; }
      const o = OW(n);
      o.mons.push(Object.assign({ kind: 'mon', pos: 'atk', attr: '?', race: '?', atk: 0, def: 0, intr: null }, ev.mon, { ui: 40 + o.mons.length + o.st.length }));
      text = `Recorded: they summoned ${ev.mon.name || 'a monster'}.`;
    } else throw new Error('unknown event');
    step(n, text);
    n.cur.ev = true;
    done(n);
    n.log[n.log.length - 1].pre = s0;
    n.path = s0.path.concat(['@' + JSON.stringify(ev)]);
    return n;
  }

  // Rebuild a line from its recorded actions (lets several Workers share the work).
  function replay(cfg, path) {
    let s = newState(cfg);
    for (const k of path) {
      let n;
      if (k[0] === '@') {
        n = applyEvent(s, JSON.parse(k.slice(1)));
      } else if (k[0] === '^') {
        n = startMul(s, JSON.parse(k.slice(1)));
      } else if (k[0] === '!') {
        const o = JSON.parse(k.slice(1));
        const a = gen(s).find((x) => x.k === o.k);
        if (!a) throw new Error('replay: ' + o.k);
        n = interrupt(s, a, o.it);
      } else {
        const neg = k[0] === '~';
        const key = neg ? k.slice(1) : k;
        const a = gen(s).find((x) => x.k === key);
        if (!a) throw new Error('replay: ' + key);
        n = exec(s, a, neg);
        const last = n.log[n.log.length - 1];
        if (last && last !== s.log[s.log.length - 1]) { last.pre = s; last.act = a; }
      }
      s = n;
    }
    return s;
  }
  // The same actions with no interruptions: what you would actually try to do. Tolerant:
  // triggers that only exist without the interruption are resolved with their first option,
  // and actions that stop being legal are skipped.
  function planOf(cfg, path) {
    const bl = (cfg.base || []).length;
    const want = path.slice(bl).filter((k) => k[0] !== '^' && k[0] !== '@').map((k) => (k[0] === '!' ? JSON.parse(k.slice(1)).k : k[0] === '~' ? k.slice(1) : k));
    let s = bl ? replay(cfg, path.slice(0, bl)) : newState(cfg);
    const apply = (a) => {
      const n = exec(s, a, false);
      const last = n.log[n.log.length - 1];
      if (last && last !== s.log[s.log.length - 1]) { last.pre = s; last.act = a; }
      s = n;
    };
    const base = (k) => k.replace(/#\d+$/, '');
    for (const k of want) {
      for (let guard = 0; guard < 6; guard++) {
        const acts = gen(s);
        const a = acts.find((x) => x.k === k) || acts.find((x) => base(x.k) === base(k));
        if (a) { apply(a); break; }
        if (!s.pend.length) break;
        apply(acts.find((x) => !x.k.startsWith('dec:')) || acts[0]);
      }
    }
    for (let guard = 0; guard < 6 && s.pend.length; guard++) { const acts = gen(s); apply(acts.find((x) => !x.k.startsWith('dec:')) || acts[0]); }
    // Finish the plan: the bait line stops where the interrupted version diverged.
    const more = solveBeam(s, { timeMs: 300, width: 48, growth: 4, maxWidth: 768, converge: true });
    const fin = more.lines[0];
    return fin && fin.score > evaluate(s, false).score ? fin : asLine(s);
  }
  function asLine(s) { const e = evaluate(s, true); e.state = s; return e; }

  // One branch: replay to a step, let them interrupt it, find your best continuation.
  function branchTask(t) {
    const cfg = t.dpen != null ? Object.assign({}, t.cfg, { dpen: t.dpen }) : t.cfg;
    let n;
    if (t.start) n = startMul(replay(cfg, t.prefix || []), t.it);
    else {
      const s = replay(cfg, t.prefix);
      const a = gen(s).find((x) => x.k === t.key);
      if (!a) return null;
      n = interrupt(s, a, t.it);
    }
    const w = t.width || 48;
    if (t.quick) {
      const q = solveBeam(n, { timeMs: 200, width: w, rounds: 1, top: 1 });
      return { score: q.lines[0] ? q.lines[0].score : evaluate(n, false).score };
    }
    const r = solveBeam(n, { timeMs: t.timeMs || 250, width: w, growth: 4, maxWidth: t.maxWidth || 768, converge: true });
    const best = r.lines[0] || asLine(n);
    if (t.frontier) return { best: serializeLine(best, t.hand || [], 'branch'), frontier: (r.frontier || []).map((l) => serializeLine(l, t.hand || [], 'branch')) };
    return serializeLine(best, t.hand || [], 'branch');
  }

  // ── Worst case ──
  // For one interruption: the step where it hurts most. Every eligible step gets a quick search;
  // full searches then run from the most damaging up, until no remaining step can be worse.
  async function worstUse(cfg, cur, it, fromIdx, run, opts) {
    const steps = [];
    cur.steps.forEach((st, i) => { if (i >= fromIdx && eligible(st, it)) steps.push(i); });
    const oppEmpty = !(cfg.opp && (cfg.opp.mons.length + cfg.opp.st.length));
    if (MUL[it.kind] && fromIdx === 0 && !(cfg.base && cfg.base.length) && !(cfg.mul & MUL[it.kind]) && (it.kind === 'maxxc' || oppEmpty) && !cur.path.some((k) => k[0] === '!' || k[0] === '^')) steps.unshift(-1);
    if (!steps.length) return null;
    const task = (i, quick) => (i < 0 ? { type: 'branch', cfg, prefix: [], key: null, it, start: true, quick, timeMs: opts.branchMs || 250, hand: opts.hand || [] }
      : { type: 'branch', cfg, prefix: cur.path.slice(0, cur.steps[i].pathIdx), key: cur.steps[i].key, it, quick, timeMs: opts.branchMs || 250, hand: opts.hand || [] });
    const q = await Promise.all(steps.map((i) => run(task(i, true)).catch(() => null)));
    const order = steps.map((i, n) => ({ i, q: q[n] })).filter((x) => x.q).sort((a, b) => a.q.score - b.q.score);
    let best = null;
    const tried = [];
    for (let n = 0; n < order.length; n += 2) {
      if (best && order[n].q.score >= best.r.score - 1e-9) break;
      const batch = order.slice(n, n + 2).filter((x) => !best || x.q.score < best.r.score);
      const full = await Promise.all(batch.map((x) => run(task(x.i, false)).catch(() => null)));
      full.forEach((r, k) => { if (!r) return; tried.push({ r, i: batch[k].i }); if (!best || r.score < best.r.score) best = { r, i: batch[k].i }; });
      if (opts.expired && opts.expired()) break;
    }
    if (best) best.tried = tried;
    return best;
  }
  const sameIntr = (a, b) => a.kind === b.kind && a.src === b.src && a.uid === b.uid;
  // One round: the worst use of each interruption they still hold (identical copies tested once).
  async function worstRound(cfg, cur, intrs, used, fromIdx, run, opts) {
    const uniq = [];
    intrs.forEach((it, j) => { if (!used.has(j) && !(opts.noHand && it.src === 'hand') && !uniq.some((u) => sameIntr(intrs[u], it))) uniq.push(j); });
    const res = await Promise.all(uniq.map((j) => worstUse(cfg, cur, intrs[j], fromIdx, run, opts)));
    return uniq.map((j, n) => ({ j, w: res[n] })).filter((x) => x.w).sort((a, b) => a.w.r.score - b.w.r.score);
  }
  // They use every interruption they hold, one after another, each where it leaves you worst off.
  // An interruption that changes nothing by itself is still spent, because two of them together can.
  // The first one is tried several ways (opts.firstMoves): the most damaging opener is not always their best plan.
  async function robust(cfg, line, intrs, run, opts = {}) {
    const handMax = opts.handMax == null ? Infinity : opts.handMax;
    const below = (sc) => !!opts.stopBelow && sc < opts.stopBelow();
    const expired = () => !!opts.expired && opts.expired();
    const unused = (used) => { const rest = []; intrs.forEach((it, j) => { if (!used.has(j) && !rest.some((r) => sameIntr(r.it, it))) rest.push({ it, step: null }); }); return rest; };
    async function chain(cur, applied, used, fromIdx) {
      while (used.size < intrs.length) {
        if (below(cur.score)) return { line: cur, applied, score: cur.score, pruned: true };
        if (expired()) return { line: cur, applied, score: cur.score, partial: true };
        const spent = applied.filter((a) => a.step != null && a.it.src === 'hand').length;
        const round = await worstRound(cfg, cur, intrs, used, fromIdx, run, spent >= handMax ? Object.assign({}, opts, { noHand: true }) : opts);
        if (!round.length) break;
        const x = round[0];
        used.add(x.j);
        applied = applied.concat([{ it: intrs[x.j], step: x.w.i }]);
        cur = x.w.r; fromIdx = x.w.i + 1;
      }
      return { line: cur, applied: applied.concat(unused(used)), score: cur.score };
    }
    const first = await worstRound(cfg, line, intrs, new Set(), opts.from || 0, run, handMax <= 0 ? Object.assign({}, opts, { noHand: true }) : opts);
    const openers = [];
    for (const x of first) for (const t of x.w.tried || [x.w]) openers.push({ j: x.j, w: t });
    openers.sort((a, b) => (a.w.r.score - b.w.r.score) || (a.w.i - b.w.i));
    openers.length = Math.min(openers.length, intrs.length > 1 ? (opts.firstMoves || 3) : 1);
    if (!openers.length) return { line, applied: unused(new Set()), score: line.score };
    if (below(openers[0].w.r.score)) return { line: openers[0].w.r, applied: [{ it: intrs[openers[0].j], step: openers[0].w.i }], score: openers[0].w.r.score, pruned: true };
    const outs = await Promise.all(openers.map((x) => chain(x.w.r, [{ it: intrs[x.j], step: x.w.i }], new Set([x.j]), x.w.i + 1)));
    let best = outs[0];
    for (const o of outs) if (o.score < best.score) best = o;
    return best;
  }

  // Plain data for the page (results cross a Worker boundary).
  const SPELLCASTERS = new Set(SPELLCASTER_IN_HAND);
  function serializeLine(l, hand, tag) {
    const log = l.state.log;
    let nibIdx = -1;
    log.forEach((st, i) => { const prev = i ? log[i - 1].summonsAfter : 0; if (nibIdx < 0 && st.summonsAfter >= 5 && prev < 5) nibIdx = i; });
    const firstDroll = log.findIndex((st) => st.tags.droll);
    const after = (i) => (log[i + 1] && log[i + 1].pre ? log[i + 1].pre : l.state);
    const steps = log.map((st, i) => {
      const pre = st.pre;
      const notes = [];
      if (pre) {
        const tali = pre.st.some((x) => x.id === 'TALI' && !x.up) && keys(pre.hand).some((id) => SPELLCASTERS.has(id));
        if (tali && st.tags.dm) notes.push('talisman');
        if (pre.mons.some((m) => m.id === 'ILIA')) notes.push('ilia');
        if (pre.mons.some((m) => m.id === 'DRAG') && keys(pre.hand).length) notes.push('dragoon');
      }
      const rawKey = pre ? l.state.path[pre.path.length] : null;
      return {
        pathIdx: pre ? pre.path.length : -1,
        key: rawKey ? (rawKey[0] === '~' ? rawKey.slice(1) : rawKey[0] === '!' ? JSON.parse(rawKey.slice(1)).k : rawKey[0] === '@' || rawKey[0] === '^' ? null : rawKey) : null,
        ev: !!st.ev, mons: after(i).mons.map((m) => m.id), sts: after(i).st.map((x) => x.id),
        oppPresent: pre && pre.opp ? pre.opp.mons.filter((m) => !m.faceDown).map((m) => m.uid).concat(pre.opp.st.map((x) => x.uid)) : [],
        summoned: st.ns > 0, extraSummon: st.xs > 0, draws: st.draws || 0,
        oppCount: pre && pre.opp ? pre.opp.mons.length + pre.opp.st.length : 0,
        text: st.text, tags: st.tags, interrupted: st.interrupted || null, summonsAfter: st.summonsAfter,
        canNeg: !!(st.act && st.act.neg), nibiru: i === nibIdx, firstDroll: i === firstDroll, notes,
        curtain: /Curtain: Special Summon/.test(st.text), gaze: /Gaze of Timaeus on/.test(st.text),
      };
    });
    const n = l.final;
    return {
      tag, score: l.score, summary: l.summary, items: l.items, sets: l.sets, chokes: l.chokes, safest: !!l.safest, path: l.state.path,
      steps, summons: l.state.summons, opening: l.state.opening || [], mul: l.state.mul,
      board: { mons: n.mons.map((m) => ({ id: m.id, uses: m.uses, gaze: m.gaze })), st: n.st.map((x) => ({ id: x.id, up: !!x.up, endSet: !!x.endSet })), hand: toObj(n.hand), lp: n.lp,
        opp: n.opp ? n.opp.mons.map((m) => m.name || 'monster').concat(n.opp.st.map((x) => x.name || 'Spell/Trap')) : [] },
      generated: toGenerated(l, tag, hand),
    };
  }
  function serialize(r, hand, k) {
    const lines = r.lines.slice(0, k || r.lines.length).map((l, i) => serializeLine(l, hand, 'Line ' + (i + 1)));
    let safest = null;
    if (r.safest && !r.lines.includes(r.safest)) safest = serializeLine(r.safest, hand, 'Safest lethal');
    const frontier = r.frontier ? r.frontier.map((l) => serializeLine(l, hand, 'Trade')) : null;
    return { lines, safest, frontier, nodes: r.nodes, ms: r.ms, width: r.width };
  }
  function lineRef(r, which) { return which === 'safest' ? r.safest : r.lines[which]; }

  const api = { MUL, MUL_TEXT, asLine, planOf, eligible, interrupt, replay, branchTask, robust, INTR_LABEL, serialize, serializeLine, lineRef, solveBeam, potential, init, NAMES, SHORT, BY_NAME, P, newState, gen, evaluate, toGenerated, stateKey, S, N, battle, HANDTRAPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
