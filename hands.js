/*
 * Poker → Claude : combinaisons du poker.
 * - CATEGORIES : la liste des combinaisons (de la plus faible à la plus forte), avec un exemple.
 * - evaluate(cartes) : la meilleure combinaison possible avec 2 à 7 cartes.
 * - describe(mesCartes, tableau) : ma combinaison actuelle + les tirages (couleur, quinte).
 * Cartes au format de l'appli : rang (A K Q J T 9…2) + couleur (p c k t). Ex : 'Ac' = As de cœur.
 */
(function (root) {
  'use strict';

  const VAL = { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };
  const SUIT_SYM = { p: '♠', c: '♥', k: '♦', t: '♣' };
  const ONE = { 14: 'As', 13: 'Roi', 12: 'Dame', 11: 'Valet' };
  const MANY = { 14: 'As', 13: 'Rois', 12: 'Dames', 11: 'Valets' };
  const AT = { 14: "à l'As", 13: 'au Roi', 12: 'à la Dame', 11: 'au Valet' };

  const one = (v) => ONE[v] || String(v);
  const many = (v) => MANY[v] || String(v);
  const of = (v) => (v === 14 ? "d'As" : 'de ' + many(v)); // « Paire de Rois », « Paire d'As »
  const at = (v) => AT[v] || 'au ' + v; // « Quinte au 9 », « Couleur à la Dame »

  const CATEGORIES = [
    { id: 0, name: 'Carte haute', desc: "Aucune combinaison : c'est la plus haute carte qui compte.", ex: ['Ap', 'Jc', '8k', '5t', '3p'] },
    { id: 1, name: 'Paire', desc: '2 cartes de même valeur.', ex: ['Ap', 'Ac'] },
    { id: 2, name: 'Double paire', desc: '2 paires différentes.', ex: ['Jp', 'Jk', '4c', '4t'] },
    { id: 3, name: 'Brelan', desc: '3 cartes de même valeur.', ex: ['7p', '7c', '7k'] },
    { id: 4, name: 'Quinte (suite)', desc: '5 valeurs qui se suivent, couleurs mélangées. A-2-3-4-5 compte aussi.', ex: ['Tc', '9p', '8k', '7t', '6c'] },
    { id: 5, name: 'Couleur', desc: '5 cartes de la même couleur.', ex: ['Ac', 'Jc', '8c', '4c', '2c'] },
    { id: 6, name: 'Full', desc: 'Un brelan + une paire.', ex: ['Qp', 'Qc', 'Qk', '7t', '7p'] },
    { id: 7, name: 'Carré', desc: '4 cartes de même valeur.', ex: ['Kp', 'Kc', 'Kk', 'Kt'] },
    { id: 8, name: 'Quinte flush', desc: 'Une suite de 5 cartes de la même couleur.', ex: ['9p', '8p', '7p', '6p', '5p'] },
    { id: 9, name: 'Quinte flush royale', desc: 'As, Roi, Dame, Valet, 10 de la même couleur.', ex: ['Ak', 'Kk', 'Qk', 'Jk', 'Tk'] },
  ];

  // Plus haute carte d'une suite de 5 dans un ensemble de valeurs (0 s'il n'y en a pas).
  function straightTop(vals) {
    const s = new Set(vals);
    if (s.has(14)) s.add(1); // l'As compte aussi comme 1
    for (let top = 14; top >= 5; top--) {
      let ok = true;
      for (let k = 0; k < 5 && ok; k++) ok = s.has(top - k);
      if (ok) return top;
    }
    return 0;
  }

  // Meilleure combinaison avec 2 à 7 cartes.
  // Renvoie { cat, name, main, kick } : main = les cartes qui forment la combinaison, kick = les cartes
  // d'appoint (« kickers ») qui complètent les 5 meilleures cartes.
  function evaluate(cards) {
    if (!cards || !cards.length) return null;
    const list = cards.map((c) => ({ c, v: VAL[c[0]], s: c[1] })).sort((a, b) => b.v - a.v);
    const vals = list.map((x) => x.v);
    const byV = {};
    list.forEach((x) => { (byV[x.v] = byV[x.v] || []).push(x); });
    const bySuit = {};
    list.forEach((x) => { (bySuit[x.s] = bySuit[x.s] || []).push(x); });
    const byValue = Object.keys(byV).map(Number).sort((a, b) => b - a);
    const quads = byValue.filter((v) => byV[v].length === 4);
    const trips = byValue.filter((v) => byV[v].length === 3);
    const pairs = byValue.filter((v) => byV[v].length === 2);
    const flush = Object.keys(bySuit).find((s) => bySuit[s].length >= 5);
    const done = (cat, name, main) => {
      const rest = list.filter((x) => !main.includes(x));
      return { cat, name, main: main.map((x) => x.c), kick: rest.slice(0, Math.max(0, 5 - main.length)).map((x) => x.c) };
    };
    const straightCards = (pool, top) => {
      const out = [];
      for (let k = 0; k < 5; k++) {
        const want = top - k === 1 ? 14 : top - k; // l'As compte comme 1 dans A-2-3-4-5
        out.push(pool.find((x) => x.v === want && !out.includes(x)));
      }
      return out;
    };

    if (flush) {
      const t = straightTop(bySuit[flush].map((x) => x.v));
      if (t === 14) return done(9, 'Quinte flush royale', straightCards(bySuit[flush], t));
      if (t) return done(8, 'Quinte flush ' + at(t), straightCards(bySuit[flush], t));
    }
    if (quads.length) return done(7, 'Carré ' + of(quads[0]), byV[quads[0]]);
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const pair = Math.max(trips[1] || 0, pairs[0] || 0);
      return done(6, 'Full aux ' + many(trips[0]) + ' par les ' + many(pair), byV[trips[0]].concat(byV[pair].slice(0, 2)));
    }
    if (flush) return done(5, 'Couleur ' + at(bySuit[flush][0].v) + ' ' + SUIT_SYM[flush], bySuit[flush].slice(0, 5));
    const st = straightTop(vals);
    if (st) return done(4, 'Quinte ' + at(st), straightCards(list, st));
    if (trips.length) return done(3, 'Brelan ' + of(trips[0]), byV[trips[0]]);
    if (pairs.length >= 2) return done(2, 'Double paire ' + many(pairs[0]) + ' et ' + many(pairs[1]), byV[pairs[0]].concat(byV[pairs[1]]));
    if (pairs.length) return done(1, 'Paire ' + of(pairs[0]), byV[pairs[0]]);
    return done(0, 'Hauteur ' + one(byValue[0]), [list[0]]);
  }

  function describe(mine, board) {
    if (!mine || mine.length < 2) return null;
    board = board || [];
    const all = mine.concat(board);
    const best = evaluate(all);
    const out = { best, note: null, shared: false, draws: [], flushDraw: null, straightOuts: [] };
    if (board.length === 0) {
      out.note = mine[0][1] === mine[1][1] ? 'Cartes assorties (même couleur)' : 'Cartes dépareillées';
    }
    if (board.length >= 3) {
      const b = evaluate(board);
      out.shared = !!b && b.name === best.name; // la combinaison est entièrement sur le tableau
    }
    if (board.length === 3 || board.length === 4) {
      if (best.cat < 5) {
        const bySuit = {};
        all.forEach((c) => { bySuit[c[1]] = (bySuit[c[1]] || 0) + 1; });
        Object.keys(bySuit).forEach((s) => {
          if (bySuit[s] === 4) {
            out.flushDraw = SUIT_SYM[s];
            out.draws.push('Tirage couleur : encore un ' + SUIT_SYM[s] + ' et tu as la couleur.');
          }
        });
      }
      if (best.cat < 4) {
        const have = new Set(all.map((c) => VAL[c[0]]));
        const outs = [];
        for (let v = 14; v >= 2; v--) {
          if (have.has(v)) continue;
          const s2 = new Set(have);
          s2.add(v);
          if (straightTop(s2)) outs.push(one(v));
        }
        out.straightOuts = outs;
        if (outs.length) out.draws.push('Tirage quinte : un ' + outs.join(' ou un ') + ' te donne la quinte.');
      }
    }
    return out;
  }

  function shortText(d) {
    if (!d) return '';
    const parts = [d.best.name.charAt(0).toLowerCase() + d.best.name.slice(1)];
    if (d.shared && d.best.cat > 0) parts[0] += ' (sur le tableau : tout le monde l\'a)';
    if (d.flushDraw) parts.push('tirage couleur ' + d.flushDraw);
    if (d.straightOuts.length) parts.push('tirage quinte (un ' + d.straightOuts.join(' ou un ') + ')');
    return parts.join(' · ');
  }

  const api = { CATEGORIES, evaluate, describe, shortText, straightTop };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerHands = api;
})(typeof window !== 'undefined' ? window : globalThis);
