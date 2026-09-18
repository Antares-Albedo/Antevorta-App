import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertirEnRente, projeterConsommation, tauxConversion } from '../js/rente.js';
import { courbeRendement } from '../js/optimiseur.js';
import { comparerAvanceRachat, comparerScenarios } from '../js/comparateur.js';
import { chargerConfiguration, creerParametresFiscaux } from '../js/models.js';
import { donnees } from './aide.js';

const d = donnees();
const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('conversion en rente interpolée et coefficient de réversion', () => {
  proche(tauxConversion(65, d.tableRente), 0.040);
  proche(tauxConversion(66, d.tableRente), 0.0415);
  const r = convertirEnRente(100000, 65, 'reversible60', d.tableRente);
  proche(r.renteAnnuelle, 100000 * 0.04 * 0.86);
});

test('phase de consommation jusqu\'à épuisement', () => {
  const c = projeterConsommation({ capital: 100000, primesNettes: 80000, gainsDejaSoumisPS: 0, rachatAnnuel: 30000, rendementNet: 0, anciennete: 8, fiscal: creerParametresFiscaux(), constantes: d.parametresFiscaux, baremeIR: d.baremeIR });
  assert.equal(c.anneeEpuisement, 4);
  proche(c.lignes[3].rachatBrut, 10000);
});

test('optimiseur : seuils de bascule et optimum', () => {
  const frais = { gestionFondsEuros: 0.006, gestionUC: 0.009 };
  const c = courbeRendement({ rendementUC: 0.02, encours: 100000, bareme: d.baremeFondsEuros, frais, tauxPS: 0 });
  assert.equal(c.points.length, 101);
  assert.equal(c.seuils.length, 4);
  assert.ok(c.seuils.every((s) => s.gainMarginal > 0));
  assert.ok(c.zonesDefavorables.length > 0);
  const fort = courbeRendement({ rendementUC: 0.08, encours: 100000, bareme: d.baremeFondsEuros, frais, tauxPS: 0 });
  proche(fort.optimum.partUC, 1);
});

test('comparateur avance contre rachat : même liquidité nette', () => {
  const cfg = chargerConfiguration({ contrat: { montantInitial: 200000, dureeProjection: 8, supports: [{ id: 'FE', type: 'fondsEuros', allocation: 0.5 }, { id: 'UC', type: 'uc', allocation: 0.5 }] } });
  const c = comparerAvanceRachat(cfg, d, { montant: 30000, annee: 3, duree: 4 });
  assert.ok(Math.abs(c.detailRachat.montantNet - 30000) < 2);
  assert.equal(c.lignes.length, 8);
  assert.ok(c.coutAvance > 0);
});

test('comparateur de scénarios', () => {
  const cfg = chargerConfiguration({ contrat: { montantInitial: 100000, dureeProjection: 5, supports: [{ id: 'FE', type: 'fondsEuros', allocation: 1 }] } });
  const c = comparerScenarios([{ nom: 'A', config: cfg }, { nom: 'B', config: { ...cfg, frais: { ...cfg.frais, gestionFondsEuros: 0 } } }], d);
  assert.equal(c.tableau.length, 5);
  assert.ok(c.tableau[4].B > c.tableau[4].A);
});
