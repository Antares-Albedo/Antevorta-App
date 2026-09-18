import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assietteAvance, controlerPlafond, tableauAmortissement, alerteAvance } from '../js/avance.js';
import { creerParametresAvance } from '../js/models.js';

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const supports = [{ id: 'FE', type: 'fondsEuros' }, { id: 'UC', type: 'uc' }, { id: 'ST', type: 'structure' }];

test('assiette 80 % euros et 60 % UC', () => {
  const a = assietteAvance({ FE: 100000, UC: 50000, ST: 10000 }, supports, creerParametresAvance());
  proche(a.fondsEuros, 80000); proche(a.uc, 36000); proche(a.maximum, 116000);
  const sans = assietteAvance({ FE: 100000, UC: 50000, ST: 10000 }, supports, creerParametresAvance({ inclureStructures: false }));
  proche(sans.maximum, 110000);
  assert.equal(controlerPlafond(120000, 116000).valide, false);
  assert.equal(controlerPlafond(116000, 116000).valide, true);
});

test('in fine à intérêts composés : dette = capital × (1 + t)^n', () => {
  const t = tableauAmortissement(creerParametresAvance({ montant: 30000, anneeMiseEnPlace: 1, duree: 6, tauxInteret: 0.03 }));
  assert.equal(t.lignes.length, 6);
  proche(t.lignes[4].totalDu, 30000 * 1.03 ** 5);
  proche(t.lignes[5].remboursementCapital, 30000 * 1.03 ** 6);
  proche(t.coutTotal, 30000 * (1.03 ** 6 - 1));
});

test('intérêts simples payés annuellement et amortissable', () => {
  const s = tableauAmortissement(creerParametresAvance({ montant: 10000, duree: 4, tauxInteret: 0.03, capitalisation: 'simple' }));
  proche(s.lignes[0].interetsPayes, 300); proche(s.lignes[2].totalDu, 10000); proche(s.coutTotal, 1200);
  const a = tableauAmortissement(creerParametresAvance({ montant: 12000, duree: 3, tauxInteret: 0, remboursement: 'amortissable' }));
  assert.deepEqual(a.lignes.map((l) => Math.round(l.remboursementCapital)), [4000, 4000, 4000]);
});

test('remboursements libres et alerte', () => {
  const l = tableauAmortissement(creerParametresAvance({ montant: 10000, duree: 3, tauxInteret: 0, remboursement: 'libre', remboursementsLibres: { 2: 4000 } }));
  assert.deepEqual(l.lignes.map((x) => Math.round(x.remboursementCapital)), [0, 4000, 6000]);
  assert.equal(alerteAvance(75000, 100000, 0.7), true);
  assert.equal(alerteAvance(65000, 100000, 0.7), false);
});
