/**
 * avance.js : avance consentie par l'assureur, assiette disponible et coût.
 *
 * Règle structurante : l'avance ne réduit pas l'assiette de rendement du
 * contrat. Le capital reste investi et continue de produire des intérêts ;
 * seule une dette (capital et intérêts) est suivie en parallèle.
 */

import { TypeSupport } from './models.js';

/**
 * Assiette d'avance disponible pour un exercice.
 * @param {Object<string, number>} valeurs valeurs par support
 * @param {Array<object>} supports
 * @param {object} p paramètres d'avance (quotités, inclureStructures)
 * @returns {{fondsEuros:number, uc:number, maximum:number}}
 */
export function assietteAvance(valeurs, supports, p) {
  let fe = 0;
  let uc = 0;
  for (const s of supports) {
    const v = valeurs[s.id] || 0;
    if (s.type === TypeSupport.FONDS_EUROS) fe += v;
    else if (s.type === TypeSupport.UC) uc += v;
    else if (p.inclureStructures !== false) uc += v;
  }
  const qFE = p.quotiteFondsEuros ?? 0.8;
  const qUC = p.quotiteUC ?? 0.6;
  return { fondsEuros: fe * qFE, uc: uc * qUC, maximum: fe * qFE + uc * qUC };
}

/**
 * Contrôle du montant demandé par rapport à l'assiette.
 * @param {number} montant
 * @param {number} maximum
 * @returns {{valide:boolean, message:string|null}}
 */
export function controlerPlafond(montant, maximum) {
  if (montant > maximum + 1e-6) {
    return { valide: false, message: `Montant demandé (${montant.toFixed(0)} €) supérieur à l'assiette disponible (${maximum.toFixed(0)} €).` };
  }
  return { valide: true, message: null };
}

/**
 * Crée l'état d'une avance au moment de sa mise en place.
 * @param {object} p paramètres
 * @returns {object}
 */
export function ouvrirAvance(p) {
  return {
    capitalInitial: p.montant,
    capitalRestantDu: p.montant,
    interetsCapitalises: 0,
    anneeMiseEnPlace: p.anneeMiseEnPlace,
    anneeFin: p.anneeMiseEnPlace + p.duree - 1,
    cumulInterets: 0,
    cumulRemboursements: 0,
    soldee: false,
  };
}

/**
 * Exercice d'une avance en cours : intérêts, remboursement, montant total dû.
 *
 * - capitalisation « composee » : les intérêts s'ajoutent à la dette ;
 * - capitalisation « simple » : les intérêts sont payés chaque année par le souscripteur ;
 * - remboursement « inFine » : capital remboursé à l'échéance ;
 * - remboursement « amortissable » : capital remboursé par fractions égales ;
 * - remboursement « libre » : montants saisis par année (remboursementsLibres), solde à l'échéance.
 *
 * @param {object} etat état de l'avance (muté)
 * @param {object} p paramètres
 * @param {number} annee année de la projection
 * @returns {{annee:number, capitalDebut:number, interets:number, interetsPayes:number, remboursementCapital:number, capitalFin:number, totalDu:number, rangAnnee:number}|null}
 */
export function exercerAvance(etat, p, annee) {
  if (etat.soldee || annee < etat.anneeMiseEnPlace) return null;
  const rang = annee - etat.anneeMiseEnPlace + 1;
  const capitalDebut = etat.capitalRestantDu;
  const interets = capitalDebut * p.tauxInteret;
  let interetsPayes = 0;
  if (p.capitalisation === 'simple') interetsPayes = interets;
  else etat.capitalRestantDu += interets;

  let remboursement = 0;
  const derniere = annee >= etat.anneeFin;
  if (p.remboursement === 'amortissable') {
    const restantes = etat.anneeFin - annee + 1;
    remboursement = etat.capitalRestantDu / Math.max(restantes, 1);
  } else if (p.remboursement === 'libre') {
    remboursement = Number((p.remboursementsLibres || {})[String(annee)] || 0);
    if (derniere) remboursement = etat.capitalRestantDu;
  } else if (derniere) {
    remboursement = etat.capitalRestantDu;
  }
  remboursement = Math.min(remboursement, etat.capitalRestantDu);
  etat.capitalRestantDu -= remboursement;
  etat.cumulInterets += interets;
  etat.cumulRemboursements += remboursement + interetsPayes;
  if (derniere || etat.capitalRestantDu <= 1e-6) {
    etat.soldee = true;
    etat.capitalRestantDu = 0;
  }
  return {
    annee,
    rangAnnee: rang,
    capitalDebut,
    interets,
    interetsPayes,
    remboursementCapital: remboursement,
    capitalFin: etat.capitalRestantDu,
    totalDu: etat.capitalRestantDu,
    decaissement: remboursement + interetsPayes,
  };
}

/**
 * Tableau d'amortissement complet d'une avance, indépendamment du contrat.
 * @param {object} p paramètres
 * @returns {{lignes:Array<object>, coutTotal:number, totalRembourse:number}}
 */
export function tableauAmortissement(p) {
  const etat = ouvrirAvance(p);
  const lignes = [];
  for (let a = p.anneeMiseEnPlace; a <= etat.anneeFin; a += 1) {
    const l = exercerAvance(etat, p, a);
    if (l) lignes.push(l);
    if (etat.soldee) break;
  }
  return { lignes, coutTotal: etat.cumulInterets, totalRembourse: etat.cumulRemboursements };
}

/**
 * Alerte si le montant dû dépasse une fraction de la valeur de rachat.
 * @param {number} totalDu
 * @param {number} valeurRachat
 * @param {number} seuil fraction
 */
export function alerteAvance(totalDu, valeurRachat, seuil) {
  if (valeurRachat <= 0) return totalDu > 0;
  return totalDu / valeurRachat > seuil;
}
