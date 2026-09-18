import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendementUC, capitaliserUC, monteCarloUC } from '../js/unitesCompte.js';

const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('rendement déterministe et capitalisation', () => {
  assert.equal(rendementUC({ rendementMoyen: 0.05, volatilite: 0.2 }, null), 0.05);
  const r = capitaliserUC({ valeurDebut: 10000, rendement: 0.05, tauxFraisGestion: 0.01 });
  proche(r.gains, 500);
  proche(r.fraisGestion, 100);
  proche(r.valeurFin, 10400);
});

test('Monte Carlo reproductible et cohérent', () => {
  const p = { rendementMoyen: 0.05, volatilite: 0.15 };
  const a = monteCarloUC(10000, p, 5, { nombreSimulations: 3000, graine: 7 });
  const b = monteCarloUC(10000, p, 5, { nombreSimulations: 3000, graine: 7 });
  assert.equal(a.annees[4].mediane, b.annees[4].mediane);
  assert.ok(a.annees[4].p5 < a.annees[4].mediane && a.annees[4].mediane < a.annees[4].p95);
  assert.ok(Math.abs(a.annees[4].moyenne - 10000 * 1.05 ** 5) / (10000 * 1.05 ** 5) < 0.03);
  const sans = monteCarloUC(10000, { rendementMoyen: 0.05, volatilite: 0 }, 10, { nombreSimulations: 3 });
  proche(sans.annees[9].mediane, 10000 * 1.05 ** 10, 1e-6);
});
