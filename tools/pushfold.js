/*
 * Tableaux « tapis ou couché » (petits tapis) : calcul de l'équilibre (Nash) en jetons, comme les tableaux des pros.
 *
 * 1. Chances (équité) de chacune des 169 mains de départ contre chacune des autres, tapis avant le flop (tirages au hasard).
 * 2. Pour chaque taille de tapis S (en grosses blindes) et chaque nombre k de joueurs qui parlent après celui qui met tapis
 *    (k = 1 : petite blinde contre grosse blinde ; k = 2 : bouton ; k = 3 : CO…), on cherche l'équilibre :
 *    - celui qui parle en premier met tapis si ça rapporte plus que se coucher, sachant qui paiera derrière ;
 *    - chaque joueur derrière paie si ça rapporte plus que se coucher, sachant avec quoi on met tapis.
 *    Simplifications classiques : blindes 0,5 / 1, pas d'ante, tout le monde a le même tapis, au plus un joueur paie.
 * 3. Résultat écrit dans odds.js (PUSHFOLD), sous forme compacte (une main = un bit).
 *
 * Usage : node tools/pushfold.js [tirages par couple]     (≈ 1 min)
 */
const fs = require('fs');
const path = require('path');
const O = require('../odds.js');

const R = 'AKQJT98765432';
const CLASSES = [];
for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
  if (i === j) CLASSES.push(R[i] + R[j]);
  else if (i < j) CLASSES.push(R[i] + R[j] + 's');
  else CLASSES.push(R[j] + R[i] + 'o');
}
const W = CLASSES.map((c) => (c.length === 2 ? 6 : c[2] === 's' ? 4 : 12)); // nombre de combinaisons
const N = CLASSES.length;

// ---- 1. équités
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const SUITS = 'pckt';
function dealClass(c, used) {
  for (let t = 0; t < 50; t++) {
    let a, b;
    if (c.length === 2) { const s1 = SUITS[(rnd() * 4) | 0]; let s2 = SUITS[(rnd() * 4) | 0]; if (s2 === s1) continue; a = c[0] + s1; b = c[1] + s2; }
    else if (c[2] === 's') { const s = SUITS[(rnd() * 4) | 0]; a = c[0] + s; b = c[1] + s; }
    else { const s1 = SUITS[(rnd() * 4) | 0]; const s2 = SUITS[(rnd() * 4) | 0]; if (s1 === s2) continue; a = c[0] + s1; b = c[1] + s2; }
    const ia = O.toInt(a), ib = O.toInt(b);
    if (used.has(ia) || used.has(ib)) continue;
    return [ia, ib];
  }
  return null;
}
const DECK = [];
for (const r of R) for (const s of SUITS) DECK.push(O.toInt(r + s));
function equity(ci, cj, iters) {
  let win = 0, n = 0;
  for (let t = 0; t < iters; t++) {
    const used = new Set();
    const h1 = dealClass(CLASSES[ci], used); if (!h1) continue; h1.forEach((x) => used.add(x));
    const h2 = dealClass(CLASSES[cj], used); if (!h2) continue; h2.forEach((x) => used.add(x));
    const board = [];
    while (board.length < 5) { const c = DECK[(rnd() * 52) | 0]; if (!used.has(c)) { used.add(c); board.push(c); } }
    const s1 = O.score7(h1.concat(board)), s2 = O.score7(h2.concat(board));
    win += s1 > s2 ? 1 : s1 === s2 ? 0.5 : 0; n++;
  }
  return n ? win / n : 0.5;
}

// ---- 2. équilibre (jeu fictif : on mélange petit à petit les meilleures réponses)
function solve(EQ, S, k) {
  // derrière celui qui met tapis : k joueurs ; les deux derniers sont la petite et la grosse blinde (si k ≥ 2)
  const behind = [];
  for (let i = 0; i < k; i++) behind.push(k === 1 ? 'BB' : i === k - 1 ? 'BB' : i === k - 2 ? 'SB' : 'X');
  const postedP = k === 1 ? 0.5 : 0;
  const posted = { BB: 1, SB: 0.5, X: 0 };
  let push = new Float64Array(N).fill(0.5);
  const call = behind.map(() => new Float64Array(N).fill(0.3));
  const eqVs = (h, rangeProb) => { // équité de h contre une plage (pondérée)
    let s = 0, w = 0;
    for (let x = 0; x < N; x++) { const p = rangeProb[x] * W[x]; if (p) { s += p * EQ[h * N + x]; w += p; } }
    return w ? s / w : 0.5;
  };
  const freq = (rangeProb) => { let s = 0, w = 0; for (let x = 0; x < N; x++) { s += rangeProb[x] * W[x]; w += W[x]; } return s / w; };
  for (let it = 1; it <= 400; it++) {
    const lr = 1 / (it + 1);
    // meilleure réponse de chaque joueur derrière, face à la plage de tapis
    const nc = behind.map((role, j) => {
      const dead = 1.5 - posted[role] - postedP; // blindes des autres (au milieu, perdues pour eux)
      const out = new Float64Array(N);
      for (let h = 0; h < N; h++) {
        const e = eqVs(h, push);
        const ev = e * (2 * S + dead) - (S - posted[role]);
        out[h] = ev > 0 ? 1 : 0;
      }
      return out;
    });
    // meilleure réponse de celui qui met tapis, face aux plages de paiement
    const cf = call.map(freq);
    const np = new Float64Array(N);
    for (let h = 0; h < N; h++) {
      let ev = 0, pass = 1;
      behind.forEach((role, j) => {
        const pj = pass * cf[j];
        if (pj > 1e-9) {
          const dead = 1.5 - posted[role] - postedP;
          ev += pj * (eqVs(h, call[j]) * (2 * S + dead) - S + postedP);
        }
        pass *= 1 - cf[j];
      });
      ev += pass * 1.5; // tout le monde se couche : je prends les blindes
      np[h] = ev > 0 ? 1 : 0;
    }
    for (let h = 0; h < N; h++) {
      push[h] += (np[h] - push[h]) * lr;
      call.forEach((c, j) => { c[h] += (nc[j][h] - c[h]) * lr; });
    }
  }
  const set = (p) => CLASSES.filter((_, h) => p[h] >= 0.5);
  return { push: set(push), call: call.map(set), behind };
}

// masque 169 bits → hexadécimal
const mask = (set) => {
  const bits = CLASSES.map((c) => (set.includes(c) ? 1 : 0));
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += ((bits[i] << 3) | ((bits[i + 1] || 0) << 2) | ((bits[i + 2] || 0) << 1) | (bits[i + 3] || 0)).toString(16);
  return hex;
};
const pctOf = (set) => Math.round((set.reduce((a, c) => a + W[CLASSES.indexOf(c)], 0) / 1326) * 100);

if (require.main === module) {
  const iters = Number(process.argv[2]) || 3000;
  const cache = path.join(__dirname, `pushfold-eq-${iters}.json`);
  let EQ;
  if (fs.existsSync(cache)) EQ = Float64Array.from(JSON.parse(fs.readFileSync(cache, 'utf8')));
  else {
    const t0 = Date.now();
    EQ = new Float64Array(N * N);
    for (let i = 0; i < N; i++) {
      EQ[i * N + i] = 0.5;
      for (let j = i + 1; j < N; j++) { const e = equity(i, j, iters); EQ[i * N + j] = e; EQ[j * N + i] = 1 - e; }
    }
    fs.writeFileSync(cache, JSON.stringify(Array.from(EQ, (x) => Math.round(x * 10000) / 10000)));
    console.log(`équités calculées en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const STACKS = [5, 8, 10, 12, 15, 20];
  const out = { classes: 'AKQJT98765432', stacks: STACKS, push: {}, callBB: {}, callSB: {}, callFirst: {} };
  for (const S of STACKS) {
    out.push[S] = []; out.callBB[S] = []; out.callSB[S] = []; out.callFirst[S] = [];
    const line = [];
    for (let k = 1; k <= 8; k++) {
      const r = solve(EQ, S, k);
      out.push[S].push(mask(r.push));
      out.callBB[S].push(mask(r.call[r.behind.length - 1]));
      out.callSB[S].push(k >= 2 ? mask(r.call[r.behind.length - 2]) : '');
      out.callFirst[S].push(mask(r.call[0]));
      line.push(`k${k}:${pctOf(r.push)}%/BB${pctOf(r.call[r.behind.length - 1])}%`);
    }
    console.log(`${S} BB  ` + line.join('  '));
  }
  fs.writeFileSync(path.join(__dirname, 'pushfold.json'), JSON.stringify(out));
  console.log('écrit : tools/pushfold.json');
}
module.exports = { CLASSES };
