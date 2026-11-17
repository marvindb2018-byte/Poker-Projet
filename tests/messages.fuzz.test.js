/*
 * Vérifie, sur des milliers de mains jouées au hasard, que chaque message envoyé à Claude :
 *  - respecte la notation (chaque ligne a une forme connue, rien d'« undefined » ou de « NaN ») ;
 *  - dit toujours qui a fait quoi : aucune action des autres joueurs n'est perdue entre deux messages ;
 *  - donne ma position et mes cartes dans le premier message de la main, avec ce qui s'est passé avant moi.
 * Lancer : node tests/messages.fuzz.test.js
 */
const assert = require('assert');
const E = require('../engine.js');

let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const POS = '(?:UTG\\+[12]|UTG|MP\\+[12]|MP|CO|BTN|SB|BB)';
const ACT = `${POS} (?:f|x|s|b\\d+|r\\d+|AI\\d+)`;
const ACTS = `${ACT}(?:, ${ACT})*`;
const CARD = '[AKQJT2-9][pckt]';
const TAIL = `(?:${ACTS}|tous couchés|je parle en premier)`;
const LINE = [
  new RegExp(`^table \\d+ joueurs \\(${POS}(?:, ${POS})*\\)(?: — le BTN est aussi SB)?(?:, blindes \\d+/\\d+)?$`),
  new RegExp('^blindes \\d+/\\d+$'),
  new RegExp(`^tapis ${POS} \\d+(?:, ${POS} \\d+)*$`),
  new RegExp(`^${POS} ${CARD}${CARD} \\| ${TAIL}$`),
  new RegExp(`^\\+(?:${CARD}){1,3} pot \\d+ \\| ${TAIL}$`),
  new RegExp(`^${ACTS}$`),
];

let hands = 0, messages = 0, checked = 0;
for (let g = 0; g < 60; g++) {
  const n = 2 + (g % 9);
  const names = Array.from({ length: n }, (_, i) => (i ? 'J' + i : 'Moi'));
  const s = E.newGame({ names, stacks: names.map(() => 200 + Math.floor(rnd() * 4000)), meIndex: 0, btnIndex: Math.floor(rnd() * n), sb: 10, bb: 20 });
  s.promptCopied = true;
  for (let k = 0; k < 60; k++) {
    // de temps en temps : la table change (arrivée, départ, blindes, recave)
    if (rnd() < 0.08 && s.players.length < 10) E.addPlayer(s, { name: 'N' + k, stack: 500 + Math.floor(rnd() * 3000), afterId: pick(s.players).id });
    if (rnd() < 0.05) { const o = s.players.filter((p) => !p.me); if (o.length > 1) E.removePlayer(s, pick(o).id); }
    if (rnd() < 0.05) E.updateSettings(s, { sb: s.settings.sb * 2, bb: s.settings.bb * 2 });
    s.players.forEach((p) => { if (p.stack === 0) p.stack = 1000; });
    if (!E.startHand(s).ok) break;
    hands++;
    const h = s.hand;
    if (h.phase === 'spectate') { E.endHand(s); continue; }
    const deck = [];
    E.RANKS.forEach((r) => E.SUITS.forEach((u) => deck.push(r + u)));
    deck.sort(() => rnd() - 0.5);
    assert.ok(E.chooseCards(s, [deck.pop(), deck.pop()]).ok);
    const sent = [];
    let guard = 0;
    while (h.phase !== 'done' && guard++ < 300) {
      if (h.phase === 'action') {
        if (h.toAct === h.meId) {
          const m = E.buildMessage(s);
          sent.push(m);
          messages++;
          assert.ok(m.length > 0, 'message vide');
          assert.ok(!/undefined|NaN|null/.test(m), m);
          for (const line of m.split('\n')) assert.ok(LINE.some((re) => re.test(line)), 'ligne inconnue : « ' + line + ' »\n' + m);
          if (sent.length === 1) {
            assert.ok(m.includes(h.pos[h.meId] + ' ' + h.cards.join('') + ' | '), 'pas de ligne « position + cartes » :\n' + m);
            assert.ok(/^tapis /m.test(m), 'pas de ligne tapis :\n' + m);
          }
        }
        const o = E.options(h, h.toAct);
        const x = rnd();
        let a;
        if (x < 0.25) a = { type: o.canCheck ? 'x' : 'f' };
        else if (x < 0.6) a = { type: o.canCheck ? 'x' : 's' };
        else if (x < 0.9 && o.canRaise) a = { type: 'r', to: Math.min(o.maxTo, o.minTo + Math.floor(rnd() * 200)) };
        else if (x < 0.95) a = { type: 'AI' };
        else a = { type: o.canCheck ? 'x' : 'f' };
        assert.ok(E.applyAction(s, a).ok);
      } else if (h.phase === 'board') {
        assert.ok(E.addStreet(s, h.street === 0 ? [deck.pop(), deck.pop(), deck.pop()] : [deck.pop()]).ok);
      } else if (h.phase === 'showdown') {
        const c = E.showdownCandidates(h);
        assert.ok(E.declareWinners(s, [pick(c)]).ok);
      }
    }
    assert.strictEqual(h.phase, 'done');
    // Rien n'est perdu : chaque action non « couché » des autres, faite avant ma dernière décision,
    // apparaît exactement une fois dans les messages envoyés.
    const lastMine = h.events.map((e, i) => (e.t === 'act' && e.mine ? i : -1)).filter((i) => i >= 0).pop();
    if (lastMine != null) {
      const expected = h.events.slice(0, lastMine).filter((e) => e.t === 'act' && !e.mine && e.a !== 'f').length;
      const text = h.sent.join('\n');
      const found = (text.match(new RegExp(ACT, 'g')) || []).filter((t) => !/ f$/.test(t)).length;
      assert.strictEqual(found, expected, 'actions perdues ou en double :\n' + text);
      assert.deepStrictEqual(h.sent, sent);
      checked++;
    }
    E.endHand(s);
  }
}
console.log(`✓ ${hands} mains simulées, ${messages} messages vérifiés, ${checked} mains contrôlées de bout en bout`);
