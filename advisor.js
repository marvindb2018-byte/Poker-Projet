/*
 * Poker → Claude : le « cerveau » de l'aide instantanée, utilisé par l'appli et par la simulation (tests/sim.js).
 * - oppModels(h, lookup) : pour chaque adversaire encore en jeu, ses mains probables d'après ce qu'il a fait et son profil ;
 * - preflopCtx(h, lookup) : la situation avant le flop (relances, suiveurs, relanceur) pour le tableau des mains de départ ;
 * - advise(h, lookup) : le conseil pour moi, avant le flop (tableau) ou après (gain moyen de chaque action).
 * lookup(pseudo) renvoie l'enregistrement du profil de ce joueur (ou undefined s'il est inconnu).
 */
(function (root) {
  'use strict';

  const req = (g, f) => root[g] || (typeof require === 'function' ? require(f) : null);
  const E = () => req('PokerEngine', './engine.js');
  const O = () => req('PokerOdds', './odds.js');
  const P = () => req('PokerProfiles', './profiles.js');
  const H = () => req('PokerHands', './hands.js');

  // Ce que chaque adversaire encore en jeu a fait, et donc ses mains probables
  function oppModels(h, lookup) {
    const e = E(), o = O(), p = P();
    const blinds = {};
    let pot0 = 0;
    (h.posts || []).forEach((x) => {
      pot0 += x.amt;
      if (x.kind === 'sb' || x.kind === 'bb') blinds[x.id] = (blinds[x.id] || 0) + x.amt;
    });
    return e.live(h).filter((id) => id !== h.meId).map((id) => {
      const act = { raised: false, raiseOver: false, reraiseCount: 0, called: false, facingRaise: false, openKey: o.openRangeKey(h.pos[id], h.order.length) };
      const post = [];
      let top = h.bb, raises = 0, st = 0, bet = Object.assign({}, blinds), pot = pot0;
      h.events.forEach((ev) => {
        if (ev.t === 'street') { st = ev.street; top = 0; bet = {}; return; }
        if (ev.t !== 'act') return;
        const prev = bet[ev.id] || 0;
        const raise = (ev.a === 'r' || ev.a === 'b' || ev.a === 'AI') && ev.amt > top;
        if (ev.id === id) {
          if (st === 0) {
            if (raise) { act.raised = true; act.raiseOver = raises >= 1; act.reraiseCount = raises; }
            else if (ev.a === 's' || ev.a === 'AI') { act.called = true; act.facingRaise = raises >= 1; }
          } else if (raise) post.push({ street: st, kind: top > 0 ? 'raise' : 'bet', frac: (ev.amt - top) / Math.max(1, pot + top - prev) });
          else if (ev.a === 's' || ev.a === 'AI') post.push({ street: st, kind: 'call' });
        }
        if (ev.amt != null) { pot += ev.amt - prev; bet[ev.id] = ev.amt; }
        if (raise) { top = ev.amt; if (st === 0) raises++; }
      });
      const rec = lookup(h.names[id]);
      const s = p.stats(rec);
      const known = !!rec && rec.n >= p.MIN_HANDS;
      const r = o.playerRange(act, known ? { vpip: s.vpip, pfr: s.pfr } : null);
      return {
        id, name: h.names[id], pos: h.pos[id], pr: known ? p.profile(rec) : null,
        range: r.range, minus: r.minus, text: r.text, acts: post,
        bluff: s.bluff, loose: s.loose, mix: s.mix, fold: s.fold,
        allin: !!h.allin[id], bet: h.bet[id], stack: h.stack[id], toCall: Math.max(0, h.cb - h.bet[id]),
      };
    });
  }

  // Ce qui s'est passé avant moi pendant le préflop (relances, suiveurs, qui a relancé)
  function preflopCtx(h, lookup, override) {
    let raises = 0, limpers = 0, iRaised = false, top = h.bb, callers = 0, raiser = null;
    h.events.forEach((e) => {
      if (e.t !== 'act' || e.street !== 0) return;
      const isRaise = (e.a === 'r' || e.a === 'b' || e.a === 'AI') && e.amt > top;
      if (isRaise) top = e.amt;
      if (e.id === h.meId) { if (isRaise) iRaised = true; return; }
      if (isRaise) { raises++; raiser = e.id; callers = 0; }
      else if ((e.a === 's' || e.a === 'AI') && raises === 0) limpers++;
      else if ((e.a === 's' || e.a === 'AI') && raises > 0) callers++;
    });
    const rp = raiser && P().profile(lookup(h.names[raiser]));
    // Les joueurs qui parlent encore après moi : jouent-ils tous très peu de mains ? (on peut alors voler les blindes)
    const i = h.pre.indexOf(h.meId);
    const behind = h.pre.slice(i + 1).filter((id) => !h.folded[id]).map((id) => P().profile(lookup(h.names[id])));
    const behindTight = behind.length > 0 && behind.every((pr) => pr && pr.vpip < 0.22);
    return Object.assign({
      behindTight,
      cards: h.cards, pos: h.pos[h.meId], n: h.order.length, bb: h.bb, sb: h.sb, cb: h.cb,
      myBet: h.bet[h.meId], myStack: h.stack[h.meId], raises, limpers, callers, iRaised: iRaised && raises > 0,
      raiserPos: raiser ? h.pos[raiser] : null,
      raiser: rp ? { name: h.names[raiser], pfr: rp.pfr } : null,
    }, override || {});
  }

  // Je parle en dernier sur ce tour (aucun adversaire encore libre de parler après moi)
  function inPosition(h) {
    const order = h.post;
    const i = order.indexOf(h.meId);
    return !order.slice(i + 1).some((id) => !h.folded[id] && !h.allin[id]);
  }

  // Le conseil pour moi, quand c'est à moi de parler
  function advise(h, lookup, opts) {
    if (!h || !h.meIn || h.folded[h.meId] || h.cards.length !== 2) return null;
    const o = O();
    if (h.street === 0) return Object.assign(o.preflopAdvice(preflopCtx(h, lookup)), { street: 0 });
    const e = E();
    const opt = e.options(h, h.meId);
    const d = H().describe(h.cards, h.board);
    const ctx = {
      cards: h.cards, board: h.board, pot: e.potOf(h), toCall: opt.toCall, myBet: h.bet[h.meId], myStack: h.stack[h.meId],
      cb: h.cb, minRaise: opt.minTo, unit: h.sb, inPos: inPosition(h), handName: d ? H().shortText(d) : '',
      opps: oppModels(h, lookup),
    };
    return Object.assign(o.postflopAdvice(ctx, opts && opts.iters), { street: h.street });
  }

  // Conseil → action de l'appli (pour « Jouer ça »)
  function toAction(a) {
    if (!a) return null;
    return ({ raise: { type: 'r', to: a.to }, bet: { type: 'r', to: a.to }, call: { type: 's' }, check: { type: 'x' }, fold: { type: 'f' }, allin: { type: 'AI' } })[a.action] || null;
  }

  const api = { oppModels, preflopCtx, inPosition, advise, toAction };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerAdvisor = api;
})(typeof window !== 'undefined' ? window : globalThis);
