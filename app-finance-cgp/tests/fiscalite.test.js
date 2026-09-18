import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerFiscaliteRachat, determinerTauxMarginal, quotePartGains, restitutionPrelevementsSociaux, impotBareme } from '../js/fiscalite.js';
import { creerParametresFiscaux } from '../js/models.js';
import { donnees } from './aide.js';

const d = donnees();
const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const base = (o = {}) => ({
  montantRachat: 12000, valeurContrat: 120000, gainsTotaux: 20000, gainsDejaSoumisPS: 0,
  primesAvant2017: 0, primesApres2017: 100000, anciennete: 5, abattementRestant: 4600,
  fiscal: creerParametresFiscaux({ tauxMarginal: 0.30 }), constantes: d.parametresFiscaux, baremeIR: d.baremeIR, ...o,
});

test('quote-part de gains', () => {
  proche(quotePartGains(12000, 120000, 20000), 2000);
  proche(quotePartGains(12000, 120000, -5000), 0);
});

test('moins de 8 ans : 12,80 % sans abattement, PS 17,20 %', () => {
  const f = calculerFiscaliteRachat(base());
  proche(f.quotePartGains, 2000);
  proche(f.abattementUtilise, 0);
  proche(f.impotForfaitaire.total, 256);
  proche(f.acompte, 256);
  proche(f.prelevementsSociaux, 344);
  proche(f.montantNet, 12000 - 256 - 344);
  proche(f.impotBareme, 600);
  assert.equal(f.optionFavorable, 'forfaitaire');
});

test('plus de 8 ans : abattement puis 7,50 %, acompte régularisé', () => {
  const f = calculerFiscaliteRachat(base({ montantRachat: 36000, anciennete: 9 }));
  proche(f.quotePartGains, 6000);
  proche(f.abattementUtilise, 4600);
  proche(f.impotForfaitaire.total, 1400 * 0.075);
  proche(f.acompte, 6000 * 0.075);
  proche(f.regularisation, 1400 * 0.075 - 450);
  proche(f.prelevementsSociaux, 6000 * 0.172);
});

test('plus de 8 ans, primes au-delà de 150 000 € : taux plein sur la fraction excédentaire', () => {
  const f = calculerFiscaliteRachat(base({ montantRachat: 60000, valeurContrat: 360000, gainsTotaux: 60000, primesApres2017: 300000, anciennete: 10, abattementRestant: 9200, fiscal: creerParametresFiscaux({ situation: 'couple', tauxMarginal: 0.41 }) }));
  proche(f.quotePartGains, 10000);
  // 5 000 € au taux réduit, 5 000 € au taux plein ; abattement 9 200 € imputé d'abord sur le taux réduit.
  proche(f.detailBases.tauxReduit, 0);
  proche(f.detailBases.tauxPlein, 800);
  proche(f.impotForfaitaire.total, 800 * 0.128);
});

test('primes antérieures au 27/09/2017 : PFL et ordre d\'imputation de l\'abattement', () => {
  const f = calculerFiscaliteRachat(base({ primesAvant2017: 50000, primesApres2017: 50000, anciennete: 9, montantRachat: 30000, gainsTotaux: 20000, abattementRestant: 4600 }));
  proche(f.quotePartGains, 5000);
  proche(f.gainsAvant2017, 2500);
  proche(f.detailBases.avant2017, 0);
  proche(f.detailBases.tauxReduit, 2500 - 2100);
  const jeune = calculerFiscaliteRachat(base({ primesAvant2017: 100000, primesApres2017: 0, anciennete: 3 }));
  proche(jeune.impotForfaitaire.total, 2000 * 0.35);
  const moyen = calculerFiscaliteRachat(base({ primesAvant2017: 100000, primesApres2017: 0, anciennete: 6 }));
  proche(moyen.impotForfaitaire.total, 2000 * 0.15);
});

test('option barème : taux marginal saisi ou déduit du barème', () => {
  assert.equal(determinerTauxMarginal(50000, 1, d.baremeIR).taux, 0.30);
  assert.equal(determinerTauxMarginal(50000, 2, d.baremeIR).taux, 0.11);
  proche(impotBareme(11497, 1, d.baremeIR), 0);
  const f = calculerFiscaliteRachat(base({ fiscal: creerParametresFiscaux({ option: 'bareme', tauxMarginal: null, revenuImposable: 20000 }) }));
  assert.equal(f.taux.origineTMI, 'bareme');
  proche(f.taux.marginal, 0.11);
  proche(f.impotDefinitif, 2000 * 0.11);
  proche(f.regularisation, 220 - 256);
  assert.equal(f.optionFavorable, 'bareme');
});

test('gains déjà soumis aux PS et restitution', () => {
  const f = calculerFiscaliteRachat(base({ gainsDejaSoumisPS: 10000 }));
  proche(f.prelevementsSociaux, 1000 * 0.172);
  proche(restitutionPrelevementsSociaux(1000, -5000, d.parametresFiscaux), 1000);
  proche(restitutionPrelevementsSociaux(1000, 2000, d.parametresFiscaux), 1000 - 344);
  proche(restitutionPrelevementsSociaux(100, 20000, d.parametresFiscaux), 0);
});
