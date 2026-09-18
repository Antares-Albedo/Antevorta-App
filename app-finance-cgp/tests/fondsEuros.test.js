import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tauxFondsEuros, capitaliserFondsEuros, trancheBareme } from '../js/fondsEuros.js';
import { donnees } from './aide.js';

const { baremeFondsEuros: bareme } = donnees();
const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('barème à paliers stricts croisant part UC et encours', () => {
  proche(tauxFondsEuros(bareme, 0.70, 100000).taux, 0.04);
  proche(tauxFondsEuros(bareme, 0.70, 150000).taux, 0.0425);
  proche(tauxFondsEuros(bareme, 0.699, 150000).taux, 0.04);
  proche(tauxFondsEuros(bareme, 0.50, 149999).taux, 0.0325);
  proche(tauxFondsEuros(bareme, 0.40, 200000).taux, 0.0225);
  proche(tauxFondsEuros(bareme, 0.39, 200000).taux, 0.011);
  proche(tauxFondsEuros(bareme, 0, 10).taux, 0.011);
  assert.equal(trancheBareme(bareme, 0.65).tranche.libelle, 'UC 60 % à 70 %');
});

test('évolution pluriannuelle et plancher', () => {
  const scenario = { tendance: 'baisse', variationAnnuelle: 0.10, tauxPlancher: 0.03 };
  proche(tauxFondsEuros(bareme, 0.7, 100000, { annee: 1, scenario }).taux, 0.04);
  proche(tauxFondsEuros(bareme, 0.7, 100000, { annee: 2, scenario }).taux, 0.036);
  proche(tauxFondsEuros(bareme, 0.7, 100000, { annee: 5, scenario }).taux, 0.03);
  const hausse = { tendance: 'hausse', variationAnnuelle: 0.05 };
  proche(tauxFondsEuros(bareme, 0.7, 100000, { annee: 3, scenario: hausse }).taux, 0.04 * 1.05 ** 2);
});

test('capitalisation avec frais et prélèvements sociaux au fil de l\'eau', () => {
  // 10 000 € à 3 %, frais 0,6 % sur l'encours, PS 17,2 % sur les intérêts nets de frais.
  const r = capitaliserFondsEuros({ valeurDebut: 10000, taux: 0.03, tauxFraisGestion: 0.006, tauxPS: 0.172 });
  proche(r.interetsBruts, 300);
  proche(r.fraisGestion, 60);
  proche(r.prelevementsSociaux, 240 * 0.172);
  proche(r.valeurFin, 10000 + 240 - 240 * 0.172);
});

test('flux de milieu d\'exercice capitalisés une demi-année', () => {
  const r = capitaliserFondsEuros({ valeurDebut: 0, fluxMilieu: 1000, taux: 0.04 });
  proche(r.valeurFin, 1000 * 1.04 ** 0.5);
});
