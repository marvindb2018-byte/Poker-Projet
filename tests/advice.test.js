// Situations de manuel : le conseil doit être celui d'un bon joueur.
const assert = require('assert');
const O = require('../odds.js');

const base = { range: null, minus: null, acts: [], bluff: 0.3, loose: 0.25, mix: 0, fold: null, name: 'Paul', toCall: 0, bet: 0 };
const opp = (...o) => Object.assign({}, base, ...o);
const caller = O.playerRange({ called: true }, null);
const opener = O.playerRange({ raised: true, openKey: 'CO' }, null);
const run = (c) => O.postflopAdvice(Object.assign({ pot: 100, toCall: 0, myBet: 0, myStack: 2000, cb: 0, unit: 10, inPos: true, minRaise: 0 }, c), 3000);

const CASES = [
  ['Paire max bon kicker, checké jusqu\'à moi : mise pour la valeur', ['bet'],
    { cards: ['Ap', 'Kc'], board: ['Kk', '7t', '2c'], handName: 'Paire de Rois', opps: [opp(caller)] }],
  ['Rien du tout contre un joueur qui se couche souvent : bluff', ['bet'],
    { cards: ['6p', '5p'], board: ['Kk', 'Qt', '2c'], handName: 'Hauteur 6', opps: [opp(caller, { fold: 0.75 })] }],
  ['Rien du tout contre un payeur : pas de bluff', ['check'],
    { cards: ['6p', '5p'], board: ['Kk', 'Qt', '2c'], handName: 'Hauteur 6', opps: [opp(caller, { fold: 0.15 })] }],
  ['Rien du tout contre 3 adversaires : pas de bluff', ['check'],
    { cards: ['6p', '5p'], board: ['Kk', 'Qt', '2c'], handName: 'Hauteur 6', opps: [opp(caller), opp(caller), opp(caller)] }],
  ['Tirage couleur max face à une demi-mise : on continue', ['call', 'raise'],
    { cards: ['Ac', '9c'], board: ['Kc', '7c', '2t'], pot: 150, toCall: 50, cb: 50, minRaise: 100, handName: 'Hauteur As · tirage couleur', opps: [opp(opener, { acts: [{ street: 1, kind: 'bet', frac: 0.5 }], bet: 50 })] }],
  ['Tirage ventral seul face à une mise du pot à la turn : couché', ['fold'],
    { cards: ['9p', '8p'], board: ['6c', '5t', 'Kk', '2p'], pot: 300, toCall: 150, cb: 150, minRaise: 300, handName: 'Hauteur 9', opps: [opp(opener, { acts: [{ street: 2, kind: 'bet', frac: 1 }], bet: 150 })] }],
  ['Rien face à une mise : couché', ['fold'],
    { cards: ['4p', '3c'], board: ['Kc', 'Qk', '9t'], pot: 150, toCall: 50, cb: 50, minRaise: 100, handName: 'Hauteur 4', opps: [opp(opener, { acts: [{ street: 1, kind: 'bet', frac: 0.5 }], bet: 50 })] }],
  ['Brelan servi : mise pour la valeur', ['bet'],
    { cards: ['7p', '7c'], board: ['7k', '8k', '9t'], handName: 'Brelan de 7', opps: [opp(caller)] }],
  ['River, 2e paire contre un maniaque qui mise : on paie', ['call'],
    { cards: ['Qp', 'Tc'], board: ['Kc', 'Tk', '5t', '3p', '2c'], pot: 400, toCall: 200, cb: 200, minRaise: 400, handName: 'Paire de 10',
      opps: [opp(O.playerRange({ raised: true }, { vpip: 0.6, pfr: 0.45 }), { acts: [{ street: 1, kind: 'bet', frac: 0.7 }, { street: 2, kind: 'bet', frac: 0.7 }, { street: 3, kind: 'bet', frac: 0.5 }], bluff: 0.55, bet: 200 })] }],
  ['River, 2e paire contre un joueur serré passif qui relance : couché', ['fold'],
    { cards: ['Qp', 'Tc'], board: ['Kc', 'Tk', '5t', '3p', '2c'], pot: 600, toCall: 400, cb: 600, myBet: 200, minRaise: 1000, handName: 'Paire de 10',
      opps: [opp(O.playerRange({ called: true }, { vpip: 0.15, pfr: 0.04 }), { acts: [{ street: 3, kind: 'raise', frac: 1 }], bluff: 0.08, bet: 600 })] }],
  ['Couleur max à la river face à une mise : relance (tapis)', ['raise', 'allin'],
    { cards: ['Ap', 'Qp'], board: ['Kp', 'Jp', '5p', '3c', '2k'], pot: 300, toCall: 100, cb: 100, minRaise: 200, myStack: 500, handName: 'Couleur', opps: [opp(opener, { acts: [{ street: 3, kind: 'bet', frac: 0.5 }], bet: 100 })] }],
  ['Peu de jetons et paire max : tapis', ['allin'],
    { cards: ['Ap', 'Kc'], board: ['Kk', '7t', '2c'], pot: 300, myStack: 400, handName: 'Paire de Rois', opps: [opp(caller)] }],
];

let fails = 0;
CASES.forEach(([label, ok, ctx]) => {
  // deux tirages : le conseil doit être stable
  const a = run(ctx), b = run(ctx);
  const good = ok.includes(a.action) && ok.includes(b.action);
  if (!good) fails++;
  console.log((good ? '✓ ' : '✗ ') + label + ' → ' + a.text + (a.action !== b.action ? ' / ' + b.text : ''));
  assert.ok(a.plain && a.plain.length > 40 && a.why && a.gains, label + ' : explication manquante');
});
assert.strictEqual(fails, 0, fails + ' situation(s) mal jouée(s)');

// Avant le flop : vol des blindes quand ceux qui restent jouent très peu
const pre = (o) => O.preflopAdvice(Object.assign({ n: 6, bb: 20, sb: 10, cb: 20, myBet: 0, myStack: 2000, raises: 0, limpers: 0 }, o));
assert.strictEqual(pre({ cards: ['Kc', '8k'], pos: 'CO' }).action, 'fold');
assert.strictEqual(pre({ cards: ['Kc', '8k'], pos: 'CO', behindTight: true }).action, 'raise');
assert.strictEqual(pre({ cards: ['Kc', '8k'], pos: 'UTG', behindTight: true }).action, 'fold');
console.log('✓ vol des blindes contre des joueurs serrés');
console.log('\nSituations de manuel OK');
