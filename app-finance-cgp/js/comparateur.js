/**
 * comparateur.js : comparaison avance contre rachat partiel et comparaison
 * de scénarios côte à côte. S'appuie sur projection.js.
 */

import { projeter } from './projection.js';
import { creerParametresAvance, creerRachatProgramme, creerContrat } from './models.js';

/**
 * Copie profonde d'une configuration (objets JSON simples).
 * @param {object} o
 */
export function cloner(o) {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Comparateur avance contre rachat partiel pour un même besoin de liquidité.
 *
 * Côté avance : projection avec l'avance paramétrée. Côté rachat : projection
 * avec un rachat ponctuel brut calibré pour procurer le même montant net
 * après fiscalité (itération sur le taux effectif).
 *
 * @param {object} config configuration de base (sans avance ni rachat ponctuel)
 * @param {object} donnees tables de paramètres
 * @param {object} besoin { montant, annee, duree, tauxInteret, capitalisation, remboursement }
 * @returns {object} { avance, rachat, lignes, differentielTerme }
 */
export function comparerAvanceRachat(config, donnees, besoin) {
  const base = cloner(config);
  base.avance = creerParametresAvance({ actif: false });

  const configAvance = cloner(base);
  configAvance.avance = creerParametresAvance({
    actif: true,
    montant: besoin.montant,
    anneeMiseEnPlace: besoin.annee,
    duree: besoin.duree || 6,
    tauxInteret: besoin.tauxInteret ?? 0.03,
    capitalisation: besoin.capitalisation || 'composee',
    remboursement: besoin.remboursement || 'inFine',
    quotiteFondsEuros: config.avance?.quotiteFondsEuros ?? 0.8,
    quotiteUC: config.avance?.quotiteUC ?? 0.6,
    seuilAlerte: config.avance?.seuilAlerte ?? 0.7,
  });
  const resultatAvance = projeter(configAvance, donnees);

  // Rachat brut calibré : trois itérations suffisent (le taux effectif varie peu).
  let brut = besoin.montant;
  let resultatRachat = null;
  for (let i = 0; i < 4; i += 1) {
    const configRachat = cloner(base);
    configRachat.contrat = creerContrat({
      ...configRachat.contrat,
      rachatsProgrammes: [
        ...configRachat.contrat.rachatsProgrammes,
        creerRachatProgramme({ montant: brut, periodicite: 'annuelle', anneeDebut: besoin.annee, anneeFin: besoin.annee }),
      ],
    });
    resultatRachat = projeter(configRachat, donnees);
    const detail = resultatRachat.rachats.find((r) => r.annee === besoin.annee && Math.abs(r.montantRachat - Math.min(brut, r.montantRachat)) < 1e-6)
      || resultatRachat.rachats.find((r) => r.annee === besoin.annee);
    if (!detail) break;
    const net = detail.montantNet;
    if (Math.abs(net - besoin.montant) < 1) break;
    brut *= besoin.montant / Math.max(net, 1);
  }

  // Patrimoine côté avance : valeur du contrat diminuée de la dette restante et
  // des remboursements déjà décaissés par le souscripteur (capital et intérêts).
  const lignes = [];
  const duree = config.contrat.dureeProjection;
  let cumulDecaissements = 0;
  for (let a = 1; a <= duree; a += 1) {
    const la = resultatAvance.lignes[a - 1];
    const lr = resultatRachat.lignes[a - 1];
    const detteAvance = la.avance ? la.avance.totalDu : 0;
    cumulDecaissements += la.avance ? la.avance.decaissement : 0;
    const patrimoineAvance = la.valeurFin - detteAvance - cumulDecaissements;
    lignes.push({
      annee: a,
      valeurAvance: la.valeurFin,
      detteAvance,
      interetsAvance: la.avance ? la.avance.interets : 0,
      cumulDecaissements,
      patrimoineAvance,
      valeurRachat: lr.valeurFin,
      fiscaliteRachat: lr.impots + lr.prelevementsSociauxRachats,
      differentiel: patrimoineAvance - lr.valeurFin,
    });
  }
  const detailRachat = resultatRachat.rachats.find((r) => r.annee === besoin.annee) || null;
  return {
    avance: resultatAvance,
    rachat: resultatRachat,
    rachatBrut: brut,
    detailRachat,
    lignes,
    coutAvance: resultatAvance.synthese.avance ? resultatAvance.synthese.avance.coutTotal : 0,
    coutFiscalRachat: detailRachat ? detailRachat.impotDefinitif + detailRachat.prelevementsSociaux : 0,
    differentielTerme: lignes.length ? lignes[lignes.length - 1].differentiel : 0,
    avanceRefusee: resultatAvance.avance.refusee,
  };
}

/**
 * Comparateur de scénarios : projections côte à côte sur les mêmes flux.
 * @param {Array<{nom:string, config:object}>} scenarios trois à cinq configurations
 * @param {object} donnees
 * @returns {{resultats:Array<object>, tableau:Array<object>}}
 */
export function comparerScenarios(scenarios, donnees) {
  const resultats = scenarios.map((s) => ({ nom: s.nom, resultat: projeter(s.config, donnees) }));
  const duree = Math.max(...resultats.map((r) => r.resultat.lignes.length));
  const tableau = [];
  for (let a = 1; a <= duree; a += 1) {
    const ligne = { annee: a };
    for (const r of resultats) {
      const l = r.resultat.lignes[a - 1];
      ligne[r.nom] = l ? l.valeurFin : null;
    }
    tableau.push(ligne);
  }
  return { resultats, tableau };
}
