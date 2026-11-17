/*
 * Poker → Claude : moteur de la partie.
 * Aucune dépendance : fonctionne dans le navigateur (window.PokerEngine) et dans Node (require).
 *
 * Toutes les fonctions qui modifient l'état valident d'abord, puis renvoient { ok: true } ou { ok: false, err }.
 */
(function (root) {
  'use strict';

  const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const SUITS = ['p', 'c', 'k', 't']; // pique, cœur, carreau, trèfle
  const STREET_NAMES = ['Préflop', 'Flop', 'Turn', 'River'];
  const MAX_PLAYERS = 10;

  // Positions dans l'ordre de parole préflop, selon le nombre de joueurs servis.
  const POSITIONS = {
    2: ['BTN', 'BB'],
    3: ['BTN', 'SB', 'BB'],
    4: ['UTG', 'BTN', 'SB', 'BB'],
    5: ['UTG', 'CO', 'BTN', 'SB', 'BB'],
    6: ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'],
    7: ['UTG', 'UTG+1', 'MP', 'CO', 'BTN', 'SB', 'BB'],
    8: ['UTG', 'UTG+1', 'MP', 'MP+1', 'CO', 'BTN', 'SB', 'BB'],
    9: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'CO', 'BTN', 'SB', 'BB'],
    10: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'MP+2', 'CO', 'BTN', 'SB', 'BB'],
  };

  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const fail = (err) => ({ ok: false, err });
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const isActive = (p) => p.stack > 0 && !p.paused;
  const isCard = (c) => typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);
  const getPlayer = (state, id) => state.players.find((p) => p.id === id);

  function toInt(v, def) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
  }

  /* ------------------------------------------------------------------ partie */

  function defaultSettings() {
    return { sb: 10, bb: 20 };
  }

  // cfg = { names: [...], stacks: [...] (jetons de chaque joueur), sb, bb, meIndex, btnIndex }
  // cfg.stack sert de valeur par défaut si un tapis manque (utile pour les tests).
  function newGame(cfg) {
    const names = (cfg.names || []).slice(0, MAX_PLAYERS);
    if (names.length < 2) return null;
    const fallback = toInt(cfg.stack, 0);
    const settings = defaultSettings();
    settings.sb = toInt(cfg.sb, 10) || 10;
    settings.bb = toInt(cfg.bb, 20) || 20;
    const meIndex = cfg.meIndex | 0;
    const players = names.map((name, i) => ({
      id: uid(),
      name: String(name || '').trim() || 'Joueur ' + (i + 1),
      stack: toInt(cfg.stacks && cfg.stacks[i], fallback) || fallback,
      me: i === meIndex,
      paused: false,
    }));
    const btn = players[Math.min(Math.max(0, cfg.btnIndex | 0), players.length - 1)];
    const state = {
      v: 1,
      settings,
      players,
      btnId: null, // bouton de la dernière main jouée
      nextBtnId: btn.id, // bouton imposé pour la prochaine main
      handNo: 0,
      hand: null,
      last: null,
      told: null, // ce que Claude sait de la table (nombre de joueurs, blindes)
      promptCopied: false,
    };
    markConversationStart(state);
    state.promptCopied = false;
    return state;
  }

  // Appelé quand le prompt de départ est copié : Claude repart de la table telle qu'elle est décrite dans le prompt.
  function markConversationStart(state) {
    const n = state.players.filter(isActive).length;
    state.told = { n, sb: state.settings.sb, bb: state.settings.bb };
    state.promptCopied = true;
  }

  function updateSettings(state, patch) {
    const S = state.settings;
    const next = Object.assign({}, S);
    for (const k of ['sb', 'bb']) {
      if (patch[k] != null) {
        const v = toInt(patch[k], NaN);
        if (!(v > 0)) return fail('Valeur invalide pour ' + k + '.');
        next[k] = v;
      }
    }
    if (next.sb > next.bb) return fail('La petite blinde doit être inférieure ou égale à la grosse.');
    state.settings = next;
    return ok();
  }

  /* ---------------------------------------------------------------- joueurs */

  function needNoHand(state) {
    return state.hand ? fail('Termine (ou abandonne) la main en cours avant de modifier la table.') : null;
  }

  function addPlayer(state, d) {
    const blocked = needNoHand(state);
    if (blocked) return blocked;
    const P = state.players;
    if (P.length >= MAX_PLAYERS) return fail(MAX_PLAYERS + ' joueurs maximum.');
    const stack = toInt(d.stack, NaN);
    if (!(stack > 0)) return fail('Indique le nombre de jetons du nouveau joueur.');
    let i = d.afterId ? P.findIndex((p) => p.id === d.afterId) : P.length - 1;
    if (i < 0) i = P.length - 1;
    const p = { id: uid(), name: String(d.name || '').trim() || 'Joueur ' + (P.length + 1), stack, me: false, paused: false };
    P.splice(i + 1, 0, p);
    return ok({ id: p.id });
  }

  function removePlayer(state, id) {
    const blocked = needNoHand(state);
    if (blocked) return blocked;
    const P = state.players;
    const i = P.findIndex((p) => p.id === id);
    if (i < 0) return fail('Joueur introuvable.');
    // Si le bouton part, on le recule d'une place pour qu'il arrive au joueur suivant à la prochaine main.
    if (state.btnId === id) state.btnId = P.length > 1 ? P[(i - 1 + P.length) % P.length].id : null;
    if (state.nextBtnId === id) state.nextBtnId = null;
    P.splice(i, 1);
    if (state.btnId === id) state.btnId = null;
    return ok();
  }

  function updatePlayer(state, id, d) {
    const p = getPlayer(state, id);
    if (!p) return fail('Joueur introuvable.');
    if (d.stack != null && String(d.stack) !== String(p.stack)) {
      const blocked = needNoHand(state);
      if (blocked) return blocked;
      const s = toInt(d.stack, NaN);
      if (!(s >= 0)) return fail('Tapis invalide.');
      p.stack = s;
    }
    if (d.name != null) {
      p.name = String(d.name).trim() || p.name;
      if (state.hand && state.hand.names[id] != null) state.hand.names[id] = p.name;
    }
    return ok();
  }

  function setButtonNext(state, id) {
    const blocked = needNoHand(state);
    if (blocked) return blocked;
    const p = getPlayer(state, id);
    if (!p) return fail('Joueur introuvable.');
    if (!isActive(p)) return fail('Ce joueur ne joue pas (pause ou 0 jeton).');
    state.nextBtnId = id;
    return ok();
  }

  function setMe(state, id) {
    const blocked = needNoHand(state);
    if (blocked) return blocked;
    state.players.forEach((p) => { p.me = p.id === id; });
    return ok();
  }

  function togglePause(state, id) {
    const blocked = needNoHand(state);
    if (blocked) return blocked;
    const p = getPlayer(state, id);
    if (!p) return fail('Joueur introuvable.');
    p.paused = !p.paused;
    return ok();
  }

  /* ------------------------------------------------------------------- main */

  // Calcule le bouton et les positions de la prochaine main, sans rien modifier.
  function planNextHand(state) {
    const P = state.players;
    const active = P.filter(isActive);
    if (active.length < 2) return fail('Il faut au moins 2 joueurs avec des jetons (et pas en pause).');
    let btnIdx = -1;
    const forced = state.nextBtnId ? P.findIndex((p) => p.id === state.nextBtnId && isActive(p)) : -1;
    if (forced >= 0) btnIdx = forced;
    else {
      const from = P.findIndex((p) => p.id === state.btnId);
      for (let k = 1; k <= P.length; k++) {
        const i = (((from + k) % P.length) + P.length) % P.length;
        if (isActive(P[i])) { btnIdx = i; break; }
      }
    }
    // order : du joueur à gauche du bouton jusqu'au bouton (SB, BB, …, BTN)
    const order = [];
    for (let k = 1; k <= P.length; k++) {
      const p = P[(btnIdx + k) % P.length];
      if (isActive(p)) order.push(p.id);
    }
    const n = order.length;
    const pre = n === 2 ? [order[1], order[0]] : order.slice(2).concat(order.slice(0, 2));
    const pos = {};
    pre.forEach((id, i) => { pos[id] = POSITIONS[n][i]; });
    return ok({ btnId: P[btnIdx].id, order, pre, post: order.slice(), pos });
  }

  function startHand(state) {
    if (state.hand) return fail('Une main est déjà en cours.');
    const plan = planNextHand(state);
    if (!plan.ok) return plan;
    const S = state.settings;
    const me = state.players.find((p) => p.me);
    const h = {
      no: state.handNo + 1,
      order: plan.order,
      pre: plan.pre,
      post: plan.post,
      pos: plan.pos,
      btnId: plan.btnId,
      sb: S.sb,
      bb: S.bb,
      names: {},
      stacks0: {},
      stack: {},
      total: {},
      bet: {},
      folded: {},
      allin: {},
      acted: {},
      street: 0,
      cb: S.bb, // mise à suivre sur le tour en cours
      lastRaise: S.bb,
      toAct: null,
      board: [],
      cards: [],
      meId: me ? me.id : null,
      meIn: !!me && plan.order.includes(me.id),
      phase: 'cards',
      events: [],
      sent: [],
      pots: null,
      win: null,
      prevMeta: { btnId: state.btnId, nextBtnId: state.nextBtnId, handNo: state.handNo, told: clone(state.told) },
    };
    plan.order.forEach((id) => {
      const p = getPlayer(state, id);
      h.names[id] = p.name;
      h.stacks0[id] = h.stack[id] = p.stack;
      h.total[id] = h.bet[id] = 0;
      h.folded[id] = h.allin[id] = h.acted[id] = false;
    });
    state.handNo = h.no;
    state.btnId = plan.btnId;
    state.nextBtnId = null;
    if (h.meIn) addHeader(state, h);
    else h.phase = 'spectate';
    const n = h.order.length;
    h.sbId = n === 2 ? h.order[1] : h.order[0];
    h.bbId = n === 2 ? h.order[0] : h.order[1];
    put(h, h.sbId, S.sb);
    put(h, h.bbId, S.bb);
    h.toAct = findNext(h, null);
    state.hand = h;
    return ok();
  }

  // Lignes ajoutées en tête du premier message de la main :
  //  - « table 7 joueurs, blindes 20/40 » seulement si ça a changé depuis la dernière fois ;
  //  - « tapis UTG 2000, MP 1500, … » à chaque main (les positions tournent, donc on les redonne toujours).
  function addHeader(state, h) {
    const S = state.settings;
    const t = state.told || {};
    const n = h.order.length;
    const parts = [];
    if (t.n !== n) parts.push('table ' + n + ' joueurs');
    if (t.sb !== S.sb || t.bb !== S.bb) parts.push('blindes ' + S.sb + '/' + S.bb);
    if (parts.length) h.events.push({ t: 'hdr', text: parts.join(', ') });
    h.events.push({ t: 'hdr', text: 'tapis ' + h.pre.map((id) => h.pos[id] + ' ' + h.stacks0[id]).join(', ') });
    state.told = { n, sb: S.sb, bb: S.bb };
  }

  function put(h, id, amount) {
    const a = Math.max(0, Math.min(amount, h.stack[id]));
    h.stack[id] -= a;
    h.bet[id] += a;
    h.total[id] += a;
    if (h.stack[id] === 0) h.allin[id] = true;
  }

  const live = (h) => h.order.filter((id) => !h.folded[id]);
  const potOf = (h) => h.order.reduce((s, id) => s + h.total[id], 0);
  const meLive = (h) => !!h && h.meIn && !h.folded[h.meId];

  function needsAction(h, id) {
    return !h.folded[id] && !h.allin[id] && (!h.acted[id] || h.bet[id] < h.cb);
  }

  function findNext(h, afterId) {
    const ord = h.street === 0 ? h.pre : h.post;
    const from = afterId == null ? -1 : ord.indexOf(afterId);
    for (let k = 1; k <= ord.length; k++) {
      const id = ord[(from + k) % ord.length];
      if (needsAction(h, id)) return id;
    }
    return null;
  }

  function chooseCards(state, cards) {
    const h = state.hand;
    if (!h || h.phase !== 'cards') return fail('Pas de cartes attendues.');
    if (!Array.isArray(cards) || cards.length !== 2 || !cards.every(isCard) || cards[0] === cards[1]) return fail('Choisis 2 cartes différentes.');
    h.cards = cards.slice();
    h.events.push({ t: 'deal', pos: h.pos[h.meId], cards: cards.slice() });
    h.phase = 'action';
    if (!h.toAct) closeStreet(state);
    return ok();
  }

  // Ce que le joueur qui doit parler peut faire.
  function options(h, id) {
    const c = h.bet[id];
    const st = h.stack[id];
    const cb = h.cb;
    const maxTo = c + st;
    const minTo = cb === 0 ? Math.min(h.bb, maxTo) : Math.min(cb + h.lastRaise, maxTo);
    return {
      st,
      c,
      cb,
      toCall: Math.min(Math.max(0, cb - c), st),
      canCheck: c >= cb,
      canRaise: maxTo > cb,
      isBet: cb === 0,
      minTo,
      maxTo,
    };
  }

  // Montants proposés pour une mise / relance.
  function sizeHints(h, id) {
    const o = options(h, id);
    if (!o.canRaise) return [];
    const unit = h.sb > 0 ? h.sb : 1;
    const round = (x) => Math.max(unit, Math.round(x / unit) * unit);
    const pot = potOf(h);
    const out = [];
    if (h.street === 0) {
      if (h.cb <= h.bb) [2, 2.5, 3, 4].forEach((x) => out.push({ label: x + ' BB', to: round(x * h.bb) }));
      else [2.5, 3, 4].forEach((x) => out.push({ label: '×' + x, to: round(x * h.cb) }));
    } else if (h.cb === 0) {
      [[1 / 3, '⅓ pot'], [1 / 2, '½ pot'], [2 / 3, '⅔ pot'], [1, 'pot']].forEach(([f, l]) => out.push({ label: l, to: round(f * pot) }));
    } else {
      [2.5, 3].forEach((x) => out.push({ label: '×' + x, to: round(x * h.cb) }));
      out.push({ label: 'pot', to: round(h.cb + pot + (h.cb - o.c)) });
    }
    const seen = new Set();
    return out.filter((x) => x.to > o.cb && x.to < o.maxTo && !seen.has(x.to) && seen.add(x.to));
  }

  // a = { type: 'f' | 'x' | 's' | 'r' | 'AI', to?: montant total sur le tour (mise ou relance « à ») }
  function applyAction(state, a) {
    const h = state.hand;
    if (!h || h.phase !== 'action' || !h.toAct) return fail('Aucune action attendue.');
    const id = h.toAct;
    const st = h.stack[id];
    const c = h.bet[id];
    const cb = h.cb;
    const mine = id === h.meId;
    let type = a && a.type;
    let to = a && a.to != null ? Math.floor(Number(a.to)) : null;
    if (!['f', 'x', 's', 'r', 'AI'].includes(type)) return fail('Action inconnue.');
    if (type === 's' && c >= cb) type = 'x';
    if (type === 'r') {
      if (!Number.isFinite(to) || to <= 0) return fail('Montant invalide.');
      if (to >= c + st) type = 'AI';
      else if (to <= cb) return fail(cb === 0 ? 'La mise doit être positive.' : 'La relance doit dépasser ' + cb + '.');
    }
    if (type === 'x' && c < cb) return fail('Check impossible : il y a ' + (cb - c) + ' à suivre.');
    if (type === 'AI' && st <= 0) return fail('Ce joueur est déjà à tapis.');

    if (mine) h.sent.push(buildMessage(state));
    const ev = { t: 'act', id, pos: h.pos[id], mine, street: h.street };
    if (type === 'f') {
      h.folded[id] = true;
      ev.a = 'f';
    } else if (type === 'x') {
      h.acted[id] = true;
      ev.a = 'x';
    } else if (type === 's') {
      put(h, id, cb - c);
      h.acted[id] = true;
      ev.a = h.allin[id] ? 'AI' : 's';
      ev.amt = h.bet[id];
    } else {
      const target = type === 'AI' ? c + st : to;
      const wasBet = cb === 0;
      put(h, id, target - c);
      h.acted[id] = true;
      if (target > cb) raiseTo(h, id, target);
      ev.a = h.allin[id] ? 'AI' : wasBet ? 'b' : 'r';
      ev.amt = target;
    }
    h.events.push(ev);
    advance(state, id);
    return ok();
  }

  function raiseTo(h, id, to) {
    const inc = to - h.cb;
    if (inc >= h.lastRaise) h.lastRaise = inc;
    h.cb = to;
    h.order.forEach((o) => { if (o !== id) h.acted[o] = false; });
  }

  function advance(state, lastId) {
    const h = state.hand;
    const L = live(h);
    if (L.length === 1) {
      h.toAct = null;
      h.pots = [{ amount: potOf(h), elig: L.slice(), won: L.slice() }];
      finishHand(state);
      return;
    }
    const next = findNext(h, lastId);
    if (next) { h.toAct = next; return; }
    closeStreet(state);
  }

  function closeStreet(state) {
    const h = state.hand;
    h.toAct = null;
    const canAct = live(h).filter((id) => !h.allin[id]);
    if (h.street >= 3 || canAct.length <= 1) startShowdown(state);
    else h.phase = 'board';
  }

  // Raccourci : tout le monde checke (ou se couche s'il y a une mise) jusqu'à ce que ce soit à moi.
  function checkFoldUntilMe(state) {
    const h = state.hand;
    if (!h || h.phase !== 'action' || !meLive(h)) return fail('Raccourci indisponible.');
    let guard = 0;
    while (h.phase === 'action' && h.toAct && h.toAct !== h.meId && guard++ < 50) {
      const o = options(h, h.toAct);
      const r = applyAction(state, { type: o.canCheck ? 'x' : 'f' });
      if (!r.ok) return r;
    }
    return ok();
  }

  function addStreet(state, cards) {
    const h = state.hand;
    if (!h || h.phase !== 'board') return fail('Pas de carte attendue.');
    const need = h.street === 0 ? 3 : 1;
    cards = cards || [];
    if (cards.length === 0) {
      if (meLive(h)) return fail('Indique les cartes du tableau.');
    } else {
      if (cards.length !== need || !cards.every(isCard)) return fail('Il faut ' + need + ' carte' + (need > 1 ? 's' : '') + '.');
      const used = new Set(h.board.concat(h.cards));
      if (new Set(cards).size !== cards.length || cards.some((c) => used.has(c))) return fail('Carte déjà utilisée.');
    }
    h.street += 1;
    h.board = h.board.concat(cards);
    h.events.push({ t: 'street', street: h.street, cards: cards.slice(), pot: potOf(h) });
    h.order.forEach((id) => { h.bet[id] = 0; h.acted[id] = false; });
    h.cb = 0;
    h.lastRaise = h.bb;
    h.phase = 'action';
    h.toAct = findNext(h, null);
    if (!h.toAct) closeStreet(state);
    return ok();
  }

  /* --------------------------------------------------------------- abattage */

  // Pot principal + pots annexes. Un joueur encore en jeu et pas à tapis est éligible à tout.
  function computePots(h) {
    const L = live(h);
    const maxT = Math.max(0, ...h.order.map((id) => h.total[id]));
    const caps = [...new Set(L.filter((id) => h.allin[id]).map((id) => h.total[id]))].filter((t) => t < maxT);
    const levels = caps.concat([maxT]).sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      h.order.forEach((id) => { amount += Math.max(0, Math.min(h.total[id], lvl) - prev); });
      const elig = L.filter((id) => !h.allin[id] || h.total[id] >= lvl);
      if (amount > 0) {
        if (elig.length) pots.push({ amount, elig });
        else if (pots.length) pots[pots.length - 1].amount += amount;
      }
      prev = lvl;
    }
    return pots;
  }

  function startShowdown(state) {
    const h = state.hand;
    h.toAct = null;
    h.phase = 'showdown';
    h.pots = computePots(h).map((p) => ({ amount: p.amount, elig: p.elig.slice(), won: null }));
    autoAward(h);
    if (h.pots.every((p) => p.won)) finishHand(state);
  }

  function autoAward(h) {
    h.pots.forEach((p) => { if (!p.won && p.elig.length === 1) p.won = p.elig.slice(); });
  }

  // Quand je suis couché et que je ne veux pas saisir la suite : on passe directement au gagnant.
  function forceShowdown(state) {
    const h = state.hand;
    if (!h || !['action', 'board'].includes(h.phase)) return fail('Impossible maintenant.');
    startShowdown(state);
    return ok();
  }

  function showdownCandidates(h) {
    const s = new Set();
    (h.pots || []).forEach((p) => { if (!p.won) p.elig.forEach((id) => s.add(id)); });
    return h.order.filter((id) => s.has(id));
  }

  // ids : joueur(s) ayant la meilleure main parmi les candidats (plusieurs = partage).
  function declareWinners(state, ids) {
    const h = state.hand;
    if (!h || h.phase !== 'showdown') return fail("Pas d'abattage en cours.");
    const cand = showdownCandidates(h);
    const W = (ids || []).filter((id) => cand.includes(id));
    if (!W.length) return fail('Choisis au moins un gagnant.');
    h.pots.forEach((p) => {
      if (p.won) return;
      const inter = p.elig.filter((id) => W.includes(id));
      if (inter.length) p.won = inter;
    });
    h.pots.forEach((p) => { if (!p.won) p.elig = p.elig.filter((id) => !W.includes(id)); });
    autoAward(h);
    if (h.pots.every((p) => p.won)) finishHand(state);
    return ok();
  }

  function finishHand(state) {
    const h = state.hand;
    const win = {};
    h.order.forEach((id) => { win[id] = 0; });
    h.pots.forEach((p) => {
      const w = h.order.filter((id) => p.won.includes(id)); // jeton impair : premier joueur à gauche du bouton
      const share = Math.floor(p.amount / w.length);
      let rem = p.amount - share * w.length;
      w.forEach((id) => { win[id] += share + (rem > 0 ? 1 : 0); if (rem > 0) rem -= 1; });
    });
    h.win = win;
    h.toAct = null;
    h.phase = 'done';
    h.order.forEach((id) => {
      const p = getPlayer(state, id);
      if (p) p.stack = h.stack[id] + win[id];
    });
  }

  function handSummary(h) {
    const pots = (h.pots || []).map((p, i, all) => ({
      label: all.length > 1 ? (i === 0 ? 'Pot principal' : 'Pot annexe' + (all.length > 2 ? ' ' + i : '')) : 'Pot',
      amount: p.amount,
      winners: (p.won || []).map((id) => h.names[id]),
    }));
    const nets = h.order
      .map((id) => ({ id, name: h.names[id], pos: h.pos[id], net: h.stack[id] + ((h.win && h.win[id]) || 0) - h.stacks0[id], me: id === h.meId }))
      .filter((x) => x.net !== 0);
    return { no: h.no, pots, nets, board: h.board.slice(), cards: h.cards.slice(), sent: h.sent.slice() };
  }

  function endHand(state) {
    const h = state.hand;
    if (!h) return fail('Pas de main en cours.');
    if (h.phase === 'done') state.last = handSummary(h);
    else if (h.phase !== 'spectate') return fail("La main n'est pas terminée.");
    state.hand = null;
    return ok();
  }

  // Annule complètement la main : tapis, bouton et numéro reviennent à l'état d'avant.
  function abortHand(state) {
    const h = state.hand;
    if (!h) return fail('Pas de main en cours.');
    if (h.phase === 'done') {
      h.order.forEach((id) => { const p = getPlayer(state, id); if (p) p.stack = h.stacks0[id]; });
    }
    state.btnId = h.prevMeta.btnId;
    state.nextBtnId = h.prevMeta.nextBtnId;
    state.handNo = h.prevMeta.handNo;
    state.told = h.prevMeta.told;
    state.hand = null;
    return ok();
  }

  /* --------------------------------------------------------------- messages */

  function fmtAct(e) {
    return e.a === 'b' || e.a === 'r' || e.a === 'AI' ? e.a + e.amt : e.a;
  }

  // Les joueurs qui se couchent ne sont pas écrits (« un joueur non cité s'est couché »).
  function renderLine(l) {
    if (l.raw) return l.raw;
    const shown = l.acts.filter((e) => e.a !== 'f');
    const s = shown.map((e) => e.pos + ' ' + fmtAct(e)).join(', ');
    if (l.head == null) return s;
    if (s) return l.head + ' | ' + s;
    if (l.acts.length) return l.head + ' | tous couchés';
    return l.head;
  }

  // Message à envoyer à Claude : tout ce qui s'est passé depuis ma dernière décision.
  function buildMessage(state) {
    const h = state.hand;
    if (!h) return '';
    let start = 0;
    for (let i = h.events.length - 1; i >= 0; i--) {
      const e = h.events[i];
      if (e.t === 'act' && e.mine) { start = i + 1; break; }
    }
    const lines = [];
    let cur = null;
    for (let i = start; i < h.events.length; i++) {
      const e = h.events[i];
      if (e.t === 'hdr') {
        lines.push({ raw: e.text });
        cur = null;
      } else if (e.t === 'deal') {
        cur = { head: e.pos + ' ' + e.cards.join(''), acts: [] };
        lines.push(cur);
      } else if (e.t === 'street') {
        cur = { head: '+' + (e.cards.length ? e.cards.join('') : '??') + ' pot ' + e.pot, acts: [] };
        lines.push(cur);
      } else if (e.t === 'act' && !e.mine) {
        if (!cur) { cur = { head: null, acts: [] }; lines.push(cur); }
        cur.acts.push(e);
      }
    }
    return lines.map(renderLine).filter(Boolean).join('\n');
  }

  function buildPrompt(state) {
    const S = state.settings;
    const n = Math.max(2, Math.min(MAX_PLAYERS, state.players.filter(isActive).length || 2));
    const L = [];
    L.push("On joue au Texas Hold'em No Limit entre amis, sans argent. Tu me conseilles en direct.");
    L.push('Table : ' + n + ' joueurs, blindes ' + S.sb + '/' + S.bb + '.');
    L.push('');
    L.push('Notation :');
    L.push('- Cartes : rang A K Q J T 9…2 + couleur p=pique, c=cœur, k=carreau, t=trèfle. Ex : AcTk. Sans couleur : AKs (assorties) / AKo (dépareillées).');
    L.push('- Positions : ' + POSITIONS[n].join(', ') + (n === 2 ? ' (à 2 joueurs, le BTN est aussi SB)' : '') + '.');
    L.push('- Actions : f=couché, x=check, s=suit, b40=mise 40, r120=relance à 120, AI350=tapis pour 350. Les montants sont le total misé par le joueur sur le tour en cours.');
    L.push('- Nouvelle main : une ligne avec le tapis de chaque position, puis ma position + mes cartes | actions avant moi. Ex :');
    L.push('  tapis UTG 2000, MP 1500, CO 2400, BTN 1800, SB 2000, BB 900');
    L.push('  BTN AcKk | UTG r60, CO s');
    L.push('- Cartes du tableau : + les nouvelles cartes, le pot | les actions. Ex : +Kc7t2k pot 200 | BB b100');
    L.push("- Après ma décision, je t'envoie seulement les réactions. Ex : BB r300");
    L.push("- Un joueur qui a parlé sans être cité s'est couché.");
    L.push('- Table : je te préviens quand le nombre de joueurs ou les blindes changent. Ex : table 7 joueurs, blindes 20/40');
    L.push('');
    L.push("Réponds en une seule ligne : action + montant (ex : r180). Ajoute 3 à 5 mots d'explication seulement si la décision est serrée. Si j'écris « ? », explique en 2 phrases.");
    return L.join('\n');
  }

  const api = {
    RANKS, SUITS, STREET_NAMES, POSITIONS, MAX_PLAYERS,
    defaultSettings, newGame, markConversationStart, updateSettings,
    addPlayer, removePlayer, updatePlayer, setButtonNext, setMe, togglePause,
    planNextHand, startHand, chooseCards, options, sizeHints, applyAction, checkFoldUntilMe,
    addStreet, forceShowdown, showdownCandidates, declareWinners, computePots,
    endHand, abortHand, handSummary,
    buildMessage, buildPrompt,
    isActive, isCard, potOf, live, meLive,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
