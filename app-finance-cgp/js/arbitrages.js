/**
 * arbitrages.js : arbitrages ponctuels, rééquilibrage périodique et
 * sécurisation progressive vers le fonds en euros.
 *
 * Chaque fonction reçoit la carte des valeurs par support et renvoie les
 * mouvements réalisés ; les frais d'arbitrage sont prélevés sur le montant
 * transféré (la destination reçoit le montant net). Tout arbitrage modifie la
 * part d'UC, donc le taux du fonds en euros de l'exercice : ce couplage est
 * restitué par l'orchestrateur (projection.js).
 */

import { TypeSupport } from './models.js';
import { fraisArbitrage } from './frais.js';

/**
 * Exécute un transfert entre deux supports.
 * @param {Object<string, number>} valeurs carte des valeurs (mutée)
 * @param {string} source
 * @param {string} destination
 * @param {number} montant montant brut prélevé sur la source
 * @param {object} frais
 * @param {string} motif
 * @returns {object|null} mouvement réalisé
 */
export function transferer(valeurs, source, destination, montant, frais, motif) {
  if (!source || !destination || source === destination) return null;
  const disponible = valeurs[source] || 0;
  const brut = Math.min(Math.max(montant, 0), disponible);
  if (brut <= 1e-9) return null;
  const f = fraisArbitrage(brut, frais);
  valeurs[source] = disponible - brut;
  valeurs[destination] = (valeurs[destination] || 0) + brut - f;
  return { motif, source, destination, montant: brut, frais: f, net: brut - f };
}

/**
 * Arbitrages ponctuels de l'exercice.
 * @param {Object<string, number>} valeurs
 * @param {Array<object>} arbitrages liste creerArbitrage
 * @param {number} annee
 * @param {object} frais
 * @returns {Array<object>} mouvements
 */
export function appliquerArbitragesPonctuels(valeurs, arbitrages, annee, frais) {
  const mouvements = [];
  for (const a of arbitrages || []) {
    if (a.annee !== annee) continue;
    let montant = a.montant;
    if ((montant === null || montant === undefined) && a.pourcentage) montant = (valeurs[a.source] || 0) * a.pourcentage;
    const m = transferer(valeurs, a.source, a.destination, montant || 0, frais, 'ponctuel');
    if (m) mouvements.push(m);
  }
  return mouvements;
}

/**
 * Identifiants des supports pris en compte par les arbitrages automatiques.
 * @param {Array<object>} supports
 * @param {boolean} inclureStructures
 */
function supportsArbitrables(supports, inclureStructures) {
  return supports.filter((s) => s.type !== TypeSupport.STRUCTURE || inclureStructures);
}

/**
 * Ramène les supports arbitrables vers une allocation cible.
 * @param {Object<string, number>} valeurs
 * @param {Array<object>} supports
 * @param {Object<string, number>} allocationCible fraction par identifiant (normalisée sur les supports arbitrables)
 * @param {object} frais
 * @param {string} motif
 * @param {boolean} [inclureStructures=false]
 * @returns {Array<object>}
 */
export function reequilibrer(valeurs, supports, allocationCible, frais, motif = 'reequilibrage', inclureStructures = false) {
  const cibles = supportsArbitrables(supports, inclureStructures);
  const total = cibles.reduce((s, x) => s + (valeurs[x.id] || 0), 0);
  const sommeAlloc = cibles.reduce((s, x) => s + (allocationCible[x.id] || 0), 0);
  if (total <= 0 || sommeAlloc <= 0) return [];
  const ecarts = cibles.map((s) => ({
    id: s.id,
    ecart: (valeurs[s.id] || 0) - total * ((allocationCible[s.id] || 0) / sommeAlloc),
  }));
  const excedents = ecarts.filter((e) => e.ecart > 1e-6).sort((a, b) => b.ecart - a.ecart);
  const deficits = ecarts.filter((e) => e.ecart < -1e-6).sort((a, b) => a.ecart - b.ecart);
  const mouvements = [];
  let i = 0;
  let j = 0;
  while (i < excedents.length && j < deficits.length) {
    const montant = Math.min(excedents[i].ecart, -deficits[j].ecart);
    const m = transferer(valeurs, excedents[i].id, deficits[j].id, montant, frais, motif);
    if (m) mouvements.push(m);
    excedents[i].ecart -= montant;
    deficits[j].ecart += montant;
    if (excedents[i].ecart <= 1e-6) i += 1;
    if (deficits[j].ecart >= -1e-6) j += 1;
  }
  return mouvements;
}

/**
 * Part cible du fonds en euros pour une année donnée de la sécurisation.
 * @param {object} securisation paramètres (anneeDebut, partFondsEurosCible, courbe, pasPaliers)
 * @param {number} partDepart part du fonds en euros au démarrage de la sécurisation
 * @param {number} annee
 * @param {number} dureeProjection
 * @returns {number|null} null si la sécurisation n'est pas active cette année
 */
export function partCibleSecurisation(securisation, partDepart, annee, dureeProjection) {
  const debut = securisation.anneeDebut || Math.max(1, dureeProjection - 5);
  if (annee < debut) return null;
  const longueur = Math.max(dureeProjection - debut, 1);
  let progression = Math.min((annee - debut) / longueur, 1);
  if (securisation.courbe === 'paliers') {
    const pas = Math.max(1, securisation.pasPaliers || 2);
    progression = Math.min(Math.floor((annee - debut) / pas) * pas / longueur, 1);
    if (annee >= dureeProjection) progression = 1;
  }
  return partDepart + (securisation.partFondsEurosCible - partDepart) * progression;
}

/**
 * Sécurisation progressive : transfert des UC vers le fonds en euros pour
 * atteindre la part cible de l'année. Ne réalise jamais le mouvement inverse.
 * @param {Object<string, number>} valeurs
 * @param {Array<object>} supports
 * @param {object} securisation
 * @param {object} etat état persistant { partDepart:number|null }
 * @param {number} annee
 * @param {number} dureeProjection
 * @param {object} frais
 * @param {boolean} [inclureStructures=false]
 * @returns {Array<object>}
 */
export function securiser(valeurs, supports, securisation, etat, annee, dureeProjection, frais, inclureStructures = false) {
  const cibles = supportsArbitrables(supports, inclureStructures);
  const fe = cibles.filter((s) => s.type === TypeSupport.FONDS_EUROS);
  if (!fe.length) return [];
  const total = cibles.reduce((s, x) => s + (valeurs[x.id] || 0), 0);
  if (total <= 0) return [];
  const partFE = fe.reduce((s, x) => s + (valeurs[x.id] || 0), 0) / total;
  if (etat.partDepart === null || etat.partDepart === undefined) {
    const debut = securisation.anneeDebut || Math.max(1, dureeProjection - 5);
    if (annee < debut) return [];
    etat.partDepart = partFE;
  }
  const cible = partCibleSecurisation(securisation, etat.partDepart, annee, dureeProjection);
  if (cible === null || cible <= partFE + 1e-6) return [];
  let aTransferer = (cible - partFE) * total;
  const destination = fe[0].id;
  const sources = cibles.filter((s) => s.type !== TypeSupport.FONDS_EUROS).sort((a, b) => (valeurs[b.id] || 0) - (valeurs[a.id] || 0));
  const mouvements = [];
  for (const s of sources) {
    if (aTransferer <= 1e-6) break;
    const montant = Math.min(aTransferer, valeurs[s.id] || 0);
    const m = transferer(valeurs, s.id, destination, montant, frais, 'securisation');
    if (m) {
      mouvements.push(m);
      aTransferer -= montant;
    }
  }
  return mouvements;
}
