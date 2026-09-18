/**
 * models.js : structures de données du simulateur.
 *
 * Ce module ne contient aucune logique de calcul : uniquement des fabriques
 * qui construisent des objets complets (valeurs par défaut) et des contrôles
 * de cohérence. Toutes les fractions sont exprimées en nombre décimal
 * (0,03 = 3 %) et toutes les années sont des rangs entiers (1 = premier
 * exercice de la projection).
 */

/** Types de supports reconnus. */
export const TypeSupport = Object.freeze({
  FONDS_EUROS: 'fondsEuros',
  UC: 'uc',
  STRUCTURE: 'structure',
});

/** Périodicités et nombre d'occurrences par an. */
export const Periodicite = Object.freeze({
  MENSUELLE: 'mensuelle',
  TRIMESTRIELLE: 'trimestrielle',
  ANNUELLE: 'annuelle',
});

export const OCCURRENCES_PAR_AN = Object.freeze({
  mensuelle: 12,
  trimestrielle: 4,
  annuelle: 1,
});

/** Tendances pluriannuelles. */
export const Tendance = Object.freeze({ HAUSSE: 'hausse', BAISSE: 'baisse', STABLE: 'stable' });

/** Méthodes de simulation des trajectoires. */
export const MethodeSimulation = Object.freeze({ DETERMINISTE: 'deterministe', STOCHASTIQUE: 'stochastique' });

/** Convention de perte en capital à maturité d'un produit structuré. */
export const ModePerteStructure = Object.freeze({
  DEPUIS_STRIKE: 'depuisStrike',
  DEPUIS_BARRIERE: 'depuisBarriere',
});

/**
 * Fusionne des valeurs saisies avec des valeurs par défaut (copie superficielle).
 * @template T
 * @param {T} defauts
 * @param {Partial<T>} [valeurs]
 * @returns {T}
 */
function avecDefauts(defauts, valeurs = {}) {
  const resultat = { ...defauts };
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (valeur !== undefined) resultat[cle] = valeur;
  }
  return resultat;
}

/**
 * Paramètres d'un fonds en euros. Le taux n'est pas saisi : il résulte du
 * barème (data/bareme-fonds-euros.json) croisant part d'UC et encours.
 * @param {object} [o]
 */
export function creerParametresFondsEuros(o = {}) {
  return avecDefauts({
    /** Taux forcé (fraction) qui court-circuite le barème si renseigné. */
    tauxForce: null,
  }, o);
}

/**
 * Paramètres d'un support en unités de compte.
 * @param {object} [o]
 */
export function creerParametresUC(o = {}) {
  return avecDefauts({
    rendementMoyen: 0.05,
    volatilite: 0.15,
  }, o);
}

/**
 * Paramètres d'un produit structuré à capital protégé.
 * @param {object} [o]
 */
export function creerParametresStructure(o = {}) {
  const p = avecDefauts({
    sousJacent: 'Euro Stoxx 50',
    barriereProtection: 0.60,
    barriereCoupon: 0.70,
    niveauCoupon: 0.06,
    effetMemoire: true,
    autocall: true,
    barriereAutocall: 1.00,
    maturite: 8,
    /** Fréquence des observations en années (1 = annuelle, 0.5 = semestrielle arrondie à l'année, 2 = tous les deux ans). */
    frequenceObservation: 1,
    tendanceSousJacent: 0.02,
    volatiliteSousJacent: 0.20,
    modePerte: ModePerteStructure.DEPUIS_STRIKE,
    /** Identifiant du support recevant coupons et capital remboursé ; null = fonds en euros. */
    supportReaffectation: null,
    /** Vrai si le structuré est assimilé aux UC pour la part d'UC et l'assiette d'avance. */
    assimileUC: true,
  }, o);
  if (p.maturite < 1) throw new Error('La maturité doit être d\'au moins 1 an.');
  if (!(p.barriereProtection > 0 && p.barriereProtection <= 1)) throw new Error('Barrière de protection invalide.');
  return p;
}

/**
 * Support d'investissement.
 * @param {object} o
 * @param {string} o.id identifiant unique dans le contrat
 * @param {string} o.type valeur de TypeSupport
 * @param {number} o.allocation part des versements (fraction)
 * @param {object} [o.parametres]
 * @param {string} [o.libelle]
 */
export function creerSupport(o) {
  if (!o || !o.id) throw new Error('Un support doit avoir un identifiant.');
  if (!Object.values(TypeSupport).includes(o.type)) throw new Error(`Type de support inconnu : ${o.type}`);
  const fabriques = {
    fondsEuros: creerParametresFondsEuros,
    uc: creerParametresUC,
    structure: creerParametresStructure,
  };
  return {
    id: o.id,
    type: o.type,
    libelle: o.libelle || o.id,
    allocation: Number(o.allocation ?? 0),
    parametres: fabriques[o.type](o.parametres || {}),
  };
}

/**
 * Versement programmé.
 * @param {object} [o]
 */
export function creerVersementProgramme(o = {}) {
  return avecDefauts({
    montant: 0,
    periodicite: Periodicite.MENSUELLE,
    anneeDebut: 1,
    anneeFin: null,
    indexation: 0,
    /** Taux de frais propre (fraction) ; null = taux général des versements programmés. */
    tauxFrais: null,
  }, o);
}

/**
 * Versement complémentaire ponctuel.
 * @param {object} [o]
 */
export function creerVersementComplementaire(o = {}) {
  return avecDefauts({
    montant: 0,
    annee: 1,
    tauxFrais: null,
    /** Support crédité ; null = répartition selon l'allocation. */
    support: null,
  }, o);
}

/**
 * Rachat programmé.
 * @param {object} [o]
 */
export function creerRachatProgramme(o = {}) {
  const r = avecDefauts({
    montant: null,
    pourcentage: null,
    periodicite: Periodicite.ANNUELLE,
    anneeDebut: 1,
    anneeFin: null,
    /** Support débité ; null = prélèvement au prorata des valeurs. */
    support: null,
  }, o);
  if ((r.montant === null || r.montant === undefined) === (r.pourcentage === null || r.pourcentage === undefined)) {
    throw new Error('Un rachat programmé porte soit un montant, soit un pourcentage.');
  }
  return r;
}

/**
 * Scénario de marché commun.
 * @param {object} [o]
 */
export function creerScenarioMarche(o = {}) {
  return avecDefauts({
    tendance: Tendance.STABLE,
    /** Variation annuelle relative appliquée au barème du fonds en euros (0,05 = 5 % par an). */
    variationAnnuelle: 0,
    /** Volatilité annuelle additionnelle du taux du fonds en euros (points). */
    volatilite: 0,
    /** Taux plancher du fonds en euros (fraction). */
    tauxPlancher: 0,
    methode: MethodeSimulation.DETERMINISTE,
    nombreSimulations: 500,
    graine: 42,
  }, o);
}

/**
 * Paramètres de frais, tous éditables par le conseiller.
 * @param {object} [o]
 */
export function creerParametresFrais(o = {}) {
  return avecDefauts({
    versementInitial: 0.02,
    versementsProgrammes: 0.02,
    versementsComplementaires: 0.02,
    arbitrage: 0.005,
    gestionFondsEuros: 0.006,
    gestionUC: 0.009,
    /** Frais de gestion applicables aux produits structurés (assimilés UC par défaut). */
    gestionStructure: 0.009,
    plafondFraisVersement: 0.03,
  }, o);
}

/**
 * Arbitrage ponctuel.
 * @param {object} [o]
 */
export function creerArbitrage(o = {}) {
  return avecDefauts({
    annee: 1,
    source: null,
    destination: null,
    montant: null,
    pourcentage: null,
  }, o);
}

/**
 * Règles d'arbitrage automatiques : rééquilibrage et sécurisation progressive.
 * @param {object} [o]
 */
export function creerParametresArbitrages(o = {}) {
  return avecDefauts({
    ponctuels: [],
    reequilibrage: { actif: false, periodiciteAnnees: 1 },
    securisation: {
      actif: false,
      anneeDebut: null,
      /** Part cible du fonds en euros au terme (fraction). */
      partFondsEurosCible: 0.80,
      /** 'lineaire' ou 'paliers'. */
      courbe: 'lineaire',
      /** Pas des paliers en années (courbe par paliers). */
      pasPaliers: 2,
    },
    /** Les produits structurés sont exclus des arbitrages automatiques par défaut. */
    inclureStructures: false,
  }, o);
}

/**
 * Paramètres d'une avance consentie par l'assureur.
 * @param {object} [o]
 */
export function creerParametresAvance(o = {}) {
  return avecDefauts({
    actif: false,
    montant: 0,
    anneeMiseEnPlace: 1,
    duree: 6,
    tauxInteret: 0.03,
    /** 'composee' (intérêts capitalisés) ou 'simple' (intérêts payés chaque année). */
    capitalisation: 'composee',
    /** 'inFine', 'amortissable' ou 'libre'. */
    remboursement: 'inFine',
    /** Remboursements libres par année de la projection : { "4": 10000 }. */
    remboursementsLibres: {},
    quotiteFondsEuros: 0.80,
    quotiteUC: 0.60,
    inclureStructures: true,
    seuilAlerte: 0.70,
  }, o);
}

/**
 * Paramètres fiscaux propres au foyer du souscripteur.
 * @param {object} [o]
 */
export function creerParametresFiscaux(o = {}) {
  return avecDefauts({
    /** 'seul' ou 'couple'. */
    situation: 'seul',
    /** 'forfaitaire' ou 'bareme'. */
    option: 'forfaitaire',
    /** Taux marginal saisi (fraction) ; null = déduit du revenu imposable. */
    tauxMarginal: 0.30,
    revenuImposable: 60000,
    /** Primes cumulées tous contrats et tous assureurs confondus, hors ce contrat. */
    primesCumuleesAutresContrats: 0,
    /** Prélèvements sociaux au fil de l'eau sur le fonds en euros. */
    prelevementsSociauxFilEau: true,
  }, o);
}

/**
 * Contrat d'assurance-vie ou de capitalisation.
 * @param {object} o
 */
export function creerContrat(o = {}) {
  const contrat = avecDefauts({
    nom: 'Contrat',
    montantInitial: 0,
    dureeProjection: 10,
    dateSouscription: null,
    /** Âge fiscal du contrat au démarrage de la simulation (années). */
    anterioriteFiscale: 0,
    /** Primes déjà versées avant le démarrage, ventilées selon la date du 27/09/2017. */
    primesAnterieuresAvant2017: 0,
    primesAnterieuresApres2017: 0,
    /** Gains latents à l'ouverture, dont la part déjà soumise aux prélèvements sociaux. */
    gainsLatentsOuverture: 0,
    gainsLatentsDejaSoumisPS: 0,
    supports: [],
    versementsProgrammes: [],
    versementsComplementaires: [],
    rachatsProgrammes: [],
  }, o);
  contrat.supports = (contrat.supports || []).map((s) => (s.parametres && s.libelle ? creerSupport(s) : creerSupport(s)));
  contrat.versementsProgrammes = (contrat.versementsProgrammes || []).map(creerVersementProgramme);
  contrat.versementsComplementaires = (contrat.versementsComplementaires || []).map(creerVersementComplementaire);
  contrat.rachatsProgrammes = (contrat.rachatsProgrammes || []).map(creerRachatProgramme);
  return contrat;
}

/**
 * Contrôle de cohérence d'un contrat. Retourne la liste des erreurs (vide si valide).
 * @param {object} contrat
 * @returns {string[]}
 */
export function validerContrat(contrat) {
  const erreurs = [];
  if (!(contrat.dureeProjection >= 1)) erreurs.push('La durée de projection doit être d\'au moins 1 an.');
  if (contrat.montantInitial < 0) erreurs.push('Le montant initial ne peut pas être négatif.');
  if (!contrat.supports.length) erreurs.push('Le contrat doit comporter au moins un support.');
  const ids = contrat.supports.map((s) => s.id);
  if (new Set(ids).size !== ids.length) erreurs.push('Les identifiants de supports doivent être uniques.');
  const total = contrat.supports.reduce((s, x) => s + x.allocation, 0);
  if (Math.abs(total - 1) > 1e-6) erreurs.push(`La somme des allocations vaut ${(total * 100).toFixed(1)} % au lieu de 100 %.`);
  for (const r of contrat.rachatsProgrammes) {
    if (r.support && !ids.includes(r.support)) erreurs.push(`Support de prélèvement inconnu : ${r.support}`);
  }
  for (const v of contrat.versementsComplementaires) {
    if (v.support && !ids.includes(v.support)) erreurs.push(`Support cible inconnu : ${v.support}`);
  }
  return erreurs;
}

/**
 * Sérialisation JSON d'une configuration complète (contrat et paramètres).
 * @param {object} configuration
 * @returns {string}
 */
export function serialiser(configuration) {
  return JSON.stringify(configuration, null, 2);
}

/**
 * Reconstruit une configuration complète depuis un objet JSON en appliquant
 * toutes les valeurs par défaut.
 * @param {object} brut
 */
export function chargerConfiguration(brut) {
  return {
    nom: brut.nom || (brut.contrat && brut.contrat.nom) || 'Configuration',
    contrat: creerContrat(brut.contrat || {}),
    frais: creerParametresFrais(brut.frais || {}),
    scenario: creerScenarioMarche(brut.scenario || {}),
    arbitrages: creerParametresArbitrages(brut.arbitrages || {}),
    avance: creerParametresAvance(brut.avance || {}),
    fiscal: creerParametresFiscaux(brut.fiscal || {}),
  };
}
