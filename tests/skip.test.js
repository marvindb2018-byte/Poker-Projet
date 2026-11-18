// « Passer le tour » : main pas suivie
const assert = require('assert');
const E = require('../engine.js');
const ok = (r) => { assert.ok(r && r.ok, r && r.err); return r; };
const s = E.newGame({ names: ['Moi', 'A', 'B', 'C', 'D', 'F'], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, stack: 2000 });
ok(E.startHand(s));
const btn1 = s.hand.btnId;
ok(E.chooseCards(s, ['Ac', 'Kk']));
ok(E.applyAction(s, { type: 'r', to: 60 }));   // UTG relance : des jetons sont misés
ok(E.applyAction(s, { type: 's' }));
ok(E.skipHand(s));
assert.strictEqual(s.hand, null);
assert.ok(s.players.every((p) => p.stack === 2000), 'jetons d\'avant la main');
assert.strictEqual(s.handNo, 1);
assert.ok(s.last.skipped);
ok(E.startHand(s));
assert.notStrictEqual(s.hand.btnId, btn1, 'le jeton D a avancé');
assert.strictEqual(s.hand.no, 2);
const total = s.hand.order.reduce((a, id) => a + s.hand.stack[id], 0) + E.potOf(s.hand);
assert.strictEqual(total, 12000, 'aucun jeton perdu');
console.log('✓ main passée : jeton D avancé, jetons d\'avant la main, main suivante n°2');
console.log('\nPasser le tour OK');
