/**
 * frais.js : frais sur versement, d'arbitrage et de gestion.
 *
 * Règle : les frais sur versement sont déduits du montant brut avant
 * investissement ; seul le montant net alimente les supports.
 */

import { TypeSupport } from './models.js';

/**
 * Contrôle qu'un taux de frais est dans la plage autorisée.
 * @param {number} taux fraction (0,03 = 3 %)
 * @param {number} [plafond=0.03]
 * @returns {number} le taux validé
 * @throws {Error} si le taux est hors plage
 */
export function validerTauxFrais(taux, plafond = 0.03) {
  const t = Number(taux);
  if (!Number.isFinite(t) || t < 0 || t > plafond + 1e-12) {
    throw new Error(`Taux de frais invalide : ${(t * 100).toFixed(2)} % (plage autorisée 0,00 % à ${(plafond * 100).toFixed(2)} %).`);
  }
  return t;
}

/**
 * Contrôle l'ensemble des paramètres de frais. Retourne la liste des erreurs.
 * @param {object} frais paramètres issus de creerParametresFrais
 * @returns {string[]}
 */
export function validerParametresFrais(frais) {
  const erreurs = [];
  const plafond = frais.plafondFraisVersement ?? 0.03;
  for (const cle of ['versementInitial', 'versementsProgrammes', 'versementsComplementaires', 'arbitrage']) {
    try {
      validerTauxFrais(frais[cle], plafond);
    } catch (e) {
      erreurs.push(`${cle} : ${e.message}`);
    }
  }
  for (const cle of ['gestionFondsEuros', 'gestionUC', 'gestionStructure']) {
    if (!(frais[cle] >= 0 && frais[cle] <= 0.05)) erreurs.push(`${cle} : taux de frais de gestion invalide.`);
  }
  return erreurs;
}

/**
 * Taux de frais applicable à un flux entrant : le taux propre du flux prime
 * sur le taux général de sa catégorie.
 * @param {'initial'|'programme'|'complementaire'} categorie
 * @param {number|null} tauxPropre
 * @param {object} frais
 * @returns {number}
 */
export function tauxFraisVersement(categorie, tauxPropre, frais) {
  const plafond = frais.plafondFraisVersement ?? 0.03;
  if (tauxPropre !== null && tauxPropre !== undefined && tauxPropre !== '') {
    return validerTauxFrais(tauxPropre, plafond);
  }
  const general = {
    initial: frais.versementInitial,
    programme: frais.versementsProgrammes,
    complementaire: frais.versementsComplementaires,
  }[categorie];
  return validerTauxFrais(general ?? 0, plafond);
}

/**
 * Décompose un versement brut en frais et montant net investi.
 * @param {number} montantBrut
 * @param {number} taux
 * @returns {{brut:number, frais:number, net:number}}
 */
export function appliquerFraisVersement(montantBrut, taux) {
  const frais = montantBrut * taux;
  return { brut: montantBrut, frais, net: montantBrut - frais };
}

/**
 * Frais prélevés sur un montant arbitré.
 * @param {number} montant
 * @param {object} frais
 * @returns {number}
 */
export function fraisArbitrage(montant, frais) {
  return montant * validerTauxFrais(frais.arbitrage, frais.plafondFraisVersement ?? 0.03);
}

/**
 * Taux de frais de gestion annuel d'un support selon son type.
 * @param {string} typeSupport
 * @param {object} frais
 * @returns {number}
 */
export function tauxFraisGestion(typeSupport, frais) {
  switch (typeSupport) {
    case TypeSupport.FONDS_EUROS: return frais.gestionFondsEuros;
    case TypeSupport.UC: return frais.gestionUC;
    case TypeSupport.STRUCTURE: return frais.gestionStructure ?? frais.gestionUC;
    default: return 0;
  }
}

/**
 * Frais de gestion prélevés sur un encours.
 * @param {number} encours assiette (encours moyen de l'exercice)
 * @param {number} taux
 * @returns {number}
 */
export function fraisGestion(encours, taux) {
  return Math.max(encours, 0) * taux;
}

/**
 * Crée un compteur de frais vide pour un exercice.
 * @returns {{versement:number, arbitrage:number, gestionFondsEuros:number, gestionUC:number, gestionStructure:number, total:number}}
 */
export function nouveauCompteurFrais() {
  return { versement: 0, arbitrage: 0, gestionFondsEuros: 0, gestionUC: 0, gestionStructure: 0, total: 0 };
}

/**
 * Ajoute un montant de frais d'une nature donnée au compteur.
 * @param {object} compteur
 * @param {string} nature
 * @param {number} montant
 */
export function ajouterFrais(compteur, nature, montant) {
  compteur[nature] = (compteur[nature] || 0) + montant;
  compteur.total += montant;
}
