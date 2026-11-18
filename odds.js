/*
 * Poker → Claude : calculs instantanés, sans IA.
 * - score7(cartes) : force d'une main de 5 à 7 cartes, sous forme d'un nombre (plus grand = meilleur).
 * - equity(mesCartes, tableau, nbAdversaires) : probabilité de gagner, par simulation de milliers de mains.
 * - Tableaux de mains de départ par position et conseil avant le flop (preflopAdvice).
 * Cartes au format de l'appli : rang (A K Q J T 9…2) + couleur (p c k t). Ex : 'Ac' = As de cœur.
 */
(function (root) {
  'use strict';

  const RANK_CHARS = '23456789TJQKA'; // index 0 = 2 … 12 = As
  const SUIT_CHARS = 'pckt';
  const toInt = (c) => RANK_CHARS.indexOf(c[0]) * 4 + SUIT_CHARS.indexOf(c[1]);

  /* ------------------------------------------------------------ évaluation rapide */

  const rc = new Int8Array(13);
  const sc = new Int8Array(4);
  const sm = new Int32Array(4);

  // Plus haute carte d'une suite dans un masque de valeurs (bit r = valeur r présente), -1 sinon.
  function straightHigh(mask) {
    const m = (mask << 1) | ((mask >> 12) & 1); // l'As compte aussi comme carte basse
    for (let hi = 13; hi >= 4; hi--) if (((m >> (hi - 4)) & 31) === 31) return hi - 1;
    return -1;
  }

  // Les n plus hautes valeurs d'un masque, sauf celles exclues, empaquetées (4 bits chacune).
  function topRanks(mask, n, exclude) {
    let v = 0, k = 0;
    for (let r = 12; r >= 0 && k < n; r--) {
      if ((mask >> r) & 1 && r !== exclude[0] && r !== exclude[1]) { v = (v << 4) | r; k++; }
    }
    for (; k < n; k++) v <<= 4;
    return v;
  }

  // Catégories : 0 carte haute, 1 paire, 2 double paire, 3 brelan, 4 quinte, 5 couleur, 6 full, 7 carré, 8 quinte flush
  function score7(cards) {
    rc.fill(0); sc.fill(0); sm.fill(0);
    let mask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], r = c >> 2, s = c & 3;
      rc[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
    if (fs >= 0) {
      const sf = straightHigh(sm[fs]);
      if (sf >= 0) return (8 << 20) | sf;
    }
    let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
    for (let r = 12; r >= 0; r--) {
      const n = rc[r];
      if (n === 4) quad = r;
      else if (n === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (quad >= 0) return (7 << 20) | (quad << 4) | topRanks(mask, 1, [quad, -1]);
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 4) | Math.max(t2, p1);
    if (fs >= 0) return (5 << 20) | topRanks(sm[fs], 5, [-1, -1]);
    const st = straightHigh(mask);
    if (st >= 0) return (4 << 20) | st;
    if (t1 >= 0) return (3 << 20) | (t1 << 8) | topRanks(mask, 2, [t1, -1]);
    if (p1 >= 0 && p2 >= 0) return (2 << 20) | (p1 << 8) | (p2 << 4) | topRanks(mask, 1, [p1, p2]);
    if (p1 >= 0) return (1 << 20) | (p1 << 12) | topRanks(mask, 3, [p1, -1]);
    return topRanks(mask, 5, [-1, -1]);
  }

  /* ------------------------------------------------------------ probabilité de gagner */

  // Simulation : les adversaires reçoivent des mains au hasard, le tableau est complété au hasard.
  // Renvoie { win, tie, equity } en fractions (0 à 1). « equity » compte les partages au prorata.
  function equity(mine, board, nOpp, iters) {
    nOpp = Math.max(1, Math.min(9, nOpp | 0));
    iters = iters || (nOpp <= 2 ? 4000 : 2500);
    const known = mine.concat(board).map(toInt);
    const deck = [];
    for (let c = 0; c < 52; c++) if (!known.includes(c)) deck.push(c);
    const need = 5 - board.length;
    const draw = need + 2 * nOpp;
    const me = new Array(7);
    const opp = new Array(7);
    const boardInts = board.map(toInt);
    const mineInts = mine.map(toInt);
    let win = 0, tie = 0, eq = 0;
    for (let it = 0; it < iters; it++) {
      // tirage sans remise des cartes nécessaires (début du paquet mélangé)
      for (let i = 0; i < draw; i++) {
        const j = i + Math.floor(Math.random() * (deck.length - i));
        const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
      }
      let k = 0;
      for (; k < 2; k++) me[k] = mineInts[k];
      for (let b = 0; b < boardInts.length; b++) me[k++] = boardInts[b];
      for (let b = 0; b < need; b++) me[k++] = deck[b];
      const myScore = score7(me);
      let best = -1, ties = 0, beaten = false;
      for (let o = 0; o < nOpp; o++) {
        opp[0] = deck[need + 2 * o];
        opp[1] = deck[need + 2 * o + 1];
        for (let b = 2; b < 7; b++) opp[b] = me[b];
        const s = score7(opp);
        if (s > myScore) { beaten = true; break; }
        if (s === myScore) ties++;
        if (s > best) best = s;
      }
      if (beaten) continue;
      if (ties === 0) { win++; eq += 1; } else { tie++; eq += 1 / (ties + 1); }
    }
    return { win: win / iters, tie: tie / iters, equity: eq / iters };
  }

  // Part du pot qu'il faut gagner pour que suivre soit rentable.
  const potOdds = (toCall, pot) => (toCall > 0 ? toCall / (pot + toCall) : 0);

  /* ------------------------------------------------------------ mains de départ */

  const ORDER = 'AKQJT98765432';

  // « AKs », « AKo », « 77 » pour deux cartes
  function handClass(c1, c2) {
    let a = c1[0], b = c2[0];
    if (ORDER.indexOf(a) > ORDER.indexOf(b)) { const t = a; a = b; b = t; }
    if (a === b) return a + b;
    return a + b + (c1[1] === c2[1] ? 's' : 'o');
  }

  // Lit une liste du type « 66+, A9s+, A5s, KTs+, AJo+, KQo, 98s-65s »
  function parseRange(str) {
    const out = new Set();
    str.split(',').map((x) => x.trim()).filter(Boolean).forEach((tok) => {
      const plus = tok.endsWith('+');
      const t = plus ? tok.slice(0, -1) : tok;
      if (t.includes('-')) { // suite de mains assorties : 98s-65s
        const [from, to] = t.split('-');
        const s = from[2] || '';
        let i = ORDER.indexOf(from[0]);
        const end = ORDER.indexOf(to[0]);
        const gap = ORDER.indexOf(from[1]) - ORDER.indexOf(from[0]);
        for (; i <= end; i++) out.add(ORDER[i] + ORDER[i + gap] + s);
        return;
      }
      if (t.length === 2) { // paire
        const r = ORDER.indexOf(t[0]);
        if (plus) for (let i = 0; i <= r; i++) out.add(ORDER[i] + ORDER[i]);
        else out.add(t);
        return;
      }
      const hi = ORDER.indexOf(t[0]), lo = ORDER.indexOf(t[1]), s = t[2];
      if (plus) for (let i = hi + 1; i <= lo; i++) out.add(ORDER[hi] + ORDER[i] + s);
      else out.add(t);
    });
    return out;
  }

  // Tableaux simples et solides pour un débutant (inspirés des tableaux classiques à 6 joueurs).
  const RANGES = {
    open: {
      UTG9: parseRange('77+, ATs+, KJs+, QJs, AQo+'),
      UTG: parseRange('66+, A9s+, A5s, KTs+, QTs+, JTs, AJo+, KQo'),
      MP: parseRange('55+, A7s+, A5s, A4s, K9s+, Q9s+, J9s+, T9s, ATo+, KJo+, QJo'),
      CO: parseRange('33+, A2s+, K7s+, Q8s+, J8s+, T8s+, 98s, 87s, 76s, A8o+, KTo+, QTo+, JTo'),
      BTN: parseRange('22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o'),
      SB: parseRange('22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A5o+, K9o+, Q9o+, J9o+, T9o'),
    },
    threeBet: parseRange('QQ+, AKs, AKo'),
    call: parseRange('22+, ATs+, KJs+, QJs, JTs, T9s, AQo'),
    callBB: parseRange('22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A9o+, KTo+, QTo+, JTo'),
    vsBig: parseRange('77+, AJs+, KQs, AQo+'),
    vs3bet: { raise: parseRange('KK+'), call: parseRange('QQ, AKs, AKo') },
  };

  // Plage d'ouverture selon la position et la taille de table
  function openRangeKey(pos, n) {
    if (pos.startsWith('UTG')) return n >= 8 ? 'UTG9' : 'UTG';
    if (pos.startsWith('MP')) return 'MP';
    if (pos === 'CO' || pos === 'BTN' || pos === 'SB') return pos;
    return null; // BB : pas d'ouverture
  }

  const pct = (set) => {
    let combos = 0;
    set.forEach((h) => { combos += h.length === 2 ? 6 : h[2] === 's' ? 4 : 12; });
    return Math.round((combos / 1326) * 100);
  };

  const round5 = (x, unit) => Math.max(unit, Math.round(x / unit) * unit);

  /*
   * Conseil avant le flop d'après les tableaux.
   * ctx = { cards, pos, n, bb, sb, cb (mise à suivre), myBet, myStack, raises (relances avant moi),
   *         limpers, iRaised (j'ai déjà relancé et on m'a sur-relancé) }
   * Renvoie { action: 'raise'|'call'|'check'|'fold'|'allin', to, text, why }
   */
  function preflopAdvice(ctx) {
    const hc = handClass(ctx.cards[0], ctx.cards[1]);
    const bb = ctx.bb;
    const unit = ctx.sb || 1;
    const stackBB = (ctx.myStack + ctx.myBet) / bb;
    const late = ctx.pos === 'CO' || ctx.pos === 'BTN';
    const has = (set) => set.has(hc);
    const R = (to, why) => ({ action: 'raise', to: round5(to, unit), text: 'Relance à ' + round5(to, unit), why });
    const allin = (why) => ({ action: 'allin', text: 'Tapis', why });
    const call = (why) => ({ action: 'call', text: 'Suis', why });
    const fold = (why) => ({ action: 'fold', text: 'Couche-toi', why });
    const check = (why) => ({ action: 'check', text: 'Check', why });

    // On m'a sur-relancé après ma relance
    if (ctx.iRaised) {
      if (has(RANGES.vs3bet.raise)) return stackBB <= 40 ? allin(hc + ' : main la plus forte, tapis') : R(ctx.cb * 2.3, hc + ' : on sur-relance encore');
      if (has(RANGES.vs3bet.call)) return call(hc + ' : assez forte pour payer la sur-relance');
      return fold(hc + ' : pas assez forte face à une sur-relance');
    }
    // Tapis court : tapis ou couché
    if (stackBB <= 12) {
      const key = openRangeKey(ctx.pos, ctx.n) || 'SB';
      const pushOk = ctx.raises === 0 ? has(RANGES.open[key]) || has(RANGES.call) : has(RANGES.threeBet) || has(parseRange('TT+, AQs+, AQo+'));
      if (pushOk) return allin(`tapis court (${Math.round(stackBB)} grosses blindes) : tapis avec ${hc}`);
      if (ctx.pos === 'BB' && ctx.raises === 0) return check('tapis court : check gratuit');
      return fold(`tapis court (${Math.round(stackBB)} grosses blindes) : ${hc} est trop faible`);
    }
    // Personne n'a relancé
    if (ctx.raises === 0) {
      if (ctx.pos === 'BB') {
        if (has(parseRange('TT+, AQs+, AKo'))) return R(bb * (3 + ctx.limpers), hc + ' : main forte, relance même en grosse blinde');
        return check('personne n\'a relancé : check gratuit');
      }
      const key = openRangeKey(ctx.pos, ctx.n);
      const range = RANGES.open[key];
      if (has(range)) {
        const size = (late ? 2.5 : 3) + ctx.limpers;
        return R(bb * size, `${hc} fait partie des mains à relancer depuis ${ctx.pos} (${pct(range)} % des mains)`);
      }
      return fold(`${hc} ne fait pas partie des mains à jouer depuis ${ctx.pos}`);
    }
    // Une relance avant moi
    if (ctx.raises === 1) {
      const big = ctx.cb > bb * 4.5;
      if (has(RANGES.threeBet)) return R(ctx.cb * (late ? 3 : 3.5), hc + ' : main premium, sur-relance');
      if (big) return has(RANGES.vsBig) ? call(hc + ' : assez forte pour payer une grosse relance') : fold(hc + ' : trop faible face à une grosse relance');
      const range = ctx.pos === 'BB' ? RANGES.callBB : RANGES.call;
      if (has(range)) return call(`${hc} : assez bonne pour payer une relance${ctx.pos === 'BB' ? ' depuis la grosse blinde' : ''}`);
      return fold(hc + ' : trop faible face à une relance');
    }
    // Relance et sur-relance avant moi
    if (has(RANGES.vs3bet.raise)) return stackBB <= 40 ? allin(hc + ' : main la plus forte, tapis') : R(ctx.cb * 2.3, hc + ' : main la plus forte, on relance encore');
    if (has(parseRange('QQ, AKs'))) return call(hc + ' : assez forte pour payer');
    return fold(hc + ' : face à deux relances, seules les meilleures mains continuent');
  }

  // Grille 13×13 pour l'affichage : lignes et colonnes A → 2 ; au-dessus de la diagonale = assorties.
  function grid() {
    const rows = [];
    for (let i = 0; i < 13; i++) {
      const row = [];
      for (let j = 0; j < 13; j++) {
        if (i === j) row.push(ORDER[i] + ORDER[j]);
        else if (i < j) row.push(ORDER[i] + ORDER[j] + 's');
        else row.push(ORDER[j] + ORDER[i] + 'o');
      }
      rows.push(row);
    }
    return rows;
  }

  const api = { score7, equity, potOdds, handClass, parseRange, RANGES, openRangeKey, preflopAdvice, grid, pct, toInt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerOdds = api;
})(typeof window !== 'undefined' ? window : globalThis);
