import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transferer, reequilibrer, securiser, partCibleSecurisation } from '../js/arbitrages.js';
import { creerParametresFrais } from '../js/models.js';

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const supports = [{ id: 'FE', type: 'fondsEuros' }, { id: 'UC', type: 'uc' }];
const frais = creerParametresFrais({ arbitrage: 0.01 });

test('transfert avec frais d\'arbitrage', () => {
  const v = { FE: 1000, UC: 1000 };
  const m = transferer(v, 'UC', 'FE', 500, frais, 'test');
  proche(v.UC, 500); proche(v.FE, 1495); proche(m.frais, 5);
});

test('rééquilibrage vers l\'allocation cible', () => {
  const v = { FE: 4000, UC: 6000 };
  const m = reequilibrer(v, supports, { FE: 0.5, UC: 0.5 }, creerParametresFrais({ arbitrage: 0 }));
  assert.equal(m.length, 1);
  proche(v.FE, 5000); proche(v.UC, 5000);
});

test('sécurisation linéaire jusqu\'au terme', () => {
  const sec = { actif: true, anneeDebut: 6, partFondsEurosCible: 1, courbe: 'lineaire' };
  proche(partCibleSecurisation(sec, 0.5, 6, 10), 0.5);
  proche(partCibleSecurisation(sec, 0.5, 8, 10), 0.75);
  proche(partCibleSecurisation(sec, 0.5, 10, 10), 1);
  assert.equal(partCibleSecurisation(sec, 0.5, 3, 10), null);
  const v = { FE: 5000, UC: 5000 };
  const etat = { partDepart: null };
  assert.equal(securiser(v, supports, sec, etat, 3, 10, creerParametresFrais({ arbitrage: 0 })).length, 0);
  securiser(v, supports, sec, etat, 8, 10, creerParametresFrais({ arbitrage: 0 }));
  proche(v.FE, 7500); proche(v.UC, 2500);
});
