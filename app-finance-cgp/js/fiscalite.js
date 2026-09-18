/**
 * fiscalite.js : fiscalité en cas de vie des rachats d'assurance-vie.
 *
 * - quote-part de gains d'un rachat = rachat × gains / valeur du contrat ;
 * - impôt sur le revenu selon la date des primes (avant ou après le 27/09/2017),
 *   l'âge du contrat, l'abattement après 8 ans et l'option choisie
 *   (prélèvement forfaitaire ou barème progressif) ;
 * - prélèvements sociaux à 17,20 % sur la totalité des gains, au fil de l'eau
 *   pour le fonds en euros, au rachat pour les UC et structurés ;
 * - restitution des prélèvements sociaux acquittés en trop au dénouement.
 *
 * Toutes les constantes sont lues dans data/parametres-fiscaux.json et
 * data/bareme-ir.json (jamais codées en dur).
 */

/**
 * Taux marginal d'imposition déduit du barème progressif.
 * @param {number} revenuImposable revenu net imposable du foyer
 * @param {number} parts nombre de parts de quotient familial
 * @param {object} baremeIR barème chargé depuis data/bareme-ir.json
 * @returns {{taux:number, tranche:number}}
 */
export function determinerTauxMarginal(revenuImposable, parts, baremeIR) {
  const quotient = Math.max(revenuImposable, 0) / Math.max(parts, 1);
  for (let i = 0; i < baremeIR.tranches.length; i += 1) {
    const t = baremeIR.tranches[i];
    if (t.jusqua === null || quotient <= t.jusqua) return { taux: t.taux, tranche: i };
  }
  const derniere = baremeIR.tranches[baremeIR.tranches.length - 1];
  return { taux: derniere.taux, tranche: baremeIR.tranches.length - 1 };
}

/**
 * Impôt au barème progressif pour un revenu donné (calcul complet par tranches).
 * @param {number} revenuImposable
 * @param {number} parts
 * @param {object} baremeIR
 */
export function impotBareme(revenuImposable, parts, baremeIR) {
  const quotient = Math.max(revenuImposable, 0) / Math.max(parts, 1);
  let impot = 0;
  let precedent = 0;
  for (const t of baremeIR.tranches) {
    const plafond = t.jusqua === null ? Infinity : t.jusqua;
    if (quotient > precedent) impot += (Math.min(quotient, plafond) - precedent) * t.taux;
    precedent = plafond;
    if (quotient <= plafond) break;
  }
  return impot * Math.max(parts, 1);
}

/**
 * Quote-part de gains contenue dans un rachat.
 * @param {number} montantRachat
 * @param {number} valeurContrat
 * @param {number} gainsTotaux gains latents du contrat (valeur moins primes nettes)
 */
export function quotePartGains(montantRachat, valeurContrat, gainsTotaux) {
  if (valeurContrat <= 0 || montantRachat <= 0 || gainsTotaux <= 0) return 0;
  return Math.min(montantRachat * (gainsTotaux / valeurContrat), montantRachat);
}

/**
 * Prélèvements sociaux au fil de l'eau sur les intérêts du fonds en euros.
 * @param {number} interets
 * @param {object} constantes parametres-fiscaux.json
 */
export function prelevementsSociauxFilEau(interets, constantes) {
  return Math.max(interets, 0) * constantes.prelevementsSociaux.tauxAssuranceVie;
}

/**
 * Calcul complet de la fiscalité d'un rachat.
 *
 * @param {object} p
 * @param {number} p.montantRachat montant brut racheté
 * @param {number} p.valeurContrat valeur de rachat totale avant le rachat
 * @param {number} p.gainsTotaux gains latents du contrat
 * @param {number} p.gainsDejaSoumisPS part des gains latents ayant déjà supporté les prélèvements sociaux (fonds en euros)
 * @param {number} p.primesAvant2017 primes nettes versées avant le 27/09/2017
 * @param {number} p.primesApres2017 primes nettes versées depuis le 27/09/2017
 * @param {number} p.anciennete âge fiscal du contrat au jour du rachat (années)
 * @param {number} p.abattementRestant abattement annuel non encore consommé
 * @param {object} p.fiscal paramètres du foyer (situation, option, tauxMarginal, revenuImposable, primesCumuleesAutresContrats)
 * @param {object} p.constantes data/parametres-fiscaux.json
 * @param {object} p.baremeIR data/bareme-ir.json
 * @returns {object} détail complet (voir champs)
 */
export function calculerFiscaliteRachat(p) {
  const c = p.constantes;
  const gains = quotePartGains(p.montantRachat, p.valeurContrat, p.gainsTotaux);
  const capital = p.montantRachat - gains;
  const primesTotales = Math.max((p.primesAvant2017 || 0) + (p.primesApres2017 || 0), 0);
  const partAvant = primesTotales > 0 ? (p.primesAvant2017 || 0) / primesTotales : 0;
  const gainsAvant2017 = gains * partAvant;
  const gainsApres2017 = gains - gainsAvant2017;
  const plus8Ans = p.anciennete >= c.abattementAnnuel.dureeMinimale;

  // Abattement : uniquement après 8 ans, imputé d'abord sur les produits des primes
  // antérieures au 27/09/2017, puis sur la fraction au taux réduit, puis sur le solde.
  const abattementDisponible = plus8Ans ? Math.max(p.abattementRestant ?? 0, 0) : 0;
  const primesCumulees = (p.primesApres2017 || 0) + (p.fiscal.primesCumuleesAutresContrats || 0);
  const seuil = c.primesApres2017.seuilPrimesTauxReduit;
  const fractionReduite = primesCumulees > 0 ? Math.min(1, seuil / primesCumulees) : 1;
  let gainsReduit = plus8Ans ? gainsApres2017 * fractionReduite : 0;
  let gainsPlein = plus8Ans ? gainsApres2017 - gainsReduit : gainsApres2017;
  let gainsAvant = gainsAvant2017;

  let abattementUtilise = 0;
  const imputer = (montant) => {
    const utilise = Math.min(montant, abattementDisponible - abattementUtilise);
    abattementUtilise += utilise;
    return montant - utilise;
  };
  gainsAvant = imputer(gainsAvant);
  gainsReduit = imputer(gainsReduit);
  gainsPlein = imputer(gainsPlein);

  // Prélèvement forfaitaire (ou libératoire pour les primes antérieures).
  let tauxAvant;
  if (p.anciennete < 4) tauxAvant = c.primesAvant2017.tauxMoins4Ans;
  else if (p.anciennete < 8) tauxAvant = c.primesAvant2017.taux4a8Ans;
  else tauxAvant = c.primesAvant2017.tauxPlus8Ans;
  const tauxReduit = c.primesApres2017.tauxPlus8AnsReduit;
  const tauxPlein = plus8Ans ? c.primesApres2017.tauxPlus8AnsPlein : c.primesApres2017.tauxMoins8Ans;
  const impotForfaitaire = {
    avant2017: gainsAvant * tauxAvant,
    tauxReduit: gainsReduit * tauxReduit,
    tauxPlein: gainsPlein * tauxPlein,
  };
  impotForfaitaire.total = impotForfaitaire.avant2017 + impotForfaitaire.tauxReduit + impotForfaitaire.tauxPlein;

  // Acompte prélevé par l'assureur sur les produits des primes postérieures
  // au 27/09/2017 (avant abattement), régularisé lors de la déclaration.
  const tauxAcompte = plus8Ans ? c.primesApres2017.acomptePlus8Ans : c.primesApres2017.acompteMoins8Ans;
  const acompte = gainsApres2017 * tauxAcompte + gainsAvant2017 * (p.fiscal.option === 'bareme' ? 0 : tauxAvant);

  // Option barème progressif : gains imposables après abattement au taux marginal.
  const parts = (p.baremeIR.partsParSituation || {})[p.fiscal.situation] || 1;
  let tauxMarginal = p.fiscal.tauxMarginal;
  let origineTMI = 'saisi';
  if (tauxMarginal === null || tauxMarginal === undefined) {
    tauxMarginal = determinerTauxMarginal(p.fiscal.revenuImposable || 0, parts, p.baremeIR).taux;
    origineTMI = 'bareme';
  }
  const baseBareme = gainsAvant + gainsReduit + gainsPlein;
  const impotBaremeProgressif = baseBareme * tauxMarginal;

  const optionBareme = p.fiscal.option === 'bareme';
  const impotDefinitif = optionBareme ? impotBaremeProgressif : impotForfaitaire.total;
  const regularisation = impotDefinitif - acompte;

  // Prélèvements sociaux sur la totalité des gains, hors fraction déjà prélevée au fil de l'eau.
  const tauxPS = c.prelevementsSociaux.tauxAssuranceVie;
  const partDejaSoumise = p.gainsTotaux > 0 ? Math.min(Math.max(p.gainsDejaSoumisPS || 0, 0) / p.gainsTotaux, 1) : 0;
  const gainsSoumisPS = gains * (1 - partDejaSoumise);
  const prelevementsSociaux = gainsSoumisPS * tauxPS;

  const montantNet = p.montantRachat - impotDefinitif - prelevementsSociaux;
  const tauxEffectif = gains > 0 ? (impotDefinitif + prelevementsSociaux) / gains : 0;
  const favorable = impotBaremeProgressif < impotForfaitaire.total - 1e-9 ? 'bareme' : (impotBaremeProgressif > impotForfaitaire.total + 1e-9 ? 'forfaitaire' : 'egal');

  return {
    montantRachat: p.montantRachat,
    quotePartGains: gains,
    partCapital: capital,
    gainsAvant2017,
    gainsApres2017,
    plus8Ans,
    abattementUtilise,
    abattementRestant: abattementDisponible - abattementUtilise,
    baseImposable: baseBareme,
    detailBases: { avant2017: gainsAvant, tauxReduit: gainsReduit, tauxPlein: gainsPlein },
    taux: { avant2017: tauxAvant, reduit: tauxReduit, plein: tauxPlein, marginal: tauxMarginal, origineTMI },
    impotForfaitaire,
    impotBareme: impotBaremeProgressif,
    optionRetenue: optionBareme ? 'bareme' : 'forfaitaire',
    acompte,
    impotDefinitif,
    regularisation,
    optionFavorable: favorable,
    economieOption: Math.abs(impotBaremeProgressif - impotForfaitaire.total),
    prelevementsSociaux,
    gainsSoumisPS,
    montantNet,
    tauxEffectif,
  };
}

/**
 * Restitution de prélèvements sociaux au dénouement lorsque les prélèvements
 * acquittés au fil de l'eau excèdent ceux dus sur la performance globale.
 * @param {number} psPayesFilEau cumul des prélèvements sociaux au fil de l'eau
 * @param {number} gainsGlobaux gains nets globaux du contrat (peuvent être négatifs)
 * @param {object} constantes
 * @returns {number} montant à restituer (≥ 0)
 */
export function restitutionPrelevementsSociaux(psPayesFilEau, gainsGlobaux, constantes) {
  const dus = Math.max(gainsGlobaux, 0) * constantes.prelevementsSociaux.tauxAssuranceVie;
  return Math.max(psPayesFilEau - dus, 0);
}

/**
 * Abattement annuel applicable au foyer.
 * @param {object} fiscal
 * @param {object} constantes
 */
export function abattementAnnuel(fiscal, constantes) {
  return fiscal.situation === 'couple' ? constantes.abattementAnnuel.couple : constantes.abattementAnnuel.seul;
}
