/*
 * Simulation : l'appli (« moi ») joue des milliers de mains à 6 contre des robots aux styles différents.
 * Mesure : mon gain en grosses blindes pour 100 mains (bb/100). Tapis remis à 100 grosses blindes à chaque main.
 * Compare la version actuelle (conseil avant et après le flop, profils appris en cours de route)
 * à l'ancienne (tableau avant le flop, puis seulement « suivre si c'est rentable », jamais de mise).
 *
 * Usage : node tests/sim.js [mains] [table]   (table : amis, payeurs, serres, maniaques, melange, reguliers)
 */
const E = require('../engine.js');
const O = require('../odds.js');
const P = require('../profiles.js');
const A = require('../advisor.js');

const RANKS = 'AKQJT98765432'.split('');
const DECK = [];
RANKS.forEach((r) => 'pckt'.split('').forEach((s) => DECK.push(r + s)));
// Paquet mélangé avec une graine : les deux versions reçoivent exactement les mêmes cartes (la chance s'annule)
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const BB = 20, STACK = 2000;
let BR = Math.random; // hasard des robots (rejouable en mode « seeded »)
const BASE = JSON.parse(JSON.stringify(O.TUNE)); // réglages de départ : ceux des copies de l'appli

/* ---------------------------------------------------------------- robots */

// force avant le flop (0 = AA … 1 = 32o) et ce que les cartes font avec le tableau
const pct = (c) => O.rankPct(O.handClass(c[0], c[1]));
function conn(c, board) {
  const b = board.map(O.toInt);
  return O.connect(O.toInt(c[0]), O.toInt(c[1]), b, O.score7(b) >> 20);
}

// Chaque style : seuils simples. ctx = { cards, h, id, o (options du moteur), pot, raisedBefore }
const STYLES = {
  // Paie presque tout, relance rarement, ne bluffe jamais
  payeur: {
    pre(x) { const q = pct(x.cards); if (q <= 0.05) return raise(x, 3); if (x.o.toCall === 0) return { type: 'x' }; return q <= (x.raisedBefore ? 0.55 : 0.65) ? { type: 's' } : { type: 'f' }; },
    post(x) { const c = conn(x.cards, x.h.board); if (x.o.toCall === 0) return c.level >= 3 ? bet(x, 0.5) : { type: 'x' }; if (c.level >= 4) return raise(x, 2.5); return c.level >= 1 || c.draw || c.over || BR() < 0.35 ? { type: 's' } : { type: 'f' }; },
  },
  // Joue très peu, mise ses bonnes mains, lâche tout le reste
  serre: {
    pre(x) { const q = pct(x.cards); if (q <= 0.04) return raise(x, 3); if (q <= 0.08 && !x.raisedBefore) return raise(x, 3); if (x.o.toCall === 0) return { type: 'x' }; return { type: 'f' }; },
    post(x) { const c = conn(x.cards, x.h.board); if (x.o.toCall === 0) return c.level >= 2 ? bet(x, 0.66) : { type: 'x' }; if (c.level >= 4) return raise(x, 2.5); return c.level >= 2 ? { type: 's' } : { type: 'f' }; },
  },
  // Relance et mise tout le temps
  maniaque: {
    pre(x) { const q = pct(x.cards); if (q <= 0.15 || (q <= 0.5 && !x.raisedBefore)) return BR() < 0.12 ? { type: 'AI' } : raise(x, 3); if (x.o.toCall === 0) return { type: 'x' }; return q <= 0.6 ? { type: 's' } : { type: 'f' }; },
    post(x) { const c = conn(x.cards, x.h.board); if (x.o.toCall === 0) return BR() < 0.7 || c.level >= 1 ? bet(x, 0.75) : { type: 'x' }; if (c.level >= 3 || BR() < 0.12) return raise(x, 2.5); return c.level >= 1 || c.draw || BR() < 0.3 ? { type: 's' } : { type: 'f' }; },
  },
  // L'ami typique : joue beaucoup, suit beaucoup, relance peu, bluffe un peu
  ami: {
    pre(x) { const q = pct(x.cards); if (q <= 0.08) return x.h.cb === BB && BR() < 0.5 ? openTo(x, 6) : raise(x, 3); if (x.o.toCall === 0) return { type: 'x' }; if (!x.raisedBefore) return q <= 0.45 ? { type: 's' } : { type: 'f' }; return q <= 0.3 ? { type: 's' } : { type: 'f' }; },
    post(x) { const c = conn(x.cards, x.h.board); if (x.o.toCall === 0) return c.level >= 2 || BR() < 0.1 ? bet(x, 0.5) : { type: 'x' }; if (c.level >= 4) return raise(x, 2.5); return c.level >= 1 || c.draw || BR() < 0.15 ? { type: 's' } : { type: 'f' }; },
  },
  // Le régulier : joue selon sa place (tableaux classiques), mise après avoir relancé, lâche sans rien
  regulier: {
    pre(x) {
      const hc = O.handClass(x.cards[0], x.cards[1]), pos = x.h.pos[x.id], R = O.RANGES;
      if (!x.raisedBefore) {
        const key = O.openRangeKey(pos, x.h.order.length);
        if (key && R.open[key].has(hc)) return raise(x, 2.5);
        return x.o.toCall === 0 ? { type: 'x' } : { type: 'f' };
      }
      if (R.threeBet.has(hc)) return raise(x, 3);
      if (x.o.toCall === 0) return { type: 'x' };
      return (pos === 'BB' ? R.callBB : R.call).has(hc) && x.o.toCall <= BB * 4 ? { type: 's' } : { type: 'f' };
    },
    post(x) { const c = conn(x.cards, x.h.board); if (x.o.toCall === 0) return c.level >= 2 || c.draw || BR() < 0.35 ? bet(x, 0.6) : { type: 'x' }; if (c.level >= 3) return raise(x, 2.5); return c.level >= 2 || (c.draw && BR() < 0.6) ? { type: 's' } : { type: 'f' }; },
  },
  // Serré-agressif : peu de mains, mais relance et mise souvent, bluffe parfois ; selon sa place
  tag: {
    pre(x) {
      const hc = O.handClass(x.cards[0], x.cards[1]), pos = x.h.pos[x.id], R = O.RANGES;
      if (!x.raisedBefore) {
        const key = O.openRangeKey(pos, x.h.order.length);
        if (key && R.open[key].has(hc)) return raise(x, 2.5);
        return x.o.toCall === 0 ? { type: 'x' } : { type: 'f' };
      }
      if (R.threeBet.has(hc) || (O.parseRange('A5s, A4s, KQs, AJs').has(hc) && BR() < 0.4)) return raise(x, 3);
      if (x.o.toCall === 0) return { type: 'x' };
      return R.call.has(hc) && x.o.toCall <= BB * 5 ? { type: 's' } : { type: 'f' };
    },
    post(x) {
      const c = conn(x.cards, x.h.board);
      if (x.o.toCall === 0) return c.level >= 2 || c.draw || BR() < 0.45 ? bet(x, c.level >= 3 ? 0.75 : 0.5) : { type: 'x' };
      if (c.level >= 3 || (c.draw && BR() < 0.25)) return raise(x, 2.5);
      return c.level >= 2 || c.draw ? { type: 's' } : { type: 'f' };
    },
  },
  // Copie de l'appli, avec les réglages de départ (pour vérifier que la nouvelle version bat l'ancienne)
  copie: {
    pre(x) { return copyAct(x); },
    post(x) { return copyAct(x); },
  },
};
function copyAct(x) {
  const h2 = Object.assign({}, x.h, { meId: x.id, cards: x.cards, meIn: true });
  return A.toAction(A.advise(h2, x.lookup, { iters: 250, tune: BASE }));
}
function openTo(x, nbb) {
  const to = Math.max(x.o.minTo, BB * nbb);
  return to >= x.o.maxTo ? { type: 'AI' } : { type: 'r', to };
}
function raise(x, mult) {
  const to = Math.max(x.o.minTo, Math.round((x.h.cb === 0 ? x.pot * 0.75 : x.h.cb * mult) / 10) * 10, BB * 2.5);
  return to >= x.o.maxTo ? { type: 'AI' } : { type: 'r', to };
}
function bet(x, f) {
  const to = Math.max(x.o.minTo, Math.round((x.pot * f) / 10) * 10);
  return to >= x.o.maxTo ? { type: 'AI' } : { type: 'r', to };
}

/* ---------------------------------------------------------------- moi */

// Ancienne version : tableau avant le flop ; après, check si gratuit, sinon suivre seulement si c'est rentable
function heroOld(s, lookup) {
  const h = s.hand;
  if (h.street === 0) return A.toAction(O.preflopAdvice(A.preflopCtx(h, lookup)));
  const o = E.options(h, h.meId);
  if (o.toCall === 0) return { type: 'x' };
  const eq = O.equityVs(h.cards, h.board, A.oppModels(h, lookup), 700).equity;
  return eq >= O.potOdds(o.toCall, E.potOf(h)) ? { type: 's' } : { type: 'f' };
}
function heroNew(s, lookup) { return A.toAction(A.advise(s.hand, lookup, { iters: 700 })); }
const heroWith = (tune) => (s, lookup) => A.toAction(A.advise(s.hand, lookup, { iters: 700, tune }));

/* ---------------------------------------------------------------- partie */

function play(nHands, styles, hero, seed0, opts) {
  seed0 = seed0 || 1;
  const seeded = !!(opts && opts.seeded);
  const mr = Math.random;
  const results = [];
  const names = ['Moi'].concat(styles.map((st, i) => st + (i + 1)));
  const ST = (opts && opts.stack) || STACK; // tapis de départ de chaque main (petits tapis : opts.stack)
  const s = E.newGame({ names, meIndex: 0, btnIndex: 0, sb: 10, bb: BB, stack: ST });
  let db = { v: 1, p: {}, recent: [] };
  const lookup = (name) => db.p[P.keyFor(name, s.gid)];
  const styleOf = {};
  s.players.forEach((p, i) => { styleOf[p.id] = i === 0 ? null : styles[i - 1]; });
  let won = 0, played = 0, errors = 0;
  for (let n = 0; n < nHands; n++) {
    s.players.forEach((p) => { p.stack = ST; });
    if (!E.startHand(s).ok) break;
    const h = s.hand;
    const deck = shuffle(DECK.slice(), rng(seed0 * 100003 + n));
    if (seeded) { Math.random = rng(seed0 * 1000003 + n * 7 + 1); BR = rng(seed0 * 999331 + n * 13 + 5); } // mêmes tirages pour les deux versions
    const cards = {};
    h.order.forEach((id) => { cards[id] = [deck.pop(), deck.pop()]; });
    const board = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    E.chooseCards(s, cards[h.meId]);
    let guard = 0;
    while (h.phase !== 'done' && guard++ < 200) {
      if (h.phase === 'board') { E.addStreet(s, h.street === 0 ? board.slice(0, 3) : [board[h.street + 2]]); continue; }
      if (h.phase === 'showdown') {
        if (h.board.length < 5) h.board = board.slice(); // tapis avant la river : on retourne les cartes restantes
        E.showdownCandidates(h).filter((id) => id !== h.meId).forEach((id) => E.showCards(s, id, cards[id]));
        if (h.phase === 'showdown') { errors++; break; }
        continue;
      }
      const id = h.toAct;
      const o = E.options(h, id);
      let a;
      if (id === h.meId) a = hero(s, lookup);
      else {
        const raisedBefore = h.street === 0 && h.cb > BB;
        a = STYLES[styleOf[id]][h.street === 0 ? 'pre' : 'post']({ cards: cards[id], h, id, o, pot: E.potOf(h), raisedBefore, lookup });
      }
      let r = E.applyAction(s, a || { type: 'f' }, true);
      if (!r.ok) r = E.applyAction(s, { type: o.toCall ? 'f' : 'x' }, true);
      if (!r.ok) { errors++; break; }
    }
    if (h.phase !== 'done') { E.abortHand(s); continue; }
    db = P.record(db, s.gid + ':' + h.no, h, s.gid);
    const net = h.stack[h.meId] + h.win[h.meId] - h.stacks0[h.meId];
    won += net;
    results.push(net / BB);
    played++;
    E.endHand(s);
  }
  Math.random = mr; BR = mr;
  const mean = results.reduce((a, x) => a + x, 0) / played;
  const sd = Math.sqrt(results.reduce((a, x) => a + (x - mean) * (x - mean), 0) / played);
  return { bb100: (won / BB / played) * 100, se100: (sd / Math.sqrt(played)) * 100, played, errors, results };
}

const TABLES = {
  amis: ['ami', 'ami', 'ami', 'ami', 'ami'],
  payeurs: ['payeur', 'payeur', 'payeur', 'ami', 'ami'],
  serres: ['serre', 'serre', 'serre', 'ami', 'ami'],
  maniaques: ['maniaque', 'maniaque', 'ami', 'ami', 'serre'],
  melange: ['payeur', 'serre', 'maniaque', 'ami', 'ami'],
  reguliers: ['regulier', 'regulier', 'regulier', 'ami', 'ami'],
};
// Tables jamais utilisées pendant le réglage : pour vérifier que le gain tient face à d'autres adversaires
const VALIDATION = {
  tags: ['tag', 'tag', 'tag', 'ami', 'payeur'],
  copies: ['copie', 'copie', 'regulier', 'ami', 'payeur'],
  potes: ['ami', 'ami', 'payeur', 'maniaque', 'tag'],
  durs: ['tag', 'regulier', 'copie', 'serre', 'ami'],
};

if (require.main === module) {
  const nHands = Number(process.argv[2]) || 1500;
  const which = process.argv[3] ? [process.argv[3]] : Object.keys(TABLES);
  console.log(`Simulation : ${nHands} mains par table, gain en grosses blindes pour 100 mains (bb/100)\n`);
  console.log('Table'.padEnd(12), 'Ancienne'.padStart(14), 'Nouvelle'.padStart(14), 'Écart (mêmes cartes)'.padStart(24));
  const f = (x, e) => (x.toFixed(0) + ' ± ' + (2 * e).toFixed(0)).padStart(14);
  which.forEach((t) => {
    const t0 = Date.now();
    const old = play(nHands, TABLES[t], heroOld);
    const neu = play(nHands, TABLES[t], heroNew);
    // écart main par main (mêmes cartes) : beaucoup moins de hasard que la différence des deux moyennes
    const d = neu.results.map((x, i) => x - (old.results[i] || 0));
    const dm = d.reduce((a, x) => a + x, 0) / d.length;
    const dsd = Math.sqrt(d.reduce((a, x) => a + (x - dm) * (x - dm), 0) / d.length);
    console.log(t.padEnd(12), f(old.bb100, old.se100), f(neu.bb100, neu.se100), f(dm * 100, (dsd / Math.sqrt(d.length)) * 100).padStart(24), `  (${((Date.now() - t0) / 1000).toFixed(0)} s${old.errors + neu.errors ? ', erreurs ' + (old.errors + neu.errors) : ''})`);
  });
  console.log('\n± = marge d\'erreur (95 %). Écart > marge : la différence n\'est pas due au hasard.');
}

module.exports = { play, TABLES, VALIDATION, heroOld, heroNew, heroWith, BASE };
