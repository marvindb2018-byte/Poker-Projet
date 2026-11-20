const assert = require('assert');
const O = require('../odds.js');
const H = require('../hands.js');

const RANKS = 'AKQJT98765432'.split('');
const SUITS = 'pckt'.split('');
const deck = [];
RANKS.forEach((r) => SUITS.forEach((s) => deck.push(r + s)));
const score = (cards) => O.score7(cards.map(O.toInt));

// 1. Même catégorie que l'évaluateur détaillé (hands.js), sur 30 000 mains de 7 cartes au hasard
for (let n = 0; n < 30000; n++) {
  const d = deck.slice().sort(() => Math.random() - 0.5).slice(0, 7);
  const cat = score(d) >> 20;
  const ref = H.evaluate(d).cat;
  assert.strictEqual(cat, ref === 9 ? 8 : ref, d.join(' ') + ' → ' + H.evaluate(d).name);
}
console.log('✓ catégories identiques sur 30 000 mains');

// 2. Ordre des mains
const gt = (a, b) => assert.ok(score(a) > score(b), a.join(' ') + ' devrait battre ' + b.join(' '));
const eq = (a, b) => assert.strictEqual(score(a), score(b), a.join(' ') + ' = ' + b.join(' '));
const board = ['2c', '7k', '9t', 'Jp', '4c'];
gt(['Ap', 'Ac'].concat(board), ['Kp', 'Kc'].concat(board));
gt(['Ak', 'Kk'].concat(['Ac', '7k', '9t', 'Jp', '4c']), ['Ak', 'Qk'].concat(['Ac', '7k', '9t', 'Jp', '4c'])); // kicker
gt(['6c', '2p', '3k', '4t', '5c', 'Kk', 'Qt'], ['Ac', '2p', '3k', '4t', '5c', 'Kk', 'Qt']); // quinte au 6 > quinte au 5
gt(['2c', '3c', '9c', 'Jc', 'Kc', 'Ap', 'Qt'], ['Tc', 'Jp', 'Qk', 'Kt', 'Ac', '2k', '3t']); // couleur > quinte
gt(['7p', '7c', '7k', '2t', '2c', 'Ap', 'Kp'], ['Ap', 'Ac', 'Ak', 'Kt', 'Qc', 'Jp', '9p']); // full > brelan
eq(['Ap', 'Kc', 'Qp', 'Qc', 'Jk', 'Jt', '2p'], ['Ak', 'Kp', 'Qp', 'Qc', 'Jk', 'Jt', '3p']); // même double paire, même kicker
console.log('✓ ordre des mains');

// 3. Probabilités connues (contre des mains au hasard)
const near = (x, target, tol, label) => assert.ok(Math.abs(x - target) <= tol, `${label} : ${(x * 100).toFixed(1)} % au lieu de ≈ ${target * 100} %`);
near(O.equity(['Ap', 'Ac'], [], 1, 20000).equity, 0.85, 0.02, 'AA contre 1');
near(O.equity(['7p', '2c'], [], 1, 20000).equity, 0.35, 0.025, '72o contre 1');
near(O.equity(['Ak', 'Kk'], [], 1, 20000).equity, 0.67, 0.02, 'AKs contre 1');
near(O.equity(['Ap', 'Ac'], [], 5, 12000).equity, 0.49, 0.03, 'AA contre 5');
// tableau quinte flush royale : tout le monde partage
const royal = O.equity(['2c', '3c'], ['Ap', 'Kp', 'Qp', 'Jp', 'Tp'], 1, 500);
assert.strictEqual(royal.tie, 1);
assert.ok(Math.abs(royal.equity - 0.5) < 1e-9);
// la river est tombée et j'ai la quinte flush max : 100 %
assert.strictEqual(O.equity(['Ap', 'Kp'], ['Qp', 'Jp', 'Tp', '2c', '3k'], 3, 500).equity, 1);
console.log('✓ probabilités connues');

// 4. Vitesse
let t = Date.now();
O.equity(['Ak', 'Kk'], ['Kc', '7t', '2k'], 3);
const ms = Date.now() - t;
assert.ok(ms < 400, ms + ' ms');
console.log('✓ calcul en ' + ms + ' ms (3 adversaires, flop)');

// 5. Mains de départ
assert.strictEqual(O.handClass('Ac', 'Kk'), 'AKo');
assert.strictEqual(O.handClass('Kc', 'At'), 'AKo');
assert.strictEqual(O.handClass('Kc', 'Ac'), 'AKs');
assert.strictEqual(O.handClass('Tt', '9t'), 'T9s');
assert.strictEqual(O.handClass('7p', '7c'), '77');
assert.deepStrictEqual([...O.parseRange('A9s+')], ['AKs', 'AQs', 'AJs', 'ATs', 'A9s']);
assert.deepStrictEqual([...O.parseRange('98s-65s')], ['98s', '87s', '76s', '65s']);
assert.strictEqual(O.parseRange('22+').size, 13);
const p = (k) => O.pct(O.RANGES.open[k]);
assert.ok(p('UTG9') < p('UTG') && p('UTG') < p('MP') && p('MP') < p('CO') && p('CO') < p('BTN'), [p('UTG9'), p('UTG'), p('MP'), p('CO'), p('BTN')].join(' '));
console.log('✓ tableaux : UTG ' + p('UTG') + ' %, MP ' + p('MP') + ' %, CO ' + p('CO') + ' %, BTN ' + p('BTN') + ' %, SB ' + p('SB') + ' % des mains');

const adv = (o) => O.preflopAdvice(Object.assign({ n: 6, bb: 20, sb: 10, cb: 20, myBet: 0, myStack: 2000, raises: 0, limpers: 0 }, o));
let a = adv({ cards: ['Ac', 'Kk'], pos: 'UTG' });
assert.deepStrictEqual([a.action, a.to], ['raise', 60]);
a = adv({ cards: ['Ac', 'Kk'], pos: 'BTN', limpers: 2 });
assert.deepStrictEqual([a.action, a.to], ['raise', 100]); // 3 BB + 1 par suiveur
assert.strictEqual(adv({ cards: ['7c', '2k'], pos: 'BTN' }).action, 'fold');
assert.strictEqual(adv({ cards: ['7c', '2k'], pos: 'BB', myBet: 20 }).action, 'check');
assert.strictEqual(adv({ cards: ['Qc', 'Qk'], pos: 'CO', raises: 1, cb: 60 }).action, 'raise');
assert.strictEqual(adv({ cards: ['8c', '7c'], pos: 'BB', raises: 1, cb: 60, myBet: 20 }).action, 'call');
assert.strictEqual(adv({ cards: ['8c', '7c'], pos: 'MP', raises: 1, cb: 60 }).action, 'fold');
assert.strictEqual(adv({ cards: ['Ac', '8k'], pos: 'CO', myStack: 200 }).action, 'allin'); // 10 BB
assert.strictEqual(adv({ cards: ['Kc', 'Kk'], pos: 'CO', iRaised: true, raises: 2, cb: 180, myBet: 60 }).action, 'raise');
assert.strictEqual(adv({ cards: ['Jc', 'Jk'], pos: 'UTG', raises: 2, cb: 180 }).action, 'fold');
assert.ok(adv({ cards: ['Ac', 'Kk'], pos: 'UTG' }).why.includes('AKo'));
assert.strictEqual(O.grid()[0][1], 'AKs');
assert.strictEqual(O.grid()[1][0], 'AKo');
// chaque conseil a son explication « en clair », dans toutes les situations
const POSS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
for (let i = 0; i < 5000; i++) {
  const d = deck.slice().sort(() => Math.random() - 0.5);
  const ctx = { cards: [d[0], d[1]], pos: POSS[i % 6], n: 6, bb: 20, sb: 10, cb: [20, 60, 200, 540][i % 4], myBet: 0,
    myStack: [150, 2000][i % 2], raises: i % 3, limpers: i % 2, iRaised: i % 7 === 0,
    raiser: i % 5 === 0 ? { name: 'Paul', pfr: [0.04, 0.15, 0.4][i % 3] } : null };
  const a = O.preflopAdvice(ctx);
  assert.ok(a.plain && a.plain.length > 30 && a.why, JSON.stringify(ctx) + ' → ' + JSON.stringify(a));
}
console.log('✓ conseils avant le flop (avec explication en clair)');
// taille de la relance : normale (≤ 3 BB), grosse (3-6), très grosse (6-15), tapis (> 15)
const vsSize = (cards, pos, cb, extra) => adv(Object.assign({ cards, pos, cb, raises: 1, myBet: pos === 'BB' ? 20 : pos === 'SB' ? 10 : 0 }, extra)).action;
const sizes = [60, 100, 200, 2000];
assert.deepStrictEqual(sizes.map((cb) => vsSize(['Ac', 'Jk'], 'BTN', cb)), ['call', 'fold', 'fold', 'fold']);
assert.deepStrictEqual(sizes.map((cb) => vsSize(['7c', '7k'], 'CO', cb)), ['call', 'call', 'fold', 'fold']);
assert.deepStrictEqual(sizes.map((cb) => vsSize(['Kp', 'Qp'], 'BB', cb)), ['call', 'call', 'fold', 'fold']);
assert.deepStrictEqual(sizes.map((cb) => vsSize(['Qc', 'Qk'], 'CO', cb)), ['raise', 'raise', 'call', 'call']);
assert.deepStrictEqual(sizes.map((cb) => vsSize(['Ac', 'Ak'], 'CO', cb)), ['raise', 'raise', 'raise', 'call']);
// jamais payer un tapis de 100 BB avec une petite paire ou deux figures
for (const c of [['7c', '7k'], ['Kp', 'Qp'], ['Ac', 'Jk'], ['Tc', 'Tk']]) for (const pos of ['CO', 'BTN', 'BB']) assert.strictEqual(vsSize(c, pos, 2000), 'fold', c + ' ' + pos);
// contre un joueur qui relance n'importe quoi, on paie plus large (5 BB traité comme une relance normale)
assert.strictEqual(vsSize(['7c', '7k'], 'CO', 100, { raiser: { name: 'Paul', pfr: 0.4 } }), 'call');
// contre un joueur très serré, une relance de 5 BB est traitée comme une très grosse
assert.strictEqual(vsSize(['7c', '7k'], 'CO', 100, { raiser: { name: 'Léa', pfr: 0.04 } }), 'fold');
console.log('✓ conseils selon la taille de la relance');
// place du relanceur : plus prudent contre UTG/MP, plus large contre CO/BTN/SB
const vsPos = (cards, pos, rp, raiser) => vsSize(cards, pos, 60, { raiserPos: rp, raiser });
assert.strictEqual(vsPos(['Ap', 'Tc'], 'BB', 'UTG'), 'fold');
assert.strictEqual(vsPos(['Ap', 'Tc'], 'BB', 'BTN'), 'call');
assert.strictEqual(vsPos(['Ap', 'Jc'], 'SB', 'MP'), 'fold');
assert.strictEqual(vsPos(['Ap', 'Jc'], 'SB', 'BTN'), 'raise');
assert.strictEqual(vsPos(['Tp', 'Tc'], 'BTN', 'UTG'), 'call');
assert.strictEqual(vsPos(['Tp', 'Tc'], 'BTN', 'CO'), 'raise');
assert.ok(adv({ cards: ['Ap', 'Tc'], pos: 'BB', cb: 60, raises: 1, myBet: 20, raiserPos: 'BTN' }).plain.includes('BTN'));
// les habitudes connues comptent plus que la place : un joueur très serré qui relance du bouton reste sérieux
assert.strictEqual(vsPos(['Ap', 'Tc'], 'BB', 'BTN', { name: 'Léa', pfr: 0.05 }), 'fold');
assert.strictEqual(vsPos(['Ap', 'Jc'], 'SB', 'BTN', { name: 'Léa', pfr: 0.05 }), 'fold');
// sans place connue : comme avant
assert.strictEqual(vsPos(['Ap', 'Tc'], 'BB', null), 'call');
console.log('✓ conseils selon la place du relanceur');
// cohérence : plus la relance est grosse, moins on joue de mains (jamais « payé à 5 BB mais couché à 3 BB »)
{
  const RK = 'AKQJT98765432', hs = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) hs.push(i === j ? [RK[i] + 'p', RK[j] + 'c'] : i < j ? [RK[i] + 'p', RK[j] + 'p'] : [RK[j] + 'p', RK[i] + 'c']);
  const plays = (a) => a.action !== 'fold' && a.action !== 'check';
  for (const pos of ['MP', 'CO', 'BTN', 'SB', 'BB']) for (const rp of [null, 'UTG', 'CO']) {
    if (rp === pos) continue;
    for (const c of hs) {
      const at = (cb) => plays(vsSize(c, pos, cb, { raiserPos: rp }));
      const sz = [60, 100, 200, 2000];
      for (let k = 1; k < sz.length; k++) assert.ok(!(at(sz[k]) && !at(sz[k - 1])), `${O.handClass(c[0], c[1])} en ${pos} contre ${rp} : joué à ${sz[k] / 20} BB mais couché à ${sz[k - 1] / 20} BB`);
    }
  }
  // l'exemple de la capture : 22 en petite blinde, couché face à une relance normale comme face à une grosse
  assert.strictEqual(vsSize(['2p', '2c'], 'SB', 60, { raiserPos: 'UTG' }), 'fold');
  assert.strictEqual(vsSize(['2p', '2c'], 'SB', 100, { raiserPos: 'UTG' }), 'fold');
  // ailleurs, petite paire : payée face à une grosse relance seulement s'il reste au moins 15 fois la mise derrière
  assert.strictEqual(vsSize(['2p', '2c'], 'BTN', 100, { raiserPos: 'CO' }), 'call');
  assert.strictEqual(vsSize(['2p', '2c'], 'BTN', 100, { raiserPos: 'CO', myStack: 1100 }), 'fold');
}
console.log('✓ cohérence : plus la relance est grosse, moins de mains jouées');
// tableaux « tapis ou couché » calculés : proches des tableaux de référence (tête-à-tête, 10 grosses blindes : ~58 % / ~37 %)
{
  const p = (set) => O.pct(set);
  assert.ok(p(O.pfSet('push', 10, 1)) >= 52 && p(O.pfSet('push', 10, 1)) <= 66, 'petite blinde 10 BB');
  assert.ok(p(O.pfSet('callBB', 10, 1)) >= 30 && p(O.pfSet('callBB', 10, 1)) <= 42, 'grosse blinde 10 BB');
  assert.ok(p(O.pfSet('push', 10, 5)) >= 9 && p(O.pfSet('push', 10, 5)) <= 18, 'UTG 10 BB (6 joueurs)');
  for (const S of [5, 8, 10, 12, 15, 20]) for (let k = 1; k < 8; k++) assert.ok(O.pfSet('push', S, k).size >= O.pfSet('push', S, k + 1).size - 2, 'moins de mains quand plus de joueurs parlent après');
  assert.ok(O.pfSet('push', 5, 2).size > O.pfSet('push', 15, 2).size, 'plus de mains avec un plus petit tapis');
  const pf = (cards, pos, stack, extra) => O.preflopAdvice(Object.assign({ cards, pos, n: 6, bb: 20, sb: 10, cb: 20, myBet: pos === 'BB' ? 20 : pos === 'SB' ? 10 : 0,
    myStack: stack * 20 - (pos === 'BB' ? 20 : pos === 'SB' ? 10 : 0), raises: 0, limpers: 0, callers: 0 }, extra || {})).action;
  assert.strictEqual(pf(['Kp', '9c'], 'SB', 10), 'allin');
  assert.strictEqual(pf(['7p', '2c'], 'UTG', 10), 'fold');
  assert.strictEqual(pf(['Ap', '5c'], 'BTN', 10), 'allin');
  assert.strictEqual(pf(['Ap', '5c'], 'BTN', 40), 'raise');          // tapis confortable : relance normale
  assert.strictEqual(pf(['Ap', 'Kc'], 'BB', 10), 'check');           // personne n'a relancé : check gratuit
  assert.strictEqual(pf(['Ap', 'Tc'], 'BB', 10, { raises: 1, cb: 200, raiserPos: 'BTN' }), 'call');
  assert.strictEqual(pf(['Kp', '8c'], 'BB', 10, { raises: 1, cb: 200, raiserPos: 'UTG' }), 'fold');
}
console.log('✓ tableaux « tapis ou couché » calculés');
console.log('\nTests probabilités OK');
