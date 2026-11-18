const assert = require('assert');
const E = require('../engine.js');
const P = require('../profiles.js');
const O = require('../odds.js');

const ok = (r) => { assert.ok(r && r.ok, r && r.err); return r; };
const act = (s, type, to) => ok(E.applyAction(s, { type, to }));
const pid = (s, name) => s.players.find((p) => p.name === name).id;

function game6() {
  return E.newGame({ names: ['Moi', 'Paul', 'Léa', 'Marc', 'Sophie', 'Hugo'], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, stack: 2000 });
}

// 1. Ce que chaque joueur a fait pendant une main
// BTN = Moi, SB = Paul, BB = Léa, UTG = Marc, MP = Sophie, CO = Hugo
const s = game6();
ok(E.startHand(s));
ok(E.chooseCards(s, ['Ac', 'Kk']));
act(s, 'r', 60);   // UTG Marc relance
act(s, 's');       // MP Sophie suit
act(s, 'f');       // CO Hugo couché
act(s, 's');       // moi
act(s, 'f');       // SB Paul couché
act(s, 's');       // BB Léa suit
ok(E.addStreet(s, ['Kc', '7t', '2k']));
act(s, 'x');       // Léa check
act(s, 'r', 100);  // Marc mise
act(s, 'f');       // Sophie se couche face à la mise
act(s, 's');       // moi
act(s, 'r', 300);  // Léa relance
act(s, 'f');       // Marc couché face à la relance
act(s, 's');       // moi
ok(E.addStreet(s, ['5c']));
act(s, 'r', 400);  // Léa mise
act(s, 'f');       // moi
assert.strictEqual(s.hand.phase, 'done');
const st = P.handStats(s.hand);
const S = (n) => st[pid(s, n)];
assert.deepStrictEqual(S('Marc'), { n: 1, vpip: 1, pfr: 1, agg: 1, calls: 0, faced: 1, foldBet: 1 });
assert.deepStrictEqual(S('Sophie'), { n: 1, vpip: 1, pfr: 0, agg: 0, calls: 0, faced: 1, foldBet: 1 });
assert.deepStrictEqual(S('Hugo'), { n: 1, vpip: 0, pfr: 0, agg: 0, calls: 0, faced: 0, foldBet: 0 });
assert.deepStrictEqual(S('Paul'), { n: 1, vpip: 0, pfr: 0, agg: 0, calls: 0, faced: 0, foldBet: 0 });
assert.deepStrictEqual(S('Léa'), { n: 1, vpip: 1, pfr: 0, agg: 2, calls: 0, faced: 1, foldBet: 0 });
console.log('✓ statistiques d\'une main');

// 2. Enregistrement : une main rejouée (après « Annuler ») remplace l'ancienne au lieu de compter deux fois
let db = P.record(null, 'g:1', s.hand, 'g');
db = P.record(db, 'g:1', s.hand, 'g');
assert.strictEqual(db.p.marc.n, 1);
assert.strictEqual(db.p.marc.pfr, 1);
assert.ok(!db.p.moi, 'je ne suis pas dans les profils');
db = P.record(db, 'g:2', s.hand, 'g');
assert.strictEqual(db.p.marc.n, 2);
P.forget(db, 'g:2');
assert.strictEqual(db.p.marc.n, 1);
assert.strictEqual(P.keyFor('Joueur 3', 'abc'), 'abc|joueur 3');
assert.strictEqual(P.keyFor(' Paul ', 'abc'), 'paul');
console.log('✓ enregistrement sans double compte');

// 3. Style en mots simples
assert.strictEqual(P.profile({ n: 5, vpip: 5, pfr: 5 }), null, 'trop peu de mains');
const fish = P.profile({ n: 20, vpip: 11, pfr: 1, agg: 2, calls: 10, faced: 10, foldBet: 1 });
assert.strictEqual(fish.short, 'large · passif');
assert.ok(fish.text.includes('ne le bluffe pas'), fish.text);
const rock = P.profile({ n: 30, vpip: 4, pfr: 3, agg: 4, calls: 2, faced: 8, foldBet: 6 });
assert.strictEqual(rock.short, 'serré · agressif');
assert.ok(rock.text.includes('se bluffe bien'), rock.text);
assert.ok(rock.bluff > 0.3 && fish.loose > rock.loose);
console.log('✓ styles : ' + fish.short + ' / ' + rock.short);

// 4. Ligne pour Claude
const s2 = game6();
ok(E.startHand(s2));
const lookup = (name) => ({ marc: { n: 30, vpip: 12, pfr: 3, faced: 10, foldBet: 7 }, léa: { n: 3, vpip: 1, pfr: 1 } })[P.keyFor(name)];
assert.strictEqual(P.claudeLine(s2.hand, lookup), 'profils (mains jouées/relancées avant le flop/couché face à une mise, en %) : UTG 40/10/70 sur 30');
assert.ok(E.buildPrompt(s2).includes('profils (…) : UTG 45/8/70 sur 30'));
assert.ok(E.buildAutoPrompt().includes('Retiens'));
console.log('✓ ligne des profils pour Claude');

// 5. Ce que les cartes font avec le tableau
const I = (cs) => cs.map(O.toInt);
const cn = (hole, board) => { const b = I(board); return O.connect(I(hole)[0], I(hole)[1], b, O.score7(b) >> 20); };
const flop = ['Kc', '7t', '2k'];
assert.strictEqual(cn(['Kp', 'Qp'], flop).level, 2);  // paire max
assert.strictEqual(cn(['7p', '6p'], flop).level, 1);  // petite paire
assert.strictEqual(cn(['Ap', 'Ac'], flop).level, 2);  // paire en main au-dessus
assert.strictEqual(cn(['Kp', '7c'], flop).level, 3);  // double paire
assert.strictEqual(cn(['Qp', 'Jp'], flop).level, 0);
assert.strictEqual(cn(['8c', '9c'], ['Kc', '7c', '2k']).draw, true); // tirage couleur
assert.strictEqual(cn(['8p', '6p'], ['7c', '5k', 'Kc']).draw, true); // quinte ouverte
assert.strictEqual(cn(['Ap', '2p'], ['3c', '4k', 'Kc']).draw, false); // A-2-3-4 : un seul côté
assert.strictEqual(cn(['Ap', 'Qp'], ['Jc', '7k', '2c']).over, true);
console.log('✓ lecture du tableau');

// 6. Probabilités contre les mains probables
const near = (x, target, tol, label) => assert.ok(Math.abs(x - target) <= tol, `${label} : ${(x * 100).toFixed(1)} % au lieu de ≈ ${target * 100} %`);
const any = { range: null, minus: null, acts: [], bluff: 0.3, loose: 0.25 };
near(O.equityVs(['Ap', 'Ac'], [], [any], 20000).equity, 0.85, 0.02, 'AA contre une main quelconque');
const threeBet = Object.assign({}, any, O.playerRange({ raised: true, raiseOver: true, reraiseCount: 1 }, null));
const akVs3bet = O.equityVs(['Ap', 'Kc'], [], [threeBet], 15000).equity;
assert.ok(akVs3bet < 0.5 && akVs3bet > 0.3, 'AKo contre une sur-relance : ' + akVs3bet);
const nines = O.equityVs(['9p', '9c'], flop, [any], 8000).equity;
const ninesVsBet = O.equityVs(['9p', '9c'], flop, [Object.assign({}, any, { acts: [{ street: 1, kind: 'bet' }] })], 8000).equity;
const ninesVsRaise = O.equityVs(['9p', '9c'], flop, [Object.assign({}, any, { acts: [{ street: 1, kind: 'raise' }] })], 8000).equity;
assert.ok(ninesVsBet < nines - 0.06 && ninesVsRaise < ninesVsBet - 0.08, [nines, ninesVsBet, ninesVsRaise].join(' / '));
console.log(`✓ 9-9 sur K-7-2 : ${Math.round(nines * 100)} % au hasard, ${Math.round(ninesVsBet * 100)} % s'il mise, ${Math.round(ninesVsRaise * 100)} % s'il relance ; AKo contre une sur-relance : ${Math.round(akVs3bet * 100)} %`);
// un joueur large qui relance a des mains plus faibles qu'un joueur serré
const open = (pr) => Object.assign({}, any, O.playerRange({ raised: true }, pr));
const vsLoose = O.equityVs(['Ap', 'Jc'], [], [open({ vpip: 0.5, pfr: 0.35 })], 15000).equity;
const vsTight = O.equityVs(['Ap', 'Jc'], [], [open({ vpip: 0.12, pfr: 0.06 })], 15000).equity;
assert.ok(vsLoose > vsTight + 0.08, vsLoose + ' / ' + vsTight);
console.log(`✓ AJo contre la relance d'un joueur large : ${Math.round(vsLoose * 100)} %, d'un joueur serré : ${Math.round(vsTight * 100)} %`);
// vitesse : 3 adversaires avec mains probables et mises
const t0 = Date.now();
O.equityVs(['Ak', 'Kk'], ['Kc', '7t', '2k'], [threeBet, open(null), Object.assign({}, any, { acts: [{ street: 1, kind: 'bet' }] })]);
const ms = Date.now() - t0;
assert.ok(ms < 300, ms + ' ms');
console.log('✓ calcul en ' + ms + ' ms');

// 7. Le conseil avant le flop s'adapte au relanceur
const adv = (o) => O.preflopAdvice(Object.assign({ n: 6, pos: 'CO', bb: 20, sb: 10, cb: 60, myBet: 0, myStack: 2000, raises: 1, limpers: 0 }, o));
assert.strictEqual(adv({ cards: ['Ac', 'Qk'] }).action, 'call');
assert.strictEqual(adv({ cards: ['Ac', 'Qk'], raiser: { name: 'Marc', pfr: 0.35 } }).action, 'raise');
assert.strictEqual(adv({ cards: ['Qc', 'Qk'], raiser: { name: 'Marc', pfr: 0.05 } }).action, 'call');
assert.strictEqual(adv({ cards: ['8c', '8k'], raiser: { name: 'Marc', pfr: 0.05 } }).action, 'fold');
assert.strictEqual(adv({ cards: ['Kc', '9c'], raiser: { name: 'Marc', pfr: 0.35 } }).action, 'call');
assert.ok(adv({ cards: ['Kc', '9c'], raiser: { name: 'Marc', pfr: 0.35 } }).why.includes('Marc relance 35 %'));
console.log('✓ conseil adapté au relanceur');
console.log('\nTests profils OK');
