/*
 * Poker → Claude : mémoire de la façon de jouer de chaque joueur, d'une main et d'une partie à l'autre.
 * Pour chaque pseudo, on compte :
 *  - n : mains où il a eu à parler avant le flop ;
 *  - vpip : mains où il a mis des jetons de lui-même avant le flop (suivi ou relancé, pas les blindes) ;
 *  - pfr : mains où il a relancé avant le flop ;
 *  - agg / calls : après le flop, ses mises et relances / les fois où il a suivi ;
 *  - faced / foldBet : après le flop, les fois où il a dû répondre à une mise / où il s'est couché ;
 *  - sd : ses mains montrées à l'abattage (ce qu'il avait fait, et avec quoi) : de quoi vérifier et corriger les prévisions.
 * Les chiffres sont « lissés » : au début, on suppose un joueur moyen, puis ce qu'on observe compte de plus en plus.
 * Les données sont rangées par pseudo, donc on retrouve les joueurs d'une partie à l'autre.
 */
(function (root) {
  'use strict';

  const ODDS = () => root.PokerOdds || (typeof require === 'function' ? require('./odds.js') : null);
  const MIN_HANDS = 8; // en dessous, on n'affiche pas de style
  const FIELDS = ['n', 'vpip', 'pfr', 'agg', 'calls', 'faced', 'foldBet'];
  const empty = () => ({ n: 0, vpip: 0, pfr: 0, agg: 0, calls: 0, faced: 0, foldBet: 0 });
  // Joueur « moyen » entre amis, et le poids de cette supposition (en nombre de mains)
  const PRIOR = { vpip: 0.32, pfr: 0.12, kHands: 10, fold: 0.45, kFold: 6, aggr: 0.35, kAggr: 6 };
  const SD_MAX = 40; // mains montrées gardées par joueur

  // Pseudo → clé. Les noms par défaut (« Joueur 3 ») ne valent que pour la partie en cours.
  function keyFor(name, gid) {
    const k = String(name || '').trim().toLowerCase();
    return /^joueur \d+$/.test(k) || !k ? (gid || '') + '|' + k : k;
  }

  const LEN = [0, 3, 4, 5];

  // Ce que chaque joueur a fait pendant une main (à partir des actions saisies), et ses cartes s'il les a montrées.
  function handStats(h) {
    const out = {};
    const get = (id) => (out[id] = out[id] || empty());
    let top = h.bb;
    let bet = {};
    const pre = {};
    const post = {}; // actions après le flop, pour relire les mains montrées
    h.events.forEach((e) => {
      if (e.t === 'street') { top = 0; bet = {}; return; }
      if (e.t !== 'act') return;
      const c = get(e.id);
      const facing = top > (bet[e.id] || 0);
      const raise = (e.a === 'r' || e.a === 'b' || e.a === 'AI') && e.amt > top;
      if (e.street === 0) {
        const p = (pre[e.id] = pre[e.id] || { acted: false, vpip: false, pfr: false });
        p.acted = true;
        if (e.a === 's' || raise || (e.a === 'AI' && e.amt > 0)) p.vpip = true;
        if (raise) p.pfr = true;
      } else {
        if (raise) c.agg++;
        else if (e.a === 's' || e.a === 'AI') c.calls++;
        if (facing) { c.faced++; if (e.a === 'f') c.foldBet++; }
        if (raise || e.a === 's' || e.a === 'AI') (post[e.id] = post[e.id] || []).push({ street: e.street, kind: raise ? 'bet' : 'call' });
      }
      if (e.amt != null) bet[e.id] = e.amt;
      if (raise) top = e.amt;
    });
    Object.keys(pre).forEach((id) => {
      const c = get(id);
      c.n = 1;
      if (pre[id].vpip) c.vpip = 1;
      if (pre[id].pfr) c.pfr = 1;
    });
    // Mains montrées : ce qu'il avait réellement, comparé à ce qu'il a joué
    const O = ODDS();
    Object.keys(h.shown || {}).forEach((id) => {
      const cards = h.shown[id];
      if (!O || !cards || cards.length !== 2 || !out[id]) return;
      const cls = O.handClass(cards[0], cards[1]);
      const p = pre[id] || {};
      const e = { a: p.pfr ? 'r' : p.vpip ? 'c' : 'x', p: O.rankPct(cls), cls, bets: 0, bluffs: 0, calls: 0, light: 0 };
      const x = O.toInt(cards[0]), y = O.toInt(cards[1]);
      (post[id] || []).forEach((a) => {
        const b = h.board.slice(0, LEN[a.street]).map(O.toInt);
        if (b.length !== LEN[a.street]) return;
        const cn = O.connect(x, y, b, O.score7(b) >> 20);
        if (a.kind === 'bet') { e.bets++; if (cn.level === 0 && !cn.draw) e.bluffs++; }
        else { e.calls++; if (cn.level === 0 && !cn.draw && !cn.over) e.light++; }
      });
      out[id].sd = e;
    });
    return out;
  }

  const add = (a, b, sign) => { FIELDS.forEach((f) => { a[f] = Math.max(0, (a[f] || 0) + sign * (b[f] || 0)); }); };

  /*
   * Ajoute une main terminée aux profils. db = { v, p: { clé: { name, ...compteurs, sd: [...] } }, recent: [{ k, c }] }.
   * handKey identifie la main : si elle est enregistrée une 2e fois (après « Annuler » puis correction),
   * l'ancienne version est d'abord retirée.
   */
  function record(db, handKey, h, gid) {
    db = db && db.p ? db : { v: 1, p: {}, recent: [] };
    forget(db, handKey);
    const st = handStats(h);
    const c = {};
    Object.keys(st).forEach((id) => {
      if (id === h.meId) return;
      const key = keyFor(h.names[id], gid);
      c[key] = st[id];
      const rec = (db.p[key] = db.p[key] || Object.assign({ name: h.names[id] }, empty()));
      rec.name = h.names[id];
      add(rec, st[id], 1);
      if (st[id].sd) {
        rec.sd = (rec.sd || []).concat([Object.assign({ k: handKey }, st[id].sd)]).slice(-SD_MAX);
      }
    });
    db.recent.push({ k: handKey, c });
    if (db.recent.length > 40) db.recent.shift();
    return db;
  }

  function forget(db, handKey) {
    if (!db || !db.recent) return db;
    const i = db.recent.findIndex((r) => r.k === handKey);
    if (i < 0) return db;
    const old = db.recent[i];
    Object.keys(old.c).forEach((key) => {
      const rec = db.p[key];
      if (!rec) return;
      add(rec, old.c[key], -1);
      if (rec.sd) rec.sd = rec.sd.filter((e) => e.k !== handKey);
    });
    db.recent.splice(i, 1);
    return db;
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /*
   * Ce qu'on sait d'un joueur, lissé (toujours une réponse, même pour un inconnu : le joueur moyen).
   * vpip / pfr : part des mains jouées / relancées ; fold : part des couchés face à une mise (null si pas assez vu) ;
   * bluff / loose : part des mises sans rien / des fois où il suit sans rien ; mix : part des mains jouées « n'importe comment »
   * (hors de ses mains probables, d'après les mains montrées) ; inRange : part des mains montrées qui étaient dans les prévisions.
   */
  function stats(rec) {
    const r = rec || empty();
    const n = r.n || 0;
    const vpip = (r.vpip + PRIOR.vpip * PRIOR.kHands) / (n + PRIOR.kHands);
    const pfr = Math.min(vpip, (r.pfr + PRIOR.pfr * PRIOR.kHands) / (n + PRIOR.kHands));
    const fold = r.faced >= 3 ? (r.foldBet + PRIOR.fold * PRIOR.kFold) / (r.faced + PRIOR.kFold) : null;
    const post = r.agg + r.calls;
    const aggr = (r.agg + PRIOR.aggr * PRIOR.kAggr) / (post + PRIOR.kAggr);
    const sd = r.sd || [];
    // bluffs et paiements « sans rien » vus à l'abattage
    const bets = sd.reduce((a, e) => a + e.bets, 0), bluffs = sd.reduce((a, e) => a + e.bluffs, 0);
    const calls = sd.reduce((a, e) => a + e.calls, 0), light = sd.reduce((a, e) => a + e.light, 0);
    const bluffPrior = clamp(0.1 + 0.6 * (aggr - 0.2), 0.08, 0.55);
    const loosePrior = clamp(0.75 - (fold == null ? PRIOR.fold : fold), 0.05, 0.6);
    const bluff = (bluffs + bluffPrior * 4) / (bets + 4);
    const loose = (light + loosePrior * 4) / (calls + 4);
    // mains montrées hors de ce qu'on prévoyait (il relance ou paie avec des mains plus faibles que prévu)
    let outs = 0, checked = 0;
    sd.forEach((e) => {
      if (e.a === 'r') { checked++; if (e.p > Math.max(pfr, 0.08) * 1.2) outs++; }
      else if (e.a === 'c') { checked++; if (e.p > Math.max(vpip, 0.15) * 1.2) outs++; }
    });
    const mix = (outs + 0.2) / (checked + 4);
    return {
      n, vpip, pfr, fold, aggr, bluff, loose, mix,
      sdN: sd.length, sdChecked: checked, inRange: checked ? (checked - outs) / checked : null,
      bets, bluffs,
    };
  }

  // Pourcentages et style en mots simples, pour l'affichage. null si on ne connaît pas encore assez le joueur.
  function profile(rec) {
    if (!rec || rec.n < MIN_HANDS) return null;
    const s = stats(rec);
    const { vpip, pfr, fold } = s;
    const width = vpip < 0.2 ? 'serré' : vpip > 0.38 ? 'large' : 'moyen';
    const ratio = vpip > 0 ? pfr / vpip : 0;
    const temper = rec.vpip < 3 ? '' : ratio < 0.35 ? 'passif' : ratio > 0.6 ? 'agressif' : ''; // pas d'avis s'il ne joue presque jamais
    const tone = width === 'large' ? (temper === 'passif' ? 'fish' : 'maniac') : width === 'serré' ? 'rock' : 'reg';
    const short = [width, temper].filter(Boolean).join(' · ');
    const say = [];
    say.push(`Joue environ ${Math.round(vpip * 100)} % de ses mains (${width === 'serré' ? 'peu' : width === 'large' ? 'beaucoup' : 'normalement'}) et en relance ${Math.round(pfr * 100)} % avant le flop.`);
    if (temper === 'passif') say.push('Il suit plus qu\'il ne relance : quand il relance, il a souvent une très bonne main.');
    else if (temper === 'agressif') say.push('Il relance souvent : ses relances ne veulent pas toujours dire une grosse main.');
    if (width === 'serré') say.push('Quand il entre dans un coup, méfie-toi.');
    if (width === 'large') say.push('Il joue beaucoup de mains faibles : tu peux miser plus pour la valeur.');
    if (fold != null) say.push(fold >= 0.6 ? `Se couche souvent face à une mise (${Math.round(fold * 100)} %) : il se bluffe bien.` : fold <= 0.3 ? `Se couche rarement face à une mise (${Math.round(fold * 100)} %) : ne le bluffe pas, mise tes bonnes mains.` : `Se couche ${Math.round(fold * 100)} % du temps face à une mise.`);
    if (s.bets >= 2) say.push(`À l'abattage, ses mises étaient des bluffs ${s.bluffs} fois sur ${s.bets}.`);
    if (s.sdChecked >= 3) say.push(`Prévisions vérifiées : ${Math.round(s.inRange * s.sdChecked)} mains montrées sur ${s.sdChecked} étaient dans ses mains probables.`);
    return Object.assign(s, { short, tone, text: say.join(' ') });
  }

  // Ligne pour Claude, en tête de main : « profils (…) : UTG 45/8/70 sur 30, BB 15/12/– sur 22 »
  function claudeLine(h, lookup) {
    const parts = [];
    h.pre.forEach((id) => {
      if (id === h.meId) return;
      const pr = profile(lookup(h.names[id]));
      if (!pr) return;
      parts.push(`${h.pos[id]} ${Math.round(pr.vpip * 100)}/${Math.round(pr.pfr * 100)}/${pr.fold == null ? '–' : Math.round(pr.fold * 100)} sur ${pr.n}${pr.bets >= 2 ? ` (bluffs vus ${pr.bluffs}/${pr.bets})` : ''}`);
    });
    return parts.length ? 'profils (mains jouées/relancées avant le flop/couché face à une mise, en %) : ' + parts.join(', ') : null;
  }

  const api = { MIN_HANDS, PRIOR, keyFor, handStats, record, forget, stats, profile, claudeLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerProfiles = api;
})(typeof window !== 'undefined' ? window : globalThis);
