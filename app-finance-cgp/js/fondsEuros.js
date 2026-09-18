/**
 * fondsEuros.js : taux du fonds en euros par barème à paliers et capitalisation.
 *
 * Le taux d'un exercice dépend de deux critères : la part moyenne d'unités de
 * compte du contrat sur l'exercice et l'encours total au terme de l'exercice
 * (seuil de 150 000 € par défaut). Le barème est lu dans
 * data/bareme-fonds-euros.json et s'applique par paliers stricts.
 */

import { Tendance } from './models.js';
import { normale } from './aleatoire.js';

/**
 * Tranche du barème correspondant à une part d'UC.
 * @param {object} bareme barème chargé depuis data/
 * @param {number} partUC fraction
 * @returns {{index:number, tranche:object}}
 */
export function trancheBareme(bareme, partUC) {
  const tranches = [...bareme.tranches].sort((a, b) => b.partUCMin - a.partUCMin);
  for (let i = 0; i < tranches.length; i += 1) {
    if (partUC >= tranches[i].partUCMin - 1e-9) return { index: i, tranche: tranches[i] };
  }
  return { index: tranches.length - 1, tranche: tranches[tranches.length - 1] };
}

/**
 * Coefficient d'évolution pluriannuelle appliqué à l'ensemble du barème.
 * @param {object} scenario scénario de marché
 * @param {number} annee rang de l'exercice (1 = premier)
 * @returns {number}
 */
export function coefficientEvolution(scenario, annee) {
  if (!scenario || scenario.tendance === Tendance.STABLE || !scenario.variationAnnuelle) return 1;
  const sens = scenario.tendance === Tendance.HAUSSE ? 1 : -1;
  return (1 + sens * Math.abs(scenario.variationAnnuelle)) ** (annee - 1);
}

/**
 * Taux du fonds en euros pour un exercice.
 * @param {object} bareme
 * @param {number} partUC part moyenne d'UC sur l'exercice (fraction)
 * @param {number} encours encours total du contrat au terme de l'exercice
 * @param {object} [options]
 * @param {number} [options.annee=1]
 * @param {object} [options.scenario] scénario (tendance, variation, volatilité, plancher)
 * @param {number|null} [options.tauxForce] taux imposé qui court-circuite le barème
 * @param {number} [options.bruit] tirage normal centré réduit (mode stochastique)
 * @returns {{taux:number, tauxBareme:number, tranche:string, indexTranche:number, auDessusSeuil:boolean, partUC:number}}
 */
export function tauxFondsEuros(bareme, partUC, encours, options = {}) {
  const annee = options.annee || 1;
  const scenario = options.scenario || {};
  const { index, tranche } = trancheBareme(bareme, partUC);
  const auDessusSeuil = encours >= (bareme.seuilEncours ?? 150000);
  const tauxBareme = auDessusSeuil ? tranche.tauxAuDessusSeuil : tranche.tauxSousSeuil;
  let taux = tauxBareme * coefficientEvolution(scenario, annee);
  if (scenario.volatilite > 0 && typeof options.bruit === 'number') {
    taux += scenario.volatilite * options.bruit;
  }
  if (options.tauxForce !== null && options.tauxForce !== undefined) taux = options.tauxForce;
  taux = Math.max(taux, scenario.tauxPlancher || 0);
  return { taux, tauxBareme, tranche: tranche.libelle, indexTranche: index, auDessusSeuil, partUC };
}

/**
 * Tirage du bruit du taux pour un exercice en mode stochastique.
 * @param {() => number} uniforme
 */
export function bruitTaux(uniforme) {
  return normale(uniforme);
}

/**
 * Capitalisation du compartiment euros sur un exercice.
 *
 * Intérêts : sur la valeur de début et les flux de début sur l'année entière,
 * sur les flux de milieu d'exercice sur une demi-année (taux composé). Frais de
 * gestion prélevés sur l'encours moyen. Prélèvements sociaux au fil de l'eau
 * sur les intérêts nets de frais de gestion.
 *
 * @param {object} p
 * @param {number} p.valeurDebut
 * @param {number} [p.fluxDebut=0] versements nets en début d'exercice
 * @param {number} [p.fluxMilieu=0] versements nets moins rachats en milieu d'exercice
 * @param {number} p.taux
 * @param {number} [p.tauxFraisGestion=0]
 * @param {number} [p.tauxPS=0] taux de prélèvements sociaux (0 si non prélevés au fil de l'eau)
 * @returns {{valeurFin:number, interetsBruts:number, fraisGestion:number, prelevementsSociaux:number, interetsNets:number}}
 */
export function capitaliserFondsEuros(p) {
  const fluxDebut = p.fluxDebut || 0;
  const fluxMilieu = p.fluxMilieu || 0;
  const base = p.valeurDebut + fluxDebut;
  const interetsBruts = base * p.taux + fluxMilieu * ((1 + p.taux) ** 0.5 - 1);
  const encoursMoyen = Math.max(base + fluxMilieu / 2, 0);
  const fraisGestion = encoursMoyen * (p.tauxFraisGestion || 0);
  const interetsNetsFrais = interetsBruts - fraisGestion;
  const prelevementsSociaux = Math.max(interetsNetsFrais, 0) * (p.tauxPS || 0);
  const valeurFin = base + fluxMilieu + interetsNetsFrais - prelevementsSociaux;
  return { valeurFin, interetsBruts, fraisGestion, prelevementsSociaux, interetsNets: interetsNetsFrais - prelevementsSociaux };
}
