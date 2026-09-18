import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerConfiguration } from '../js/models.js';
import { projeter, projeterMonteCarlo } from '../js/projection.js';
import { donnees } from './aide.js';

const d = donnees();
const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const sansFrais = { versementInitial: 0, versementsProgrammes: 0, versementsComplementaires: 0, arbitrage: 0, gestionFondsEuros: 0, gestionUC: 0, gestionStructure: 0 };

function config(contrat, extra = {}) {
  return chargerConfiguration({ contrat, frais: sansFrais, fiscal: { prelevementsSociauxFilEau: false }, ...extra });
}

test('versement unique 100 % fonds euros : taux 1,10 % (UC < 40 %) composé', () => {
  const r = projeter(config({ montantInitial: 10000, dureeProjection: 5, supports: [{ id: 'FE', type: 'fondsEuros', allocation: 1 }] }), d);
  proche(r.synthese.valeurTerme, 10000 * 1.011 ** 5, 1e-6);
  assert.equal(r.lignes[0].trancheBareme, 'UC moins de 40 %');
  proche(r.lignes[0].performanceNette, 0.011);
});

test('prélèvements sociaux au fil de l\'eau réduisent le capital', () => {
  const cfg = chargerConfiguration({ contrat: { montantInitial: 10000, dureeProjection: 2, supports: [{ id: 'FE', type: 'fondsEuros', allocation: 1 }] }, frais: sansFrais });
  const r = projeter(cfg, d);
  proche(r.lignes[0].prelevementsSociaux, 110 * 0.172);
  proche(r.synthese.valeurTerme, 10000 * (1 + 0.011 * (1 - 0.172)) ** 2);
});

test('part d\'UC et taux du fonds en euros couplés : 75 % UC et encours ≥ 150 000 € donne 4,25 %', () => {
  const r = projeter(config({
    montantInitial: 200000, dureeProjection: 1,
    supports: [{ id: 'FE', type: 'fondsEuros', allocation: 0.25 }, { id: 'UC', type: 'uc', allocation: 0.75, parametres: { rendementMoyen: 0 } }],
  }), d);
  assert.equal(r.lignes[0].trancheBareme, 'UC 70 % et plus');
  assert.equal(r.lignes[0].auDessusSeuil, true);
  proche(r.lignes[0].tauxFondsEuros, 0.0425);
  proche(r.lignes[0].repartition.FE, 50000 * 1.0425);
  // La part d'UC retenue est la moyenne de l'exercice : elle baisse quand seul le fonds en euros progresse.
  assert.ok(r.lignes[0].partUC < 0.75 && r.lignes[0].partUC > 0.74);
});

test('un arbitrage modifie la part d\'UC donc le taux de l\'exercice', () => {
  const contrat = {
    montantInitial: 100000, dureeProjection: 2,
    supports: [{ id: 'FE', type: 'fondsEuros', allocation: 0.45 }, { id: 'UC', type: 'uc', allocation: 0.55, parametres: { rendementMoyen: 0 } }],
  };
  const sans = projeter(config(contrat), d);
  const avec = projeter(config(contrat, { arbitrages: { ponctuels: [{ annee: 2, source: 'UC', destination: 'FE', montant: 20000 }] } }), d);
  assert.equal(sans.lignes[1].trancheBareme, 'UC 50 % à 60 %');
  assert.equal(avec.lignes[1].trancheBareme, 'UC moins de 40 %');
  assert.ok(avec.lignes[1].tauxFondsEuros < sans.lignes[1].tauxFondsEuros);
  assert.equal(avec.arbitrages.length, 1);
});

test('rachat programmé : fiscalité et réduction des primes', () => {
  const r = projeter(config({
    montantInitial: 100000, dureeProjection: 3,
    supports: [{ id: 'FE', type: 'fondsEuros', allocation: 1 }],
    rachatsProgrammes: [{ montant: 10000, periodicite: 'annuelle', anneeDebut: 2, anneeFin: 2 }],
  }), d);
  const rachat = r.rachats[0];
  assert.equal(rachat.annee, 2);
  const valeurAvant = 100000 * 1.011;
  proche(rachat.quotePartGains, 10000 * (valeurAvant - 100000) / valeurAvant);
  proche(rachat.impotDefinitif, rachat.quotePartGains * 0.128);
  proche(r.lignes[1].rachatsBruts, 10000);
  proche(r.lignes[1].primesNettes, 100000 - rachat.partCapital);
});

test('avance : capital maintenu investi, dette suivie, refus au-delà de l\'assiette', () => {
  const contrat = { montantInitial: 100000, dureeProjection: 8, supports: [{ id: 'FE', type: 'fondsEuros', allocation: 1 }] };
  const sans = projeter(config(contrat), d);
  const avec = projeter(config(contrat, { avance: { actif: true, montant: 50000, anneeMiseEnPlace: 2, duree: 3, tauxInteret: 0.03 } }), d);
  proche(avec.synthese.valeurTerme, sans.synthese.valeurTerme);
  assert.equal(avec.avance.lignes.length, 3);
  proche(avec.avance.lignes[2].remboursementCapital, 50000 * 1.03 ** 3);
  const refus = projeter(config(contrat, { avance: { actif: true, montant: 90000, anneeMiseEnPlace: 1, duree: 3 } }), d);
  assert.ok(refus.avance.refusee);
  assert.ok(refus.signalements.some((s) => s.type === 'avanceRefusee'));
});

test('produit structuré : coupons réaffectés au fonds en euros', () => {
  const r = projeter(config({
    montantInitial: 10000, dureeProjection: 3,
    supports: [
      { id: 'FE', type: 'fondsEuros', allocation: 0.5, parametres: { tauxForce: 0 } },
      { id: 'ST', type: 'structure', allocation: 0.5, parametres: { niveauCoupon: 0.05, maturite: 5, tendanceSousJacent: 0.05, autocall: true } },
    ],
  }), d);
  proche(r.lignes[0].coupons, 250);
  proche(r.lignes[0].repartition.ST, 0);
  proche(r.lignes[0].repartition.FE, 10250);
  assert.equal(r.evenementsStructures[0].evenement, 'autocall');
});

test('signalements : changement de tranche et seuil d\'encours', () => {
  const r = projeter(config({
    montantInitial: 140000, dureeProjection: 6,
    supports: [{ id: 'FE', type: 'fondsEuros', allocation: 0.3 }, { id: 'UC', type: 'uc', allocation: 0.7, parametres: { rendementMoyen: 0.06 } }],
  }), d);
  assert.ok(r.signalements.some((s) => s.type === 'seuilEncours'));
  assert.ok(r.signalements.some((s) => s.type === 'seuilFranchi'));
});

test('Monte Carlo du contrat complet', () => {
  const cfg = config({
    montantInitial: 50000, dureeProjection: 5,
    supports: [{ id: 'FE', type: 'fondsEuros', allocation: 0.5 }, { id: 'UC', type: 'uc', allocation: 0.5, parametres: { rendementMoyen: 0.05, volatilite: 0.15 } }],
  });
  const mc = projeterMonteCarlo(cfg, d, 40);
  assert.equal(mc.distributions.length, 5);
  const f = mc.distributions[4];
  assert.ok(f.p5 <= f.mediane && f.mediane <= f.p95);
});

test('reprise d\'un contrat existant avec antériorité fiscale et gains latents', () => {
  const r = projeter(config({
    montantInitial: 0, dureeProjection: 1, anterioriteFiscale: 10,
    primesAnterieuresAvant2017: 80000, primesAnterieuresApres2017: 0, gainsLatentsOuverture: 20000,
    supports: [{ id: 'FE', type: 'fondsEuros', allocation: 1 }],
    rachatsProgrammes: [{ montant: 10000, periodicite: 'annuelle' }],
  }), d);
  proche(r.synthese.valeurOuverture, 100000);
  const rachat = r.rachats[0];
  assert.equal(rachat.plus8Ans, true);
  proche(rachat.gainsAvant2017, rachat.quotePartGains);
  proche(rachat.abattementUtilise, 2000);
  proche(rachat.impotDefinitif, 0);
});
