import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererFlux, totalVersementsBruts } from '../js/flux.js';
import { creerContrat, creerParametresFrais } from '../js/models.js';

const support = [{ id: 'FE', type: 'fondsEuros', allocation: 1 }];

test('versement initial seul', () => {
  const c = creerContrat({ montantInitial: 10000, dureeProjection: 3, supports: support });
  const flux = genererFlux(c, creerParametresFrais({ versementInitial: 0.02 }));
  assert.equal(flux.length, 1);
  assert.equal(flux[0].annee, 1);
  assert.equal(flux[0].montantNet, 9800);
});

test('versements programmés mensuels indexés', () => {
  const c = creerContrat({
    montantInitial: 0, dureeProjection: 3, supports: support,
    versementsProgrammes: [{ montant: 100, periodicite: 'mensuelle', indexation: 0.10 }],
  });
  const flux = genererFlux(c, creerParametresFrais({ versementsProgrammes: 0 }));
  assert.equal(flux.length, 3);
  assert.deepEqual(flux.map((f) => Math.round(f.montantBrut * 100) / 100), [1200, 1320, 1452]);
  assert.equal(flux[0].moment, 'milieu');
});

test('versement complémentaire et rachat programmé bornés à la durée', () => {
  const c = creerContrat({
    montantInitial: 1000, dureeProjection: 4, supports: support,
    versementsComplementaires: [{ montant: 500, annee: 2 }, { montant: 500, annee: 9 }],
    rachatsProgrammes: [{ montant: 100, periodicite: 'trimestrielle', anneeDebut: 3 }],
  });
  const flux = genererFlux(c, creerParametresFrais({ versementInitial: 0, versementsComplementaires: 0.01 }));
  const rachats = flux.filter((f) => f.sens === 'sortant');
  assert.equal(rachats.length, 2);
  assert.equal(rachats[0].montantBrut, 400);
  assert.equal(flux.filter((f) => f.categorie === 'complementaire').length, 1);
  assert.equal(totalVersementsBruts(flux), 1500);
  assert.deepEqual(flux.map((f) => f.annee), [1, 2, 3, 4]);
});

test('rachat en pourcentage périodique', () => {
  const c = creerContrat({
    montantInitial: 1000, dureeProjection: 1, supports: support,
    rachatsProgrammes: [{ pourcentage: 0.01, periodicite: 'mensuelle' }],
  });
  const flux = genererFlux(c, creerParametresFrais());
  const r = flux.find((f) => f.sens === 'sortant');
  assert.ok(Math.abs(r.pourcentage - (1 - 0.99 ** 12)) < 1e-12);
});
