/**
 * flux.js : chronologie annuelle des flux du contrat.
 *
 * Chaque flux porte : année, catégorie, sens, montant brut, frais, montant net,
 * moment dans l'exercice (début ou milieu) et support de destination ou de
 * prélèvement. Convention : versement initial et versements complémentaires
 * en début d'exercice ; versements programmés et rachats programmés répartis
 * sur l'exercice, modélisés en milieu d'exercice.
 */

import { OCCURRENCES_PAR_AN } from './models.js';
import { appliquerFraisVersement, tauxFraisVersement } from './frais.js';

/** Catégories de flux. */
export const CategorieFlux = Object.freeze({
  INITIAL: 'initial',
  PROGRAMME: 'programme',
  COMPLEMENTAIRE: 'complementaire',
  RACHAT: 'rachat',
});

/**
 * Génère la liste chronologique des flux sur la durée de projection.
 * @param {object} contrat
 * @param {object} frais paramètres de frais
 * @returns {Array<object>} flux triés par année puis par ordre d'exécution
 */
export function genererFlux(contrat, frais) {
  const flux = [];
  const duree = contrat.dureeProjection;

  if (contrat.montantInitial > 0) {
    const taux = tauxFraisVersement('initial', null, frais);
    const d = appliquerFraisVersement(contrat.montantInitial, taux);
    flux.push({
      annee: 1, categorie: CategorieFlux.INITIAL, sens: 'entrant', moment: 'debut',
      montantBrut: d.brut, frais: d.frais, montantNet: d.net, tauxFrais: taux, support: null,
      libelle: 'Versement initial',
    });
  }

  for (const vc of contrat.versementsComplementaires) {
    if (vc.montant > 0 && vc.annee >= 1 && vc.annee <= duree) {
      const taux = tauxFraisVersement('complementaire', vc.tauxFrais, frais);
      const d = appliquerFraisVersement(vc.montant, taux);
      flux.push({
        annee: vc.annee, categorie: CategorieFlux.COMPLEMENTAIRE, sens: 'entrant', moment: 'debut',
        montantBrut: d.brut, frais: d.frais, montantNet: d.net, tauxFrais: taux, support: vc.support || null,
        libelle: 'Versement complémentaire',
      });
    }
  }

  for (const vp of contrat.versementsProgrammes) {
    if (!(vp.montant > 0)) continue;
    const occurrences = OCCURRENCES_PAR_AN[vp.periodicite] || 1;
    const taux = tauxFraisVersement('programme', vp.tauxFrais, frais);
    const debut = Math.max(1, vp.anneeDebut || 1);
    const fin = Math.min(duree, vp.anneeFin || duree);
    for (let annee = debut; annee <= fin; annee += 1) {
      const montantUnitaire = vp.montant * (1 + (vp.indexation || 0)) ** (annee - debut);
      const d = appliquerFraisVersement(montantUnitaire * occurrences, taux);
      flux.push({
        annee, categorie: CategorieFlux.PROGRAMME, sens: 'entrant', moment: 'milieu',
        montantBrut: d.brut, frais: d.frais, montantNet: d.net, tauxFrais: taux, support: null,
        libelle: `Versements programmés (${occurrences} × ${montantUnitaire.toFixed(2)} €)`,
        occurrences, montantUnitaire,
      });
    }
  }

  for (const rp of contrat.rachatsProgrammes) {
    const occurrences = OCCURRENCES_PAR_AN[rp.periodicite] || 1;
    const debut = Math.max(1, rp.anneeDebut || 1);
    const fin = Math.min(duree, rp.anneeFin || duree);
    for (let annee = debut; annee <= fin; annee += 1) {
      flux.push({
        annee, categorie: CategorieFlux.RACHAT, sens: 'sortant', moment: 'milieu',
        montantBrut: rp.montant !== null && rp.montant !== undefined ? rp.montant * occurrences : null,
        pourcentage: rp.pourcentage !== null && rp.pourcentage !== undefined ? 1 - (1 - rp.pourcentage) ** occurrences : null,
        frais: 0, montantNet: null, support: rp.support || null,
        libelle: 'Rachat programmé', occurrences,
      });
    }
  }

  const ordre = { initial: 0, complementaire: 1, programme: 2, rachat: 3 };
  flux.sort((a, b) => a.annee - b.annee || ordre[a.categorie] - ordre[b.categorie]);
  return flux;
}

/**
 * Flux d'une année donnée.
 * @param {Array<object>} flux
 * @param {number} annee
 */
export function fluxDeLAnnee(flux, annee) {
  return flux.filter((f) => f.annee === annee);
}

/**
 * Total des versements bruts sur l'ensemble des flux.
 * @param {Array<object>} flux
 */
export function totalVersementsBruts(flux) {
  return flux.filter((f) => f.sens === 'entrant').reduce((s, f) => s + f.montantBrut, 0);
}
