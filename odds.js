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
      if (t.includes('-')) { // de … à … : 98s-65s, 66-22 (ou 22-66), A9s-A2s (ou A2s-A9s)
        const [from, to] = t.split('-');
        const s = from[2] || '';
        if (from[0] === to[0] && from[0] !== from[1]) { // même première carte : la seconde varie
          let a = ORDER.indexOf(from[1]), b = ORDER.indexOf(to[1]);
          if (a > b) { const x = a; a = b; b = x; }
          for (let i = a; i <= b; i++) out.add(from[0] + ORDER[i] + s);
          return;
        }
        let i = ORDER.indexOf(from[0]);
        let end = ORDER.indexOf(to[0]);
        const gap = ORDER.indexOf(from[1]) - ORDER.indexOf(from[0]);
        if (i > end) { const x = i; i = end; end = x; }
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
    // selon la place du relanceur : plus serré contre UTG/MP, plus large contre CO/BTN/SB
    callEarly: parseRange('22+, AJs+, KQs, QJs, JTs, AQo'),
    callBBEarly: parseRange('22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, 65s, AJo+, KQo'),
    callBBLate: parseRange('22+, A2s+, K5s+, Q8s+, J8s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A7o+, K9o+, Q9o+, J9o+, T9o, 98o'),
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


  /*
   * Tableaux « tapis ou couché » des petits tapis, calculés par tools/pushfold.js (équilibre de Nash, en jetons) :
   * pour chaque tapis (5 à 20 grosses blindes) et chaque nombre k de joueurs qui parlent après celui qui met tapis,
   * les mains avec lesquelles mettre tapis, et celles avec lesquelles payer (grosse blinde, petite blinde, autres).
   */
  const PUSHFOLD = {"stacks":[5,8,10,12,15,20],"push":{"5":["fffffffffffffffffffbff9ffcfff783bc0dc02e008","ffffffffe1fc0fe073830c1830c0840220090028008","fffffc3f81f80ee0630208102080840220090028008","ffffe03e01f00cc0420208102080840220090028008","ffffe03e01b00c80420208102080840200080020008","ffffc03e01a00880420208102000800200080020008","ffe7c03e01a00880420208102000800200080020008","ffe7c03c01200880420208002000800200080020008"],"8":["ffffffffffffdffe7fe3ff9dfce3f603b809802c008","fffffc3f81fc0ff067c21e103080840220090028008","ffffe03f01f80ee0430208102000840200080020008","ffe7e03e01b008c0420208002000800200080020008","fe07c03e01200880420008002000800200080020008","fc07c03c01200880020008002000800200080020000","f807002801200880020008002000800200080000000","f807002801200880020008002000800200000000000"],"10":["ffffffffffffcffe7ff3ff99fcc3e603b009802c008","fffffc3f81fc0fe047c20e103080840220090028008","ffffe83f01f80ee043020c002000800200080020008","fe07c03e013008c0020008002000800200080020008","fc07c03e01200880020008002000800200080020000","f807402801200080020008002000800200000000000","f807002801200080020008002000800000000000000","f006002801200080020008002000800000000000000"],"12":["fffffffffbff4ffa7fe37f98fcc0e60330090028008","fffffc3f81fc0fe047c20e103000840220080020008","ffa7e03f01f808e0430008002000800200080020008","fc07c03e01200880020008002000800200080020000","f807c02801200080020008002000800200080000000","f807002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","f006002800200080020008002000000000000000000"],"15":["fffffffff9fe0ff87fc33f187880e40320090028008","fffff83f81fc0ee043820c003000800200080020008","fe07e03e013008c0020008002000800200080020008","f807c02e01200080020008002000800200080000000","f007002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","f006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000"],"20":["ffffff3ff9fe0ff877c21e103880c40320090028008","ff27f83f01f80ce003000c002000800200080020008","f807c02e01200080020008002000800200080000000","f007002800200080020008002000800000000000000","f006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020000000000000000000000000"]},"callBB":{"5":["fffffffffffffffa7fc3fe1f30f087023809c02e008","ffffffffe1fc0fe077830e1830c0860230090028008","ffffff3f81fc0fe063830c103080840220090028008","fffffc3f81f80ee063820c103080840220090028008","fffff83f01f80ee043020c103080840220090028008","fffff83f01f80ee043020c102080840220090028008","ffffe83f01f80ee043020c102080840220090020008","ffffe83f01f80ee0430208102080840220080020008"],"8":["fffffffff9fe0fe07f03881820c0860230098028008","ffffe03e01f00c80420208102080840220090028008","fff7c03e01a00880420208102000800200080020008","ff07803801200880420008002000800200080020000","fe07003801200880020008002000800200080020000","fc07002801200880020008002000800200080000000","f807002801200880020008002000800200000000000","f807002801200880020008002000800200000000000"],"10":["ffffffffc1fc0fc07203081820c0840220090028008","ffffc03e01a00c80420208102080840200080020008","ff07c03801200880420008002000800200080020000","fc07002801200880020008002000800200080000000","f807002801200880020008002000800200000000000","f006002801200080020008002000800000000000000","f006002801200080020008002000800000000000000","f006002801200080020008002000000000000000000"],"12":["fffffc3f81f80f80620308182080840220090028008","ffe7c03c01a00880420208102000800200080020000","fc07003801200880020008002000800200080000000","f806002801200080020008002000800000000000000","f006002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","f006002800200080020008002000000000000000000","f006002800200080020008002000000000000000000"],"15":["fffff03e01f00e80620208102080840220090020008","fe07803801200880420008002000800200080000000","f806002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","e006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000"],"20":["fff7e03e01a00c80420208102080800200080020000","f807002801200880020008002000800000000000000","f006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000","e006000800200080020008000000000000000000000","e006000800200080020000000000000000000000000","e006000800200080020000000000000000000000000","e006000800200080020000000000000000000000000"]},"callSB":{"5":["","ffffff3f81f80ec0620308182080840220090028008","fffff83e01f00c80620208102080840220090028008","ffffe03e01b00c80420208102080840220090028008","ffffc03e01a00c80420208102080840200080020008","ffffc03e01a00880420208102080800200080020008","ffffc03e01a00880420208102000800200080020008","fff7c03e01a00880420208102000800200080020008"],"8":["","ffffe03e01a00c80420208102080840200080020008","ff87c03c01200880420208002000800200080020000","fe07003801200880420008002000800200080000000","fc07002801200880020008002000800200080000000","f807002801200880020008002000800200000000000","f806002801200080020008002000800200000000000","f806002801200080020008002000800000000000000"],"10":["","ffe7c03c01a00880420208102000800200080020008","fe07803801200880420008002000800200080000000","f807002801200880020008002000800200000000000","f806002801200080020008002000800000000000000","f006002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","f006002800200080020008002000000000000000000"],"12":["","ff87c03c01200880420208002000800200080020000","fc07002801200880020008002000800200000000000","f806002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","f006002800200080020008002000000000000000000","e006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000"],"15":["","fe07803801200880420008002000800200080000000","f806002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000","e006000800200080020000000000000000000000000"],"20":["","f807002801200880020008002000800000000000000","f006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000","e006000800200080020000000000000000000000000","e006000800200080020000000000000000000000000","e006000800200080020000000000000000000000000","c006000800200080020000000000000000000000000"]},"callFirst":{"5":["fffffffffffffffa7fc3fe1f30f087023809c02e008","ffffff3f81f80ec0620308182080840220090028008","ffffe03e01a00c80420208102080840220080020008","ffffc03c01a00880420208102080800200080020008","ffe7c03c01200880420208102000800200080020008","ffa7c03801200880420208002000800200080020008","ff87803801200880420208002000800200080020000","ff07803801200880420208002000800200080020000"],"8":["fffffffff9fe0fe07f03881820c0860230098028008","ffffe03e01a00c80420208102080840200080020008","ff07803801200880420208002000800200080020000","fc07002801200880020008002000800200080000000","f806002801200880020008002000800200000000000","f806002801200880020008002000800000000000000","f806002801200080020008002000800000000000000","f006002801200080020008002000800000000000000"],"10":["ffffffffc1fc0fc07203081820c0840220090028008","ffe7c03c01a00880420208102000800200080020008","fe07003801200880420008002000800200080000000","f806002801200880020008002000800200000000000","f006002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","f006002800200080020008002000000000000000000","f006002800200080020008002000000000000000000"],"12":["fffffc3f81f80f80620308182080840220090028008","ff87c03c01200880420208002000800200080020000","f807002801200880020008002000800200000000000","f006002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000"],"15":["fffff03e01f00e80620208102080840220090020008","fe07803801200880420008002000800200080000000","f006002801200080020008002000800000000000000","f006002800200080020008002000000000000000000","e006002800200080020008000000000000000000000","e006002800200080020008000000000000000000000","e006000800200080020000000000000000000000000","e006000800200080020000000000000000000000000"],"20":["fff7e03e01a00c80420208102080800200080020000","f807002801200880020008002000800000000000000","e006002800200080020008002000000000000000000","e006000800200080020008000000000000000000000","e006000800200080020000000000000000000000000","e006000800200080020000000000000000000000000","c006000800200080020000000000000000000000000","c006000800200080000000000000000000000000000"]}};
  const PF_CLASSES = (() => {
    const R = 'AKQJT98765432', out = [];
    for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) out.push(i === j ? R[i] + R[j] : i < j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o');
    return out;
  })();
  const pfCache = {};
  function pfSet(kind, S, k) {
    const st = PUSHFOLD.stacks.reduce((a, b) => (Math.abs(b - S) < Math.abs(a - S) ? b : a));
    const kk = Math.max(1, Math.min(8, k));
    const key = kind + st + ':' + kk;
    if (pfCache[key]) return pfCache[key];
    const hex = PUSHFOLD[kind][st][kk - 1] || '';
    const set = new Set();
    for (let i = 0; i < PF_CLASSES.length; i++) {
      const nib = parseInt(hex[i >> 2] || '0', 16);
      if ((nib >> (3 - (i & 3))) & 1) set.add(PF_CLASSES[i]);
    }
    return (pfCache[key] = set);
  }
  // ordre de parole avant le flop (comme le moteur) : combien de joueurs parlent après cette place
  const PF_ORDER = {
    2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['UTG', 'BTN', 'SB', 'BB'], 5: ['UTG', 'CO', 'BTN', 'SB', 'BB'], 6: ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'],
    7: ['UTG', 'UTG+1', 'MP', 'CO', 'BTN', 'SB', 'BB'], 8: ['UTG', 'UTG+1', 'MP', 'MP+1', 'CO', 'BTN', 'SB', 'BB'],
    9: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'CO', 'BTN', 'SB', 'BB'], 10: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'MP+2', 'CO', 'BTN', 'SB', 'BB'],
  };
  const behindOf = (pos, n) => { const o = PF_ORDER[n] || PF_ORDER[6]; const i = o.indexOf(pos); return i < 0 ? 3 : o.length - 1 - i; };
  const round5 = (x, unit) => Math.max(unit, Math.round(x / unit) * unit);

  /*
   * Conseil avant le flop d'après les tableaux.
   * ctx = { cards, pos, n, bb, sb, cb (mise à suivre), myBet, myStack, raises (relances avant moi),
   *         limpers, iRaised (j'ai déjà relancé et on m'a sur-relancé) }
   * Renvoie { action: 'raise'|'call'|'check'|'fold'|'allin', to, text, why }
   */
  function preflopAdvice(ctx) {
    const T = tuneOf(ctx.tune);
    const hc = handClass(ctx.cards[0], ctx.cards[1]);
    const bb = ctx.bb;
    const unit = ctx.sb || 1;
    const stackBB = (ctx.myStack + ctx.myBet) / bb;
    const late = ctx.pos === 'CO' || ctx.pos === 'BTN';
    const has = (set) => set.has(hc);
    // why : la raison courte (pour qui connaît le jargon) ; plain : la même chose en clair, pour un débutant
    const R = (to, why, plain) => ({ action: 'raise', to: round5(to, unit), text: 'Relance à ' + round5(to, unit), why, plain });
    const allin = (why, plain) => ({ action: 'allin', text: 'Tapis', why, plain });
    const call = (why, plain) => ({ action: 'call', text: 'Suis', why, plain });
    const fold = (why, plain) => ({ action: 'fold', text: 'Couche-toi', why, plain });
    const check = (why, plain) => ({ action: 'check', text: 'Check', why, plain });

    // On m'a sur-relancé après ma relance
    if (ctx.iRaised && (ctx.reraises || 1) >= 2) {
      // deux relances par-dessus la mienne : seules les deux meilleures mains continuent
      const p2 = "Deux joueurs ont relancé par-dessus ta relance : ça montre presque toujours une très grosse main.";
      if (has(RANGES.vs3bet.raise)) return allin(hc + ' : la meilleure main, tapis', p2 + " Mais tu as l'une des deux meilleures mains possibles (paire d'As ou de Rois) : mets tapis.");
      return fold(hc + ' : face à deux relances par-dessus la tienne, seules AA et KK continuent', p2 + " Même une bonne main comme la tienne n'est pas assez forte : abandonne ce que tu as déjà misé.");
    }
    if (ctx.iRaised) {
      const p0 = "Quelqu'un a relancé par-dessus ta relance";
      if (has(RANGES.vs3bet.raise)) {
        const p = p0 + ', mais ta main est la meilleure (ou presque) : remets-en une couche, tu as toutes les chances d\'être devant.';
        return stackBB <= 40 ? allin(hc + ' : main la plus forte, tapis', p) : R(ctx.cb * 2.3, hc + ' : on sur-relance encore', p);
      }
      if (has(RANGES.vs3bet.call)) return call(hc + ' : assez forte pour payer la sur-relance', p0 + '. Ta main est assez bonne pour payer et voir le flop, mais pas pour relancer encore.');
      return fold(hc + ' : pas assez forte face à une sur-relance', p0 + " : en général, ça veut dire une très grosse main. La tienne n'est pas assez forte : abandonne ce que tu as déjà misé, plutôt que d'en perdre plus.");
    }
    // Petit tapis : tableaux « tapis ou couché » calculés (équilibre). Personne n'a relancé : tapis ou couché.
    const nb = Math.round(stackBB);
    if (stackBB <= T.pfPush && ctx.raises === 0) {
      if (ctx.pos === 'BB') return check('petit tapis : check gratuit', `Il te reste ${nb} grosses blindes, mais personne n'a relancé : regarde le flop sans rien payer de plus.`);
      const k = behindOf(ctx.pos, ctx.n);
      const set = pfSet('push', stackBB, k);
      if (has(set)) return allin(`${nb} grosses blindes : tapis avec ${hc} (tableau calculé, ${pct(set)} % des mains en ${ctx.pos})`, `Il te reste ${nb} fois la grosse blinde : à ce niveau, on ne fait plus de petite relance, c'est tapis ou couché. D'après le tableau calculé pour ta place (${k} joueur${k > 1 ? 's' : ''} parle${k > 1 ? 'nt' : ''} après toi), ${hc} est assez forte : mets tapis. Souvent tout le monde se couche et tu prends les blindes ; si on paie, tu as encore de bonnes chances.`);
      return fold(`${nb} grosses blindes : ${hc} ne fait pas partie des mains à mettre tapis en ${ctx.pos} (${pct(set)} % des mains)`, `Il te reste ${nb} fois la grosse blinde : c'est tapis ou couché, et d'après le tableau calculé pour ta place, ${hc} n'est pas assez forte pour mettre tapis. Garde tes jetons pour une meilleure main ou une meilleure place.`);
    }
    // Quelqu'un met tapis (ou une relance qui engage la moitié de mon tapis) et j'ai un petit tapis : payer ou non, d'après le tableau calculé
    if (ctx.raises === 1 && stackBB <= T.pfCall && ctx.cb >= 0.5 * (ctx.myStack + ctx.myBet) && !ctx.callers) {
      const k = ctx.raiserPos ? behindOf(ctx.raiserPos, ctx.n) : 3;
      const kind = ctx.pos === 'BB' ? 'callBB' : ctx.pos === 'SB' && k >= 2 ? 'callSB' : 'callFirst';
      const set = pfSet(kind, stackBB, k);
      if (has(set)) return call(`${hc} : paie son tapis (tableau calculé : ${pct(set)} % des mains ici)`, `Il met tapis (ou presque) et il te reste ${nb} grosses blindes. D'après le tableau calculé pour cette situation, ${hc} est assez forte : paie. Avec un petit tapis, celui qui met tapis le fait avec beaucoup de mains.`);
      return fold(`${hc} : trop faible pour payer son tapis (on paie avec ${pct(set)} % des mains ici)`, `Il met tapis (ou presque) et il te reste ${nb} grosses blindes. D'après le tableau calculé pour cette situation, ${hc} ne suffit pas pour payer : couche-toi.`);
    }
    // Tapis court face à une relance normale : tapis ou couché
    if (stackBB <= 12) {
      const pushOk = has(RANGES.threeBet) || has(parseRange('TT+, AQs+, AQo+'));
      if (pushOk) return allin(`tapis court (${nb} grosses blindes) : tapis avec ${hc}`, `Il te reste peu de jetons (${nb} fois la grosse blinde). Face à une relance, on ne paie pas pour jouer après le flop : on met tout avec une bonne main.`);
      return fold(`tapis court (${nb} grosses blindes) : ${hc} est trop faible`, `Il te reste peu de jetons (${nb} fois la grosse blinde) : face à une relance, garde-les pour une meilleure main, sur laquelle tu pourras tout miser.`);
    }
    const LATE = ['CO', 'BTN', 'SB'];
    // Tapis moyen (12 à 25 grosses blindes) face à une relance : on ne paie pas pour jouer après le flop, c'est tapis ou couché
    if (ctx.raises === 1 && stackBB <= 25 && ctx.pos !== 'BB') {
      if (has(parseRange('77+, ATs+, KQs, AJo+'))) return allin(`${nb} grosses blindes face à une relance : tapis avec ${hc}`, `Il te reste ${nb} fois la grosse blinde. Suivre puis jouer après le flop te laisserait trop peu de jetons pour manœuvrer : avec une main comme la tienne, mets tapis tout de suite. Le relanceur se couchera souvent, et s'il paie, tu as de bonnes chances.`);
      return fold(`${nb} grosses blindes face à une relance : ${hc} trop faible`, `Il te reste ${nb} fois la grosse blinde : face à une relance, c'est tapis ou couché, et ta main ne suffit pas pour mettre tapis.`);
    }
    // Personne n'a relancé
    if (ctx.raises === 0) {
      // Des joueurs ont seulement suivi : en position, on peut suivre aussi avec les mains qui aiment les pots à plusieurs
      if (ctx.limpers >= 1 && ctx.pos !== 'BB') {
        const key = openRangeKey(ctx.pos, ctx.n);
        const iso = new Set([...RANGES.open[key || 'SB'], ...parseRange('A9o+, KJo+, QJo')]);
        if (has(parseRange('TT+, AJs+, KQs, AQo+')) || (has(iso) && !has(parseRange('22-66, 98s-54s')))) {
          return R(bb * ((late ? 3 : 3.5) + ctx.limpers), `${hc} : relance pour jouer contre ${ctx.limpers > 1 ? 'les suiveurs' : 'le suiveur'}`, `${ctx.limpers > 1 ? 'Des joueurs ont' : 'Un joueur a'} seulement suivi avant toi : c'est souvent le signe d'une main moyenne. Relance pour prendre l'avantage : souvent tu gagnes tout de suite, sinon tu joues la suite avec la meilleure main et l'initiative.`);
        }
        if ((late || ctx.pos === 'SB') && has(parseRange('22-99, A2s-A9s, KTs, QTs, JTs, T9s, 98s-54s'))) {
          return call(`${hc} : suivre derrière ${ctx.limpers > 1 ? 'les suiveurs' : 'le suiveur'}`, `Des joueurs ont seulement suivi. Ta main n'est pas assez forte pour relancer, mais elle aime les pots à plusieurs : pour pas cher, tu peux toucher un brelan, une couleur ou une quinte et gagner gros.`);
        }
      }
      if (ctx.pos === 'BB') {
        if (has(parseRange('TT+, AQs+, AKo'))) return R(bb * (3 + ctx.limpers), hc + ' : main forte, relance même en grosse blinde', "Personne n'a relancé et ta main est très forte : relance, pour que le pot soit plus gros quand tu gagnes.");
        return check('personne n\'a relancé : check gratuit', "Tu as déjà payé la grosse blinde et personne n'a relancé : tu vois le flop sans rien payer de plus.");
      }
      const key = openRangeKey(ctx.pos, ctx.n);
      const range = RANGES.open[key];
      // Ceux qui parlent après moi jouent très peu : en fin de tour, on relance bien plus large pour voler les blindes
      if (ctx.behindTight && ['CO', 'BTN', 'SB'].includes(ctx.pos) && !has(range) && has(RANGES.open.BTN)) {
        return R(bb * 2.5, `${hc} : vol des blindes, les joueurs restants jouent très peu`, "Les joueurs qui parlent après toi jouent très peu de mains et se couchent presque toujours. Relance pour leur prendre les blindes, même avec une main moyenne : la plupart du temps, tu gagnes tout de suite.");
      }
      if (has(range)) {
        const size = (late ? T.openLate : T.openEarly) + ctx.limpers;
        return R(bb * size, `${hc} fait partie des mains à relancer depuis ${ctx.pos} (${pct(range)} % des mains)`,
          "Personne n'a encore relancé et ta main est assez bonne pour ta place. Relance plutôt que de juste suivre : soit tout le monde se couche et tu gagnes les blindes tout de suite, soit tu joues la suite avec l'avantage."
          + (ctx.limpers ? ' La relance est un peu plus grosse parce que des joueurs ont déjà suivi.' : ''));
      }
      const early = !late && ctx.pos !== 'SB';
      return fold(`${hc} ne fait pas partie des mains à jouer depuis ${ctx.pos}`,
        "Ta main n'est pas assez bonne pour ta place" + (early ? " : beaucoup de joueurs parlent encore après toi, et l'un d'eux aura souvent mieux" : '') + '. '
        + (ctx.pos === 'SB' ? 'Te coucher ne te coûte que la petite blinde déjà posée.' : 'Te coucher ne te coûte rien.'));
    }
    // Face à une seule relance plus grosse que la normale (tier : 1 grosse, 2 très grosse, 3 tapis ou énorme)
    function bigRaise(tier) {
      const sizeTxt = ['', 'grosse relance (3 à 6 grosses blindes)', 'très grosse relance (6 à 15 grosses blindes)', 'relance énorme ou un tapis'][tier];
      const allInMe = ctx.cb >= ctx.myStack + ctx.myBet; // sa relance couvre tous mes jetons
      if (tier === 1) {
        if (has(RANGES.threeBet)) return R(ctx.cb * (late ? 2.5 : 3), `${hc} : main premium, sur-relance même face à une grosse relance`, "La relance est grosse, mais ta main est l'une des toutes meilleures : relance par-dessus pour faire grossir le pot.");
        // Petite blinde : comme face à une relance normale, on évite de suivre (on parle en premier après le flop,
        // et la grosse blinde peut encore relancer derrière) ; seules les très bonnes mains paient
        if (ctx.pos === 'SB') {
          if (has(parseRange('JJ, TT, AQs'))) return call(`${hc} : en petite blinde, assez forte pour payer une ${sizeTxt}`, `C'est une ${sizeTxt} : il a souvent une bonne main. En petite blinde, on préfère d'habitude sur-relancer ou se coucher, mais ta main est assez forte pour payer et voir le flop.`);
          return fold(`${hc} : en petite blinde, trop faible face à une ${sizeTxt}`, `C'est une ${sizeTxt} : il a souvent une bonne main. En petite blinde, tu parleras en premier après le flop et la grosse blinde peut encore relancer derrière toi : seules les meilleures mains continuent.`);
        }
        // Petites paires : on paie pour espérer un brelan seulement s'il reste assez de jetons derrière pour qu'il rapporte gros
        // (au moins 15 fois ce qu'il faut payer) ; plus la relance est grosse, moins c'est le cas
        const toPay = Math.max(1, ctx.cb - ctx.myBet);
        const setMine = (ctx.myStack - toPay) / toPay >= 15;
        const callR = parseRange((setMine ? '22+, ' : '77+, ') + 'AJs+, KQs, AQo+' + (ctx.pos === 'BB' ? ', ATs, KJs, QJs, JTs' : ''));
        if (has(callR)) {
          const smallPair = hc.length === 2 && 'AKQJT98'.indexOf(hc[0]) < 0;
          return call(`${hc} : assez forte pour payer une ${sizeTxt}`, `C'est une ${sizeTxt} : il a souvent une bonne main. `
            + (smallPair ? 'Ta petite paire peut faire un brelan et gagner un gros pot : avec beaucoup de jetons derrière, payer reste rentable.' : 'Ta main est assez forte pour payer, pas pour relancer.'));
        }
        return fold(`${hc} : trop faible face à une ${sizeTxt}`, `C'est une ${sizeTxt} : il a souvent une bonne main, et la tienne ne suffit pas pour payer aussi cher.`);
      }
      if (tier === 2) {
        if (has(parseRange('KK+'))) return stackBB <= 40 ? allin(`${hc} : la meilleure main, tapis`, `Même face à une ${sizeTxt}, tu as l'une des deux meilleures mains possibles : mets tapis.`)
          : R(ctx.cb * 2.3, `${hc} : la meilleure main, relance encore`, `Même face à une ${sizeTxt}, tu as l'une des deux meilleures mains possibles : relance encore.`);
        if (has(parseRange('QQ, JJ, AKs, AKo'))) return call(`${hc} : assez forte pour payer une ${sizeTxt}`, `C'est une ${sizeTxt} : il a souvent une très bonne main. La tienne est assez forte pour payer et voir le flop.`);
        return fold(`${hc} : trop faible face à une ${sizeTxt}`, `C'est une ${sizeTxt} : il a presque toujours une très bonne main. Seules les meilleures mains (QQ et plus, AK) continuent.`);
      }
      // tapis ou relance énorme
      if (has(parseRange('KK+'))) return allInMe ? call(`${hc} : paie son tapis`, "Il met tapis, mais tu as l'une des deux meilleures mains possibles : paie.")
        : allin(`${hc} : la meilleure main, tapis`, "Face à une relance énorme, tu as l'une des deux meilleures mains possibles : mets tapis.");
      if (has(parseRange('QQ, AKs, AKo'))) return call(`${hc} : assez forte pour payer`, `Face à une ${sizeTxt}, seules les toutes meilleures mains continuent : la tienne (QQ ou AK) en fait partie, paie.`);
      return fold(`${hc} : trop faible face à une ${sizeTxt}`, `Face à une ${sizeTxt}, il a presque toujours une très grosse main. Ne risque pas tes jetons avec moins que QQ ou AK : couche-toi.`);
    }

    // Une relance avant moi. Si on connaît le relanceur : on s'adapte à sa façon de jouer.
    if (ctx.raises === 1) {
      const r = ctx.raiser; // { name, pfr } si on le connaît assez
      const loose = r && r.pfr >= 0.25, tight = r && r.pfr < 0.08;
      const who = r ? r.name + ' relance ' + Math.round(r.pfr * 100) + ' % de ses mains' : '';
      const rare = r ? `${r.name} relance très rarement : quand il le fait, il a souvent une très bonne main.` : '';
      let threeBet = loose ? parseRange('TT+, AQs+, AKo, AQo') : tight ? parseRange('KK+') : RANGES.threeBet;
      // Taille de la relance, calée sur les tailles les plus courantes : 0 normale (jusqu'à 3 BB), 1 grosse (3 à 6 BB),
      // 2 très grosse (6 à 15 BB), 3 tapis ou plus de 15 BB. Plus elle est grosse, plus il a une grosse main.
      const sizeBB = ctx.cb / bb;
      let tier = sizeBB <= 3 ? 0 : sizeBB <= 6 ? 1 : sizeBB <= 15 ? 2 : 3;
      if (loose && tier > 0) tier -= 1; // il relance tout : sa grosse relance vaut une relance normale d'un autre
      else if (tight && tier > 0 && tier < 3) tier += 1; // il relance rarement : sa relance vaut plus
      if (tier > 0) return bigRaise(tier);
      // Place du relanceur : depuis UTG/MP on ne relance qu'avec de bonnes mains, depuis CO/BTN/SB avec beaucoup de mains moyennes.
      // Si l'appli connaît ses habitudes (relance tout ou presque rien), elles comptent plus que sa place.
      const rp = ctx.raiserPos || '';
      const vsEarly = !loose && /^(UTG|MP)/.test(rp);
      const vsLate = !loose && !tight && LATE.includes(rp) && (!r || r.pfr >= 0.12);
      const rKey = rp ? openRangeKey(rp, ctx.n) : null;
      const rPct = rKey ? pct(RANGES.open[rKey]) : 0;
      const posNote = vsEarly ? ` Il relance depuis ${rp}, la place d'où l'on ne relance qu'avec de bonnes mains (environ ${rPct} % des mains) : sois prudent.`
        : vsLate ? ` Il relance depuis ${rp}, une place d'où l'on relance avec beaucoup de mains moyennes (environ ${rPct} % des mains) : tu peux continuer avec plus de mains.` : '';
      const callers = ctx.callers || 0; // joueurs qui ont suivi la relance avant moi
      if (vsLate) threeBet = parseRange('TT+, AJs+, KQs, AQo+');
      const size = ctx.cb * (late ? T.tbIP : T.tbOOP) + ctx.cb * callers; // plus gros s'il y a déjà des suiveurs (« squeeze »)
      // Sur-relance « bluff » : un As bloque ses meilleures mains, contre une relance tardive, quand je suis bien placé
      if (!tight && !callers && LATE.includes(ctx.pos) && LATE.includes(ctx.raiserPos) && has(parseRange('A5s, A4s'))) {
        return R(size, `${hc} : sur-relance « bluff » contre une relance tardive`, `Le relanceur ${ctx.raiserPos ? 'est en ' + ctx.raiserPos + ', une place d\'où l\'on relance souvent avec des mains moyennes' : 'relance souvent'}. Ton As rend ses meilleures mains (AA, AK) moins probables, et s'il paie, tu peux encore faire une couleur ou une quinte. Il se couchera souvent.`);
      }
      // Petite blinde : on ne fait pas que suivre (mal placé après le flop) : sur-relance ou couché
      if (ctx.pos === 'SB' && !has(threeBet)) {
        const sb3 = parseRange(vsLate ? '99+, ATs+, KJs+, QJs, AJo+, KQo' : vsEarly ? 'JJ, TT, AQs, AQo' : 'JJ, TT, AQs, AJs, KQs, AQo');
        if (has(sb3)) return R(size, `${hc} : en petite blinde, sur-relance plutôt que suivre${vsLate ? ' (relance tardive)' : ''}`, "En petite blinde, tu parleras en premier après le flop : suivre te met en difficulté. Avec une bonne main comme la tienne, sur-relance pour reprendre l'avantage." + posNote);
        return fold(`${hc} : en petite blinde, sur-relance ou couché${vsEarly ? ' (relance depuis ' + rp + ')' : ''}`, "En petite blinde, tu parleras en premier après le flop, ce qui est un gros désavantage. Sans une main assez forte pour sur-relancer, couche-toi." + posNote);
      }
      if (has(threeBet)) {
        return R(size, hc + (callers ? ` : sur-relance plus grosse, ${callers} joueur${callers > 1 ? 's ont' : ' a'} déjà suivi` : loose ? ` : forte, et ${who} (souvent sans grosse main) : sur-relance` : ' : main premium, sur-relance'),
          loose ? `Ta main est bonne, et ${r.name} relance très souvent, même avec des mains faibles. Tu as donc souvent mieux que lui : relance par-dessus sa relance.`
            : vsLate && !has(RANGES.threeBet) ? `Ta main est bonne, et il relance depuis ${rp} : de cette place, on relance avec beaucoup de mains moyennes (environ ${rPct} % des mains). Tu as souvent mieux que lui : relance par-dessus.`
              : "Quelqu'un a relancé, mais ta main est l'une des toutes meilleures : relance par-dessus sa relance pour faire grossir le pot." + posNote);
      }
      if (tight) {
        if (has(parseRange('TT+, AQs+, AKo, AQo'))) return call(`${hc} : ${who}, c'est peu : sa relance est sérieuse, suis seulement`, rare + ' Ta main est assez bonne pour payer et voir le flop, mais pas pour relancer.');
        return fold(`${hc} : ${who}, c'est peu : sa relance est sérieuse`, rare + ' La tienne ne suffit pas : couche-toi.');
      }
      let range = ctx.pos === 'BB'
        ? (vsLate ? RANGES.callBBLate : vsEarly ? RANGES.callBBEarly : RANGES.callBB)
        : loose ? RANGES.callBB
          : vsEarly ? (ctx.pos === 'BTN' ? RANGES.call : RANGES.callEarly)
            : ctx.pos === 'BTN' || vsLate ? parseRange('22+, A9s+, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AJo+, KQo') // en position, ou contre une relance tardive : plus large
              : RANGES.call;
      // Des joueurs ont déjà suivi la relance : à plusieurs, les paires et les mains assorties (brelan, couleur, quinte)
      // gagnent de gros pots ; les mains dépareillées moyennes perdent souvent contre une meilleure du même genre.
      let multiNote = '';
      if (callers) {
        const keepO = parseRange(ctx.pos === 'BB' ? 'ATo+, KJo+, QJo' : 'AQo+');
        const addS = parseRange(ctx.pos === 'BB' || ctx.pos === 'BTN' ? '22+, A2s+, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, 65s' : '22+, T9s, 98s');
        range = new Set([...range].filter((c) => !c.endsWith('o') || keepO.has(c)).concat([...addS]));
        multiNote = ` ${callers > 1 ? callers + ' joueurs ont' : 'Un joueur a'} déjà suivi : à plusieurs, les paires et les mains assorties (qui peuvent faire un brelan, une couleur ou une quinte) valent plus, les mains dépareillées moins.`;
      }
      if (has(range)) {
        return call(`${hc} : assez bonne pour payer ${loose ? `(${who} : sa relance est souvent faible)` : 'une relance'}${ctx.pos === 'BB' ? ' depuis la grosse blinde' : ''}`,
          "Quelqu'un a relancé. Ta main est assez bonne pour payer et voir le flop, mais pas assez pour relancer par-dessus."
          + (loose ? ` En plus, ${r.name} relance souvent avec des mains faibles.` : posNote) + multiNote
          + (ctx.pos === 'BB' ? ' Comme tu as déjà mis la grosse blinde, suivre te coûte moins cher.' : ''));
      }
      return fold(hc + ' : trop faible face à une relance' + (vsEarly ? ' depuis ' + rp : callers ? ' et ' + callers + ' suiveur' + (callers > 1 ? 's' : '') : ''), "Quelqu'un a relancé : il a probablement une bonne main. La tienne n'est pas assez forte pour continuer : couche-toi." + posNote + multiNote);
    }
    // Relance et sur-relance avant moi
    const two = 'Il y a déjà eu deux relances avant toi';
    if (has(RANGES.vs3bet.raise)) {
      const p = two + ", mais tu as l'une des deux meilleures mains possibles (paire d'As ou de Rois) : relance encore.";
      return stackBB <= 40 ? allin(hc + ' : main la plus forte, tapis', p) : R(ctx.cb * 2.3, hc + ' : main la plus forte, on relance encore', p);
    }
    if (has(parseRange('QQ, AKs'))) return call(hc + ' : assez forte pour payer', two + ' : ça montre de très grosses mains. La tienne est assez forte pour payer, pas pour relancer.');
    return fold(hc + ' : face à deux relances, seules les meilleures mains continuent', two + ' : ça montre presque toujours de très grosses mains. Couche-toi.');
  }

  /* ------------------------------------------------------------ mains probables des adversaires */

  // Les 169 mains de départ, de la plus forte à la plus faible (calculé par simulation contre 1 et 3 adversaires).
  const HAND_RANK = ('AA KK QQ JJ TT 99 AKs AQs 88 AKo AJs ATs KQs AQo 77 AJo KJs KTs A9s ATo KQo QJs 66 A8s KJo A7s K9s QTs A5s A9o '
    + 'KTo QJo A6s JTs A4s A8o 55 K8s QTo Q9s A3s K9o A7o K7s J9s A2s K6s JTo A5o A6o Q8s T9s K5s A4o Q9o J8s K8o K4s Q7s 44 '
    + 'T8s J9o A3o K3s K7o Q6s A2o 98s J7s K6o Q8o T9o K2s Q5s T7s Q4s K5o J8o 33 97s Q3s Q7o K4o J6s J5s 87s T6s Q2s Q6o 98o '
    + 'T8o K3o J4s 96s J7o K2o 86s 22 J3s T7o Q5o 76s T5s J2s Q4o 97o T4s 95s J6o 87o 75s 85s 65s Q3o T3s T6o T2s J5o Q2o 54s '
    + '94s J4o 96o 86o 64s 76o 84s 74s 93s J3o T5o 92s 53s J2o 95o 83s 73s 63s T4o 85o 65o 75o T3o 43s 82s T2o 52s 94o 72s 62s '
    + '54o 93o 64o 84o 74o 42s 92o 32s 53o 83o 73o 63o 43o 82o 52o 72o 62o 42o 32o').split(' ');
  const combosIn = (c) => (c.length === 2 ? 6 : c[2] === 's' ? 4 : 12);

  // Les meilleures mains jusqu'à une part donnée de toutes les mains (0.15 = les 15 % meilleures).
  function topRange(frac) {
    const out = new Set();
    let n = 0;
    for (const c of HAND_RANK) {
      if (out.size && n + combosIn(c) / 2 > frac * 1326) break;
      out.add(c);
      n += combosIn(c);
    }
    return out;
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /*
   * Mains probables d'un adversaire d'après ce qu'il a fait avant le flop, et sa façon de jouer si on la connaît.
   * act = { raised, raiseOver (il a relancé une relance), reraiseCount (relances avant la sienne), called, facingRaise, openKey }
   * prof = { vpip, pfr } en fractions (part des mains jouées / relancées), ou null si on ne sait pas encore.
   * Renvoie { range: Set | null (null = n'importe quelle main), minus: Set | null (mains retirées), text }
   */
  function playerRange(act, prof) {
    if (act.raised) {
      if (act.reraiseCount >= 2) return { range: topRange(0.025), minus: null, text: 'les 2 % meilleures mains' };
      if (act.raiseOver) {
        const f = prof ? clamp(prof.pfr * 0.35, 0.025, 0.2) : 0.05;
        return { range: topRange(f), minus: null, text: `les ${Math.round(f * 100)} % meilleures mains` };
      }
      if (prof) {
        const f = clamp(prof.pfr, 0.04, 0.6);
        return { range: topRange(f), minus: null, text: `les ${Math.round(f * 100)} % meilleures mains` };
      }
      const r = act.openKey && RANGES.open[act.openKey];
      if (r) return { range: r, minus: null, text: `les ${pct(r)} % de mains qu'on relance en ${act.openKey === 'UTG9' ? 'UTG' : act.openKey}` };
      return { range: topRange(0.12), minus: null, text: 'les 12 % meilleures mains' };
    }
    if (act.called) {
      let v = prof ? prof.vpip : act.facingRaise ? 0.25 : 0.4;
      if (prof && act.facingRaise) v *= 0.75;
      v = clamp(v, 0.06, 0.9);
      const p = clamp((prof ? prof.pfr : 0.12) * 0.5, 0.01, v / 2);
      return { range: topRange(v), minus: topRange(p), text: `les ${Math.round(v * 100)} % meilleures mains, sans les toutes meilleures (il aurait relancé)` };
    }
    return { range: null, minus: null, text: "n'importe quelle main" };
  }

  // Toutes les combinaisons de cartes (entiers) d'un ensemble de mains, sauf celles qui touchent des cartes connues.
  function combosOf(range, minus, dead) {
    const out = [];
    const R = '23456789TJQKA';
    range.forEach((c) => {
      if (minus && minus.has(c)) return;
      const a = R.indexOf(c[0]), b = R.indexOf(c[1]);
      for (let s1 = 0; s1 < 4; s1++) {
        for (let s2 = 0; s2 < 4; s2++) {
          if (c.length === 2 ? s2 <= s1 : c[2] === 's' ? s1 !== s2 : s1 === s2) continue;
          const x = a * 4 + s1, y = b * 4 + s2;
          if (!dead[x] && !dead[y]) out.push([x, y]);
        }
      }
    });
    return out;
  }

  // Ce que les 2 cartes d'un joueur font avec le tableau : 0 rien, 1 petite paire, 2 paire max / paire en main au-dessus,
  // 3 double paire, 4 brelan ou mieux ; draw = tirage couleur ou quinte ouverte ; over = deux cartes plus hautes que le tableau.
  const tmp7 = new Array(7);
  function connect(x, y, board, boardCat) {
    const nb = board.length;
    tmp7.length = nb + 2;
    tmp7[0] = x; tmp7[1] = y;
    for (let i = 0; i < nb; i++) tmp7[i + 2] = board[i];
    const sc7 = score7(tmp7);
    const cat = sc7 >> 20;
    let top = -1, smask = 0;
    const suits = [0, 0, 0, 0];
    for (let i = 0; i < nb; i++) { const r = board[i] >> 2; if (r > top) top = r; suits[board[i] & 3]++; smask |= 1 << r; }
    const rx = x >> 2, ry = y >> 2;
    let level = 0;
    if (cat > boardCat) {
      if (cat >= 3) level = 4; // brelan, quinte, couleur… grâce à ses cartes
      else if (cat === 2) level = 3; // double paire
      else {
        const pair = (sc7 >> 12) & 15;
        level = pair >= top ? 2 : 1;
      }
    }
    let draw = false;
    if (nb < 5 && level < 3) {
      if ((suits[x & 3] + 1 + (((y & 3) === (x & 3)) ? 1 : 0)) === 4 || (suits[y & 3] + 1 + (((y & 3) === (x & 3)) ? 1 : 0)) === 4) draw = true;
      const all = smask | (1 << rx) | (1 << ry);
      const m = (all << 1) | ((all >> 12) & 1);
      const mb = (smask << 1) | ((smask >> 12) & 1);
      for (let lo = 1; lo <= 10 && !draw; lo++) { // 4 valeurs qui se suivent, ouvertes des deux côtés, avec une de mes cartes
        if (((m >> lo) & 15) === 15 && ((mb >> lo) & 15) !== 15 && lo + 4 <= 13) draw = true;
      }
    }
    return { level, draw, over: rx > top && ry > top };
  }

  /*
   * Tirage au sort des mains des adversaires, d'après leurs mains probables.
   * opps = [{ range, minus, mix, acts: [{ street: 1|2|3, kind: 'bet'|'raise'|'call', frac (taille / pot) }], bluff, loose }]
   *  - mix : part des fois où il joue n'importe quoi (main tirée au hasard) ;
   *  - bluff : part des mises faites sans rien (ni paire ni tirage), loose : part des fois où il suit sans rien.
   */
  const LEN = [0, 3, 4, 5]; // cartes du tableau à chaque tour
  function makeSampler(mineI, boardI, opps) {
    const n = opps.length;
    const dead = new Uint8Array(52);
    mineI.concat(boardI).forEach((c) => { dead[c] = 1; });
    const lists = opps.map((o) => (o.range ? combosOf(o.range, o.minus, dead) : null));
    const boardAt = LEN.map((l) => boardI.slice(0, l));
    const known = (st) => st >= 1 && st <= 3 && boardAt[st].length === LEN[st];
    const catAt = boardAt.map((b, st) => (known(st) ? score7(b) >> 20 : 0));
    const acts = opps.map((o) => (o.acts || []).filter((a) => known(a.street)));
    const used = new Uint8Array(52);
    const hands = new Array(n);
    const randCard = () => { let c; do { c = (Math.random() * 52) | 0; } while (used[c]); return c; };
    const accept = (k, x, y) => {
      for (const a of acts[k]) {
        const c = connect(x, y, boardAt[a.street], catAt[a.street]);
        let pr;
        const bf = opps[k].bluff * (a.frac == null ? 1 : a.frac > 0.8 ? 0.6 : a.frac < 0.4 ? 1.2 : 1) * [1, 1, 0.8, 0.7][a.street];
        if (a.kind === 'raise') pr = c.level >= 2 || c.draw ? 1 : c.level === 1 ? 0.3 : bf * 0.5;
        else if (a.kind === 'bet') pr = c.level >= 1 || c.draw ? 1 : bf;
        else pr = c.level >= 1 || c.draw || c.over ? 1 : opps[k].loose;
        if (pr < 1 && Math.random() >= pr) return false;
      }
      return true;
    };
    // Remplit hands[k] pour chaque adversaire ; false si impossible (cartes déjà toutes prises).
    function sample() {
      used.set(dead);
      for (let k = 0; k < n; k++) {
        let got = null, fallback = null;
        const L = lists[k];
        for (let t = 0; t < 60 && !got; t++) {
          let x, y;
          if (L && L.length && !(opps[k].mix && Math.random() < opps[k].mix)) {
            const pick = L[(Math.random() * L.length) | 0];
            x = pick[0]; y = pick[1];
            if (used[x] || used[y]) continue;
          } else {
            x = randCard(); used[x] = 1; y = randCard(); used[x] = 0;
          }
          if (!fallback) fallback = [x, y];
          if (accept(k, x, y)) got = [x, y];
        }
        got = got || fallback;
        if (!got) return false;
        used[got[0]] = used[got[1]] = 1;
        hands[k] = got;
      }
      return true;
    }
    return { sample, hands, used, randCard };
  }

  // Probabilité de gagner contre les mains probables de chaque adversaire.
  function equityVs(mine, board, opps, iters) {
    const n = opps.length;
    if (!n) return { win: 1, tie: 0, equity: 1 };
    iters = iters || (n <= 2 ? 3000 : 2000);
    const mineI = mine.map(toInt), boardI = board.map(toInt);
    const S = makeSampler(mineI, boardI, opps);
    const me = new Array(7), opp = new Array(7);
    const need = 5 - boardI.length;
    let win = 0, tie = 0, eq = 0, done = 0;
    for (let it = 0; it < iters; it++) {
      if (!S.sample()) continue;
      let m = 0;
      me[m++] = mineI[0]; me[m++] = mineI[1];
      for (let b = 0; b < boardI.length; b++) me[m++] = boardI[b];
      for (let b = 0; b < need; b++) { const c = S.randCard(); S.used[c] = 1; me[m++] = c; }
      const myScore = score7(me);
      let beaten = false, ties = 0;
      for (let k = 0; k < n; k++) {
        opp[0] = S.hands[k][0]; opp[1] = S.hands[k][1];
        for (let b = 2; b < 7; b++) opp[b] = me[b];
        const s2 = score7(opp);
        if (s2 > myScore) { beaten = true; break; }
        if (s2 === myScore) ties++;
      }
      done++;
      if (beaten) continue;
      if (ties === 0) { win++; eq += 1; } else { tie++; eq += 1 / (ties + 1); }
    }
    done = done || 1;
    return { win: win / done, tie: tie / done, equity: eq / done };
  }

  /* ------------------------------------------------------------ conseil après le flop */

  // Probabilité qu'un adversaire continue (suive ou relance) face à une mise, selon ce que ses cartes font avec le tableau.
  // sizeFrac : taille de la mise / pot ; vsRaise : face à une relance ; scale : réglage propre au joueur (calé sur son profil).
  /*
   * Réglages de l'algorithme. Valeurs trouvées par simulation (tests/tune.js) ; chaque calcul peut recevoir
   * d'autres réglages (ctx.tune) : c'est ce qui permet à la simulation de comparer deux versions à la même table.
   */
  const TUNE = {
    rOop: 0.9, // part de mes chances que j'arrive à jouer jusqu'au bout quand je parle en premier (flop, turn)
    sizes: [0.33, 0.66, 1, 1.5], // tailles de mise essayées (en part du pot) ; 1,5 fois le pot ajouté par la simulation
    betCap: 0.6, // une mise ne dépasse pas cette part de mon tapis (au-delà : tapis)
    aiBet: 4.9, // tapis possible si mon tapis ≤ aiBet × le pot (2,5 avant la simulation)
    raiseMult: 3, // relance = 3 fois la mise
    aiRaise: 2, // tapis possible face à une mise si ce qui reste ≤ aiRaise × le pot
    tol: 0.03, // à gain presque égal (en part du pot), on préfère l'action la plus simple
    commit: 0.35, // une mise qui engage cette part du tapis ou plus devient tapis, si ça rapporte presque autant (0,5 avant)
    mPair: 1, mDraw: 1, mAir: 1, sizeK: 0.9, rr: 1, // modèle de l'adversaire : paie avec une paire, un tirage, rien ; effet de la taille ; sur-relance
    openLate: 2.5, openEarly: 3, tbIP: 3, tbOOP: 3.5, // tailles avant le flop (en grosses blindes / en fois la relance)
    foldMarginal: true, // une relance « bluff » qui ne rapporte presque rien : couché
    pfPush: 12, pfCall: 20, // tableaux « tapis ou couché » calculés : jusqu'à 12 grosses blindes pour mettre tapis en premier (au-dessus, jouer
                            // normalement rapporte plus en simulation), jusqu'à 20 pour décider de payer un tapis
  };
  const tuneOf = (t) => (t ? Object.assign({}, TUNE, t) : TUNE);

  function continueProb(c, sizeFrac, vsRaise, scale, T) {
    T = T || TUNE;
    let p;
    if (c.level >= 4) return 0.98;
    if (c.level === 3) return clamp(0.95 * Math.min(1, 1.9 / (1 + 0.45 * sizeFrac)), 0.3, 0.95); // double paire : paie, sauf énorme mise
    // face à une relance, celui qui a misé lâche rarement une bonne paire (surtout entre amis)
    if (c.level === 2) p = (vsRaise ? 0.8 : 0.88) * T.mPair;
    else if (c.level === 1) p = (vsRaise ? 0.45 : 0.55) * T.mPair;
    else if (c.draw) p = (vsRaise ? 0.5 : 0.62) * T.mDraw;
    else if (c.over) p = (vsRaise ? 0.08 : 0.22) * T.mAir;
    else p = (vsRaise ? 0.03 : 0.08) * T.mAir;
    p *= (1 + T.sizeK * 0.5) / (1 + T.sizeK * sizeFrac); // plus la mise est grosse, moins les mains moyennes paient (×1 pour une demi-mise du pot)
    return clamp(1 - Math.pow(1 - clamp(p, 0, 0.98), scale), 0, 0.98); // scale > 1 : paie plus souvent ; < 1 : se couche plus
  }

  // Cale le réglage d'un joueur pour que sa part de « couché face à une mise » colle à ce qu'on a observé.
  function calibrate(foldTarget, cons, T) {
    if (foldTarget == null || !cons.length) return 1;
    let lo = 0.15, hi = 25;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      let f = 0;
      for (const c of cons) f += 1 - continueProb(c, 0.6, false, mid, T);
      // plus mid est grand, plus il paie : on cherche mid tel que sa part de couchés = foldTarget
      f /= cons.length;
      if (f > foldTarget) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /*
   * Conseil après le flop : on compare le gain moyen de chaque action possible.
   * ctx = { cards, board, pot (tout ce qui est au milieu, mises du tour comprises), toCall, myBet, myStack, cb (mise à suivre),
   *         minRaise (relance minimum, total), unit (plus petit jeton), inPos (je parle en dernier), handName,
   *         opps: [{ name, range, minus, mix, acts, bluff, loose, fold (couché face à une mise, ou null), allin, toCall }] }
   * Pour chaque tirage : mains des adversaires (selon leurs mains probables), cartes à venir, puis pour chaque action :
   * qui se couche, qui paie, et qui gagne à la fin. Les tours suivants ne sont pas simulés (un horizon d'un tour) :
   * on en tient compte par un coefficient quand je parle en premier.
   */
  function postflopAdvice(ctx, iters) {
    iters = iters || 1800;
    const T = tuneOf(ctx.tune);
    const mineI = ctx.cards.map(toInt), boardI = ctx.board.map(toInt);
    const opps = ctx.opps;
    const n = opps.length;
    const unit = ctx.unit || 1;
    const pot = ctx.pot, toCall = Math.min(ctx.toCall, ctx.myStack), stack = ctx.myStack;
    const river = boardI.length === 5;
    const R = river ? 1 : ctx.inPos ? 1 : T.rOop; // part de mes chances que j'arrive vraiment à jouer jusqu'au bout
    const rnd = (x) => Math.max(unit, Math.round(x / unit) * unit);
    const boardCat = score7(boardI) >> 20;

    // Actions possibles
    const opts = [];
    if (toCall === 0) {
      opts.push({ k: 'check' });
      const SIZE_LABEL = { 0.25: '1/4 du pot', 0.33: '1/3 du pot', 0.5: 'la moitié du pot', 0.66: '2/3 du pot', 0.75: '3/4 du pot', 1: 'le pot', 1.25: '1,25 fois le pot', 1.5: '1,5 fois le pot' };
      const seen = new Set();
      T.sizes.forEach((f) => {
        const amt = rnd(pot * f);
        if (seen.has(amt)) return;
        seen.add(amt);
        if (amt <= stack * T.betCap) opts.push({ k: 'bet', add: amt, to: amt, frac: amt / pot, label: SIZE_LABEL[f] || Math.round(f * 100) + ' % du pot' });
      });
      // tapis seulement quand il reste peu de jetons par rapport au pot (pas de sur-mise énorme)
      if (stack <= pot * T.aiBet) opts.push({ k: 'allin', add: stack, to: ctx.myBet + stack, frac: stack / pot });
    } else {
      opts.push({ k: 'fold' }, { k: 'call', add: toCall });
      if (stack > toCall) {
        const t = Math.max(ctx.minRaise || 0, rnd(ctx.cb * T.raiseMult));
        if (t - ctx.myBet < stack * 0.8) opts.push({ k: 'raise', add: t - ctx.myBet, to: t, frac: (t - ctx.cb) / (pot + toCall) });
        if (stack - toCall <= (pot + toCall) * T.aiRaise) opts.push({ k: 'allin', add: stack, to: ctx.myBet + stack, frac: (stack - toCall) / (pot + toCall) });
      }
    }
    opts.forEach((o) => { o.ev = 0; o.win = 0; o.called = 0; o.folds = 0; });

    const S = makeSampler(mineI, boardI, opps);
    // Réglage de chaque joueur : on le cale sur sa part observée de « couché face à une mise »
    const scales = opps.map((o, k) => {
      if (o.fold == null) return 1;
      const cons = [];
      for (let i = 0; i < 250; i++) {
        if (!S.sample()) break;
        cons.push(connect(S.hands[k][0], S.hands[k][1], boardI, boardCat));
      }
      return calibrate(o.fold, cons, T);
    });

    const me = new Array(7), opp = new Array(7);
    const need = 5 - boardI.length;
    const oppScore = new Array(n), cn = new Array(n);
    const myStrong = connect(mineI[0], mineI[1], boardI, boardCat).level >= 3; // assez fort pour payer une sur-relance
    let done = 0, eqAll = 0;
    // part du pot qui me revient entre moi et un groupe de joueurs (mask : qui va jusqu'au bout)
    const share = (myScore, inMask) => {
      let ties = 0;
      for (let k = 0; k < n; k++) {
        if (!inMask[k]) continue;
        if (oppScore[k] > myScore) return 0;
        if (oppScore[k] === myScore) ties++;
      }
      return 1 / (ties + 1);
    };
    const inMask = new Array(n);
    for (let it = 0; it < iters; it++) {
      if (!S.sample()) continue;
      let m = 0;
      me[m++] = mineI[0]; me[m++] = mineI[1];
      for (let b = 0; b < boardI.length; b++) me[m++] = boardI[b];
      for (let b = 0; b < need; b++) { const c = S.randCard(); S.used[c] = 1; me[m++] = c; }
      const myScore = score7(me);
      for (let k = 0; k < n; k++) {
        opp[0] = S.hands[k][0]; opp[1] = S.hands[k][1];
        for (let b = 2; b < 7; b++) opp[b] = me[b];
        oppScore[k] = score7(opp);
        cn[k] = connect(S.hands[k][0], S.hands[k][1], boardI, boardCat);
      }
      done++;
      for (let k = 0; k < n; k++) inMask[k] = true;
      const sAll = share(myScore, inMask);
      eqAll += sAll;
      for (const o of opts) {
        if (o.k === 'fold') continue;
        if (o.k === 'check') { o.ev += R * sAll * pot; o.win += sAll; continue; }
        if (o.k === 'call') {
          // celui qui a misé reste ; les autres paient ou non selon leurs cartes
          let extra = 0;
          for (let k = 0; k < n; k++) {
            const o2 = opps[k];
            const owes = o2.toCall || 0;
            inMask[k] = o2.allin || owes === 0 || Math.random() < continueProb(cn[k], owes / pot, false, scales[k], T);
            if (inMask[k]) extra += Math.min(owes, o2.stack == null ? owes : o2.stack);
          }
          const sh = share(myScore, inMask);
          const r = ctx.allinCall || toCall >= stack ? 1 : R;
          o.ev += r * sh * (pot + toCall + extra) - toCall;
          o.win += sh;
          continue;
        }
        // mise, relance ou tapis : chacun décide s'il continue, et une très grosse main peut sur-relancer
        let callers = 0, extra = 0, reraiser = -1;
        const vsRaise = toCall > 0;
        for (let k = 0; k < n; k++) {
          const o2 = opps[k];
          if (o2.allin) { inMask[k] = true; continue; }
          const p = continueProb(cn[k], o.frac, vsRaise || o.k === 'allin' && o.frac > 1.5, scales[k], T);
          inMask[k] = Math.random() < p;
          if (inMask[k]) {
            callers++;
            const owes = o.to - (o2.bet || 0);
            extra += Math.min(owes, o2.stack == null ? owes : o2.stack);
            if (o.k !== 'allin' && reraiser < 0) {
              const aggr = clamp((o2.bluff || 0.3) / 0.3, 0.5, 2);
              const rr = (cn[k].level >= 3 ? (vsRaise ? 0.5 : 0.35) * aggr : cn[k].level === 2 && vsRaise ? 0.08 * aggr : 0) * T.rr;
              if (rr && Math.random() < rr) reraiser = k;
            }
          }
        }
        if (reraiser >= 0) {
          // on me sur-relance : je paie le tapis avec une très grosse main, sinon je lâche ce que j'ai mis
          if (myStrong) {
            const o2 = opps[reraiser];
            const eff = Math.min(stack, o2.stack == null ? stack : o2.stack + (o2.bet || 0) - ctx.myBet);
            for (let k = 0; k < n; k++) inMask[k] = k === reraiser;
            const sh = share(myScore, inMask);
            o.ev += sh * (pot + 2 * eff) - eff;
            o.called++; o.win += sh;
          } else o.ev -= o.add;
          continue;
        }
        let any = callers > 0;
        for (let k = 0; k < n; k++) if (opps[k].allin) any = true;
        if (!any) { o.ev += pot; o.folds++; continue; }
        const sh = share(myScore, inMask);
        const r = o.k === 'allin' ? 1 : R;
        o.ev += r * sh * (pot + o.add + extra) - o.add;
        if (callers) { o.called++; o.win += sh; }
      }
    }
    done = done || 1;
    opts.forEach((o) => {
      o.ev = o.k === 'fold' ? 0 : o.ev / done;
      o.foldProb = o.folds / done;
      o.eqCalled = o.called ? o.win / o.called : null;
      if (o.k === 'check' || o.k === 'call') o.eqCalled = o.win / done;
    });
    const eq = eqAll / done;
    const best = opts.slice().sort((a, b) => b.ev - a.ev);
    // À gain presque égal (moins de 3 % du pot d'écart avec le meilleur), on préfère l'action la plus simple et la moins risquée.
    const top = best[0].ev, tol = Math.max(1, pot * T.tol);
    const order = ['check', 'call', 'bet', 'raise', 'allin', 'fold'];
    let pick = best[0];
    for (const o of best.slice(1)) {
      if (top - o.ev <= tol && (order.indexOf(o.k) < order.indexOf(pick.k) || (o.k === pick.k && o.add < pick.add))) pick = o;
    }
    // Une mise qui engage la moitié de ton tapis ou plus : autant mettre tapis, si ça rapporte presque autant
    // (garder un petit reste ne sert à rien : tu ne pourras plus te coucher, et l'adversaire voit que tu es engagé).
    // Une relance « bluff » (peu de chances quand on paie) qui ne rapporte presque rien : on se couche plutôt
    // (le calcul est approché : ce n'est pas la peine de risquer gros pour un gain quasi nul).
    if (T.foldMarginal && toCall > 0 && (pick.k === 'raise' || pick.k === 'allin') && pick.ev <= tol && (pick.eqCalled == null || pick.eqCalled < 0.5)) {
      const fo = opts.find((o) => o.k === 'fold'), ca = opts.find((o) => o.k === 'call');
      pick = ca && ca.ev > 0 ? ca : fo;
    }
    const ai = opts.find((o) => o.k === 'allin');
    if (ai && (pick.k === 'bet' || pick.k === 'raise') && pick.add >= stack * T.commit && top - ai.ev <= tol * 2) pick = ai;
    return describePostflop(pick, opts, { ctx, eq, pot, toCall, stack, river });
  }

  const pctx = (x) => Math.round(x * 100);
  const names = (list) => (list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1]);

  // Texte du conseil : l'action, sa raison courte, et l'explication en clair.
  function describePostflop(o, opts, info) {
    const { ctx, eq, pot, toCall } = info;
    const who = names(ctx.opps.map((x) => x.name).filter(Boolean)) || "l'adversaire";
    const hand = ctx.handName ? ctx.handName.toLowerCase() : 'ta main';
    const evOf = (k) => opts.filter((x) => x.k === k).sort((a, b) => b.ev - a.ev)[0];
    const fmt = (v) => (v >= 0 ? '+' : '') + Math.round(v);
    const alt = opts.filter((x) => x !== o).sort((a, b) => b.ev - a.ev)[0];
    const label = (x) => ({ check: 'check', fold: 'couché', call: 'suivre', bet: 'mise ' + x.add, raise: 'relance à ' + x.to, allin: 'tapis' })[x.k];
    const gains = `Gain moyen estimé : ${label(o)} ${fmt(o.ev)}${alt ? ', ' + label(alt) + ' ' + fmt(alt.ev) : ''} (en jetons, par rapport à se coucher).`;
    const need = toCall > 0 ? toCall / (pot + toCall) : 0;
    const res = { action: o.k, to: o.to, ev: o.ev, eq, foldProb: o.foldProb, eqCalled: o.eqCalled, gains, close: alt ? o.ev - alt.ev <= Math.max(ctx.unit || 1, pot * 0.04) : false };
    const strong = o.eqCalled != null && o.eqCalled >= 0.55;
    const draw = /tirage/i.test(ctx.handName || '');
    if (o.k === 'check') {
      res.text = 'Check';
      res.why = `${hand} : miser ne rapporte pas plus que checker`;
      res.plain = eq >= 0.5
        ? `Tu as souvent la meilleure main, mais si tu mises, ${who} ne paiera presque qu'avec mieux et se couchera avec moins bien. Check : tu gardes tes chances et tu vois la suite gratuitement.`
        : `Ta main n'est pas assez forte pour miser, et ${who} ne se couchera pas assez souvent pour qu'un bluff rapporte. Check : tu vois la suite gratuitement.`;
    } else if (o.k === 'fold') {
      res.text = 'Couche-toi';
      res.why = `il faut ${pctx(need)} %, tu gagnes ≈ ${pctx(eq)} % contre ses mains probables`;
      res.plain = `Pour suivre ${toCall}, il faudrait gagner au moins ${pctx(need)} fois sur 100, et contre les mains probables de ${who}, tu gagnes environ ${pctx(eq)} fois sur 100. Une relance ne le ferait pas assez coucher. Couche-toi.`;
    } else if (o.k === 'call') {
      res.text = 'Suis ' + toCall;
      res.why = `il faut ${pctx(need)} %, tu gagnes ≈ ${pctx(eq)} %`;
      res.plain = `Il faut gagner ${pctx(need)} fois sur 100 pour que suivre soit rentable, et tu gagnes environ ${pctx(eq)} fois sur 100 contre les mains probables de ${who}.`
        + (eq >= 0.6 ? " Relancer ne rapporterait pas plus : les mains moins bonnes se coucheraient." : draw ? ' Ton tirage peut encore rentrer.' : '');
    } else {
      const amount = o.k === 'allin' ? 'Tapis' : o.k === 'raise' ? 'Relance à ' + o.to : 'Mise ' + o.add + (o.label ? ` (${o.label})` : '');
      res.text = amount;
      const fp = pctx(o.foldProb);
      if (strong) {
        res.why = `${hand} : souvent devant quand on te paie (${pctx(o.eqCalled)} %)`;
        res.plain = `Tu as probablement la meilleure main. ${o.k === 'raise' ? 'Relance' : o.k === 'allin' ? 'Mets tapis' : 'Mise'} pour te faire payer par des mains moins bonnes : quand ${who} paie, tu gagnes encore environ ${pctx(o.eqCalled)} fois sur 100.`
          + (o.label ? ` La taille « ${o.label} » est celle qui rapporte le plus ici.` : '');
      } else {
        // pas (encore) la meilleure main : on mise ou relance surtout pour faire coucher
        const verb = o.k === 'raise' ? 'relancer' : o.k === 'allin' ? 'mettre tapis' : 'miser';
        const than = alt ? ({ check: 'checker', call: 'suivre', fold: 'te coucher', bet: 'miser moins', raise: 'relancer', allin: 'mettre tapis' })[alt.k] : '';
        const chances = eq < 0.25 ? 'ta main gagne rarement si on va au bout' : `ta main a des chances (environ ${pctx(eq)} fois sur 100), mais elle n'est souvent pas la meilleure`;
        if (draw && fp >= 25) {
          res.why = `semi-bluff : ${fp} % de chances qu'ils se couchent, et ton tirage peut rentrer`;
          res.plain = `Semi-bluff : tu n'as pas encore de grosse main, mais ${who} se couchera environ ${fp} fois sur 100, et s'il paie, ton tirage peut encore rentrer. En moyenne, ${verb} rapporte plus que ${than}.`;
        } else if (fp >= 35 || (o.eqCalled || 0) < 0.4) {
          res.why = `bluff : ils se couchent ≈ ${fp} % du temps`;
          res.plain = `${o.k === 'raise' ? 'Relance' : 'Mise'} pour faire coucher : ${chances}, et ${who} se couchera environ ${fp} fois sur 100 face à ${o.k === 'raise' ? 'une relance' : 'cette mise'}. En moyenne, ${verb} rapporte plus que ${than}.`;
        } else {
          res.why = `mise de protection : ${fp} % de couchés, ${pctx(o.eqCalled || 0)} % quand on paie`;
          res.plain = `Ta main est correcte mais fragile : en misant, tu fais coucher les mains qui pourraient te dépasser à la carte suivante (${fp} fois sur 100), et tu gagnes encore souvent quand on te paie.`;
        }
      }
    }
    return res;
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

  // Rang d'une main de départ : part des mains qui sont au moins aussi fortes (0 = AA, 1 = 32o).
  const RANK_PCT = (() => {
    const m = {};
    let n = 0;
    HAND_RANK.forEach((c) => { m[c] = (n + combosIn(c) / 2) / 1326; n += combosIn(c); });
    return m;
  })();
  const rankPct = (cls) => RANK_PCT[cls];

  const api = { TUNE, PUSHFOLD, pfSet, behindOf, score7, equity, equityVs, postflopAdvice, continueProb, rankPct, makeSampler, playerRange, topRange, connect, HAND_RANK, potOdds, handClass, parseRange, RANGES, openRangeKey, preflopAdvice, grid, pct, toInt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerOdds = api;
})(typeof window !== 'undefined' ? window : globalThis);
