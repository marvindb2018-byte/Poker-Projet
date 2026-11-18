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
    // why : la raison courte (pour qui connaît le jargon) ; plain : la même chose en clair, pour un débutant
    const R = (to, why, plain) => ({ action: 'raise', to: round5(to, unit), text: 'Relance à ' + round5(to, unit), why, plain });
    const allin = (why, plain) => ({ action: 'allin', text: 'Tapis', why, plain });
    const call = (why, plain) => ({ action: 'call', text: 'Suis', why, plain });
    const fold = (why, plain) => ({ action: 'fold', text: 'Couche-toi', why, plain });
    const check = (why, plain) => ({ action: 'check', text: 'Check', why, plain });

    // On m'a sur-relancé après ma relance
    if (ctx.iRaised) {
      const p0 = "Quelqu'un a relancé par-dessus ta relance";
      if (has(RANGES.vs3bet.raise)) {
        const p = p0 + ', mais ta main est la meilleure (ou presque) : remets-en une couche, tu as toutes les chances d\'être devant.';
        return stackBB <= 40 ? allin(hc + ' : main la plus forte, tapis', p) : R(ctx.cb * 2.3, hc + ' : on sur-relance encore', p);
      }
      if (has(RANGES.vs3bet.call)) return call(hc + ' : assez forte pour payer la sur-relance', p0 + '. Ta main est assez bonne pour payer et voir le flop, mais pas pour relancer encore.');
      return fold(hc + ' : pas assez forte face à une sur-relance', p0 + " : en général, ça veut dire une très grosse main. La tienne n'est pas assez forte : abandonne ce que tu as déjà misé, plutôt que d'en perdre plus.");
    }
    // Tapis court : tapis ou couché
    if (stackBB <= 12) {
      const key = openRangeKey(ctx.pos, ctx.n) || 'SB';
      const pushOk = ctx.raises === 0 ? has(RANGES.open[key]) || has(RANGES.call) : has(RANGES.threeBet) || has(parseRange('TT+, AQs+, AQo+'));
      const nb = Math.round(stackBB);
      if (pushOk) return allin(`tapis court (${nb} grosses blindes) : tapis avec ${hc}`, `Il te reste peu de jetons (${nb} fois la grosse blinde). Dans ce cas, on ne fait pas de petite mise : on met tout avec une bonne main, ce qui oblige les autres à risquer gros pour te suivre.`);
      if (ctx.pos === 'BB' && ctx.raises === 0) return check('tapis court : check gratuit', "Il te reste peu de jetons, mais personne n'a relancé : regarde le flop sans rien payer de plus.");
      return fold(`tapis court (${nb} grosses blindes) : ${hc} est trop faible`, `Il te reste peu de jetons (${nb} fois la grosse blinde) : garde-les pour une meilleure main, sur laquelle tu pourras tout miser.`);
    }
    // Personne n'a relancé
    if (ctx.raises === 0) {
      if (ctx.pos === 'BB') {
        if (has(parseRange('TT+, AQs+, AKo'))) return R(bb * (3 + ctx.limpers), hc + ' : main forte, relance même en grosse blinde', "Personne n'a relancé et ta main est très forte : relance, pour que le pot soit plus gros quand tu gagnes.");
        return check('personne n\'a relancé : check gratuit', "Tu as déjà payé la grosse blinde et personne n'a relancé : tu vois le flop sans rien payer de plus.");
      }
      const key = openRangeKey(ctx.pos, ctx.n);
      const range = RANGES.open[key];
      if (has(range)) {
        const size = (late ? 2.5 : 3) + ctx.limpers;
        return R(bb * size, `${hc} fait partie des mains à relancer depuis ${ctx.pos} (${pct(range)} % des mains)`,
          "Personne n'a encore relancé et ta main est assez bonne pour ta place. Relance plutôt que de juste suivre : soit tout le monde se couche et tu gagnes les blindes tout de suite, soit tu joues la suite avec l'avantage."
          + (ctx.limpers ? ' La relance est un peu plus grosse parce que des joueurs ont déjà suivi.' : ''));
      }
      const early = !late && ctx.pos !== 'SB';
      return fold(`${hc} ne fait pas partie des mains à jouer depuis ${ctx.pos}`,
        "Ta main n'est pas assez bonne pour ta place" + (early ? " : beaucoup de joueurs parlent encore après toi, et l'un d'eux aura souvent mieux" : '') + '. '
        + (ctx.pos === 'SB' ? 'Te coucher ne te coûte que la petite blinde déjà posée.' : 'Te coucher ne te coûte rien.'));
    }
    // Une relance avant moi. Si on connaît le relanceur : on s'adapte à sa façon de jouer.
    if (ctx.raises === 1) {
      const big = ctx.cb > bb * 4.5;
      const r = ctx.raiser; // { name, pfr } si on le connaît assez
      const loose = r && r.pfr >= 0.25, tight = r && r.pfr < 0.08;
      const who = r ? r.name + ' relance ' + Math.round(r.pfr * 100) + ' % de ses mains' : '';
      const rare = r ? `${r.name} relance très rarement : quand il le fait, il a souvent une très bonne main.` : '';
      const threeBet = loose ? parseRange('TT+, AQs+, AKo, AQo') : tight ? parseRange('KK+') : RANGES.threeBet;
      if (has(threeBet)) {
        return R(ctx.cb * (late ? 3 : 3.5), hc + (loose ? ` : forte, et ${who} (souvent sans grosse main) : sur-relance` : ' : main premium, sur-relance'),
          loose ? `Ta main est bonne, et ${r.name} relance très souvent, même avec des mains faibles. Tu as donc souvent mieux que lui : relance par-dessus sa relance.`
            : "Quelqu'un a relancé, mais ta main est l'une des toutes meilleures : relance par-dessus sa relance pour faire grossir le pot.");
      }
      if (tight) {
        if (has(parseRange('TT+, AQs+, AKo, AQo'))) return call(`${hc} : ${who}, c'est peu : sa relance est sérieuse, suis seulement`, rare + ' Ta main est assez bonne pour payer et voir le flop, mais pas pour relancer.');
        return fold(`${hc} : ${who}, c'est peu : sa relance est sérieuse`, rare + ' La tienne ne suffit pas : couche-toi.');
      }
      if (big && !loose) {
        const p0 = 'La relance est grosse, ce qui montre souvent une bonne main.';
        return has(RANGES.vsBig) ? call(hc + ' : assez forte pour payer une grosse relance', p0 + ' La tienne est assez forte pour payer.')
          : fold(hc + ' : trop faible face à une grosse relance', p0 + " La tienne n'est pas assez forte pour payer aussi cher.");
      }
      const range = ctx.pos === 'BB' || loose ? RANGES.callBB : RANGES.call;
      if (has(range)) {
        return call(`${hc} : assez bonne pour payer ${loose ? `(${who} : sa relance est souvent faible)` : 'une relance'}${ctx.pos === 'BB' ? ' depuis la grosse blinde' : ''}`,
          "Quelqu'un a relancé. Ta main est assez bonne pour payer et voir le flop, mais pas assez pour relancer par-dessus."
          + (loose ? ` En plus, ${r.name} relance souvent avec des mains faibles.` : '')
          + (ctx.pos === 'BB' ? ' Comme tu as déjà mis la grosse blinde, suivre te coûte moins cher.' : ''));
      }
      return fold(hc + ' : trop faible face à une relance', "Quelqu'un a relancé : il a probablement une bonne main. La tienne n'est pas assez forte pour continuer : couche-toi.");
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
  // 3 double paire ou mieux ; draw = tirage couleur ou quinte ouverte ; over = deux cartes plus hautes que le tableau.
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
      if (cat >= 2) level = 3;
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
   * Probabilité de gagner contre les mains probables de chaque adversaire.
   * opps = [{ range, minus, acts: [{ street: 1|2|3, kind: 'bet'|'raise'|'call' }], bluff, loose }]
   *  - bluff : part des mises faites sans rien (tirage ou paire), loose : part des fois où il suit sans rien.
   */
  function equityVs(mine, board, opps, iters) {
    const n = opps.length;
    if (!n) return { win: 1, tie: 0, equity: 1 };
    iters = iters || (n <= 2 ? 3000 : 2000);
    const mineI = mine.map(toInt), boardI = board.map(toInt);
    const dead = new Uint8Array(52);
    mineI.concat(boardI).forEach((c) => { dead[c] = 1; });
    const lists = opps.map((o) => (o.range ? combosOf(o.range, o.minus, dead) : null));
    const LEN = [0, 3, 4, 5]; // cartes du tableau à chaque tour
    const boardAt = LEN.map((l) => boardI.slice(0, l));
    const known = (st) => st >= 1 && st <= 3 && boardAt[st].length === LEN[st];
    const catAt = boardAt.map((b, st) => (known(st) ? score7(b) >> 20 : 0));
    const acts = opps.map((o) => (o.acts || []).filter((a) => known(a.street)));
    const used = new Uint8Array(52);
    const hands = new Array(n);
    const me = new Array(7), opp = new Array(7);
    const need = 5 - boardI.length;
    let win = 0, tie = 0, eq = 0, done = 0;
    const randCard = () => { let c; do { c = (Math.random() * 52) | 0; } while (used[c]); return c; };
    const accept = (k, x, y) => {
      for (const a of acts[k]) {
        const c = connect(x, y, boardAt[a.street], catAt[a.street]);
        let p;
        if (a.kind === 'raise') p = c.level >= 2 || c.draw ? 1 : c.level === 1 ? 0.3 : opps[k].bluff * 0.5;
        else if (a.kind === 'bet') p = c.level >= 1 || c.draw ? 1 : opps[k].bluff;
        else p = c.level >= 1 || c.draw || c.over ? 1 : opps[k].loose;
        if (p < 1 && Math.random() >= p) return false;
      }
      return true;
    };
    for (let it = 0; it < iters; it++) {
      used.set(dead);
      let okAll = true;
      for (let k = 0; k < n && okAll; k++) {
        let got = null, fallback = null;
        for (let t = 0; t < 60 && !got; t++) {
          let x, y;
          if (lists[k]) {
            const L = lists[k];
            if (!L.length) break;
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
        if (!got) { okAll = false; break; }
        used[got[0]] = used[got[1]] = 1;
        hands[k] = got;
      }
      if (!okAll) continue;
      let m = 0;
      me[m++] = mineI[0]; me[m++] = mineI[1];
      for (let b = 0; b < boardI.length; b++) me[m++] = boardI[b];
      for (let b = 0; b < need; b++) { const c = randCard(); used[c] = 1; me[m++] = c; }
      const myScore = score7(me);
      let beaten = false, ties = 0;
      for (let k = 0; k < n; k++) {
        opp[0] = hands[k][0]; opp[1] = hands[k][1];
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

  const api = { score7, equity, equityVs, playerRange, topRange, connect, HAND_RANK, potOdds, handClass, parseRange, RANGES, openRangeKey, preflopAdvice, grid, pct, toInt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerOdds = api;
})(typeof window !== 'undefined' ? window : globalThis);
