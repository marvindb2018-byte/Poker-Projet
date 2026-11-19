/*
 * Réglage de l'algorithme par simulation.
 *
 * Principe : on essaie une autre valeur pour un réglage (taille des mises, modèle de l'adversaire…), l'appli rejoue
 * exactement les mêmes mains (mêmes cartes, même hasard) qu'avec les réglages actuels, et on mesure l'écart main par main.
 * Une valeur n'est gardée que si elle gagne sur des mains neuves, sans faire perdre sur une table.
 * À la fin, on vérifie sur des tables et des mains jamais vues pendant le réglage.
 *
 * Usage :
 *   node tests/tune.js search [tours] [mains_essai] [mains_confirmation]   → réglages trouvés dans /tmp/tune-best.json
 *   node tests/tune.js measure <fichier.json|base> <mains> <graine>       → gain par table (bb/100) et écart avec la base
 */
const { spawn } = require('child_process');
const fs = require('fs');
const S = require('./sim.js');
const ALL = Object.assign({}, S.TABLES, S.VALIDATION);

if (process.argv[2] === 'worker') {
  const { tune, table, N, seed } = JSON.parse(process.argv[3]);
  const r = S.play(N, ALL[table], S.heroWith(tune), seed, { seeded: true });
  process.stdout.write(JSON.stringify(r.results.map((x) => Math.round(x * 1000) / 1000)));
  process.exit(0);
}

const LOG = '/tmp/tune.log';
const log = (...a) => { const l = a.join(' '); console.log(l); fs.appendFileSync(LOG, l + '\n'); };

// deux simulations à la fois (deux processeurs)
const POOL = 2;
let running = 0;
const queue = [];
function worker(job) {
  return new Promise((resolve, reject) => {
    const go = () => {
      running++;
      const p = spawn(process.execPath, [__filename, 'worker', JSON.stringify(job)]);
      let out = '', err = '';
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { err += d; });
      p.on('close', (code) => {
        running--;
        if (queue.length) queue.shift()();
        if (code) reject(new Error(err.slice(0, 400))); else resolve(JSON.parse(out));
      });
    };
    if (running < POOL) go(); else queue.push(go);
  });
}
const cache = new Map();
function results(tune, table, N, seed) {
  const key = JSON.stringify([tune, table, N, seed]);
  if (!cache.has(key)) cache.set(key, worker({ tune, table, N, seed }));
  return cache.get(key);
}
async function evalAll(tune, tables, N, seed) {
  const r = await Promise.all(tables.map((t) => results(tune, t, N, seed)));
  return Object.fromEntries(tables.map((t, i) => [t, r[i]]));
}
const meanSe = (d) => {
  const m = d.reduce((a, x) => a + x, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) * (x - m), 0) / d.length);
  return { m: m * 100, se: (sd / Math.sqrt(d.length)) * 100 }; // en bb/100
};
// écart main par main entre deux versions, table par table, puis en moyenne sur les tables
function paired(base, cand) {
  const per = {};
  Object.keys(base).forEach((t) => {
    const n = Math.min(base[t].length, cand[t].length);
    per[t] = meanSe(Array.from({ length: n }, (_, i) => cand[t][i] - base[t][i]));
  });
  const T = Object.keys(per);
  const m = T.reduce((a, t) => a + per[t].m, 0) / T.length;
  const se = Math.sqrt(T.reduce((a, t) => a + per[t].se * per[t].se, 0)) / T.length;
  return { m, se, per };
}
const fmt = (x) => `${x.m >= 0 ? '+' : ''}${x.m.toFixed(1)} ± ${(2 * x.se).toFixed(1)}`;

// Les valeurs à essayer pour chaque réglage (autour de la valeur actuelle)
function candidates(cur) {
  const C = [];
  const num = (k, vals) => vals.forEach((v) => { if (Math.abs(v - cur[k]) > 1e-9) C.push({ [k]: Math.round(v * 1000) / 1000 }); });
  const around = (k, f, lo, hi) => num(k, [Math.max(lo, cur[k] * (1 - f)), Math.min(hi, cur[k] * (1 + f))]);
  around('rOop', 0.12, 0.6, 1);
  around('betCap', 0.25, 0.3, 1);
  around('aiBet', 0.4, 0.8, 6);
  around('raiseMult', 0.17, 2.2, 4.5);
  around('aiRaise', 0.4, 0.6, 5);
  num('tol', [Math.max(0, cur.tol - 0.025), cur.tol + 0.03]);
  around('commit', 0.3, 0.2, 1);
  around('mPair', 0.15, 0.5, 1.6);
  around('mDraw', 0.2, 0.5, 1.8);
  around('mAir', 0.4, 0.2, 3);
  around('sizeK', 0.35, 0.2, 2.5);
  around('rr', 0.4, 0.2, 3);
  around('openLate', 0.12, 2, 4); around('openEarly', 0.12, 2, 4);
  around('tbIP', 0.13, 2.2, 4.5); around('tbOOP', 0.13, 2.2, 5);
  const SZ = [[0.33, 0.66, 1], [0.25, 0.5, 0.75, 1], [0.33, 0.5, 0.75, 1], [0.33, 0.66, 1, 1.5], [0.5, 0.75, 1], [0.33, 0.66]];
  SZ.forEach((z) => { if (JSON.stringify(z) !== JSON.stringify(cur.sizes)) C.push({ sizes: z }); });
  return C;
}

async function search(rounds, N1, N2) {
  const train = Object.keys(S.TABLES);
  let best = JSON.parse(JSON.stringify(S.BASE));
  let seed = 100;
  const history = [];
  for (let round = 1; round <= rounds; round++) {
    const t0 = Date.now();
    const sA = seed++, sB = seed++;
    log(`\n=== Tour ${round} (essai ${N1} mains/table, graine ${sA}) ===`);
    const base = await evalAll(best, train, N1, sA);
    const C = candidates(best);
    const scored = await Promise.all(C.map(async (c) => {
      const t = Object.assign({}, best, c);
      const r = paired(base, await evalAll(t, train, N1, sA));
      return { c, r };
    }));
    scored.sort((a, b) => b.r.m - a.r.m);
    scored.forEach(({ c, r }) => log(JSON.stringify(c).padEnd(36), fmt(r)));
    // les prometteurs : confirmés sur des mains neuves, plus nombreuses
    const prom = scored.filter((x) => x.r.m > 1.2 * x.r.se).slice(0, 5);
    if (!prom.length) { log('Aucun réglage prometteur : on s\'arrête.'); break; }
    const baseB = await evalAll(best, train, N2, sB);
    const conf = [];
    for (const { c, r } of prom) {
      const rb = paired(baseB, await evalAll(Object.assign({}, best, c), train, N2, sB));
      const worst = Object.entries(rb.per).sort((a, b) => a[1].m - b[1].m)[0];
      const ok = rb.m > 2 * rb.se && worst[1].m > -2.5 * worst[1].se;
      log(`  confirmation ${JSON.stringify(c)} : ${fmt(rb)}  (pire table : ${worst[0]} ${fmt(worst[1])})  ${ok ? 'GARDÉ' : 'non'}`);
      if (ok) conf.push({ c, r: rb });
    }
    if (!conf.length) { log('Rien de confirmé ce tour-ci.'); history.push({ round, kept: null }); if (round >= 2 && !history.slice(-2).some((h) => h.kept)) break; continue; }
    // on garde le meilleur confirmé ; puis on essaie de lui ajouter les autres confirmés (réglages différents)
    conf.sort((a, b) => b.r.m - a.r.m);
    let next = Object.assign({}, best, conf[0].c);
    const keys = new Set(Object.keys(conf[0].c));
    for (const { c } of conf.slice(1)) {
      if (Object.keys(c).some((k) => keys.has(k))) continue;
      const sC = seed++;
      const bC = await evalAll(next, train, N2, sC);
      const rc = paired(bC, await evalAll(Object.assign({}, next, c), train, N2, sC));
      log(`  ajout de ${JSON.stringify(c)} : ${fmt(rc)} ${rc.m > 1.5 * rc.se ? 'GARDÉ' : 'non'}`);
      if (rc.m > 1.5 * rc.se) { next = Object.assign({}, next, c); Object.keys(c).forEach((k) => keys.add(k)); }
    }
    best = next;
    history.push({ round, kept: [...keys] });
    fs.writeFileSync('/tmp/tune-best.json', JSON.stringify(best, null, 1));
    log(`Réglages après le tour ${round} : ${JSON.stringify(best)}  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    cache.clear();
  }
  fs.writeFileSync('/tmp/tune-best.json', JSON.stringify(best, null, 1));
  log('\nRéglages finaux : ' + JSON.stringify(best));
  return best;
}

// Mesure : gain par table des deux versions, et écart main par main (mêmes cartes, même hasard)
async function measure(file, N, seed) {
  const cand = file === 'base' ? S.BASE : JSON.parse(fs.readFileSync(file, 'utf8'));
  const tables = Object.keys(ALL);
  const base = await evalAll(S.BASE, tables, N, seed);
  const neu = file === 'base' ? base : await evalAll(cand, tables, N, seed);
  const d = paired(base, neu);
  log(`\nMesure sur ${N} mains par table (graine ${seed}, jamais utilisée pour le réglage) — gain en bb/100 :`);
  log('Table'.padEnd(11), 'Avant'.padStart(14), 'Après'.padStart(14), 'Écart (mêmes mains)'.padStart(22));
  tables.forEach((t) => {
    const a = meanSe(base[t]), b = meanSe(neu[t]);
    log((t + (S.VALIDATION[t] ? ' *' : '')).padEnd(11), fmt(a).padStart(14), fmt(b).padStart(14), fmt(d.per[t]).padStart(22));
  });
  const tr = paired(Object.fromEntries(Object.keys(S.TABLES).map((t) => [t, base[t]])), Object.fromEntries(Object.keys(S.TABLES).map((t) => [t, neu[t]])));
  const va = paired(Object.fromEntries(Object.keys(S.VALIDATION).map((t) => [t, base[t]])), Object.fromEntries(Object.keys(S.VALIDATION).map((t) => [t, neu[t]])));
  log(`Moyenne tables de réglage : ${fmt(tr)} · tables jamais vues (*) : ${fmt(va)} · toutes : ${fmt(d)}`);
}

(async () => {
  const [mode, a, b, c] = process.argv.slice(2);
  if (mode === 'search') await search(Number(a) || 6, Number(b) || 2500, Number(c) || 6000);
  else if (mode === 'measure') await measure(a || 'base', Number(b) || 8000, Number(c) || 900);
  else console.log('node tests/tune.js search [tours] [mains_essai] [mains_confirmation] | measure <fichier|base> [mains] [graine]');
})().catch((e) => { console.error(e); process.exit(1); });
