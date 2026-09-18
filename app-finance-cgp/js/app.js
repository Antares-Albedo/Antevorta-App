/**
 * app.js : interface utilisateur. Seul module qui manipule le DOM.
 *
 * L'état est une configuration complète (contrat, frais, scénario,
 * arbitrages, avance, fiscalité). Chaque saisie met à jour l'état puis
 * relance la projection (engine) et le rendu des résultats.
 */

import {
  chargerConfiguration, creerSupport, creerVersementProgramme, creerVersementComplementaire,
  creerRachatProgramme, creerArbitrage, validerContrat, serialiser,
} from './models.js';
import { validerParametresFrais } from './frais.js';
import { projeter, projeterMonteCarlo } from './projection.js';
import { assietteAvance } from './avance.js';
import { courbeRendement } from './optimiseur.js';
import { comparerAvanceRachat, comparerScenarios, cloner } from './comparateur.js';
import { convertirEnRente, projeterConsommation, fractionImposableRente } from './rente.js';
import { construireClasseur, construirePDF } from './export.js';
import { formaterEuros, formaterPourcentage, formaterNombre, formaterAnnees } from './format.js';

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

const etat = {
  config: null,
  donnees: null,
  exemples: [],
  resultat: null,
  erreur: null,
  monteCarlo: null,
  section: 'contrat',
  sousOnglet: 'tableau',
  graphiques: {},
  optimiseur: { rendementUC: 0.05, volatiliteUC: 0.15, encours: null, avecPS: true },
  comparateurAvance: { montant: 30000, annee: 3, duree: 6, tauxInteret: 0.03, capitalisation: 'composee', remboursement: 'inFine' },
  scenarios: [
    { nom: 'Prudent', partUC: 0.30, rendementUC: 0.04, tendance: 'stable', variationAnnuelle: 0, gestionUC: null },
    { nom: 'Équilibré', partUC: 0.55, rendementUC: 0.05, tendance: 'stable', variationAnnuelle: 0, gestionUC: null },
    { nom: 'Dynamique', partUC: 0.75, rendementUC: 0.06, tendance: 'stable', variationAnnuelle: 0, gestionUC: null },
  ],
  rente: { age: 65, type: 'simple', capital: null, fraisArrerages: 0.03, rachatAnnuel: 24000, indexation: 0.01, rendementNet: 0.025 },
};

const SECTIONS = [
  ['contrat', 'Contrat'], ['flux', 'Flux'], ['frais', 'Frais'], ['supports', 'Supports'],
  ['arbitrages', 'Arbitrages'], ['avance', 'Avance'], ['fiscalite', 'Fiscalité'],
  ['resultats', 'Résultats'], ['optimiseur', 'Optimiseur'], ['comparateur', 'Comparateurs'], ['rente', 'Rente'],
];

const LIBELLES_TYPE = { fondsEuros: 'Fonds en euros', uc: 'Unités de compte', structure: 'Produit structuré' };
const LIBELLES_EVENEMENT = {
  autocall: 'remboursement anticipé', coupon: 'coupon versé', memoire: 'coupon mémorisé', sansCoupon: 'pas de coupon',
  maturite: 'maturité, capital remboursé', maturitePerte: 'maturité avec perte en capital',
};

const $ = (sel, racine = document) => racine.querySelector(sel);
const $$ = (sel, racine = document) => Array.from(racine.querySelectorAll(sel));
const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const couleur = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
const couleursSeries = () => [couleur('--serie-1'), couleur('--serie-2'), couleur('--serie-3'), couleur('--serie-4'), couleur('--serie-5')];

// ---------------------------------------------------------------------------
// Chargement des données
// ---------------------------------------------------------------------------

async function chargerJSON(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`Impossible de charger ${chemin}`);
  return reponse.json();
}

async function chargerDonnees() {
  if (window.__DONNEES__) return window.__DONNEES__;
  const [baremeFondsEuros, parametresFiscaux, baremeIR, tableRente, exemples] = await Promise.all([
    chargerJSON('data/bareme-fonds-euros.json'),
    chargerJSON('data/parametres-fiscaux.json'),
    chargerJSON('data/bareme-ir.json'),
    chargerJSON('data/table-rente.json'),
    chargerJSON('data/exemples-contrats.json'),
  ]);
  return { baremeFondsEuros, parametresFiscaux, baremeIR, tableRente, exemples: exemples.exemples };
}

// ---------------------------------------------------------------------------
// Accès à l'état par chemin ("contrat.supports.0.allocation")
// ---------------------------------------------------------------------------

function lire(chemin) {
  return chemin.split('.').reduce((o, k) => (o == null ? undefined : o[k]), etat);
}

function ecrire(chemin, valeur) {
  const cles = chemin.split('.');
  const derniere = cles.pop();
  const cible = cles.reduce((o, k) => o[k], etat);
  cible[derniere] = valeur;
}

// ---------------------------------------------------------------------------
// Constructeurs de champs
// ---------------------------------------------------------------------------

function champ(label, chemin, options = {}) {
  const type = options.type || 'nombre';
  const valeur = lire(chemin);
  const id = `f-${chemin.replace(/\./g, '-')}`;
  const attrs = `id="${id}" data-chemin="${chemin}" data-type="${type}"${options.attrs || ''}`;
  let controle;
  if (type === 'select') {
    controle = `<select ${attrs}>${options.choix.map(([v, l]) => `<option value="${echapper(v)}"${String(v) === String(valeur ?? '') ? ' selected' : ''}>${echapper(l)}</option>`).join('')}</select>`;
  } else if (type === 'texte') {
    controle = `<input type="text" ${attrs} value="${echapper(valeur ?? '')}">`;
  } else if (type === 'date') {
    controle = `<input type="date" ${attrs} value="${echapper(valeur ?? '')}">`;
  } else if (type === 'case') {
    return `<div class="case"><input type="checkbox" ${attrs}${valeur ? ' checked' : ''}><label for="${id}">${label}</label></div>`;
  } else {
    let affichage = valeur;
    if (type === 'pourcent') affichage = valeur === null || valeur === undefined ? '' : Math.round(valeur * 1e6) / 1e4;
    if (affichage === null || affichage === undefined) affichage = '';
    const unite = options.unite ?? (type === 'pourcent' ? '%' : type === 'euros' ? '€' : '');
    const step = options.step ?? (type === 'entier' ? 1 : type === 'pourcent' ? 0.01 : type === 'euros' ? 100 : 0.01);
    const bornes = `${options.min !== undefined ? ` min="${options.min}"` : ''}${options.max !== undefined ? ` max="${options.max}"` : ''}`;
    const entree = `<input type="number" ${attrs} value="${affichage}" step="${step}"${bornes}${options.placeholder ? ` placeholder="${echapper(options.placeholder)}"` : ''}>`;
    controle = unite ? `<div class="unite">${entree}<span>${unite}</span></div>` : entree;
  }
  return `<div class="champ${options.classe ? ` ${options.classe}` : ''}"><label for="${id}">${label}</label>${controle}${options.aide ? `<span class="note">${options.aide}</span>` : ''}</div>`;
}

/** Curseur et champ numérique liés, pour un taux de frais borné. */
function champCurseur(label, chemin, max = 3) {
  const valeur = lire(chemin) || 0;
  const id = `f-${chemin.replace(/\./g, '-')}`;
  const v = Math.round(valeur * 1e6) / 1e4;
  return `<div class="champ curseur"><label for="${id}">${label}</label>
    <div class="duo">
      <input type="range" min="0" max="${max}" step="0.05" value="${v}" data-chemin="${chemin}" data-type="pourcent" aria-label="${label} (curseur)">
      <div class="unite"><input type="number" id="${id}" min="0" max="${max}" step="0.01" value="${v}" data-chemin="${chemin}" data-type="pourcent"><span>%</span></div>
    </div></div>`;
}

// ---------------------------------------------------------------------------
// Formulaires
// ---------------------------------------------------------------------------

function rendreNav() {
  $('#nav').innerHTML = SECTIONS.map(([id, titre], i) => `${id === 'resultats' ? '<div class="sep"></div>' : ''}<button type="button" data-section="${id}" aria-current="${etat.section === id}"><span class="num">${i + 1}</span>${titre}</button>`).join('');
  $$('section.panneau').forEach((s) => s.classList.toggle('active', s.dataset.section === etat.section));
}

function rendreFormulaires() {
  const c = etat.config.contrat;
  $('#form-contrat').innerHTML = `<h3>Paramètres du contrat</h3><div class="grille">
    ${champ('Libellé du contrat', 'config.contrat.nom', { type: 'texte' })}
    ${champ('Versement initial', 'config.contrat.montantInitial', { type: 'euros', min: 0 })}
    ${champ('Durée de projection', 'config.contrat.dureeProjection', { type: 'entier', min: 1, max: 50, unite: 'ans' })}
    ${champ('Date de souscription', 'config.contrat.dateSouscription', { type: 'date' })}
    ${champ('Antériorité fiscale au démarrage', 'config.contrat.anterioriteFiscale', { type: 'entier', min: 0, max: 60, unite: 'ans', aide: 'Âge du contrat au début de la simulation' })}
  </div>`;

  $('#form-reprise').innerHTML = `<h3>Contrat existant <span class="aide">Primes déjà versées et gains latents à l'ouverture, si le contrat est repris en cours de vie</span></h3><div class="grille">
    ${champ('Primes versées avant le 27/09/2017', 'config.contrat.primesAnterieuresAvant2017', { type: 'euros', min: 0 })}
    ${champ('Primes versées depuis le 27/09/2017', 'config.contrat.primesAnterieuresApres2017', { type: 'euros', min: 0 })}
    ${champ('Gains latents à l\'ouverture', 'config.contrat.gainsLatentsOuverture', { type: 'euros' })}
    ${champ('Dont gains déjà soumis aux prélèvements sociaux', 'config.contrat.gainsLatentsDejaSoumisPS', { type: 'euros', min: 0, aide: 'Intérêts du fonds en euros déjà prélevés au fil de l\'eau' })}
  </div>`;

  rendreSupports();
  rendreFlux();

  const f = 'config.frais';
  $('#form-frais').innerHTML = `<h3>Frais sur versement <span class="aide">Chaque versement peut porter son propre taux, qui prime sur le taux général</span></h3><div class="grille large">
    ${champCurseur('Versement initial', `${f}.versementInitial`)}
    ${champCurseur('Versements programmés', `${f}.versementsProgrammes`)}
    ${champCurseur('Versements complémentaires', `${f}.versementsComplementaires`)}
    ${champCurseur('Frais d\'arbitrage', `${f}.arbitrage`)}
  </div>
  <h3 style="margin-top:18px">Frais de gestion annuels <span class="aide">Prélevés sur l'encours de chaque compartiment</span></h3><div class="grille">
    ${champ('Fonds en euros', `${f}.gestionFondsEuros`, { type: 'pourcent', min: 0, max: 5 })}
    ${champ('Unités de compte', `${f}.gestionUC`, { type: 'pourcent', min: 0, max: 5 })}
    ${champ('Produits structurés', `${f}.gestionStructure`, { type: 'pourcent', min: 0, max: 5 })}
  </div>`;

  const b = etat.donnees.baremeFondsEuros;
  const tranches = [...b.tranches].sort((x, y) => y.partUCMin - x.partUCMin);
  $('#form-bareme').innerHTML = `<h3>Barème du fonds en euros <span class="aide">Exercice ${b.exercice}, lu dans data/bareme-fonds-euros.json</span></h3>
    <div class="tableau-conteneur"><table><thead><tr><th>Part d'unités de compte</th><th>Encours &lt; ${formaterEuros(b.seuilEncours)}</th><th>Encours ≥ ${formaterEuros(b.seuilEncours)}</th></tr></thead>
    <tbody>${tranches.map((t) => `<tr><td>${echapper(t.libelle)}</td><td>${formaterPourcentage(t.tauxSousSeuil)}</td><td>${formaterPourcentage(t.tauxAuDessusSeuil)}</td></tr>`).join('')}</tbody></table></div>
    <p class="note" style="margin-top:8px">Paliers stricts, sans interpolation. La part d'UC retenue est la moyenne de l'exercice (début et fin), les produits structurés étant assimilés aux UC. Le seuil d'encours s'apprécie sur la valeur totale du contrat au terme de l'exercice.</p>`;

  const s = 'config.scenario';
  $('#form-scenario').innerHTML = `<h3>Évolution pluriannuelle et mode de simulation</h3><div class="grille">
    ${champ('Tendance du barème', `${s}.tendance`, { type: 'select', choix: [['stable', 'Stable'], ['hausse', 'Hausse'], ['baisse', 'Baisse']] })}
    ${champ('Variation annuelle du barème', `${s}.variationAnnuelle`, { type: 'pourcent', min: 0, max: 50, aide: 'Appliquée à l\'ensemble des taux, en relatif' })}
    ${champ('Taux plancher', `${s}.tauxPlancher`, { type: 'pourcent', min: 0, max: 10 })}
    ${champ('Volatilité du taux (mode stochastique)', `${s}.volatilite`, { type: 'pourcent', min: 0, max: 5, unite: 'pt' })}
    ${champ('Méthode', `${s}.methode`, { type: 'select', choix: [['deterministe', 'Déterministe (valeurs moyennes)'], ['stochastique', 'Stochastique (un tirage)']] })}
    ${champ('Graine aléatoire', `${s}.graine`, { type: 'entier', min: 0 })}
    ${champ('Simulations Monte Carlo', `${s}.nombreSimulations`, { type: 'entier', min: 10, max: 5000 })}
  </div>`;

  $('#form-supports-detail').innerHTML = `<h3>Paramètres des supports</h3><div class="liste">${c.supports.map((sup, i) => detailSupport(sup, i)).join('') || '<p class="vide">Aucun support.</p>'}</div>`;

  rendreArbitrages();

  const a = 'config.avance';
  $('#form-avance').innerHTML = `<h3>Paramètres de l'avance</h3><div class="grille">
    ${champ('Activer une avance', `${a}.actif`, { type: 'case' })}
    ${champ('Montant demandé', `${a}.montant`, { type: 'euros', min: 0 })}
    ${champ('Année de mise en place', `${a}.anneeMiseEnPlace`, { type: 'entier', min: 1, max: c.dureeProjection })}
    ${champ('Durée', `${a}.duree`, { type: 'entier', min: 1, max: 30, unite: 'ans' })}
    ${champ('Taux d\'intérêt annuel', `${a}.tauxInteret`, { type: 'pourcent', min: 0, max: 20 })}
    ${champ('Capitalisation des intérêts', `${a}.capitalisation`, { type: 'select', choix: [['composee', 'Annuelle composée'], ['simple', 'Intérêts simples payés chaque année']] })}
    ${champ('Mode de remboursement', `${a}.remboursement`, { type: 'select', choix: [['inFine', 'In fine'], ['amortissable', 'Amortissable'], ['libre', 'Remboursements partiels libres']] })}
    ${champ('Quotité fonds en euros', `${a}.quotiteFondsEuros`, { type: 'pourcent', min: 0, max: 100 })}
    ${champ('Quotité unités de compte', `${a}.quotiteUC`, { type: 'pourcent', min: 0, max: 100 })}
    ${champ('Structurés inclus dans l\'assiette', `${a}.inclureStructures`, { type: 'case' })}
    ${champ('Seuil d\'alerte (dette / valeur de rachat)', `${a}.seuilAlerte`, { type: 'pourcent', min: 0, max: 100 })}
  </div>
  <div id="remboursements-libres" style="margin-top:14px">${etat.config.avance.remboursement === 'libre' ? remboursementsLibres() : ''}</div>`;

  const fi = 'config.fiscal';
  $('#form-fiscal').innerHTML = `<h3>Situation du foyer</h3><div class="grille">
    ${champ('Situation familiale', `${fi}.situation`, { type: 'select', choix: [['seul', 'Personne seule'], ['couple', 'Couple marié ou pacsé']] })}
    ${champ('Option d\'imposition', `${fi}.option`, { type: 'select', choix: [['forfaitaire', 'Prélèvement forfaitaire'], ['bareme', 'Barème progressif']] })}
    ${champ('Taux marginal d\'imposition', `${fi}.tauxMarginal`, { type: 'pourcent', min: 0, max: 60, placeholder: 'déduit du revenu', aide: 'Laisser vide pour le déduire du revenu imposable' })}
    ${champ('Revenu net imposable du foyer', `${fi}.revenuImposable`, { type: 'euros', min: 0 })}
    ${champ('Primes cumulées sur les autres contrats', `${fi}.primesCumuleesAutresContrats`, { type: 'euros', min: 0, aide: 'Tous assureurs confondus, pour le seuil de 150 000 €' })}
    ${champ('Prélèvements sociaux au fil de l\'eau sur le fonds en euros', `${fi}.prelevementsSociauxFilEau`, { type: 'case' })}
  </div>
  <p class="note important" style="margin-top:14px">L'option pour le barème progressif est globale : elle s'applique à l'ensemble des revenus de capitaux mobiliers du foyer pour l'année, et non au seul rachat simulé.</p>`;

  const pf = etat.donnees.parametresFiscaux;
  $('#rappel-fiscal').innerHTML = `<h3>Paramètres en vigueur <span class="aide">data/parametres-fiscaux.json, référence ${echapper(pf.dateReference)}</span></h3>
    <div class="grille">
      <div><div class="ligne-valeur"><span>Prélèvements sociaux assurance-vie</span><strong>${formaterPourcentage(pf.prelevementsSociaux.tauxAssuranceVie)}</strong></div>
      <div class="ligne-valeur"><span>Autres enveloppes depuis 2026</span><strong>${formaterPourcentage(pf.prelevementsSociaux.tauxAutresEnveloppes)}</strong></div>
      <div class="ligne-valeur"><span>Primes après 2017, moins de 8 ans</span><strong>${formaterPourcentage(pf.primesApres2017.tauxMoins8Ans)}</strong></div>
      <div class="ligne-valeur"><span>Primes après 2017, 8 ans et plus</span><strong>${formaterPourcentage(pf.primesApres2017.tauxPlus8AnsReduit)} jusqu'à ${formaterEuros(pf.primesApres2017.seuilPrimesTauxReduit)}, puis ${formaterPourcentage(pf.primesApres2017.tauxPlus8AnsPlein)}</strong></div></div>
      <div><div class="ligne-valeur"><span>Primes avant 2017 (PFL)</span><strong>${formaterPourcentage(pf.primesAvant2017.tauxMoins4Ans, 0)} / ${formaterPourcentage(pf.primesAvant2017.taux4a8Ans, 0)} / ${formaterPourcentage(pf.primesAvant2017.tauxPlus8Ans)}</strong></div>
      <div class="ligne-valeur"><span>Abattement après 8 ans</span><strong>${formaterEuros(pf.abattementAnnuel.seul)} ou ${formaterEuros(pf.abattementAnnuel.couple)}</strong></div>
      <div class="ligne-valeur"><span>Barème IR (revenus ${etat.donnees.baremeIR.anneeRevenus})</span><strong>${etat.donnees.baremeIR.tranches.map((t) => formaterPourcentage(t.taux, 0)).join(' / ')}</strong></div></div>
    </div>`;

  rendreFormulaireOptimiseur();
  rendreFormulaireComparateurs();
  rendreFormulaireRente();
}

function detailSupport(sup, i) {
  const p = `config.contrat.supports.${i}.parametres`;
  if (sup.type === 'fondsEuros') {
    return `<div class="element support" data-type="fondsEuros"><div><strong>${echapper(sup.libelle)}</strong> <span class="note">fonds en euros, taux issu du barème</span><div class="grille" style="margin-top:8px">
      ${champ('Taux forcé (facultatif, remplace le barème)', `${p}.tauxForce`, { type: 'pourcent', min: 0, max: 10, placeholder: 'barème' })}</div></div></div>`;
  }
  if (sup.type === 'uc') {
    return `<div class="element support" data-type="uc"><div><strong>${echapper(sup.libelle)}</strong> <span class="note">unités de compte</span><div class="grille" style="margin-top:8px">
      ${champ('Rendement annuel moyen attendu', `${p}.rendementMoyen`, { type: 'pourcent', min: -30, max: 30 })}
      ${champ('Volatilité annuelle', `${p}.volatilite`, { type: 'pourcent', min: 0, max: 80 })}</div></div></div>`;
  }
  return `<div class="element support" data-type="structure"><div><strong>${echapper(sup.libelle)}</strong> <span class="note">produit structuré à capital protégé, souscrit avec le versement initial</span><div class="grille" style="margin-top:8px">
    ${champ('Sous-jacent', `${p}.sousJacent`, { type: 'texte' })}
    ${champ('Maturité', `${p}.maturite`, { type: 'entier', min: 1, max: 15, unite: 'ans' })}
    ${champ('Fréquence des observations', `${p}.frequenceObservation`, { type: 'select', choix: [['1', 'Annuelle'], ['2', 'Tous les 2 ans']] })}
    ${champ('Coupon par période', `${p}.niveauCoupon`, { type: 'pourcent', min: 0, max: 30 })}
    ${champ('Barrière de coupon', `${p}.barriereCoupon`, { type: 'pourcent', min: 1, max: 150 })}
    ${champ('Barrière de protection du capital', `${p}.barriereProtection`, { type: 'pourcent', min: 1, max: 100 })}
    ${champ('Barrière d\'autocall', `${p}.barriereAutocall`, { type: 'pourcent', min: 50, max: 150 })}
    ${champ('Effet mémoire', `${p}.effetMemoire`, { type: 'case' })}
    ${champ('Remboursement anticipé (autocall)', `${p}.autocall`, { type: 'case' })}
    ${champ('Tendance du sous-jacent', `${p}.tendanceSousJacent`, { type: 'pourcent', min: -30, max: 30, unite: '% / an' })}
    ${champ('Volatilité du sous-jacent', `${p}.volatiliteSousJacent`, { type: 'pourcent', min: 0, max: 80 })}
    ${champ('Perte à maturité', `${p}.modePerte`, { type: 'select', choix: [['depuisStrike', 'Baisse depuis le niveau initial'], ['depuisBarriere', 'Baisse au-delà de la barrière']] })}
    ${champ('Réaffectation des coupons et du capital', `${p}.supportReaffectation`, { type: 'select', choix: [['', 'Fonds en euros (défaut)'], ...etat.config.contrat.supports.filter((x) => x.id !== sup.id).map((x) => [x.id, x.libelle])] })}
    ${champ('Assimilé aux UC (part d\'UC et assiette d\'avance)', `${p}.assimileUC`, { type: 'case' })}
  </div></div></div>`;
}

function rendreSupports() {
  const c = etat.config.contrat;
  const total = c.supports.reduce((s, x) => s + (x.allocation || 0), 0);
  const couleurs = { fondsEuros: couleur('--serie-1'), uc: couleur('--serie-2'), structure: couleur('--serie-3') };
  $('#allocation').innerHTML = `<div class="allocation">${c.supports.map((s) => `<div style="width:${Math.max(0, s.allocation * 100)}%;background:${couleurs[s.type]}" title="${echapper(s.libelle)} ${formaterPourcentage(s.allocation, 0)}"></div>`).join('')}</div>
    <div class="allocation-total${Math.abs(total - 1) > 1e-6 ? ' erreur' : ''}">Total alloué : ${formaterPourcentage(total, 1)}${Math.abs(total - 1) > 1e-6 ? ' (doit valoir 100 %)' : ''}</div>`;
  $('#liste-supports').innerHTML = c.supports.map((s, i) => `<div class="element support" data-type="${s.type}">
    <div class="grille">
      ${champ('Identifiant', `config.contrat.supports.${i}.id`, { type: 'texte' })}
      ${champ('Libellé', `config.contrat.supports.${i}.libelle`, { type: 'texte' })}
      <div class="champ"><label>Type</label><input type="text" value="${LIBELLES_TYPE[s.type]}" disabled></div>
      ${champ('Allocation', `config.contrat.supports.${i}.allocation`, { type: 'pourcent', min: 0, max: 100, step: 1 })}
    </div>
    <button class="btn petit danger" type="button" data-action="supprimer-support" data-index="${i}">Retirer</button></div>`).join('') || '<p class="vide">Aucun support : ajoutez au moins un fonds en euros.</p>';
}

function rendreFlux() {
  const c = etat.config.contrat;
  const supportsChoix = [['', 'Selon l\'allocation'], ...c.supports.map((s) => [s.id, s.libelle])];
  const supportsPrelevement = [['', 'Au prorata des supports'], ...c.supports.map((s) => [s.id, s.libelle])];
  const periodicites = [['mensuelle', 'Mensuelle'], ['trimestrielle', 'Trimestrielle'], ['annuelle', 'Annuelle']];
  $('#liste-vp').innerHTML = c.versementsProgrammes.map((v, i) => `<div class="element"><div class="grille">
      ${champ('Montant par échéance', `config.contrat.versementsProgrammes.${i}.montant`, { type: 'euros', min: 0 })}
      ${champ('Périodicité', `config.contrat.versementsProgrammes.${i}.periodicite`, { type: 'select', choix: periodicites })}
      ${champ('Année de début', `config.contrat.versementsProgrammes.${i}.anneeDebut`, { type: 'entier', min: 1 })}
      ${champ('Année de fin', `config.contrat.versementsProgrammes.${i}.anneeFin`, { type: 'entier', min: 1, placeholder: 'terme' })}
      ${champ('Indexation annuelle', `config.contrat.versementsProgrammes.${i}.indexation`, { type: 'pourcent', min: 0, max: 20 })}
      ${champ('Frais propres', `config.contrat.versementsProgrammes.${i}.tauxFrais`, { type: 'pourcent', min: 0, max: 3, placeholder: 'taux général' })}
    </div><button class="btn petit danger" type="button" data-action="supprimer-vp" data-index="${i}">Retirer</button></div>`).join('') || '<p class="vide">Aucun versement programmé.</p>';
  $('#liste-vc').innerHTML = c.versementsComplementaires.map((v, i) => `<div class="element"><div class="grille">
      ${champ('Montant', `config.contrat.versementsComplementaires.${i}.montant`, { type: 'euros', min: 0 })}
      ${champ('Année', `config.contrat.versementsComplementaires.${i}.annee`, { type: 'entier', min: 1 })}
      ${champ('Support crédité', `config.contrat.versementsComplementaires.${i}.support`, { type: 'select', choix: supportsChoix })}
      ${champ('Frais propres', `config.contrat.versementsComplementaires.${i}.tauxFrais`, { type: 'pourcent', min: 0, max: 3, placeholder: 'taux général' })}
    </div><button class="btn petit danger" type="button" data-action="supprimer-vc" data-index="${i}">Retirer</button></div>`).join('') || '<p class="vide">Aucun versement complémentaire.</p>';
  $('#liste-rp').innerHTML = c.rachatsProgrammes.map((r, i) => `<div class="element"><div class="grille">
      ${champ('Montant par échéance', `config.contrat.rachatsProgrammes.${i}.montant`, { type: 'euros', min: 0, placeholder: 'ou pourcentage' })}
      ${champ('Ou pourcentage de l\'encours', `config.contrat.rachatsProgrammes.${i}.pourcentage`, { type: 'pourcent', min: 0, max: 100, placeholder: 'ou montant' })}
      ${champ('Périodicité', `config.contrat.rachatsProgrammes.${i}.periodicite`, { type: 'select', choix: periodicites })}
      ${champ('Année de début', `config.contrat.rachatsProgrammes.${i}.anneeDebut`, { type: 'entier', min: 1 })}
      ${champ('Année de fin', `config.contrat.rachatsProgrammes.${i}.anneeFin`, { type: 'entier', min: 1, placeholder: 'terme' })}
      ${champ('Support de prélèvement', `config.contrat.rachatsProgrammes.${i}.support`, { type: 'select', choix: supportsPrelevement })}
    </div><button class="btn petit danger" type="button" data-action="supprimer-rp" data-index="${i}">Retirer</button></div>`).join('') || '<p class="vide">Aucun rachat programmé.</p>';
}

function rendreArbitrages() {
  const c = etat.config.contrat;
  const choix = c.supports.map((s) => [s.id, s.libelle]);
  $('#liste-arbitrages').innerHTML = etat.config.arbitrages.ponctuels.map((a, i) => `<div class="element"><div class="grille">
      ${champ('Année', `config.arbitrages.ponctuels.${i}.annee`, { type: 'entier', min: 1 })}
      ${champ('Support source', `config.arbitrages.ponctuels.${i}.source`, { type: 'select', choix })}
      ${champ('Support destination', `config.arbitrages.ponctuels.${i}.destination`, { type: 'select', choix })}
      ${champ('Montant', `config.arbitrages.ponctuels.${i}.montant`, { type: 'euros', min: 0, placeholder: 'ou pourcentage' })}
      ${champ('Ou pourcentage de la source', `config.arbitrages.ponctuels.${i}.pourcentage`, { type: 'pourcent', min: 0, max: 100, placeholder: 'ou montant' })}
    </div><button class="btn petit danger" type="button" data-action="supprimer-arbitrage" data-index="${i}">Retirer</button></div>`).join('') || '<p class="vide">Aucun arbitrage ponctuel.</p>';
  const r = 'config.arbitrages.reequilibrage';
  const s = 'config.arbitrages.securisation';
  $('#form-arbitrages-auto').innerHTML = `<h3>Rééquilibrage périodique</h3><div class="grille">
      ${champ('Rééquilibrer vers l\'allocation cible', `${r}.actif`, { type: 'case' })}
      ${champ('Périodicité', `${r}.periodiciteAnnees`, { type: 'entier', min: 1, max: 10, unite: 'ans' })}
      ${champ('Inclure les produits structurés', 'config.arbitrages.inclureStructures', { type: 'case' })}
    </div>
    <h3 style="margin-top:18px">Sécurisation progressive <span class="aide">Désensibilisation graduelle vers le fonds en euros à l'approche du terme</span></h3><div class="grille">
      ${champ('Activer la sécurisation', `${s}.actif`, { type: 'case' })}
      ${champ('Année de début', `${s}.anneeDebut`, { type: 'entier', min: 1, placeholder: '5 ans avant le terme' })}
      ${champ('Part du fonds en euros visée au terme', `${s}.partFondsEurosCible`, { type: 'pourcent', min: 0, max: 100 })}
      ${champ('Courbe', `${s}.courbe`, { type: 'select', choix: [['lineaire', 'Linéaire'], ['paliers', 'Par paliers']] })}
      ${champ('Pas des paliers', `${s}.pasPaliers`, { type: 'entier', min: 1, max: 5, unite: 'ans' })}
    </div>`;
}

function remboursementsLibres() {
  const a = etat.config.avance;
  const fin = a.anneeMiseEnPlace + a.duree - 1;
  const champs = [];
  for (let an = a.anneeMiseEnPlace; an < fin; an += 1) {
    champs.push(champ(`Année ${an}`, `config.avance.remboursementsLibres.${an}`, { type: 'euros', min: 0 }));
  }
  return `<h3>Remboursements partiels libres <span class="aide">Le solde est remboursé à l'échéance (année ${fin})</span></h3><div class="grille">${champs.join('')}</div>`;
}

function rendreFormulaireOptimiseur() {
  const o = 'optimiseur';
  if (etat.optimiseur.encours === null) etat.optimiseur.encours = etat.config.contrat.montantInitial || 100000;
  $('#form-optimiseur').innerHTML = `<h3>Hypothèses</h3><div class="grille">
    ${champ('Rendement UC attendu (brut de frais)', `${o}.rendementUC`, { type: 'pourcent', min: -20, max: 30 })}
    ${champ('Volatilité UC', `${o}.volatiliteUC`, { type: 'pourcent', min: 0, max: 80 })}
    ${champ('Encours total du contrat', `${o}.encours`, { type: 'euros', min: 0 })}
    ${champ('Fonds en euros net de prélèvements sociaux', `${o}.avecPS`, { type: 'case' })}
  </div>`;
}

function rendreFormulaireComparateurs() {
  const ca = 'comparateurAvance';
  $('#form-comparateur-avance').innerHTML = `<h3>Avance contre rachat partiel <span class="aide">Même liquidité nette perçue dans les deux cas</span></h3><div class="grille">
    ${champ('Besoin de liquidité (net)', `${ca}.montant`, { type: 'euros', min: 0 })}
    ${champ('Année', `${ca}.annee`, { type: 'entier', min: 1, max: etat.config.contrat.dureeProjection })}
    ${champ('Durée de l\'avance', `${ca}.duree`, { type: 'entier', min: 1, max: 30, unite: 'ans' })}
    ${champ('Taux de l\'avance', `${ca}.tauxInteret`, { type: 'pourcent', min: 0, max: 20 })}
    ${champ('Capitalisation', `${ca}.capitalisation`, { type: 'select', choix: [['composee', 'Annuelle composée'], ['simple', 'Intérêts simples']] })}
    ${champ('Remboursement', `${ca}.remboursement`, { type: 'select', choix: [['inFine', 'In fine'], ['amortissable', 'Amortissable']] })}
  </div>`;
  $('#form-comparateur-scenarios').innerHTML = `<h3>Scénarios côte à côte <span class="aide">Mêmes flux, allocations et hypothèses différentes (3 à 5 scénarios)</span></h3>
    <div class="liste">${etat.scenarios.map((s, i) => `<div class="element"><div class="grille">
      ${champ('Nom', `scenarios.${i}.nom`, { type: 'texte' })}
      ${champ('Part d\'UC', `scenarios.${i}.partUC`, { type: 'pourcent', min: 0, max: 100, step: 1 })}
      ${champ('Rendement UC', `scenarios.${i}.rendementUC`, { type: 'pourcent', min: -20, max: 30 })}
      ${champ('Tendance fonds euros', `scenarios.${i}.tendance`, { type: 'select', choix: [['stable', 'Stable'], ['hausse', 'Hausse'], ['baisse', 'Baisse']] })}
      ${champ('Variation annuelle', `scenarios.${i}.variationAnnuelle`, { type: 'pourcent', min: 0, max: 50 })}
      ${champ('Frais de gestion UC', `scenarios.${i}.gestionUC`, { type: 'pourcent', min: 0, max: 5, placeholder: 'contrat' })}
    </div><button class="btn petit danger" type="button" data-action="supprimer-scenario" data-index="${i}"${etat.scenarios.length <= 3 ? ' disabled' : ''}>Retirer</button></div>`).join('')}</div>
    <div class="ajout" style="margin-top:12px"><button class="btn" type="button" data-action="ajouter-scenario"${etat.scenarios.length >= 5 ? ' disabled' : ''}>Ajouter un scénario</button></div>`;
}

function rendreFormulaireRente() {
  const t = etat.donnees.tableRente;
  const r = 'rente';
  $('#form-rente').innerHTML = `<h3>Rente viagère</h3><div class="grille">
    ${champ('Capital à convertir', `${r}.capital`, { type: 'euros', min: 0, placeholder: 'valeur au terme' })}
    ${champ('Âge à la liquidation', `${r}.age`, { type: 'entier', min: 40, max: 95, unite: 'ans' })}
    ${champ('Type de rente', `${r}.type`, { type: 'select', choix: Object.entries(t.libellesTypeRente) })}
    ${champ('Frais sur arrérages', `${r}.fraisArrerages`, { type: 'pourcent', min: 0, max: 10 })}
  </div>
  <h3 style="margin-top:18px">Consommation du capital par rachats programmés</h3><div class="grille">
    ${champ('Rachat annuel brut', `${r}.rachatAnnuel`, { type: 'euros', min: 0 })}
    ${champ('Indexation annuelle', `${r}.indexation`, { type: 'pourcent', min: 0, max: 10 })}
    ${champ('Rendement net du capital restant', `${r}.rendementNet`, { type: 'pourcent', min: -10, max: 15 })}
  </div>`;
}

// ---------------------------------------------------------------------------
// Calcul et rendu des résultats
// ---------------------------------------------------------------------------

let minuterie = null;
function recalculerBientot() {
  clearTimeout(minuterie);
  minuterie = setTimeout(recalculer, 120);
}

function recalculer() {
  const erreurs = [...validerContrat(etat.config.contrat), ...validerParametresFrais(etat.config.frais)];
  if (erreurs.length) {
    etat.erreur = erreurs.join(' ');
    etat.resultat = null;
  } else {
    try {
      etat.resultat = projeter(etat.config, etat.donnees);
      etat.erreur = null;
    } catch (e) {
      etat.erreur = e.message;
      etat.resultat = null;
    }
  }
  etat.monteCarlo = null;
  rendreRuban();
  rendreResultats();
  rendreAssietteAvance();
  rendreOptimiseur();
  rendreComparateurs();
  rendreRente();
}

function rendreRuban() {
  const r = etat.resultat;
  if (!r) {
    $('#ruban').innerHTML = `<div class="kpi erreur"><small>Paramétrage à corriger</small><strong>${echapper(etat.erreur || '')}</strong></div>`;
    return;
  }
  const s = r.synthese;
  const tauxMoyen = r.lignes.reduce((a, l) => a + l.tauxFondsEuros, 0) / r.lignes.length;
  $('#ruban').innerHTML = [
    ['Valeur au terme', formaterEuros(s.valeurTerme)],
    ['Versements cumulés', formaterEuros(s.cumulVersements + s.valeurOuverture)],
    ['Plus-value nette', formaterEuros(s.plusValueNette)],
    ['Rendement annualisé', formaterPourcentage(s.rendementAnnualise)],
    ['Taux fonds euros moyen', formaterPourcentage(tauxMoyen)],
    ['Frais cumulés', formaterEuros(s.cumulFrais)],
  ].map(([k, v]) => `<div class="kpi"><small>${k}</small><strong>${v}</strong></div>`).join('');
}

function pastilleSignalement(sg) {
  const libelles = { tranche: 'Tranche', seuilEncours: 'Seuil 150 k€', seuilFranchi: 'Seuil franchi', abattement: 'Abattement', avanceSeuil: 'Avance', avanceRefusee: 'Avance refusée', optionFiscale: 'Option fiscale' };
  return `<span class="pastille ${sg.niveau}" title="${echapper(sg.message)}"><span class="point"></span>${libelles[sg.type] || sg.type}</span>`;
}

function rendreResultats() {
  const zone = $('#resultats-contenu');
  const r = etat.resultat;
  if (!r) {
    zone.innerHTML = `<div class="carte"><p class="note important">${echapper(etat.erreur || 'Aucun résultat.')}</p></div>`;
    return;
  }
  const s = r.synthese;
  const parAnnee = {};
  for (const sg of r.signalements) if (sg.annee) (parAnnee[sg.annee] = parAnnee[sg.annee] || []).push(sg);
  const derniere = r.lignes[r.lignes.length - 1];
  const ft = r.fiscaliteTerme;

  zone.innerHTML = `
    <div class="tuiles">
      <div class="tuile"><small>Valeur au terme (${formaterAnnees(etat.config.contrat.dureeProjection)})</small><strong>${formaterEuros(s.valeurTerme)}</strong><div class="sous">dont gains latents ${formaterEuros(derniere.gainsLatents)}</div></div>
      <div class="tuile"><small>Plus-value nette de frais</small><strong>${formaterEuros(s.plusValueNette)}</strong><div class="sous">rendement annualisé ${formaterPourcentage(s.rendementAnnualise)}</div></div>
      <div class="tuile"><small>Rachats cumulés</small><strong>${formaterEuros(s.cumulRachats)}</strong><div class="sous">net perçu ${formaterEuros(s.cumulRachatsNets)}</div></div>
      <div class="tuile"><small>Frais cumulés</small><strong>${formaterEuros(s.cumulFrais)}</strong><div class="sous">PS au fil de l'eau ${formaterEuros(s.cumulPSFilEau)}</div></div>
      <div class="tuile"><small>Rachat total au terme, net</small><strong>${formaterEuros(ft.montantNet)}</strong><div class="sous">impôt ${formaterEuros(ft.impotDefinitif)}, PS ${formaterEuros(ft.prelevementsSociaux)}${ft.restitutionPS > 0 ? `, restitution PS ${formaterEuros(ft.restitutionPS)}` : ''}</div></div>
    </div>
    ${r.signalements.length ? `<div class="carte"><h3>Points d'attention</h3><div class="signalements">${r.signalements.map((sg) => `<div class="signalement ${sg.niveau}"><span class="annee">${sg.annee ? `Année ${sg.annee}` : 'Global'}</span><span>${echapper(sg.message)}</span></div>`).join('')}</div></div>` : ''}
    <div class="carte"><h3>Évolution de la valorisation</h3><div class="graphique"><canvas id="graph-valeur"></canvas></div></div>
    <div class="deux-colonnes">
      <div class="carte"><h3>Taux du fonds en euros <span class="aide">selon la part d'UC et l'encours</span></h3><div class="graphique petit"><canvas id="graph-taux"></canvas></div></div>
      <div class="carte"><h3>Part d'unités de compte <span class="aide">moyenne de l'exercice, seuils du barème en pointillé</span></h3><div class="graphique petit"><canvas id="graph-partuc"></canvas></div></div>
    </div>
    <div class="carte">
      <div class="sous-onglets" role="tablist">
        ${[['tableau', 'Tableau annuel'], ['repartition', 'Répartition par support'], ['rachats', `Rachats (${r.rachats.length})`], ['avance', `Avance (${r.avance.lignes.length})`], ['arbitrages', `Arbitrages (${r.arbitrages.length})`], ['structures', `Structurés (${r.evenementsStructures.length})`], ['montecarlo', 'Monte Carlo']].map(([id, l]) => `<button type="button" role="tab" data-sous="${id}" aria-selected="${etat.sousOnglet === id}">${l}</button>`).join('')}
      </div>
      <div class="sous-panneau${etat.sousOnglet === 'tableau' ? ' active' : ''}" data-sous="tableau">${tableauAnnuel(r, parAnnee)}</div>
      <div class="sous-panneau${etat.sousOnglet === 'repartition' ? ' active' : ''}" data-sous="repartition">${tableauRepartition(r)}</div>
      <div class="sous-panneau${etat.sousOnglet === 'rachats' ? ' active' : ''}" data-sous="rachats">${tableauRachats(r)}</div>
      <div class="sous-panneau${etat.sousOnglet === 'avance' ? ' active' : ''}" data-sous="avance">${tableauAvance(r)}</div>
      <div class="sous-panneau${etat.sousOnglet === 'arbitrages' ? ' active' : ''}" data-sous="arbitrages">${tableauArbitrages(r)}</div>
      <div class="sous-panneau${etat.sousOnglet === 'structures' ? ' active' : ''}" data-sous="structures">${tableauStructures(r)}</div>
      <div class="sous-panneau${etat.sousOnglet === 'montecarlo' ? ' active' : ''}" data-sous="montecarlo" id="zone-montecarlo">${zoneMonteCarlo()}</div>
    </div>`;

  dessinerGraphiquesResultats(r);
}

function tableauAnnuel(r, parAnnee) {
  const lignes = r.lignes.map((l) => {
    const sgs = parAnnee[l.annee] || [];
    const niveau = sgs.some((x) => x.niveau === 'critique') ? 'critique' : sgs.some((x) => x.niveau === 'attention') ? 'attention' : sgs.length ? 'info' : '';
    return `<tr class="${niveau ? `marque-${niveau}` : ''}">
      <td>${l.annee}${sgs.map(pastilleSignalement).join('')}</td>
      <td>${formaterEuros(l.versementsBruts)}</td><td>${formaterEuros(l.rachatsBruts)}</td><td>${formaterEuros(l.frais.total)}</td>
      <td>${formaterEuros(l.prelevementsSociaux + l.prelevementsSociauxRachats)}</td><td>${formaterEuros(l.impots)}</td>
      <td>${formaterPourcentage(l.partUC, 1)}</td><td>${formaterPourcentage(l.tauxFondsEuros)}</td><td style="text-align:left">${echapper(l.trancheBareme)}${l.auDessusSeuil ? ' <span class="pastille ok">≥ seuil</span>' : ''}</td>
      <td>${l.avance ? formaterEuros(l.avance.totalDu) : '<span class="note">—</span>'.replace('—', '·')}</td>
      <td><strong>${formaterEuros(l.valeurFin)}</strong></td><td>${formaterPourcentage(l.performanceBrute)}</td><td>${formaterPourcentage(l.performanceNette)}</td></tr>`;
  }).join('');
  return `<div class="tableau-conteneur"><table><thead><tr><th>Année</th><th>Versements</th><th>Rachats</th><th>Frais</th><th>Prélèv. sociaux</th><th>Impôt</th><th>Part UC</th><th>Taux fonds €</th><th style="text-align:left">Tranche</th><th>Encours avance</th><th>Valeur fin</th><th>Perf. brute</th><th>Perf. nette</th></tr></thead><tbody>${lignes}</tbody></table></div>
  <div class="legende-tableau"><span class="l-info">Changement de tranche ou seuil franchi</span><span class="l-attention">Encours proche du seuil, abattement consommé</span><span class="l-critique">Avance au-delà du seuil d'alerte</span></div>`;
}

function tableauRepartition(r) {
  return `<div class="tableau-conteneur"><table><thead><tr><th>Année</th>${r.supports.map((s) => `<th>${echapper(s.libelle)}</th>`).join('')}<th>Total</th><th>Part UC fin</th></tr></thead><tbody>
    ${r.lignes.map((l) => `<tr><td>${l.annee}</td>${r.supports.map((s) => `<td>${formaterEuros(l.repartition[s.id])}</td>`).join('')}<td><strong>${formaterEuros(l.valeurFin)}</strong></td><td>${formaterPourcentage(l.partUCFin, 1)}</td></tr>`).join('')}</tbody></table></div>`;
}

function tableauRachats(r) {
  if (!r.rachats.length) return '<p class="vide">Aucun rachat sur la période. La fiscalité d\'un rachat total au terme figure dans les tuiles de synthèse.</p>';
  const o = etat.config.fiscal.option;
  return `<p class="note" style="margin-bottom:10px">Option retenue : <strong>${o === 'bareme' ? 'barème progressif' : 'prélèvement forfaitaire'}</strong>. L'acompte prélevé par l'assureur est régularisé lors de la déclaration ; une régularisation négative est une restitution. Sur l'ensemble des rachats, ${r.synthese.optionFiscale.totalBareme < r.synthese.optionFiscale.totalForfaitaire - 1 ? `le barème serait plus favorable de ${formaterEuros(r.synthese.optionFiscale.totalForfaitaire - r.synthese.optionFiscale.totalBareme)}` : r.synthese.optionFiscale.totalBareme > r.synthese.optionFiscale.totalForfaitaire + 1 ? `le prélèvement forfaitaire est plus favorable de ${formaterEuros(r.synthese.optionFiscale.totalBareme - r.synthese.optionFiscale.totalForfaitaire)}` : 'les deux options sont équivalentes'}.</p>
  <div class="tableau-conteneur"><table><thead><tr><th>Année</th><th>Rachat brut</th><th>Quote-part de gains</th><th>Abattement</th><th>IR forfaitaire</th><th>IR barème</th><th>Acompte</th><th>IR définitif</th><th>Régularisation</th><th>PS</th><th>Net perçu</th><th>Taux effectif</th></tr></thead><tbody>
    ${r.rachats.map((x) => `<tr class="${x.optionFavorable !== x.optionRetenue && x.optionFavorable !== 'egal' ? 'marque-info' : ''}"><td>${x.annee}${x.optionFavorable !== x.optionRetenue && x.optionFavorable !== 'egal' ? `<span class="pastille info">${x.optionFavorable === 'bareme' ? 'barème favorable' : 'forfaitaire favorable'}</span>` : ''}</td><td>${formaterEuros(x.montantRachat)}</td><td>${formaterEuros(x.quotePartGains)}</td><td>${formaterEuros(x.abattementUtilise)}</td><td>${formaterEuros(x.impotForfaitaire.total)}</td><td>${formaterEuros(x.impotBareme)}</td><td>${formaterEuros(x.acompte)}</td><td><strong>${formaterEuros(x.impotDefinitif)}</strong></td><td>${formaterEuros(x.regularisation)}</td><td>${formaterEuros(x.prelevementsSociaux)}</td><td><strong>${formaterEuros(x.montantNet)}</strong></td><td>${formaterPourcentage(x.tauxEffectif, 1)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function tableauAvance(r) {
  if (r.avance.refusee) return `<p class="note important">${echapper(r.avance.refusee)}</p>`;
  if (!r.avance.lignes.length) return '<p class="vide">Aucune avance paramétrée. Activez une avance dans la section Avance.</p>';
  const s = r.synthese.avance;
  return `<div class="tuiles" style="margin-bottom:12px">
      <div class="tuile"><small>Coût total des intérêts</small><strong>${formaterEuros(s.coutTotal)}</strong></div>
      <div class="tuile"><small>Total remboursé</small><strong>${formaterEuros(s.totalRembourse)}</strong></div>
      <div class="tuile"><small>Différentiel net cumulé</small><strong>${formaterEuros(s.differentielCumule)}</strong><div class="sous">rendement du capital maintenu moins intérêts</div></div>
    </div>
    <div class="tableau-conteneur"><table><thead><tr><th>Année</th><th>Capital dû début</th><th>Intérêts</th><th>Intérêts payés</th><th>Remboursement</th><th>Total dû fin</th><th>Valeur de rachat</th><th>Dette / valeur</th><th>Différentiel</th></tr></thead><tbody>
    ${r.avance.lignes.map((a) => `<tr class="${a.alerte ? 'marque-critique' : ''}"><td>${a.annee}${a.alerte ? '<span class="pastille critique">seuil</span>' : ''}</td><td>${formaterEuros(a.capitalDebut)}</td><td>${formaterEuros(a.interets)}</td><td>${formaterEuros(a.interetsPayes)}</td><td>${formaterEuros(a.remboursementCapital)}</td><td><strong>${formaterEuros(a.totalDu)}</strong></td><td>${formaterEuros(a.valeurRachat)}</td><td>${formaterPourcentage(a.ratio, 1)}</td><td>${formaterEuros(a.differentiel || 0)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function tableauArbitrages(r) {
  if (!r.arbitrages.length) return '<p class="vide">Aucun arbitrage réalisé.</p>';
  const lib = (id) => (r.supports.find((s) => s.id === id) || { libelle: id }).libelle;
  const motifs = { ponctuel: 'Ponctuel', reequilibrage: 'Rééquilibrage', securisation: 'Sécurisation' };
  return `<div class="tableau-conteneur"><table><thead><tr><th>Année</th><th style="text-align:left">Motif</th><th style="text-align:left">De</th><th style="text-align:left">Vers</th><th>Montant</th><th>Frais</th><th>Part UC après</th><th>Taux fonds € de l'exercice</th></tr></thead><tbody>
    ${r.arbitrages.map((m) => { const l = r.lignes[m.annee - 1]; return `<tr><td>${m.annee}</td><td style="text-align:left">${motifs[m.motif] || m.motif}</td><td style="text-align:left">${echapper(lib(m.source))}</td><td style="text-align:left">${echapper(lib(m.destination))}</td><td>${formaterEuros(m.montant)}</td><td>${formaterEuros(m.frais)}</td><td>${formaterPourcentage(l.partUC, 1)}</td><td>${formaterPourcentage(l.tauxFondsEuros)} (${echapper(l.trancheBareme)})</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

function tableauStructures(r) {
  if (!r.evenementsStructures.length) return '<p class="vide">Aucun produit structuré dans le contrat.</p>';
  return `<div class="tableau-conteneur"><table><thead><tr><th>Année</th><th style="text-align:left">Produit</th><th>Niveau du sous-jacent</th><th style="text-align:left">Événement</th><th>Coupon</th><th>Capital remboursé</th><th>Valeur indicative</th></tr></thead><tbody>
    ${r.evenementsStructures.map((e) => `<tr class="${e.evenement === 'maturitePerte' ? 'marque-critique' : e.evenement === 'autocall' ? 'marque-info' : ''}"><td>${e.annee}</td><td style="text-align:left">${echapper(e.libelle)}</td><td>${e.niveau !== null ? formaterPourcentage(e.niveau, 1) : ''}</td><td style="text-align:left">${LIBELLES_EVENEMENT[e.evenement] || e.evenement}</td><td>${formaterEuros(e.coupon)}</td><td>${formaterEuros(e.rembourse)}</td><td>${formaterEuros(e.valeur)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function zoneMonteCarlo() {
  const mc = etat.monteCarlo;
  const n = etat.config.scenario.nombreSimulations;
  if (!mc) return `<p class="note" style="margin-bottom:10px">Distribution des valorisations sur ${formaterNombre(n)} trajectoires stochastiques (rendements UC, sous-jacent des structurés, taux du fonds en euros si volatilité renseignée).</p><button class="btn primaire" type="button" id="btn-montecarlo">Lancer ${formaterNombre(n)} simulations</button>`;
  return `<div class="tuiles" style="margin-bottom:12px">
      <div class="tuile"><small>Médiane au terme</small><strong>${formaterEuros(mc.distributions[mc.distributions.length - 1].mediane)}</strong></div>
      <div class="tuile"><small>Intervalle 5 % à 95 %</small><strong>${formaterEuros(mc.distributions[mc.distributions.length - 1].p5)} à ${formaterEuros(mc.distributions[mc.distributions.length - 1].p95)}</strong></div>
      <div class="tuile"><small>Probabilité de moins-value nette</small><strong>${formaterPourcentage(mc.probabilitePerte, 1)}</strong><div class="sous">${formaterNombre(mc.nombreSimulations)} simulations</div></div>
    </div>
    <div class="graphique"><canvas id="graph-montecarlo"></canvas></div>
    <div class="tableau-conteneur" style="margin-top:12px"><table><thead><tr><th>Année</th><th>P5</th><th>P25</th><th>Médiane</th><th>P75</th><th>P95</th><th>Moyenne</th></tr></thead><tbody>
    ${mc.distributions.map((d) => `<tr><td>${d.annee}</td><td>${formaterEuros(d.p5)}</td><td>${formaterEuros(d.p25)}</td><td><strong>${formaterEuros(d.mediane)}</strong></td><td>${formaterEuros(d.p75)}</td><td>${formaterEuros(d.p95)}</td><td>${formaterEuros(d.moyenne)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Graphiques (Chart.js)
// ---------------------------------------------------------------------------

function optionsBase(formatY = (v) => formaterEuros(v)) {
  const encre = couleur('--encre-2');
  const ligne = couleur('--ligne');
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: encre, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'rectRounded', padding: 14 } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label} : ${ctx.dataset.formatValeur ? ctx.dataset.formatValeur(ctx.parsed.y) : formatY(ctx.parsed.y)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: encre }, title: { display: true, text: 'Année', color: encre } },
      y: { grid: { color: ligne }, ticks: { color: encre, callback: (v) => formatY(v) }, border: { display: false } },
    },
  };
}

function graphique(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === 'undefined') return null;
  if (etat.graphiques[id]) etat.graphiques[id].destroy();
  etat.graphiques[id] = new Chart(canvas, config);
  return etat.graphiques[id];
}

function dessinerGraphiquesResultats(r) {
  const annees = r.lignes.map((l) => l.annee);
  const couleurs = couleursSeries();
  const datasets = r.supports.map((s, i) => ({
    label: s.libelle,
    data: r.lignes.map((l) => l.repartition[s.id]),
    backgroundColor: `${couleurs[i % couleurs.length]}66`,
    borderColor: couleurs[i % couleurs.length],
    borderWidth: 2,
    fill: true,
    stack: 'valeur',
    pointRadius: 0,
    pointHoverRadius: 5,
    tension: 0.25,
  }));
  datasets.push({
    label: 'Capital net investi',
    data: r.lignes.map((l) => l.cumulVersements + r.synthese.valeurOuverture - l.cumulRachats),
    borderColor: couleur('--encre-2'),
    borderDash: [5, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    fill: false,
  });
  if (r.avance.lignes.length) {
    datasets.push({
      label: 'Encours de l\'avance',
      data: r.lignes.map((l) => (l.avance ? l.avance.totalDu : null)),
      borderColor: couleur('--serie-4'),
      borderWidth: 2,
      pointRadius: 3,
      fill: false,
    });
  }
  const opts = optionsBase();
  opts.scales.y.stacked = true;
  opts.scales.y.beginAtZero = true;
  graphique('graph-valeur', { type: 'line', data: { labels: annees, datasets }, options: opts });

  const optTaux = optionsBase((v) => formaterPourcentage(v, 2));
  optTaux.plugins.legend.display = false;
  graphique('graph-taux', {
    type: 'bar',
    data: { labels: annees, datasets: [{ label: 'Taux du fonds en euros', data: r.lignes.map((l) => l.tauxFondsEuros), backgroundColor: r.lignes.map((l) => (l.auDessusSeuil ? couleur('--serie-1') : `${couleur('--serie-1')}99`)), borderRadius: 4, formatValeur: (v) => formaterPourcentage(v) }] },
    options: optTaux,
  });

  const b = etat.donnees.baremeFondsEuros;
  const seuilsUC = b.tranches.map((t) => t.partUCMin).filter((v) => v > 0);
  const optUC = optionsBase((v) => formaterPourcentage(v, 0));
  optUC.scales.y.min = 0;
  optUC.scales.y.max = 1;
  optUC.plugins.legend.display = false;
  graphique('graph-partuc', {
    type: 'line',
    data: {
      labels: annees,
      datasets: [
        { label: 'Part d\'UC moyenne', data: r.lignes.map((l) => l.partUC), borderColor: couleur('--serie-2'), backgroundColor: `${couleur('--serie-2')}33`, fill: true, borderWidth: 2, pointRadius: 3, tension: 0.25, formatValeur: (v) => formaterPourcentage(v, 1) },
        ...seuilsUC.map((s) => ({ label: `Seuil ${Math.round(s * 100)} %`, data: annees.map(() => s), borderColor: couleur('--encre-3'), borderDash: [3, 4], borderWidth: 1, pointRadius: 0, fill: false, formatValeur: (v) => formaterPourcentage(v, 0) })),
      ],
    },
    options: optUC,
  });
}

function dessinerMonteCarlo() {
  const mc = etat.monteCarlo;
  if (!mc) return;
  const annees = mc.distributions.map((d) => d.annee);
  const c = couleur('--serie-1');
  const opts = optionsBase();
  graphique('graph-montecarlo', {
    type: 'line',
    data: {
      labels: annees,
      datasets: [
        { label: 'P95', data: mc.distributions.map((d) => d.p95), borderColor: `${c}55`, backgroundColor: `${c}22`, fill: '+1', borderWidth: 1, pointRadius: 0 },
        { label: 'P75', data: mc.distributions.map((d) => d.p75), borderColor: `${c}88`, backgroundColor: `${c}44`, fill: '+1', borderWidth: 1, pointRadius: 0 },
        { label: 'Médiane', data: mc.distributions.map((d) => d.mediane), borderColor: c, borderWidth: 2.5, pointRadius: 0, fill: false },
        { label: 'P25', data: mc.distributions.map((d) => d.p25), borderColor: `${c}88`, backgroundColor: `${c}44`, fill: '-1', borderWidth: 1, pointRadius: 0 },
        { label: 'P5', data: mc.distributions.map((d) => d.p5), borderColor: `${c}55`, backgroundColor: `${c}22`, fill: '-1', borderWidth: 1, pointRadius: 0 },
        { label: 'Déterministe', data: etat.resultat.lignes.map((l) => l.valeurFin), borderColor: couleur('--encre-2'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
      ],
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// Sections dérivées : assiette d'avance, optimiseur, comparateurs, rente
// ---------------------------------------------------------------------------

function rendreAssietteAvance() {
  const r = etat.resultat;
  const zone = $('#assiette-avance');
  if (!r) { zone.innerHTML = ''; return; }
  const supports = etat.config.contrat.supports;
  const lignes = r.lignes.map((l) => {
    const a = assietteAvance(l.repartition, supports, etat.config.avance);
    return `<tr><td>${l.annee}</td><td>${formaterEuros(a.fondsEuros)}</td><td>${formaterEuros(a.uc)}</td><td><strong>${formaterEuros(a.maximum)}</strong></td><td>${l.avance ? formaterEuros(l.avance.totalDu) : '·'}</td></tr>`;
  }).join('');
  zone.innerHTML = `<h3>Assiette d'avance disponible année par année <span class="aide">calculée sur les valorisations de fin d'exercice</span></h3>
    ${r.avance.refusee ? `<p class="note important" style="margin-bottom:10px">${echapper(r.avance.refusee)}</p>` : ''}
    <div class="tableau-conteneur"><table><thead><tr><th>Année</th><th>${formaterPourcentage(etat.config.avance.quotiteFondsEuros, 0)} du fonds en euros</th><th>${formaterPourcentage(etat.config.avance.quotiteUC, 0)} des UC</th><th>Avance maximale</th><th>Encours de l'avance</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
}

function rendreOptimiseur() {
  const zone = $('#optimiseur-contenu');
  const o = etat.optimiseur;
  const c = courbeRendement({
    rendementUC: o.rendementUC, volatiliteUC: o.volatiliteUC, encours: o.encours || 0,
    bareme: etat.donnees.baremeFondsEuros, frais: etat.config.frais,
    tauxPS: o.avecPS && etat.config.fiscal.prelevementsSociauxFilEau ? etat.donnees.parametresFiscaux.prelevementsSociaux.tauxAssuranceVie : 0,
    scenario: etat.config.scenario,
  });
  zone.innerHTML = `
    <div class="tuiles">
      <div class="tuile"><small>Part d'UC optimale</small><strong>${formaterPourcentage(c.optimum.partUC, 0)}</strong><div class="sous">rendement global ${formaterPourcentage(c.optimum.rendement)}, tranche ${echapper(c.optimum.tranche)}</div></div>
      <div class="tuile"><small>Volatilité au point optimal</small><strong>${formaterPourcentage(c.optimum.risque, 1)}</strong><div class="sous">part d'UC × volatilité UC</div></div>
      <div class="tuile"><small>Seuils de bascule</small><strong>${c.seuils.map((s) => formaterPourcentage(s.partUC, 0)).join(' · ') || 'aucun'}</strong><div class="sous">paliers du barème</div></div>
    </div>
    <div class="carte"><h3>Rendement global selon la part d'UC</h3><div class="graphique"><canvas id="graph-optimiseur"></canvas></div></div>
    <div class="deux-colonnes">
      <div class="carte"><h3>Gain marginal à chaque palier</h3><div class="tableau-conteneur"><table><thead><tr><th>Part d'UC</th><th style="text-align:left">Tranche atteinte</th><th>Taux fonds €</th><th>Rendement global</th><th>Gain marginal</th><th>Surcroît de risque</th></tr></thead><tbody>
        ${c.seuils.map((s) => `<tr class="${s.gainMarginal > 0 ? 'marque-info' : 'marque-attention'}"><td>${formaterPourcentage(s.partUC, 0)}</td><td style="text-align:left">${echapper(s.tranche)}</td><td>${formaterPourcentage(s.tauxAvant)} → ${formaterPourcentage(s.tauxApres)}</td><td>${formaterPourcentage(s.rendementApres)}</td><td><strong>${s.gainMarginal >= 0 ? '+' : ''}${formaterNombre(s.gainMarginal * 100, 2)} pt</strong></td><td>+${formaterNombre(s.surcroitRisque * 100, 1)} pt</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="carte"><h3>Lecture</h3>
        ${c.opportunites.length ? `<div class="signalements">${c.opportunites.map((op) => `<div class="signalement"><span class="annee">${formaterPourcentage(op.partUC, 0)}</span><span>${echapper(op.message)}</span></div>`).join('')}</div>` : ''}
        ${c.zonesDefavorables.length ? `<div class="signalements" style="margin-top:8px">${c.zonesDefavorables.map((z) => `<div class="signalement attention"><span class="annee">${formaterPourcentage(z.de, 0)} à ${formaterPourcentage(z.a, 0)}</span><span>Zone défavorable : augmenter la part d'UC dégrade le rendement global (jusqu'à ${formaterNombre(z.perte * 100, 2)} pt), le fonds en euros restant dans la même tranche.</span></div>`).join('')}</div>` : '<p class="note">Aucune zone de rendement décroissant : le rendement UC attendu est supérieur au fonds en euros net sur tout l\'intervalle.</p>'}
        <p class="note" style="margin-top:10px">Le rendement global suppose une allocation constante ; la volatilité indiquée est le surcroît de risque lié aux UC, sans garantie du capital sur cette part.</p>
      </div>
    </div>`;
  const opts = optionsBase((v) => formaterPourcentage(v, 1));
  opts.scales.x.title.text = 'Part d\'unités de compte';
  opts.scales.x.ticks.maxTicksLimit = 11;
  opts.scales.x.ticks.maxRotation = 0;
  opts.interaction = { mode: 'nearest', intersect: false };
  graphique('graph-optimiseur', {
    type: 'line',
    data: {
      labels: c.points.map((p) => formaterPourcentage(p.partUC, 0)),
      datasets: [
        { label: 'Rendement global net', data: c.points.map((p) => p.rendement), borderColor: couleur('--serie-1'), backgroundColor: `${couleur('--serie-1')}22`, fill: true, borderWidth: 2, pointRadius: 0, stepped: false, formatValeur: (v) => formaterPourcentage(v) },
        { label: 'Taux du fonds en euros', data: c.points.map((p) => p.tauxFondsEuros), borderColor: couleur('--serie-3'), borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, stepped: true, fill: false, formatValeur: (v) => formaterPourcentage(v) },
        { label: 'Optimum', data: c.points.map((p) => (p.partUC === c.optimum.partUC ? p.rendement : null)), borderColor: couleur('--ok'), backgroundColor: couleur('--ok'), pointRadius: 7, pointHoverRadius: 8, showLine: false, formatValeur: (v) => formaterPourcentage(v) },
      ],
    },
    options: opts,
  });
}

function scenarioVersConfig(sc) {
  const config = cloner(etat.config);
  const fe = config.contrat.supports.find((s) => s.type === 'fondsEuros');
  const uc = config.contrat.supports.find((s) => s.type === 'uc');
  const autres = config.contrat.supports.filter((s) => s !== fe && s !== uc).reduce((t, s) => t + s.allocation, 0);
  if (fe && uc) {
    const disponible = Math.max(1 - autres, 0);
    uc.allocation = Math.min(sc.partUC, disponible);
    fe.allocation = disponible - uc.allocation;
    uc.parametres.rendementMoyen = sc.rendementUC;
  }
  config.scenario.tendance = sc.tendance;
  config.scenario.variationAnnuelle = sc.variationAnnuelle;
  if (sc.gestionUC !== null && sc.gestionUC !== undefined && sc.gestionUC !== '') config.frais.gestionUC = sc.gestionUC;
  config.contrat.nom = sc.nom;
  return chargerConfiguration(config);
}

function rendreComparateurs() {
  const zoneA = $('#comparateur-avance-contenu');
  const zoneS = $('#comparateur-scenarios-contenu');
  if (!etat.resultat) { zoneA.innerHTML = ''; zoneS.innerHTML = ''; return; }
  try {
    const c = comparerAvanceRachat(etat.config, etat.donnees, etat.comparateurAvance);
    const favorable = c.differentielTerme > 0 ? 'avance' : 'rachat';
    zoneA.innerHTML = `
      ${c.avanceRefusee ? `<p class="note important">${echapper(c.avanceRefusee)}</p>` : ''}
      <div class="comparatif">
        <div class="bloc${favorable === 'avance' ? ' favorable' : ''}"><h4>Avance de ${formaterEuros(etat.comparateurAvance.montant)}</h4><strong>${formaterEuros(c.coutAvance)}</strong><div class="note">coût total des intérêts, capital maintenu investi</div></div>
        <div class="bloc${favorable === 'rachat' ? ' favorable' : ''}"><h4>Rachat partiel de ${formaterEuros(c.rachatBrut)} brut</h4><strong>${formaterEuros(c.coutFiscalRachat)}</strong><div class="note">impôt et prélèvements sociaux, capital retiré</div></div>
        <div class="bloc"><h4>Différentiel net au terme</h4><strong>${c.differentielTerme >= 0 ? '+' : ''}${formaterEuros(c.differentielTerme)}</strong><div class="note">patrimoine avec avance (contrat moins dette et remboursements) moins patrimoine avec rachat</div></div>
      </div>
      <div class="carte" style="margin-top:12px"><h3>Différentiel net année par année</h3><div class="graphique petit"><canvas id="graph-comparateur"></canvas></div>
      <div class="tableau-conteneur" style="margin-top:12px"><table><thead><tr><th>Année</th><th>Contrat avec avance</th><th>Dette d'avance</th><th>Remboursements cumulés</th><th>Patrimoine net (avance)</th><th>Contrat après rachat</th><th>Différentiel</th></tr></thead><tbody>
        ${c.lignes.map((l) => `<tr><td>${l.annee}</td><td>${formaterEuros(l.valeurAvance)}</td><td>${formaterEuros(l.detteAvance)}</td><td>${formaterEuros(l.cumulDecaissements)}</td><td>${formaterEuros(l.patrimoineAvance)}</td><td>${formaterEuros(l.valeurRachat)}</td><td><strong>${l.differentiel >= 0 ? '+' : ''}${formaterEuros(l.differentiel)}</strong></td></tr>`).join('')}
      </tbody></table></div></div>`;
    const opts = optionsBase();
    graphique('graph-comparateur', {
      type: 'bar',
      data: { labels: c.lignes.map((l) => l.annee), datasets: [{ label: 'Différentiel avance moins rachat', data: c.lignes.map((l) => l.differentiel), backgroundColor: c.lignes.map((l) => (l.differentiel >= 0 ? couleur('--serie-2') : couleur('--serie-3'))), borderRadius: 4 }] },
      options: opts,
    });
  } catch (e) {
    zoneA.innerHTML = `<p class="note important">${echapper(e.message)}</p>`;
  }

  try {
    const scenarios = etat.scenarios.map((sc) => ({ nom: sc.nom, config: scenarioVersConfig(sc) }));
    const cs = comparerScenarios(scenarios, etat.donnees);
    const couleurs = couleursSeries();
    zoneS.innerHTML = `
      <div class="comparatif">${cs.resultats.map((r, i) => `<div class="bloc" style="border-top:3px solid ${couleurs[i % couleurs.length]}"><h4>${echapper(r.nom)}</h4><strong>${formaterEuros(r.resultat.synthese.valeurTerme)}</strong>
        <div class="ligne-valeur"><span>Rendement annualisé</span><strong>${formaterPourcentage(r.resultat.synthese.rendementAnnualise)}</strong></div>
        <div class="ligne-valeur"><span>Taux fonds € moyen</span><strong>${formaterPourcentage(r.resultat.lignes.reduce((a, l) => a + l.tauxFondsEuros, 0) / r.resultat.lignes.length)}</strong></div>
        <div class="ligne-valeur"><span>Frais cumulés</span><strong>${formaterEuros(r.resultat.synthese.cumulFrais)}</strong></div>
        <div class="ligne-valeur"><span>Plus-value nette</span><strong>${formaterEuros(r.resultat.synthese.plusValueNette)}</strong></div></div>`).join('')}</div>
      <div class="carte" style="margin-top:12px"><h3>Valorisation par scénario</h3><div class="graphique"><canvas id="graph-scenarios"></canvas></div>
      <div class="tableau-conteneur" style="margin-top:12px"><table><thead><tr><th>Année</th>${cs.resultats.map((r) => `<th>${echapper(r.nom)}</th>`).join('')}</tr></thead><tbody>
        ${cs.tableau.map((l) => `<tr><td>${l.annee}</td>${cs.resultats.map((r) => `<td>${formaterEuros(l[r.nom])}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
    graphique('graph-scenarios', {
      type: 'line',
      data: { labels: cs.tableau.map((l) => l.annee), datasets: cs.resultats.map((r, i) => ({ label: r.nom, data: cs.tableau.map((l) => l[r.nom]), borderColor: couleurs[i % couleurs.length], borderWidth: 2, pointRadius: 2, fill: false, tension: 0.2 })) },
      options: optionsBase(),
    });
  } catch (e) {
    zoneS.innerHTML = `<p class="note important">${echapper(e.message)}</p>`;
  }
}

function rendreRente() {
  const zone = $('#rente-contenu');
  const r = etat.resultat;
  if (!r) { zone.innerHTML = ''; return; }
  const p = etat.rente;
  const capital = p.capital || r.synthese.valeurTerme;
  const rente = convertirEnRente(capital, p.age, p.type, etat.donnees.tableRente, { fraisSurArrerages: p.fraisArrerages });
  const fraction = fractionImposableRente(p.age);
  const derniere = r.lignes[r.lignes.length - 1];
  const cons = projeterConsommation({
    capital, primesNettes: derniere.primesNettes, gainsDejaSoumisPS: Math.max(r.lignes.reduce((a, l) => a + l.prelevementsSociaux, 0) / etat.donnees.parametresFiscaux.prelevementsSociaux.tauxAssuranceVie * (1 - etat.donnees.parametresFiscaux.prelevementsSociaux.tauxAssuranceVie), 0),
    rachatAnnuel: p.rachatAnnuel, indexation: p.indexation, rendementNet: p.rendementNet,
    anciennete: (etat.config.contrat.anterioriteFiscale || 0) + etat.config.contrat.dureeProjection,
    fiscal: etat.config.fiscal, constantes: etat.donnees.parametresFiscaux, baremeIR: etat.donnees.baremeIR,
  });
  zone.innerHTML = `
    <div class="tuiles">
      <div class="tuile"><small>Rente annuelle (${echapper(etat.donnees.tableRente.libellesTypeRente[p.type])})</small><strong>${formaterEuros(rente.renteNetteFrais)}</strong><div class="sous">${formaterEuros(rente.renteNetteFrais / 12)} par mois, taux de conversion ${formaterPourcentage(rente.tauxConversion * rente.coefficient)}</div></div>
      <div class="tuile"><small>Fraction imposable de la rente</small><strong>${formaterPourcentage(fraction, 0)}</strong><div class="sous">rente viagère à titre onéreux, âge ${p.age} ans</div></div>
      <div class="tuile"><small>Épuisement du capital par rachats</small><strong>${cons.anneeEpuisement ? `année ${cons.anneeEpuisement}` : `au-delà de ${cons.lignes.length} ans`}</strong><div class="sous">net perçu cumulé ${formaterEuros(cons.totalNetPercu)}, fiscalité ${formaterEuros(cons.totalImpots)}</div></div>
    </div>
    <div class="carte"><h3>Phase de consommation du capital</h3><div class="graphique petit"><canvas id="graph-consommation"></canvas></div>
    <div class="tableau-conteneur" style="margin-top:12px"><table><thead><tr><th>Année</th><th>Capital début</th><th>Rachat brut</th><th>Quote-part de gains</th><th>Impôt</th><th>Prélèv. sociaux</th><th>Rachat net</th><th>Rendement</th><th>Capital fin</th></tr></thead><tbody>
      ${cons.lignes.map((l) => `<tr><td>${l.annee}</td><td>${formaterEuros(l.capitalDebut)}</td><td>${formaterEuros(l.rachatBrut)}</td><td>${formaterEuros(l.quotePartGains)}</td><td>${formaterEuros(l.impot)}</td><td>${formaterEuros(l.prelevementsSociaux)}</td><td><strong>${formaterEuros(l.rachatNet)}</strong></td><td>${formaterEuros(l.rendement)}</td><td>${formaterEuros(l.capitalFin)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note" style="margin-top:8px">Table de conversion indicative (data/table-rente.json), à remplacer par celle de l'assureur. Fiscalité des rachats reprise du module fiscal avec l'abattement annuel après 8 ans.</p></div>`;
  graphique('graph-consommation', {
    type: 'bar',
    data: { labels: cons.lignes.map((l) => l.annee), datasets: [
      { label: 'Capital restant', data: cons.lignes.map((l) => l.capitalFin), backgroundColor: `${couleur('--serie-1')}99`, borderRadius: 4 },
      { label: 'Rachat net perçu', data: cons.lignes.map((l) => l.rachatNet), backgroundColor: couleur('--serie-2'), borderRadius: 4 },
    ] },
    options: optionsBase(),
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function nomFichier(ext) {
  return `${(etat.config.contrat.nom || 'projection').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.${ext}`;
}

function exporterExcel() {
  if (!etat.resultat) return;
  if (typeof XLSX === 'undefined') { toast('Bibliothèque Excel non chargée (connexion requise).'); return; }
  const tampon = construireClasseur(etat.resultat, etat.config, XLSX);
  telecharger(new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomFichier('xlsx'));
  toast('Classeur Excel généré.');
}

function exporterPDF() {
  if (!etat.resultat) return;
  const jspdf = window.jspdf;
  if (!jspdf) { toast('Bibliothèque PDF non chargée (connexion requise).'); return; }
  const g = etat.graphiques['graph-valeur'];
  const image = g ? g.toBase64Image('image/png', 1) : null;
  const doc = construirePDF(etat.resultat, etat.config, image, jspdf.jsPDF, { conseiller: 'Synthèse de simulation' });
  doc.save(nomFichier('pdf'));
  toast('Synthèse PDF générée.');
}

function exporterJSON() {
  telecharger(new Blob([serialiser({ nom: etat.config.contrat.nom, ...etat.config })], { type: 'application/json' }), nomFichier('json'));
  toast('Configuration enregistrée.');
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

function lireValeur(el) {
  const type = el.dataset.type;
  if (type === 'case') return el.checked;
  if (type === 'select') {
    const v = el.value;
    if (v === '') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return /^-?\d+(\.\d+)?$/.test(v) && !['id', 'support', 'source', 'destination', 'supportReaffectation'].some((k) => el.dataset.chemin.endsWith(k)) ? Number(v) : v;
  }
  if (type === 'texte' || type === 'date') return el.value;
  if (el.value === '') return null;
  const n = Number(String(el.value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (type === 'pourcent') return Math.round(n * 1e4) / 1e6;
  if (type === 'entier') return Math.round(n);
  return n;
}

function surSaisie(e) {
  const el = e.target;
  if (!el.dataset || !el.dataset.chemin) return;
  let valeur = lireValeur(el);
  const chemin = el.dataset.chemin;
  if (el.type === 'range' || (el.type === 'number' && el.max !== '' && el.min !== '')) {
    // Bornes des frais : rejet hors plage
    if (valeur !== null && el.max !== '' && el.dataset.type === 'pourcent' && valeur > Number(el.max) / 100) valeur = Number(el.max) / 100;
    if (valeur !== null && el.min !== '' && el.dataset.type === 'pourcent' && valeur < Number(el.min) / 100) valeur = Number(el.min) / 100;
  }
  if (valeur === null && ['montantInitial', 'dureeProjection', 'allocation', 'montant', 'annee', 'anneeDebut'].some((k) => chemin.endsWith(`.${k}`)) && !chemin.includes('rachatsProgrammes') && !chemin.includes('ponctuels')) valeur = 0;
  ecrire(chemin, valeur);
  // Synchronisation curseur / champ numérique
  $$(`[data-chemin="${chemin}"]`).forEach((autre) => {
    if (autre === el) return;
    if (autre.dataset.type === 'pourcent' && valeur !== null) autre.value = Math.round(valeur * 1e6) / 1e4;
  });
  if (chemin.endsWith('.allocation')) rendreAllocationSeule();
  if (chemin === 'config.avance.remboursement' || chemin === 'config.avance.anneeMiseEnPlace' || chemin === 'config.avance.duree') {
    $('#remboursements-libres').innerHTML = etat.config.avance.remboursement === 'libre' ? remboursementsLibres() : '';
  }
  if (chemin.endsWith('.libelle') || chemin.endsWith('.id')) rendreFluxEtDependants();
  recalculerBientot();
}

function rendreAllocationSeule() {
  const c = etat.config.contrat;
  const total = c.supports.reduce((s, x) => s + (x.allocation || 0), 0);
  const couleurs = { fondsEuros: couleur('--serie-1'), uc: couleur('--serie-2'), structure: couleur('--serie-3') };
  $('#allocation').innerHTML = `<div class="allocation">${c.supports.map((s) => `<div style="width:${Math.max(0, s.allocation * 100)}%;background:${couleurs[s.type]}"></div>`).join('')}</div>
    <div class="allocation-total${Math.abs(total - 1) > 1e-6 ? ' erreur' : ''}">Total alloué : ${formaterPourcentage(total, 1)}${Math.abs(total - 1) > 1e-6 ? ' (doit valoir 100 %)' : ''}</div>`;
}

let minuterieFlux = null;
function rendreFluxEtDependants() {
  clearTimeout(minuterieFlux);
  minuterieFlux = setTimeout(() => { rendreFlux(); rendreArbitrages(); $('#form-supports-detail').innerHTML = `<h3>Paramètres des supports</h3><div class="liste">${etat.config.contrat.supports.map((sup, i) => detailSupport(sup, i)).join('')}</div>`; }, 600);
}

function surClic(e) {
  const btn = e.target.closest('[data-action], [data-section], [data-sous]');
  if (!btn) return;
  if (btn.dataset.section) { etat.section = btn.dataset.section; history.replaceState(null, '', `#${etat.section}`); rendreNav(); window.scrollTo({ top: 0 }); redessiner(); return; }
  if (btn.dataset.sous) {
    etat.sousOnglet = btn.dataset.sous;
    $$('.sous-onglets button').forEach((b) => b.setAttribute('aria-selected', b.dataset.sous === etat.sousOnglet));
    $$('.sous-panneau').forEach((p) => p.classList.toggle('active', p.dataset.sous === etat.sousOnglet));
    if (etat.sousOnglet === 'montecarlo') dessinerMonteCarlo();
    return;
  }
  const c = etat.config.contrat;
  const i = Number(btn.dataset.index);
  switch (btn.dataset.action) {
    case 'ajouter-support': {
      const type = $('#type-nouveau-support').value;
      const n = c.supports.filter((s) => s.type === type).length + 1;
      const prefixe = { fondsEuros: 'FE', uc: 'UC', structure: 'ST' }[type];
      c.supports.push(creerSupport({ id: `${prefixe}${n > 1 ? n : ''}`, type, libelle: `${LIBELLES_TYPE[type]}${n > 1 ? ` ${n}` : ''}`, allocation: 0 }));
      break;
    }
    case 'supprimer-support': c.supports.splice(i, 1); break;
    case 'ajouter-vp': c.versementsProgrammes.push(creerVersementProgramme({ montant: 200 })); break;
    case 'supprimer-vp': c.versementsProgrammes.splice(i, 1); break;
    case 'ajouter-vc': c.versementsComplementaires.push(creerVersementComplementaire({ montant: 10000, annee: 2 })); break;
    case 'supprimer-vc': c.versementsComplementaires.splice(i, 1); break;
    case 'ajouter-rp': c.rachatsProgrammes.push(creerRachatProgramme({ montant: 500, periodicite: 'mensuelle', anneeDebut: Math.max(1, c.dureeProjection - 4) })); break;
    case 'supprimer-rp': c.rachatsProgrammes.splice(i, 1); break;
    case 'ajouter-arbitrage': etat.config.arbitrages.ponctuels.push(creerArbitrage({ annee: 2, source: c.supports[1] ? c.supports[1].id : null, destination: c.supports[0] ? c.supports[0].id : null, montant: 10000 })); break;
    case 'supprimer-arbitrage': etat.config.arbitrages.ponctuels.splice(i, 1); break;
    case 'ajouter-scenario': if (etat.scenarios.length < 5) etat.scenarios.push({ nom: `Scénario ${etat.scenarios.length + 1}`, partUC: 0.5, rendementUC: 0.05, tendance: 'stable', variationAnnuelle: 0, gestionUC: null }); break;
    case 'supprimer-scenario': if (etat.scenarios.length > 3) etat.scenarios.splice(i, 1); break;
    default: return;
  }
  rendreFormulaires();
  recalculer();
}

function redessiner() {
  // Les canvas masqués ont une taille nulle : redessiner les graphiques de la section affichée.
  requestAnimationFrame(() => { for (const g of Object.values(etat.graphiques)) if (g && g.canvas && g.canvas.offsetParent) g.resize(); });
}

function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 2500);
}

function chargerConfigurationDepuis(brut) {
  etat.config = chargerConfiguration(brut);
  if (!etat.config.contrat.dateSouscription) etat.config.contrat.dateSouscription = new Date().toISOString().slice(0, 10);
  etat.optimiseur.encours = etat.config.contrat.montantInitial || etat.optimiseur.encours;
  etat.rente.capital = null;
  rendreFormulaires();
  recalculer();
}

function ouvrirExemples() {
  $('#liste-exemples').innerHTML = etat.exemples.map((ex, i) => `<button class="btn" type="button" data-exemple="${i}">${echapper(ex.nom)}</button>`).join('');
  $('#dialogue-exemples').showModal();
}

function basculerTheme() {
  const racine = document.documentElement;
  const actuel = racine.dataset.theme || '';
  const suivant = actuel === '' ? 'dark' : actuel === 'dark' ? 'light' : '';
  if (suivant) racine.dataset.theme = suivant; else delete racine.dataset.theme;
  try { localStorage.setItem('theme', suivant); } catch (e) { /* stockage indisponible */ }
  recalculer();
}

async function demarrer() {
  try {
    const stocke = localStorage.getItem('theme');
    if (stocke) document.documentElement.dataset.theme = stocke;
  } catch (e) { /* stockage indisponible */ }
  try {
    const d = await chargerDonnees();
    etat.donnees = d;
    etat.exemples = d.exemples || [];
  } catch (e) {
    $('#ruban').innerHTML = `<div class="kpi erreur"><small>Erreur de chargement</small><strong>${echapper(e.message)}</strong></div>`;
    return;
  }
  const ancre = (location.hash || '').slice(1);
  if (SECTIONS.some(([id]) => id === ancre)) etat.section = ancre;
  rendreNav();
  document.addEventListener('input', surSaisie);
  document.addEventListener('change', (e) => { if (e.target.matches('select, input[type="checkbox"], input[type="date"]')) surSaisie(e); });
  document.addEventListener('click', surClic);
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-montecarlo') {
      e.target.disabled = true;
      e.target.textContent = 'Calcul en cours';
      setTimeout(() => {
        etat.monteCarlo = projeterMonteCarlo(etat.config, etat.donnees);
        $('#zone-montecarlo').innerHTML = zoneMonteCarlo();
        dessinerMonteCarlo();
      }, 30);
    }
    const ex = e.target.closest('[data-exemple]');
    if (ex) {
      chargerConfigurationDepuis(etat.exemples[Number(ex.dataset.exemple)]);
      $('#dialogue-exemples').close();
      etat.section = 'resultats';
      rendreNav();
      redessiner();
      toast('Exemple chargé.');
    }
  });
  $('#btn-exemples').addEventListener('click', ouvrirExemples);
  $('#btn-fermer-exemples').addEventListener('click', () => $('#dialogue-exemples').close());
  $('#btn-importer').addEventListener('click', () => $('#fichier-import').click());
  $('#fichier-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      chargerConfigurationDepuis(JSON.parse(await f.text()));
      toast('Configuration importée.');
    } catch (err) {
      toast(`Fichier invalide : ${err.message}`);
    }
    e.target.value = '';
  });
  $('#btn-exporter-json').addEventListener('click', exporterJSON);
  $('#btn-theme').addEventListener('click', basculerTheme);
  $('#btn-excel').addEventListener('click', exporterExcel);
  $('#btn-pdf').addEventListener('click', exporterPDF);

  chargerConfigurationDepuis(etat.exemples[0] || { contrat: { montantInitial: 100000, dureeProjection: 10, supports: [{ id: 'FE', type: 'fondsEuros', libelle: 'Fonds en euros', allocation: 0.5 }, { id: 'UC', type: 'uc', libelle: 'Unités de compte', allocation: 0.5 }] } });
}

demarrer();
