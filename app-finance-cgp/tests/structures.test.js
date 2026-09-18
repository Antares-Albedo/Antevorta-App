import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulerTrajectoire, valoriserStructure, remboursementMaturite, anneesObservation } from '../js/structures.js';
import { creerParametresStructure } from '../js/models.js';

const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const base = { barriereProtection: 0.6, barriereCoupon: 0.7, niveauCoupon: 0.05, maturite: 5, barriereAutocall: 1 };

test('trajectoire déterministe', () => {
  const p = creerParametresStructure({ ...base, tendanceSousJacent: 0.1, maturite: 3 });
  const t = simulerTrajectoire(p);
  proche(t[0], 1.1); proche(t[2], 1.331);
});

test('autocall en année 2 avec coupon', () => {
  const p = creerParametresStructure(base);
  const r = valoriserStructure(10000, p, [0.95, 1.05, 1, 1, 1]);
  assert.equal(r.anneeSortie, 2);
  proche(r.totalCoupons, 1000);
  proche(r.totalRembourse, 10000);
  proche(r.rendementTotal, 0.10);
});

test('effet mémoire', () => {
  const p = creerParametresStructure({ ...base, autocall: false });
  const r = valoriserStructure(10000, p, [0.65, 0.65, 0.8, 0.8, 0.8]);
  assert.deepEqual(r.annees.map((a) => a.coupon), [0, 0, 1500, 500, 500]);
  const sans = valoriserStructure(10000, creerParametresStructure({ ...base, autocall: false, effetMemoire: false }), [0.65, 0.65, 0.8, 0.8, 0.8]);
  proche(sans.totalCoupons, 1500);
});

test('barrière de protection à maturité', () => {
  const strike = creerParametresStructure({ ...base, autocall: false, modePerte: 'depuisStrike' });
  proche(remboursementMaturite(10000, 0.5, strike), 5000);
  proche(remboursementMaturite(10000, 0.6, strike), 10000);
  const barriere = creerParametresStructure({ ...base, autocall: false, modePerte: 'depuisBarriere' });
  proche(remboursementMaturite(10000, 0.5, barriere), 9000);
  const r = valoriserStructure(10000, strike, [0.5, 0.5, 0.5, 0.5, 0.5]);
  proche(r.perteEnCapital, 5000);
  assert.equal(r.annees[4].evenement, 'maturitePerte');
});

test('fréquence d\'observation', () => {
  assert.deepEqual(anneesObservation(creerParametresStructure({ ...base, maturite: 5, frequenceObservation: 2 })), [2, 4, 5]);
});
