/*
 * Poker → Claude : mémoire de la façon de jouer de chaque joueur, d'une main et d'une partie à l'autre.
 * Pour chaque pseudo, on compte :
 *  - n : mains où il a eu à parler avant le flop ;
 *  - vpip : mains où il a mis des jetons de lui-même avant le flop (suivi ou relancé, pas les blindes) ;
 *  - pfr : mains où il a relancé avant le flop ;
 *  - agg / calls : après le flop, ses mises et relances / les fois où il a suivi ;
 *  - faced / foldBet : après le flop, les fois où il a dû répondre à une mise / où il s'est couché.
 * Les données sont rangées par pseudo, donc on retrouve les joueurs d'une partie à l'autre.
 */
(function (root) {
  'use strict';

  const MIN_HANDS = 8; // en dessous, on ne tire pas de conclusion
  const FIELDS = ['n', 'vpip', 'pfr', 'agg', 'calls', 'faced', 'foldBet'];
  const empty = () => ({ n: 0, vpip: 0, pfr: 0, agg: 0, calls: 0, faced: 0, foldBet: 0 });

  // Pseudo → clé. Les noms par défaut (« Joueur 3 ») ne valent que pour la partie en cours.
  function keyFor(name, gid) {
    const k = String(name || '').trim().toLowerCase();
    return /^joueur \d+$/.test(k) || !k ? (gid || '') + '|' + k : k;
  }

  // Ce que chaque joueur a fait pendant une main (à partir des actions saisies).
  function handStats(h) {
    const out = {};
    const get = (id) => (out[id] = out[id] || empty());
    let street = 0, top = h.bb;
    let bet = {};
    const pre = {};
    h.events.forEach((e) => {
      if (e.t === 'street') { street = e.street; top = 0; bet = {}; return; }
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
    void street;
    return out;
  }

  const add = (a, b, sign) => { FIELDS.forEach((f) => { a[f] = Math.max(0, (a[f] || 0) + sign * (b[f] || 0)); }); };

  /*
   * Ajoute une main terminée aux profils. db = { v, p: { clé: { name, ...compteurs } }, recent: [{ k, c }] }.
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
    Object.keys(old.c).forEach((key) => { if (db.p[key]) add(db.p[key], old.c[key], -1); });
    db.recent.splice(i, 1);
    return db;
  }

  // Pourcentages et style en mots simples. null si on ne connaît pas encore assez le joueur.
  function profile(rec) {
    if (!rec || rec.n < MIN_HANDS) return null;
    const vpip = rec.vpip / rec.n, pfr = rec.pfr / rec.n;
    const post = rec.agg + rec.calls;
    const aggr = post >= 6 ? rec.agg / post : null;
    const fold = rec.faced >= 5 ? rec.foldBet / rec.faced : null;
    const width = vpip < 0.2 ? 'serré' : vpip > 0.38 ? 'large' : 'moyen';
    const ratio = vpip > 0 ? pfr / vpip : 0;
    const temper = rec.vpip < 3 ? '' : ratio < 0.35 ? 'passif' : ratio > 0.6 ? 'agressif' : ''; // pas d'avis s'il ne joue presque jamais
    const tone = width === 'large' ? (temper === 'passif' ? 'fish' : 'maniac') : width === 'serré' ? 'rock' : 'reg';
    const short = [width, temper].filter(Boolean).join(' · ');
    const say = [];
    say.push(`Joue ${Math.round(vpip * 100)} % de ses mains (${width === 'serré' ? 'peu' : width === 'large' ? 'beaucoup' : 'normalement'}) et en relance ${Math.round(pfr * 100)} % avant le flop.`);
    if (temper === 'passif') say.push('Il suit plus qu\'il ne relance : quand il relance, il a souvent une très bonne main.');
    else if (temper === 'agressif') say.push('Il relance souvent : ses relances ne veulent pas toujours dire une grosse main.');
    if (width === 'serré') say.push('Quand il entre dans un coup, méfie-toi.');
    if (width === 'large') say.push('Il joue beaucoup de mains faibles : tu peux miser plus pour la valeur.');
    if (fold != null) say.push(fold >= 0.6 ? `Se couche souvent face à une mise (${Math.round(fold * 100)} %) : il se bluffe bien.` : fold <= 0.3 ? `Se couche rarement face à une mise (${Math.round(fold * 100)} %) : ne le bluffe pas, mise tes bonnes mains.` : `Se couche ${Math.round(fold * 100)} % du temps face à une mise.`);
    return {
      n: rec.n, vpip, pfr, aggr, fold, short, tone, text: say.join(' '),
      // pour le calcul des mains probables
      bluff: aggr == null ? 0.3 : Math.max(0.08, Math.min(0.55, 0.1 + 0.6 * (aggr - 0.2))),
      loose: fold == null ? 0.25 : Math.max(0.05, Math.min(0.6, 0.75 - fold)),
    };
  }

  // Ligne pour Claude, en tête de main : « profils (…) : UTG 45/8/70 sur 30, BB 15/12/– sur 22 »
  function claudeLine(h, lookup) {
    const parts = [];
    h.pre.forEach((id) => {
      if (id === h.meId) return;
      const pr = profile(lookup(h.names[id]));
      if (!pr) return;
      parts.push(`${h.pos[id]} ${Math.round(pr.vpip * 100)}/${Math.round(pr.pfr * 100)}/${pr.fold == null ? '–' : Math.round(pr.fold * 100)} sur ${pr.n}`);
    });
    return parts.length ? 'profils (mains jouées/relancées avant le flop/couché face à une mise, en %) : ' + parts.join(', ') : null;
  }

  const api = { MIN_HANDS, keyFor, handStats, record, forget, profile, claudeLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerProfiles = api;
})(typeof window !== 'undefined' ? window : globalThis);
