const assert = require('assert');
const H = require('../hands.js');

const cases = [
  [['Ak', 'Kk', 'Qk', 'Jk', 'Tk', '2c', '3p'], 9, 'Quinte flush royale'],
  [['9p', '8p', '7p', '6p', '5p', 'Ac', 'Ak'], 8, 'Quinte flush au 9'],
  [['Ac', '2c', '3c', '4c', '5c'], 8, 'Quinte flush au 5'],
  [['Kp', 'Kc', 'Kk', 'Kt', '2c'], 7, 'Carré de Rois'],
  [['Qp', 'Qc', 'Qk', '7t', '7p'], 6, 'Full aux Dames par les 7'],
  [['Qp', 'Qc', 'Qk', '7t', '7p', '7c'], 6, 'Full aux Dames par les 7'],
  [['Ac', 'Jc', '8c', '4c', '2c', 'Kp'], 5, "Couleur à l'As ♥"],
  [['Tc', '9p', '8k', '7t', '6c'], 4, 'Quinte au 10'],
  [['Ac', '2p', '3k', '4t', '5c'], 4, 'Quinte au 5'],
  [['7p', '7c', '7k', 'Ac', '2p'], 3, 'Brelan de 7'],
  [['Jp', 'Jk', '4c', '4t', '2p', '2c'], 2, 'Double paire Valets et 4'],
  [['Ap', 'Ac'], 1, "Paire d'As"],
  [['Kp', 'Qc'], 0, 'Hauteur Roi'],
];
for (const [cards, cat, name] of cases) {
  const r = H.evaluate(cards);
  assert.strictEqual(r.cat, cat, cards.join(' ') + ' → ' + r.name);
  assert.strictEqual(r.name, name);
}
console.log('✓ évaluation des combinaisons');

let d = H.describe(['Ac', 'Kc'], []);
assert.strictEqual(d.best.name, 'Hauteur As');
assert.strictEqual(d.note, 'Cartes assorties (même couleur)');

d = H.describe(['Ac', 'Kc'], ['Qc', '7c', 'Jp']);
assert.strictEqual(d.best.cat, 0);
assert.deepStrictEqual(d.draws, ['Tirage couleur : encore un ♥ et tu as la couleur.', 'Tirage quinte : un 10 te donne la quinte.']);

d = H.describe(['9c', '8p'], ['7k', '6t', '2c']);
assert.deepStrictEqual(d.draws, ['Tirage quinte : un 10 ou un 5 te donne la quinte.']);

d = H.describe(['Ac', '3p'], ['7k', '7t', 'Kc', 'Kp', 'Qt']);
assert.strictEqual(d.best.name, 'Double paire Rois et 7');
assert.strictEqual(d.shared, true);
assert.deepStrictEqual(d.draws, []);

d = H.describe(['Kk', '3p'], ['7k', '7t', 'Kc']);
assert.strictEqual(d.best.name, 'Double paire Rois et 7');
assert.strictEqual(d.shared, false);
console.log('✓ ma main, tirages et combinaison partagée');
console.log('\nTests combinaisons OK');
