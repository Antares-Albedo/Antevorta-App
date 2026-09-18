import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validerTauxFrais, tauxFraisVersement, appliquerFraisVersement, fraisArbitrage, validerParametresFrais } from '../js/frais.js';
import { creerParametresFrais } from '../js/models.js';

test('rejet des taux hors plage 0 à 3 %', () => {
  assert.throws(() => validerTauxFrais(0.031));
  assert.throws(() => validerTauxFrais(-0.01));
  assert.equal(validerTauxFrais(0.03), 0.03);
  assert.equal(validerTauxFrais(0), 0);
});

test('le taux propre du versement prime sur le taux général', () => {
  const frais = creerParametresFrais({ versementsProgrammes: 0.02 });
  assert.equal(tauxFraisVersement('programme', null, frais), 0.02);
  assert.equal(tauxFraisVersement('programme', 0.005, frais), 0.005);
  assert.throws(() => tauxFraisVersement('programme', 0.05, frais));
});

test('montant net investi = brut moins frais', () => {
  const d = appliquerFraisVersement(10000, 0.02);
  assert.equal(d.frais, 200);
  assert.equal(d.net, 9800);
  assert.equal(fraisArbitrage(20000, creerParametresFrais({ arbitrage: 0.01 })), 200);
});

test('validation globale des paramètres', () => {
  assert.deepEqual(validerParametresFrais(creerParametresFrais()), []);
  assert.ok(validerParametresFrais(creerParametresFrais({ arbitrage: 0.04 })).length === 1);
});
