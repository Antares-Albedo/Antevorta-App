/**
 * structures.js : produit structuré à capital protégé (autocall / Phoenix).
 *
 * Trajectoire du sous-jacent relative au niveau initial (1 = 100 %),
 * observations aux dates prévues (autocall, coupon avec ou sans mémoire),
 * barrière de protection à maturité.
 */

import { MethodeSimulation, ModePerteStructure } from './models.js';
import { normale } from './aleatoire.js';

/**
 * Années d'observation d'un produit selon sa fréquence et sa maturité.
 * @param {object} parametres
 * @returns {number[]}
 */
export function anneesObservation(parametres) {
  const pas = Math.max(1, Math.round(parametres.frequenceObservation || 1));
  const annees = [];
  for (let a = pas; a <= parametres.maturite; a += pas) annees.push(a);
  if (!annees.includes(parametres.maturite)) annees.push(parametres.maturite);
  return annees;
}

/**
 * Niveaux du sous-jacent en fin de chaque année (indice 0 = fin d'année 1).
 * @param {object} parametres
 * @param {string} [methode]
 * @param {() => number} [uniforme] générateur uniforme (mode stochastique)
 * @returns {number[]}
 */
export function simulerTrajectoire(parametres, methode = MethodeSimulation.DETERMINISTE, uniforme = null) {
  const mu = parametres.tendanceSousJacent || 0;
  const sigma = parametres.volatiliteSousJacent || 0;
  const n = parametres.maturite;
  const niveaux = [];
  if (methode === MethodeSimulation.DETERMINISTE || sigma <= 0 || !uniforme) {
    for (let t = 1; t <= n; t += 1) niveaux.push((1 + mu) ** t);
    return niveaux;
  }
  let log = 0;
  const logMu = Math.log(1 + mu);
  for (let t = 1; t <= n; t += 1) {
    log += logMu - 0.5 * sigma * sigma + sigma * normale(uniforme);
    niveaux.push(Math.exp(log));
  }
  return niveaux;
}

/**
 * Montant remboursé à maturité selon le niveau final.
 * @param {number} nominal
 * @param {number} niveau
 * @param {object} parametres
 */
export function remboursementMaturite(nominal, niveau, parametres) {
  if (niveau >= parametres.barriereProtection) return nominal;
  if (parametres.modePerte === ModePerteStructure.DEPUIS_BARRIERE) {
    return nominal * Math.max(1 - (parametres.barriereProtection - niveau), 0);
  }
  return nominal * Math.max(niveau, 0);
}

/**
 * Crée l'état initial d'un produit structuré.
 * @param {number} nominal
 * @param {number[]} trajectoire
 */
export function etatInitial(nominal, trajectoire) {
  return { nominal, trajectoire, memoire: 0, rembourse: false, anneeSortie: null };
}

/**
 * Observation d'un exercice : applique le mécanisme du produit et met à jour l'état.
 * @param {object} etat état courant (muté)
 * @param {number} anneeProduit rang de l'année depuis la souscription du produit (1 = première)
 * @param {object} parametres
 * @returns {{coupon:number, rembourse:number, valeur:number, evenement:string|null, niveau:number|null}}
 */
export function observer(etat, anneeProduit, parametres) {
  if (etat.rembourse || etat.nominal <= 0 || anneeProduit > parametres.maturite) {
    return { coupon: 0, rembourse: 0, valeur: 0, evenement: null, niveau: null };
  }
  const niveau = etat.trajectoire[anneeProduit - 1];
  const observation = anneesObservation(parametres).includes(anneeProduit);
  const couponPeriode = etat.nominal * parametres.niveauCoupon * (parametres.frequenceObservation || 1);
  let coupon = 0;
  let rembourse = 0;
  let evenement = null;
  if (observation) {
    if (parametres.autocall && niveau >= parametres.barriereAutocall) {
      coupon = couponPeriode + etat.memoire;
      etat.memoire = 0;
      rembourse = etat.nominal;
      evenement = 'autocall';
    } else if (niveau >= parametres.barriereCoupon) {
      coupon = couponPeriode + etat.memoire;
      etat.memoire = 0;
      evenement = 'coupon';
    } else if (parametres.effetMemoire) {
      etat.memoire += couponPeriode;
      evenement = 'memoire';
    } else {
      evenement = 'sansCoupon';
    }
    if (!rembourse && anneeProduit === parametres.maturite) {
      rembourse = remboursementMaturite(etat.nominal, niveau, parametres);
      evenement = rembourse < etat.nominal ? 'maturitePerte' : 'maturite';
    }
  }
  let valeur;
  if (rembourse > 0 || anneeProduit === parametres.maturite) {
    etat.rembourse = true;
    etat.anneeSortie = anneeProduit;
    valeur = 0;
  } else {
    valeur = remboursementMaturite(etat.nominal, niveau, parametres);
  }
  return { coupon, rembourse, valeur, evenement, niveau };
}

/**
 * Valorise entièrement un produit sur une trajectoire donnée (utilitaire de test et d'analyse).
 * @param {number} nominal
 * @param {object} parametres
 * @param {number[]} trajectoire
 */
export function valoriserStructure(nominal, parametres, trajectoire) {
  const etat = etatInitial(nominal, trajectoire);
  const annees = [];
  for (let a = 1; a <= parametres.maturite; a += 1) {
    const r = observer(etat, a, parametres);
    annees.push({ annee: a, ...r });
    if (etat.rembourse) break;
  }
  const totalCoupons = annees.reduce((s, x) => s + x.coupon, 0);
  const totalRembourse = annees.reduce((s, x) => s + x.rembourse, 0);
  return {
    annees,
    anneeSortie: etat.anneeSortie,
    totalCoupons,
    totalRembourse,
    perteEnCapital: Math.max(nominal - totalRembourse, 0),
    rendementTotal: nominal > 0 ? (totalCoupons + totalRembourse - nominal) / nominal : 0,
  };
}
