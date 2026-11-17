const assert = require('assert');
const E = require('../engine.js');

const id = (s, name) => s.players.find((p) => p.name === name).id;
const ok = (r) => { assert.ok(r && r.ok, r && r.err); return r; };
const act = (s, type, to) => ok(E.applyAction(s, { type, to }));
const who = (s) => s.hand.pos[s.hand.toAct];
const chips = (s) => s.players.reduce((a, p) => a + p.stack, 0);

function game6() {
  return E.newGame({ names: ['Moi', 'A', 'B', 'C', 'D', 'E'], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, stack: 2000 });
}

let t = 0;
function test(name, fn) { fn(); t++; console.log('✓', name); }

test('positions 6 joueurs et premier message', () => {
  const s = game6();
  ok(E.startHand(s));
  const h = s.hand;
  assert.deepStrictEqual(h.pre.map((x) => h.pos[x]), ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']);
  assert.strictEqual(h.pos[h.meId], 'BTN');
  assert.strictEqual(E.potOf(h), 30);
  ok(E.chooseCards(s, ['Ac', 'Kk']));
  assert.strictEqual(who(s), 'UTG');
  act(s, 'r', 60); act(s, 'f'); act(s, 's');
  assert.strictEqual(s.hand.toAct, s.hand.meId);
  assert.strictEqual(E.buildMessage(s), 'tapis UTG 2000, MP 2000, CO 2000, BTN 2000, SB 2000, BB 2000\nBTN AcKk | UTG r60, CO s');
});

test('réactions, flop, relance, abandon et tapis finaux', () => {
  const s = game6();
  E.startHand(s); E.chooseCards(s, ['Ac', 'Kk']);
  act(s, 'r', 60); act(s, 'f'); act(s, 's');
  act(s, 'r', 180); // moi
  act(s, 'f'); act(s, 'f'); // SB, BB
  assert.strictEqual(who(s), 'UTG');
  act(s, 's'); act(s, 'f'); // UTG suit, CO couché
  assert.strictEqual(s.hand.phase, 'board');
  assert.strictEqual(E.potOf(s.hand), 450);
  ok(E.addStreet(s, ['Kc', '7t', '2k']));
  assert.strictEqual(who(s), 'UTG');
  act(s, 'x');
  assert.strictEqual(E.buildMessage(s), '(moi r180)\nUTG s\n+Kc7t2k pot 450 | UTG x');
  act(s, 'r', 200); // moi : mise 200
  assert.strictEqual(s.hand.events[s.hand.events.length - 1].a, 'b');
  act(s, 'r', 600);
  assert.strictEqual(E.buildMessage(s), '(moi b200)\nUTG r600');
  act(s, 's'); // moi
  assert.strictEqual(s.hand.phase, 'board');
  ok(E.addStreet(s, ['5c']));
  act(s, 'x');
  assert.strictEqual(E.buildMessage(s), '(moi s)\n+5c pot 1650 | UTG x');
  act(s, 'x');
  ok(E.addStreet(s, ['9p']));
  act(s, 'r', 500);
  assert.strictEqual(E.buildMessage(s), '(moi x)\n+9p pot 1650 | UTG b500');
  act(s, 'f');
  assert.strictEqual(s.hand.phase, 'done');
  assert.strictEqual(s.hand.sent.length, 5);
  const utg = s.players.find((p) => p.name === 'C');
  assert.strictEqual(utg.stack, 2000 - 180 - 600 - 500 + 2150);
  assert.strictEqual(s.players[0].stack, 2000 - 180 - 600);
  assert.strictEqual(chips(s), 12000);
  ok(E.endHand(s));
  assert.ok(s.last && s.last.pots[0].amount === 2150);

  // main suivante : le bouton avance, je suis CO, tapis signalés
  ok(E.startHand(s));
  const h = s.hand;
  assert.strictEqual(h.pos[h.meId], 'CO');
  E.chooseCards(s, ['9c', '9t']);
  ok(E.checkFoldUntilMe(s));
  assert.strictEqual(E.buildMessage(s), 'tapis UTG 2000, MP 1940, CO 1220, BTN 1990, SB 1980, BB 2870\nCO 9c9t | tous couchés');
});

test('tout le monde se couche après ma relance : je gagne les blindes', () => {
  const s = game6();
  E.startHand(s); E.chooseCards(s, ['As', 'Ah'].map((c) => c[0] + 'p').slice(0, 1).concat(['Ac']));
  ok(E.checkFoldUntilMe(s));
  act(s, 'r', 60);
  ok(E.checkFoldUntilMe(s));
  assert.strictEqual(s.hand.phase, 'done');
  assert.strictEqual(s.players[0].stack, 2030);
  assert.strictEqual(chips(s), 12000);
});

test('tapis multiples et pots annexes', () => {
  const s = E.newGame({ names: ['Moi', 'A', 'B'], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, stack: 2000 });
  ok(E.updatePlayer(s, id(s, 'A'), { stack: 500 }));
  ok(E.updatePlayer(s, id(s, 'B'), { stack: 1500 }));
  ok(E.updatePlayer(s, id(s, 'Moi'), { stack: 3000 }));
  E.startHand(s); // moi BTN, A SB, B BB
  const h = s.hand;
  assert.deepStrictEqual(h.pre.map((x) => h.pos[x]), ['BTN', 'SB', 'BB']);
  E.chooseCards(s, ['Qc', 'Qk']);
  assert.strictEqual(E.buildMessage(s), 'tapis BTN 3000, SB 500, BB 1500\nBTN QcQk | je parle en premier');
  act(s, 'r', 60); // moi
  act(s, 'AI'); // A tapis 500
  act(s, 'AI'); // B tapis 1500
  assert.strictEqual(E.buildMessage(s), '(moi r60)\nSB AI500, BB AI1500');
  act(s, 's'); // moi suit 1500
  assert.strictEqual(s.hand.phase, 'showdown');
  assert.deepStrictEqual(s.hand.pots.map((p) => p.amount), [1500, 2000]);
  ok(E.declareWinners(s, [id(s, 'A')]));
  assert.strictEqual(s.hand.phase, 'showdown');
  assert.deepStrictEqual(E.showdownCandidates(s.hand).sort(), [id(s, 'B'), id(s, 'Moi')].sort());
  ok(E.declareWinners(s, [id(s, 'Moi')]));
  assert.strictEqual(s.hand.phase, 'done');
  assert.strictEqual(s.players.find((p) => p.name === 'A').stack, 1500);
  assert.strictEqual(s.players.find((p) => p.name === 'B').stack, 0);
  assert.strictEqual(s.players.find((p) => p.name === 'Moi').stack, 3500);
  ok(E.endHand(s));
  // B éliminé : la main suivante se joue à 2
  ok(E.startHand(s));
  assert.strictEqual(s.hand.order.length, 2);
  E.chooseCards(s, ['2c', '7k']);
  assert.ok(E.buildMessage(s).startsWith('table 2 joueurs (BTN, BB) — le BTN est aussi SB\n'));
});

test('mise non suivie rendue + partage avec jeton impair', () => {
  const s = E.newGame({ names: ['Moi', 'A', 'B', 'C'], meIndex: 0, btnIndex: 0, sb: 5, bb: 10, stack: 1000 });
  ok(E.updatePlayer(s, id(s, 'B'), { stack: 200 }));
  E.startHand(s); // ordre : A SB, B BB, C UTG, Moi BTN
  E.chooseCards(s, ['Ac', 'Ak']);
  act(s, 's'); // C limp
  act(s, 's'); // moi
  act(s, 's'); // A complète
  act(s, 'x'); // B
  E.addStreet(s, ['2c', '3c', '4c']);
  act(s, 'r', 500); // A mise 500
  act(s, 'AI'); // B tapis 190 (pour moins)
  act(s, 'f'); // C
  act(s, 'f'); // moi
  assert.strictEqual(s.hand.phase, 'showdown');
  // pot principal : 4*10 + 190 + 190 = 420 ; annexe : 310 rendu à A
  assert.deepStrictEqual(s.hand.pots.map((p) => p.amount), [420, 310]);
  ok(E.declareWinners(s, [id(s, 'A'), id(s, 'B')]));
  assert.strictEqual(s.players.find((p) => p.name === 'A').stack, 1000 - 500 - 10 + 310 + 210);
  assert.strictEqual(s.players.find((p) => p.name === 'B').stack, 210);
  assert.strictEqual(chips(s), 1000 * 3 + 200);
});

test('tête-à-tête : le bouton paie la SB et parle en premier préflop', () => {
  const s = E.newGame({ names: ['Moi', 'A'], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, stack: 2000 });
  E.startHand(s);
  const h = s.hand;
  assert.strictEqual(h.pos[h.meId], 'BTN');
  assert.strictEqual(h.bet[h.meId], 10);
  E.chooseCards(s, ['Tc', '9c']);
  assert.strictEqual(h.toAct, h.meId);
  assert.strictEqual(E.buildMessage(s), 'tapis BTN 2000, BB 2000\nBTN Tc9c | je parle en premier');
  act(s, 's');
  assert.strictEqual(who(s), 'BB');
  act(s, 'x');
  E.addStreet(s, ['2p', '7c', 'Kk']);
  assert.strictEqual(who(s), 'BB'); // la BB parle en premier après le flop
  act(s, 'x');
  assert.strictEqual(E.buildMessage(s), '(moi s)\nBB x\n+2p7cKk pot 40 | BB x');
});

test('arrivée, départ, bouton et ligne « table »', () => {
  const s = game6();
  s.promptCopied = true;
  E.startHand(s); E.chooseCards(s, ['Ac', 'Kk']);
  ok(E.checkFoldUntilMe(s)); act(s, 'f');
  // je suis couché : on termine la main en désignant le gagnant
  ok(E.forceShowdown(s));
  ok(E.declareWinners(s, [E.showdownCandidates(s.hand)[0]]));
  ok(E.endHand(s));
  assert.ok(!E.addPlayer(s, { name: 'Zoé', stack: 0 }).ok);
  ok(E.addPlayer(s, { name: 'Zoé', stack: 1500, afterId: id(s, 'C') }));
  ok(E.removePlayer(s, id(s, 'A'))); // A avait la SB, B devient le bouton
  const plan = E.planNextHand(s);
  assert.strictEqual(plan.btnId, id(s, 'B'));
  ok(E.startHand(s));
  E.chooseCards(s, ['5c', '5k']);
  const m = E.buildMessage(s).split('\n');
  assert.strictEqual(s.hand.order.length, 6); // 1 arrivée + 1 départ : toujours 6, pas de ligne « table »
  assert.ok(/^tapis .*1500/.test(m[0]), m[0]);
  ok(E.abortHand(s));
  ok(E.addPlayer(s, { name: 'Léo', stack: 2000 }));
  ok(E.startHand(s));
  E.chooseCards(s, ['5c', '5k']);
  assert.ok(E.buildMessage(s).startsWith('table 7 joueurs (UTG, UTG+1, MP, CO, BTN, SB, BB)\n'));
  assert.ok(E.planNextHand(s).ok);
  // pas de modification de la table pendant une main
  assert.ok(!E.removePlayer(s, id(s, 'B')).ok);
  // abandon : bouton, compteur et « ce que Claude sait » reviennent
  ok(E.abortHand(s));
  assert.strictEqual(s.told.n, 6);
  ok(E.removePlayer(s, id(s, 'Léo')));
  assert.strictEqual(E.planNextHand(s).btnId, id(s, 'B'));
  // bouton imposé
  ok(E.setButtonNext(s, id(s, 'Moi')));
  ok(E.startHand(s));
  assert.strictEqual(s.hand.pos[s.hand.meId], 'BTN');
});

test('un joueur arrive pendant une main : il joue à la suivante', () => {
  const s = game6();
  E.startHand(s); E.chooseCards(s, ['Ac', 'Kk']);
  act(s, 'r', 60);
  ok(E.addPlayer(s, { name: 'Zoé', stack: 3000, afterId: id(s, 'C') }));
  assert.strictEqual(s.hand.order.length, 6); // pas dans la main en cours
  assert.ok(!s.hand.order.includes(id(s, 'Zoé')));
  ok(E.checkFoldUntilMe(s)); act(s, 'f');
  ok(E.forceShowdown(s)); ok(E.declareWinners(s, E.showdownCandidates(s.hand).slice(0, 1)));
  assert.strictEqual(chips(s), 12000 + 3000);
  ok(E.endHand(s));
  ok(E.startHand(s)); E.chooseCards(s, ['2c', '2k']);
  assert.strictEqual(s.hand.order.length, 7);
  assert.ok(s.hand.order.includes(id(s, 'Zoé')));
  const m = E.buildMessage(s).split('\n');
  assert.strictEqual(m[0], 'table 7 joueurs (UTG, UTG+1, MP, CO, BTN, SB, BB)');
  assert.ok(m[1].includes(' 3000'), m[1]);
});

test('changement de blindes signalé une seule fois', () => {
  const s = game6();
  ok(E.updateSettings(s, { sb: 20, bb: 40 }));
  E.startHand(s); E.chooseCards(s, ['Ac', 'Kk']);
  assert.ok(E.buildMessage(s).startsWith('blindes 20/40\n'));
  ok(E.checkFoldUntilMe(s)); act(s, 'f');
  ok(E.forceShowdown(s)); ok(E.declareWinners(s, E.showdownCandidates(s.hand).slice(0, 1)));
  ok(E.endHand(s));
  E.startHand(s); E.chooseCards(s, ['2c', '2k']);
  assert.ok(!E.buildMessage(s).includes('blindes'));
});

test('validation des actions', () => {
  const s = game6();
  E.startHand(s); E.chooseCards(s, ['Ac', 'Kk']);
  assert.ok(!E.applyAction(s, { type: 'x' }).ok); // UTG ne peut pas checker
  assert.ok(!E.applyAction(s, { type: 'r', to: 20 }).ok);
  assert.ok(!E.chooseCards(s, ['Ac', 'Kk']).ok);
  act(s, 'r', 99999); // > tapis : devient tapis
  assert.strictEqual(s.hand.events[s.hand.events.length - 1].a, 'AI');
  assert.strictEqual(s.hand.events[s.hand.events.length - 1].amt, 2000);
});

test('tapis différents dès la création', () => {
  const s = E.newGame({ names: ['Moi', 'A', 'B'], stacks: [1500, 2500, '3000'], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, stack: 2000 });
  assert.deepStrictEqual(s.players.map((p) => p.stack), [1500, 2500, 3000]);
  E.startHand(s); E.chooseCards(s, ['Ac', 'Ad'.replace('d', 'k')]);
  assert.strictEqual(E.buildMessage(s), 'tapis BTN 1500, SB 2500, BB 3000\nBTN AcAk | je parle en premier');
});

test('je parle en premier : c\'est écrit explicitement', () => {
  const s = E.newGame({ names: ['Moi', 'A', 'B'], stacks: [201, 2161, 91], meIndex: 0, btnIndex: 0, sb: 10, bb: 20 });
  E.startHand(s); E.chooseCards(s, ['Qc', '3k']);
  assert.strictEqual(E.buildMessage(s), 'tapis BTN 201, SB 2161, BB 91\nBTN Qc3k | je parle en premier');
  act(s, 's'); act(s, 's'); act(s, 'x');
  E.addStreet(s, ['Kc', '7t', '2k']);
  act(s, 'x'); act(s, 'x');
  assert.strictEqual(E.buildMessage(s), '(moi s)\nSB s, BB x\n+Kc7t2k pot 60 | SB x, BB x');
  act(s, 'x');
  E.addStreet(s, ['5c']);
  act(s, 'r', 40); // SB mise
  act(s, 'f');
  assert.strictEqual(E.buildMessage(s), '(moi x)\n+5c pot 60 | SB b40');
  assert.ok(E.buildPrompt(s).includes('je parle en premier'));
});

test('ante classique : chaque joueur paie, le pot de départ est donné', () => {
  const s = E.newGame({ names: ['Moi', 'A', 'B', 'C', 'D', 'E'], stacks: [2000, 2000, 2000, 2000, 3, 2000], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, ante: 5 });
  ok(E.startHand(s)); E.chooseCards(s, ['Ac', 'Kk']);
  const h = s.hand;
  // D (MP) n'a que 3 jetons : il est à tapis avec son ante
  assert.strictEqual(E.potOf(h), 30 + 5 * 5 + 3);
  assert.ok(h.allin[id(s, 'D')]);
  assert.strictEqual(h.cb, 20); // l'ante ne compte pas dans la mise à suivre
  assert.strictEqual(E.options(h, h.toAct).toCall, 20);
  act(s, 'f'); act(s, 's');
  assert.strictEqual(E.buildMessage(s), 'tapis UTG 2000, MP 3, CO 2000, BTN 2000, SB 2000, BB 2000\nBTN AcKk pot 58 | CO s');
  act(s, 's'); act(s, 'f'); act(s, 'x');
  assert.strictEqual(h.phase, 'board');
  E.addStreet(s, ['2c', '3c', '4c']);
  assert.strictEqual(h.events[h.events.length - 1].pot, 58 + 20 + 20); // CO et moi suivons, la SB se couche
  assert.ok(E.buildPrompt(s).includes('ante 5 (payée par chaque joueur)'));
});

test('ante grosse blinde : seule la BB paie, la blinde passe avant si tapis court', () => {
  const s = E.newGame({ names: ['Moi', 'A', 'B'], stacks: [2000, 2000, 30], meIndex: 0, btnIndex: 0, sb: 10, bb: 20, ante: 20, anteType: 'bb' });
  ok(E.startHand(s)); E.chooseCards(s, ['Ac', 'Kk']);
  const h = s.hand; // moi BTN, A SB, B BB avec 30 jetons : 20 de blinde puis 10 d'ante
  assert.strictEqual(h.bet[id(s, 'B')], 20);
  assert.strictEqual(h.total[id(s, 'B')], 30);
  assert.strictEqual(E.potOf(h), 10 + 30);
  assert.strictEqual(E.buildMessage(s), 'tapis BTN 2000, SB 2000, BB 30\nBTN AcKk pot 40 | je parle en premier');
  assert.ok(E.buildPrompt(s).includes("ante BB 20 (la grosse blinde paie l'ante pour toute la table)"));
  act(s, 's'); act(s, 's');
  assert.strictEqual(h.phase, 'board'); // BB à tapis : plus d'enchère préflop
});

test('changement d\'ante signalé, et « sans ante » quand elle disparaît', () => {
  const s = game6();
  ok(E.updateSettings(s, { ante: 5 }));
  E.startHand(s); E.chooseCards(s, ['Ac', 'Kk']);
  assert.ok(E.buildMessage(s).startsWith('blindes 10/20, ante 5\n'));
  ok(E.abortHand(s));
  ok(E.updateSettings(s, { anteType: 'bb', ante: 20 }));
  E.startHand(s); E.chooseCards(s, ['Ac', 'Kk']);
  assert.ok(E.buildMessage(s).startsWith('blindes 10/20, ante BB 20\n'));
  ok(E.checkFoldUntilMe(s)); act(s, 'f');
  ok(E.forceShowdown(s)); ok(E.declareWinners(s, E.showdownCandidates(s.hand).slice(0, 1)));
  ok(E.endHand(s));
  ok(E.updateSettings(s, { ante: 0 }));
  E.startHand(s); E.chooseCards(s, ['2c', '2k']);
  assert.ok(E.buildMessage(s).startsWith('blindes 10/20, sans ante\n'));
  assert.ok(!E.updateSettings(s, { anteType: 'autre' }).ok);
});

test('prompt de départ', () => {
  const s = game6();
  const p = E.buildPrompt(s);
  assert.ok(p.includes('Table : 6 joueurs, blindes 10/20.'));
  assert.ok(p.includes('Positions : UTG, MP, CO, BTN, SB, BB.'));
});

test('main simulée au hasard : jetons conservés sur 300 mains', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = E.newGame({ names: ['Moi', 'A', 'B', 'C', 'D', 'E', 'F'], meIndex: 0, btnIndex: 3, sb: 10, bb: 20, stack: 1000 });
  const total = chips(s);
  const deck = () => { const d = []; E.RANKS.forEach((r) => E.SUITS.forEach((u) => d.push(r + u))); return d.sort(() => rnd() - 0.5); };
  for (let n = 0; n < 300; n++) {
    if (E.planNextHand(s).ok === false) { s.players.forEach((p) => { if (p.stack === 0) p.stack = 1000; }); }
    const before = chips(s);
    const r = E.startHand(s);
    if (!r.ok) break;
    const d = deck();
    if (s.hand.phase === 'spectate') { ok(E.endHand(s)); continue; }
    ok(E.chooseCards(s, [d.pop(), d.pop()]));
    let guard = 0;
    while (s.hand.phase !== 'done' && guard++ < 200) {
      const h = s.hand;
      if (h.phase === 'action') {
        const o = E.options(h, h.toAct);
        const x = rnd();
        if (x < 0.2 && !o.canCheck) act(s, 'f');
        else if (x < 0.6) act(s, o.canCheck ? 'x' : 's');
        else if (x < 0.9 && o.canRaise) act(s, 'r', Math.min(o.maxTo, o.minTo + Math.floor(rnd() * 100)));
        else if (x < 0.95) act(s, 'AI');
        else act(s, o.canCheck ? 'x' : 's');
      } else if (h.phase === 'board') {
        ok(E.addStreet(s, h.street === 0 ? [d.pop(), d.pop(), d.pop()] : [d.pop()]));
      } else if (h.phase === 'showdown') {
        const c = E.showdownCandidates(h);
        ok(E.declareWinners(s, rnd() < 0.15 ? c : [c[Math.floor(rnd() * c.length)]]));
      }
    }
    assert.strictEqual(s.hand.phase, 'done');
    assert.strictEqual(chips(s), before, 'main ' + n);
    s.players.forEach((p) => assert.ok(p.stack >= 0));
    ok(E.endHand(s));
  }
  assert.ok(chips(s) >= total);
});

console.log(`\n${t} tests OK`);
