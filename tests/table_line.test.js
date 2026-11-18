// Départ rapide : la ligne « TABLE … » de Claude
const assert = require('assert');
const E = require('../engine.js');

let r = E.parseTableLine('TABLE blindes 10/20 | ante 0 | Marvin 2000 (moi) | Paul 1850 (D) | Léa 2300 | Marc 900 | Sophie 2000 (pause) | Hugo 2000');
assert.ok(r.ok, r.err);
assert.deepStrictEqual([r.sb, r.bb, r.ante, r.anteType], [10, 20, 0, 'chacun']);
assert.deepStrictEqual(r.players.map((p) => p.name), ['Marvin', 'Paul', 'Léa', 'Marc', 'Sophie', 'Hugo']);
assert.deepStrictEqual(r.players.map((p) => p.stack), [2000, 1850, 2300, 900, 2000, 2000]);
assert.strictEqual(r.players.findIndex((p) => p.me), 0);
assert.strictEqual(r.players.findIndex((p) => p.btn), 1);
assert.strictEqual(r.players.findIndex((p) => p.paused), 4);
assert.deepStrictEqual(r.warnings, []);
console.log('✓ ligne type');

// Réponse avec du texte autour, des guillemets de code, montants abrégés, pseudos avec espaces, ante BB
r = E.parseTableLine('Voici la table :\n```\nTABLE blindes 1K/2K | ante BB 2K | Le Grand Bob 1,25M (moi) | xX_Dark_Xx 850K | jean-pierre 12 500 (D)\n```\nBonne partie !');
assert.ok(r.ok, r.err);
assert.deepStrictEqual([r.sb, r.bb, r.ante, r.anteType], [1000, 2000, 2000, 'bb']);
assert.deepStrictEqual(r.players.map((p) => [p.name, p.stack]), [['Le Grand Bob', 1250000], ['xX_Dark_Xx', 850000], ['jean-pierre', 12500]]);
assert.strictEqual(r.players.findIndex((p) => p.btn), 2);
console.log('✓ texte autour, 1,25M / 850K / 12 500, pseudos avec espaces, ante BB');

// Informations manquantes : avertissements clairs
r = E.parseTableLine('TABLE blindes ? | ante 0 | Paul 1850 | Léa ?');
assert.ok(r.ok);
assert.strictEqual(r.sb, null);
assert.ok(r.players[0].me, 'moi par défaut en 1er');
assert.strictEqual(r.warnings.length, 4, r.warnings.join(' / '));
console.log('✓ avertissements : ' + r.warnings.length);

assert.ok(!E.parseTableLine('bonjour').ok);
assert.ok(!E.parseTableLine('TABLE blindes 10/20 | Paul 100').ok, 'un seul joueur');
assert.strictEqual(E.chipAmount('12.500'), 12500);
assert.strictEqual(E.chipAmount('2,5K'), 2500);
assert.ok(E.buildTablePrompt().includes('(moi)') && E.buildTablePrompt().includes('TABLE blindes'));
console.log('\nLigne TABLE OK');
