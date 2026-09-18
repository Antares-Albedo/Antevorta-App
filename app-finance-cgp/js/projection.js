/**
 * projection.js : orchestrateur de la projection annuelle.
 *
 * Pour chaque exercice :
 *  1. flux de l'année (nets de frais), 2. arbitrages et rééquilibrages,
 *  3. part d'UC et encours, 4. taux du fonds en euros (barème à paliers),
 *  5. rendement des compartiments et frais de gestion, 6. prélèvements
 *  sociaux au fil de l'eau sur le compartiment euros, 7. avance en cours,
 *  8. fiscalité des rachats, 9. consolidation.
 *
 * Conventions : versement initial et complémentaires en début d'exercice,
 * versements et rachats programmés en milieu d'exercice ; les produits
 * structurés ne sont souscrits qu'avec le versement initial (ou un versement
 * complémentaire qui les cible), les autres flux qui leur sont alloués sont
 * redirigés vers leur support de réaffectation.
 */

import { TypeSupport, MethodeSimulation, validerContrat } from './models.js';
import { validerParametresFrais, tauxFraisGestion, fraisGestion, nouveauCompteurFrais, ajouterFrais } from './frais.js';
import { genererFlux, fluxDeLAnnee, CategorieFlux } from './flux.js';
import { tauxFondsEuros, capitaliserFondsEuros, bruitTaux } from './fondsEuros.js';
import { rendementUC, capitaliserUC } from './unitesCompte.js';
import { simulerTrajectoire, etatInitial, observer } from './structures.js';
import { appliquerArbitragesPonctuels, reequilibrer, securiser } from './arbitrages.js';
import { assietteAvance, controlerPlafond, ouvrirAvance, exercerAvance, alerteAvance } from './avance.js';
import { calculerFiscaliteRachat, abattementAnnuel, restitutionPrelevementsSociaux } from './fiscalite.js';
import { creerGenerateur, normale, percentile } from './aleatoire.js';

/**
 * Support de réaffectation d'un produit structuré (coupons, capital remboursé,
 * flux redirigés).
 * @param {object} contrat
 * @param {object} support
 * @returns {string}
 */
function supportReaffectation(contrat, support) {
  const cible = support.parametres.supportReaffectation;
  if (cible && cible !== support.id && contrat.supports.some((s) => s.id === cible)) return cible;
  const fe = contrat.supports.find((s) => s.type === TypeSupport.FONDS_EUROS);
  if (fe) return fe.id;
  const uc = contrat.supports.find((s) => s.type === TypeSupport.UC);
  return uc ? uc.id : support.id;
}

/**
 * Part d'unités de compte d'une carte de valeurs.
 * @param {Object<string, number>} valeurs
 * @param {Array<object>} supports
 * @param {boolean} structuresAssimilees
 */
export function partUnitesDeCompte(valeurs, supports, structuresAssimilees = true) {
  let total = 0;
  let uc = 0;
  for (const s of supports) {
    const v = Math.max(valeurs[s.id] || 0, 0);
    total += v;
    if (s.type === TypeSupport.UC) uc += v;
    else if (s.type === TypeSupport.STRUCTURE && (s.parametres.assimileUC ?? structuresAssimilees)) uc += v;
  }
  return total > 0 ? uc / total : 0;
}

/**
 * Ventile un montant net entrant entre les supports.
 * @returns {Object<string, number>}
 */
function ventiler(contrat, montantNet, cible, autoriserStructures) {
  const parts = {};
  if (cible) {
    parts[cible] = montantNet;
  } else {
    for (const s of contrat.supports) if (s.allocation > 0) parts[s.id] = (parts[s.id] || 0) + montantNet * s.allocation;
  }
  if (autoriserStructures) return parts;
  const resultat = {};
  for (const [id, m] of Object.entries(parts)) {
    const s = contrat.supports.find((x) => x.id === id);
    const dest = s && s.type === TypeSupport.STRUCTURE ? supportReaffectation(contrat, s) : id;
    resultat[dest] = (resultat[dest] || 0) + m;
  }
  return resultat;
}

/**
 * Projection complète d'une configuration.
 *
 * @param {object} config { contrat, frais, scenario, arbitrages, avance, fiscal }
 * @param {object} donnees { baremeFondsEuros, parametresFiscaux, baremeIR }
 * @param {object} [options] { graine, methode }
 * @returns {object} résultat : lignes annuelles, signalements, avance, fiscalité au terme, synthèse
 */
export function projeter(config, donnees, options = {}) {
  const { contrat, frais, scenario, arbitrages, avance, fiscal } = config;
  const erreurs = [...validerContrat(contrat), ...validerParametresFrais(frais)];
  if (erreurs.length) throw new Error(erreurs.join(' '));

  const bareme = donnees.baremeFondsEuros;
  const constantes = donnees.parametresFiscaux;
  const baremeIR = donnees.baremeIR;
  const methode = options.methode || scenario.methode;
  const stochastique = methode === MethodeSimulation.STOCHASTIQUE;
  const uniforme = creerGenerateur(options.graine ?? scenario.graine ?? 42);
  const duree = contrat.dureeProjection;
  const tauxPS = fiscal.prelevementsSociauxFilEau ? constantes.prelevementsSociaux.tauxAssuranceVie : 0;

  // État du contrat
  const valeurs = {};
  for (const s of contrat.supports) valeurs[s.id] = 0;
  const etatsStructures = {};
  for (const s of contrat.supports) {
    if (s.type === TypeSupport.STRUCTURE) {
      etatsStructures[s.id] = etatInitial(0, simulerTrajectoire(s.parametres, methode, stochastique ? uniforme : null));
    }
  }
  let primesAvant2017 = contrat.primesAnterieuresAvant2017 || 0;
  let primesApres2017 = contrat.primesAnterieuresApres2017 || 0;
  let gainsDejaSoumisPS = contrat.gainsLatentsDejaSoumisPS || 0;
  let cumulPSFilEau = 0;
  let cumulVersements = 0;
  let cumulRachats = 0;
  let cumulRachatsNets = 0;
  let cumulImpots = 0;
  let cumulFrais = 0;
  let cumulPSRachats = 0;
  let cumulGainsRachetes = 0;

  // Reprise d'un contrat existant : valeur d'ouverture répartie selon l'allocation.
  const valeurOuverture = primesAvant2017 + primesApres2017 + (contrat.gainsLatentsOuverture || 0);
  if (valeurOuverture > 0) {
    for (const [id, m] of Object.entries(ventiler(contrat, valeurOuverture, null, true))) {
      valeurs[id] += m;
      if (etatsStructures[id]) etatsStructures[id].nominal += m;
    }
  }

  const flux = genererFlux(contrat, frais);
  const lignes = [];
  const signalements = [];
  const rachatsDetail = [];
  const mouvementsArbitrage = [];
  const evenementsStructures = [];
  let etatAvance = null;
  const lignesAvance = [];
  let avanceRefusee = null;
  const etatSecurisation = { partDepart: null };
  let trancheprecedente = null;
  let totalForfaitaire = 0;
  let totalBareme = 0;
  let cumulDifferentielAvance = 0;
  const seuilEncours = bareme.seuilEncours ?? 150000;

  for (let annee = 1; annee <= duree; annee += 1) {
    const valeurDebut = Object.values(valeurs).reduce((s, v) => s + v, 0);
    const compteurFrais = nouveauCompteurFrais();
    const fluxDebut = {};
    const fluxMilieu = {};
    let versementsBruts = 0;
    let versementsNets = 0;
    let rachatsBruts = 0;
    let rachatsNets = 0;
    let impotsAnnee = 0;
    let psRachats = 0;
    let abattementRestant = abattementAnnuel(fiscal, constantes);
    let abattementConsomme = 0;

    // 1. Flux de l'année
    for (const f of fluxDeLAnnee(flux, annee)) {
      if (f.sens === 'entrant') {
        versementsBruts += f.montantBrut;
        versementsNets += f.montantNet;
        cumulVersements += f.montantBrut;
        primesApres2017 += f.montantBrut;
        ajouterFrais(compteurFrais, 'versement', f.frais);
        const structuresOK = f.categorie === CategorieFlux.INITIAL || (f.categorie === CategorieFlux.COMPLEMENTAIRE && !!f.support);
        const parts = ventiler(contrat, f.montantNet, f.support, structuresOK);
        const cible = f.moment === 'debut' ? fluxDebut : fluxMilieu;
        for (const [id, m] of Object.entries(parts)) {
          cible[id] = (cible[id] || 0) + m;
          if (etatsStructures[id]) {
            etatsStructures[id].nominal += m;
            valeurs[id] += m;
          }
        }
      }
    }
    // Les flux de début d'exercice sont intégrés aux valeurs avant arbitrages.
    for (const [id, m] of Object.entries(fluxDebut)) if (!etatsStructures[id]) valeurs[id] += m;

    // Rachats programmés (milieu d'exercice), fiscalité calculée sur la situation du contrat.
    for (const f of fluxDeLAnnee(flux, annee)) {
      if (f.sens !== 'sortant') continue;
      const total = Object.values(valeurs).reduce((s, v) => s + v, 0) + Object.values(fluxMilieu).reduce((s, v) => s + v, 0);
      const assiette = f.support ? (valeurs[f.support] || 0) + (fluxMilieu[f.support] || 0) : total;
      let montant = f.pourcentage !== null && f.pourcentage !== undefined ? assiette * f.pourcentage : Math.min(f.montantBrut || 0, assiette);
      montant = Math.max(Math.min(montant, assiette), 0);
      if (montant <= 0) continue;
      const primesNettes = primesAvant2017 + primesApres2017;
      const gainsTotaux = total - primesNettes;
      const detail = calculerFiscaliteRachat({
        montantRachat: montant,
        valeurContrat: total,
        gainsTotaux,
        gainsDejaSoumisPS,
        primesAvant2017,
        primesApres2017,
        anciennete: (contrat.anterioriteFiscale || 0) + annee - 1,
        abattementRestant,
        fiscal,
        constantes,
        baremeIR,
      });
      abattementRestant = detail.abattementRestant;
      abattementConsomme += detail.abattementUtilise;
      totalForfaitaire += detail.impotForfaitaire.total;
      totalBareme += detail.impotBareme;
      impotsAnnee += detail.impotDefinitif;
      psRachats += detail.prelevementsSociaux;
      cumulPSRachats += detail.prelevementsSociaux;
      cumulGainsRachetes += detail.quotePartGains;
      // Le capital remboursé réduit les primes ; les gains rachetés réduisent les gains déjà soumis aux PS au prorata.
      const partAvant = primesNettes > 0 ? primesAvant2017 / primesNettes : 0;
      primesAvant2017 -= detail.partCapital * partAvant;
      primesApres2017 -= detail.partCapital * (1 - partAvant);
      if (gainsTotaux > 0) gainsDejaSoumisPS -= detail.quotePartGains * Math.min(gainsDejaSoumisPS / gainsTotaux, 1);
      gainsDejaSoumisPS = Math.max(gainsDejaSoumisPS, 0);
      // Prélèvement sur les supports.
      if (f.support) {
        fluxMilieu[f.support] = (fluxMilieu[f.support] || 0) - montant;
        if (etatsStructures[f.support]) {
          const e = etatsStructures[f.support];
          const avant = valeurs[f.support];
          e.nominal *= avant > 0 ? Math.max(avant - montant, 0) / avant : 0;
          valeurs[f.support] = Math.max(avant - montant, 0);
          fluxMilieu[f.support] += montant;
        }
      } else {
        for (const s of contrat.supports) {
          const base = (valeurs[s.id] || 0) + (fluxMilieu[s.id] || 0);
          if (base <= 0 || total <= 0) continue;
          const part = montant * (base / total);
          if (etatsStructures[s.id]) {
            const e = etatsStructures[s.id];
            e.nominal *= Math.max(valeurs[s.id] - part, 0) / Math.max(valeurs[s.id], 1e-9);
            valeurs[s.id] = Math.max(valeurs[s.id] - part, 0);
          } else {
            fluxMilieu[s.id] = (fluxMilieu[s.id] || 0) - part;
          }
        }
      }
      rachatsBruts += montant;
      rachatsNets += detail.montantNet;
      cumulRachats += montant;
      cumulRachatsNets += detail.montantNet;
      rachatsDetail.push({ annee, ...detail });
    }

    // 2. Arbitrages
    const mouvements = [];
    mouvements.push(...appliquerArbitragesPonctuels(valeurs, arbitrages.ponctuels, annee, frais));
    if (arbitrages.reequilibrage && arbitrages.reequilibrage.actif) {
      const periode = Math.max(1, arbitrages.reequilibrage.periodiciteAnnees || 1);
      if (annee > 1 && (annee - 1) % periode === 0) {
        const cible = {};
        for (const s of contrat.supports) cible[s.id] = s.allocation;
        mouvements.push(...reequilibrer(valeurs, contrat.supports, cible, frais, 'reequilibrage', arbitrages.inclureStructures));
      }
    }
    if (arbitrages.securisation && arbitrages.securisation.actif) {
      mouvements.push(...securiser(valeurs, contrat.supports, arbitrages.securisation, etatSecurisation, annee, duree, frais, arbitrages.inclureStructures));
    }
    for (const m of mouvements) {
      ajouterFrais(compteurFrais, 'arbitrage', m.frais);
      mouvementsArbitrage.push({ annee, ...m });
      if (etatsStructures[m.source]) etatsStructures[m.source].nominal = valeurs[m.source];
    }

    // 3. Part d'UC et encours, 4. taux du fonds en euros (point fixe sur l'encours de fin d'exercice)
    const partUCDebut = partUnitesDeCompte(valeurs, contrat.supports, bareme.structuresAssimileesUC);
    const bruitFE = stochastique && scenario.volatilite > 0 ? bruitTaux(uniforme) : null;
    const bruitsUC = {};
    for (const s of contrat.supports) if (s.type === TypeSupport.UC) bruitsUC[s.id] = stochastique ? normale(uniforme) : null;
    const feSupports = contrat.supports.filter((s) => s.type === TypeSupport.FONDS_EUROS);
    const tauxForce = feSupports.length ? feSupports[0].parametres.tauxForce : null;

    let infoTaux = null;
    let resultatsSupports = {};
    let encoursFin = valeurDebut;
    let partUCMoyenne = partUCDebut;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      infoTaux = tauxFondsEuros(bareme, partUCMoyenne, encoursFin, { annee, scenario, tauxForce, bruit: bruitFE });
      resultatsSupports = {};
      const valeursFin = {};
      for (const s of contrat.supports) {
        if (s.type === TypeSupport.FONDS_EUROS) {
          const r = capitaliserFondsEuros({
            valeurDebut: valeurs[s.id], fluxDebut: 0, fluxMilieu: fluxMilieu[s.id] || 0,
            taux: infoTaux.taux, tauxFraisGestion: tauxFraisGestion(s.type, frais), tauxPS,
          });
          resultatsSupports[s.id] = r;
          valeursFin[s.id] = r.valeurFin;
        } else if (s.type === TypeSupport.UC) {
          const rendement = rendementUC(s.parametres, bruitsUC[s.id]);
          const r = capitaliserUC({
            valeurDebut: valeurs[s.id], fluxDebut: 0, fluxMilieu: fluxMilieu[s.id] || 0,
            rendement, tauxFraisGestion: tauxFraisGestion(s.type, frais),
          });
          resultatsSupports[s.id] = { ...r, rendement };
          valeursFin[s.id] = r.valeurFin;
        } else {
          valeursFin[s.id] = valeurs[s.id];
        }
      }
      const nouvelEncours = Object.values(valeursFin).reduce((s, v) => s + v, 0);
      const partFin = partUnitesDeCompte(valeursFin, contrat.supports, bareme.structuresAssimileesUC);
      const nouvellePart = (partUCDebut + partFin) / 2;
      const stable = Math.abs(nouvelEncours - encoursFin) < 0.01 && Math.abs(nouvellePart - partUCMoyenne) < 1e-9;
      encoursFin = nouvelEncours;
      partUCMoyenne = nouvellePart;
      if (stable) break;
    }

    // 5. et 6. Application des rendements, frais de gestion et prélèvements sociaux
    let interetsBrutsFE = 0;
    let psFilEau = 0;
    let gainsUC = 0;
    for (const s of contrat.supports) {
      const r = resultatsSupports[s.id];
      if (!r) continue;
      valeurs[s.id] = r.valeurFin;
      if (s.type === TypeSupport.FONDS_EUROS) {
        interetsBrutsFE += r.interetsBruts;
        psFilEau += r.prelevementsSociaux;
        gainsDejaSoumisPS += r.interetsNets;
        ajouterFrais(compteurFrais, 'gestionFondsEuros', r.fraisGestion);
      } else {
        gainsUC += r.gains;
        ajouterFrais(compteurFrais, 'gestionUC', r.fraisGestion);
      }
    }
    cumulPSFilEau += psFilEau;

    // Produits structurés : frais de gestion, observation, réaffectation
    let coupons = 0;
    let remboursements = 0;
    let variationStructures = 0;
    for (const s of contrat.supports) {
      if (s.type !== TypeSupport.STRUCTURE) continue;
      const e = etatsStructures[s.id];
      const dest = supportReaffectation(contrat, s);
      if (!e.rembourse && e.nominal > 0) {
        const fg = fraisGestion(e.nominal, tauxFraisGestion(s.type, frais));
        if (fg > 0 && dest !== s.id) {
          valeurs[dest] -= fg;
          ajouterFrais(compteurFrais, 'gestionStructure', fg);
        }
      }
      const avant = valeurs[s.id];
      const obs = observer(e, annee, s.parametres);
      if (obs.evenement) {
        evenementsStructures.push({ annee, support: s.id, libelle: s.libelle, ...obs });
      }
      if (obs.coupon > 0) {
        coupons += obs.coupon;
        valeurs[dest] += obs.coupon;
      }
      if (e.rembourse) {
        valeurs[dest] += obs.rembourse;
        remboursements += obs.rembourse;
        valeurs[s.id] = 0;
        variationStructures += obs.rembourse - avant;
      } else if (e.nominal > 0) {
        valeurs[s.id] = obs.valeur;
        variationStructures += obs.valeur - avant;
      }
    }

    // 7. Avance
    let ligneAvance = null;
    let alerte = false;
    const assiette = assietteAvance(valeurs, contrat.supports, avance);
    if (avance.actif && !etatAvance && annee === avance.anneeMiseEnPlace && !avanceRefusee) {
      const controle = controlerPlafond(avance.montant, assiette.maximum);
      if (controle.valide && avance.montant > 0) {
        etatAvance = ouvrirAvance(avance);
      } else {
        avanceRefusee = controle.message || 'Montant d\'avance nul.';
        signalements.push({ annee, type: 'avanceRefusee', niveau: 'critique', message: `Avance refusée : ${avanceRefusee}` });
      }
    }
    if (etatAvance) {
      ligneAvance = exercerAvance(etatAvance, avance, annee);
      if (ligneAvance) {
        const valeurTotale = Object.values(valeurs).reduce((s, v) => s + v, 0);
        alerte = alerteAvance(ligneAvance.totalDu, valeurTotale, avance.seuilAlerte);
        ligneAvance.assiette = assiette.maximum;
        ligneAvance.valeurRachat = valeurTotale;
        ligneAvance.ratio = valeurTotale > 0 ? ligneAvance.totalDu / valeurTotale : 0;
        ligneAvance.alerte = alerte;
        lignesAvance.push(ligneAvance);
        if (alerte) signalements.push({ annee, type: 'avanceSeuil', niveau: 'critique', message: `L'encours de l'avance (${Math.round(ligneAvance.totalDu).toLocaleString('fr-FR')} €) dépasse ${Math.round(avance.seuilAlerte * 100)} % de la valeur de rachat.` });
      }
    }

    // 9. Consolidation
    const valeurFin = Object.values(valeurs).reduce((s, v) => s + v, 0);
    const fluxMilieuNet = Object.values(fluxMilieu).reduce((s, v) => s + v, 0);
    const baseRendement = valeurDebut + Object.values(fluxDebut).reduce((s, v) => s + v, 0) + fluxMilieuNet / 2;
    const gainsBruts = interetsBrutsFE + gainsUC + coupons + variationStructures;
    const performanceBrute = baseRendement > 0 ? gainsBruts / baseRendement : 0;
    const performanceNette = baseRendement > 0 ? (valeurFin + rachatsBruts - valeurDebut - versementsBruts) / baseRendement : 0;
    cumulFrais += compteurFrais.total;
    cumulImpots += impotsAnnee;

    if (etatAvance && ligneAvance) {
      const rendementCapitalMaintenu = ligneAvance.capitalDebut * performanceNette;
      ligneAvance.rendementCapitalMaintenu = rendementCapitalMaintenu;
      ligneAvance.differentiel = rendementCapitalMaintenu - ligneAvance.interets;
      cumulDifferentielAvance += ligneAvance.differentiel;
      ligneAvance.differentielCumule = cumulDifferentielAvance;
    }

    const repartition = {};
    for (const s of contrat.supports) repartition[s.id] = valeurs[s.id];
    const partUCFin = partUnitesDeCompte(valeurs, contrat.supports, bareme.structuresAssimileesUC);
    const primesNettesFin = primesAvant2017 + primesApres2017;

    lignes.push({
      annee,
      valeurDebut,
      versementsBruts,
      versementsNets,
      rachatsBruts,
      rachatsNets,
      frais: { ...compteurFrais },
      prelevementsSociaux: psFilEau,
      prelevementsSociauxRachats: psRachats,
      impots: impotsAnnee,
      abattementConsomme,
      abattementAnnuel: abattementAnnuel(fiscal, constantes),
      coupons,
      remboursementsStructures: remboursements,
      tauxFondsEuros: infoTaux ? infoTaux.taux : 0,
      trancheBareme: infoTaux ? infoTaux.tranche : null,
      indexTranche: infoTaux ? infoTaux.indexTranche : null,
      auDessusSeuil: infoTaux ? infoTaux.auDessusSeuil : false,
      partUC: partUCMoyenne,
      partUCFin,
      valeurFin,
      repartition,
      arbitrages: mouvements,
      avance: ligneAvance,
      performanceBrute,
      performanceNette,
      cumulVersements,
      cumulRachats,
      cumulRachatsNets,
      cumulFrais,
      cumulImpots,
      cumulPSFilEau,
      primesNettes: primesNettesFin,
      gainsLatents: valeurFin - primesNettesFin,
      plusValueNette: valeurFin + cumulRachats - cumulVersements - valeurOuverture,
    });

    // Signalements
    if (infoTaux) {
      if (trancheprecedente !== null && trancheprecedente !== infoTaux.indexTranche) {
        signalements.push({ annee, type: 'tranche', niveau: 'info', message: `Changement de tranche du barème du fonds en euros : ${infoTaux.tranche} (taux ${(infoTaux.taux * 100).toFixed(2).replace('.', ',')} %).` });
      }
      trancheprecedente = infoTaux.indexTranche;
    }
    if (valeurFin >= seuilEncours * 0.9 && valeurFin < seuilEncours) {
      signalements.push({ annee, type: 'seuilEncours', niveau: 'attention', message: `Encours de ${Math.round(valeurFin).toLocaleString('fr-FR')} € proche du seuil de ${seuilEncours.toLocaleString('fr-FR')} € du barème.` });
    }
    const lignePrecedente = lignes[lignes.length - 2];
    if (lignePrecedente && lignePrecedente.valeurFin < seuilEncours && valeurFin >= seuilEncours) {
      signalements.push({ annee, type: 'seuilFranchi', niveau: 'info', message: `Franchissement du seuil de ${seuilEncours.toLocaleString('fr-FR')} € d'encours : taux majoré du barème.` });
    }
    if (abattementConsomme >= abattementAnnuel(fiscal, constantes) - 1e-6 && abattementConsomme > 0) {
      signalements.push({ annee, type: 'abattement', niveau: 'attention', message: `Abattement annuel de ${abattementAnnuel(fiscal, constantes).toLocaleString('fr-FR')} € totalement consommé.` });
    }
  }

  // Fiscalité d'un rachat total au terme (dénouement) avec restitution éventuelle des prélèvements sociaux.
  const valeurTerme = Object.values(valeurs).reduce((s, v) => s + v, 0);
  const primesNettes = primesAvant2017 + primesApres2017;
  const fiscaliteTerme = calculerFiscaliteRachat({
    montantRachat: valeurTerme,
    valeurContrat: valeurTerme,
    gainsTotaux: valeurTerme - primesNettes,
    gainsDejaSoumisPS,
    primesAvant2017,
    primesApres2017,
    anciennete: (contrat.anterioriteFiscale || 0) + duree,
    abattementRestant: abattementAnnuel(fiscal, constantes),
    fiscal,
    constantes,
    baremeIR,
  });
  // Restitution : prélèvements sociaux acquittés (fil de l'eau, rachats, dénouement)
  // comparés à ceux dus sur la performance globale du contrat.
  const gainsGlobaux = (valeurTerme - primesNettes) + cumulGainsRachetes + cumulPSFilEau;
  const psAcquittes = cumulPSFilEau + cumulPSRachats + fiscaliteTerme.prelevementsSociaux;
  fiscaliteTerme.restitutionPS = Math.min(
    restitutionPrelevementsSociaux(psAcquittes, gainsGlobaux, constantes),
    cumulPSFilEau,
  );
  if (fiscaliteTerme.restitutionPS < 1) fiscaliteTerme.restitutionPS = 0;
  fiscaliteTerme.gainsGlobaux = gainsGlobaux;
  fiscaliteTerme.psAcquittes = psAcquittes;
  fiscaliteTerme.montantNet += fiscaliteTerme.restitutionPS;

  if (rachatsDetail.length) {
    const favorable = totalBareme < totalForfaitaire - 1e-6 ? 'bareme' : (totalBareme > totalForfaitaire + 1e-6 ? 'forfaitaire' : 'egal');
    if (favorable !== 'egal') {
      signalements.push({
        annee: null,
        type: 'optionFiscale',
        niveau: 'info',
        message: favorable === 'bareme'
          ? `L'option pour le barème progressif serait plus favorable que le prélèvement forfaitaire sur les rachats projetés (écart ${Math.round(totalForfaitaire - totalBareme).toLocaleString('fr-FR')} €).`
          : `Le prélèvement forfaitaire est plus favorable que le barème progressif sur les rachats projetés (écart ${Math.round(totalBareme - totalForfaitaire).toLocaleString('fr-FR')} €).`,
      });
    }
  }

  const derniere = lignes[lignes.length - 1];
  const capitalNet = cumulVersements + valeurOuverture - cumulRachats;
  const synthese = {
    valeurOuverture,
    valeurTerme,
    cumulVersements,
    cumulRachats,
    cumulRachatsNets,
    cumulFrais,
    cumulImpots,
    cumulPSFilEau,
    plusValueNette: derniere ? derniere.plusValueNette : 0,
    rendementAnnualise: capitalNet > 0 && duree > 0 ? (valeurTerme / capitalNet) ** (1 / duree) - 1 : 0,
    avance: etatAvance ? {
      coutTotal: etatAvance.cumulInterets,
      totalRembourse: etatAvance.cumulRemboursements,
      differentielCumule: cumulDifferentielAvance,
      refusee: avanceRefusee,
    } : (avanceRefusee ? { refusee: avanceRefusee } : null),
    optionFiscale: { totalForfaitaire, totalBareme },
  };

  return {
    nom: contrat.nom,
    lignes,
    signalements,
    rachats: rachatsDetail,
    arbitrages: mouvementsArbitrage,
    evenementsStructures,
    avance: { lignes: lignesAvance, refusee: avanceRefusee },
    fiscaliteTerme,
    synthese,
    flux,
    supports: contrat.supports.map((s) => ({ id: s.id, libelle: s.libelle, type: s.type })),
  };
}

/**
 * Projection Monte Carlo : répète la projection en mode stochastique et
 * agrège la distribution des valorisations annuelles.
 * @param {object} config
 * @param {object} donnees
 * @param {number} [nombreSimulations]
 */
export function projeterMonteCarlo(config, donnees, nombreSimulations) {
  const n = Math.max(1, nombreSimulations || config.scenario.nombreSimulations || 200);
  const duree = config.contrat.dureeProjection;
  const uniforme = creerGenerateur(config.scenario.graine ?? 42);
  const matrice = [];
  let pertes = 0;
  for (let i = 0; i < n; i += 1) {
    const graine = Math.floor(uniforme() * 2 ** 31);
    const r = projeter(config, donnees, { graine, methode: MethodeSimulation.STOCHASTIQUE });
    matrice.push(r.lignes.map((l) => l.valeurFin));
    if (r.synthese.plusValueNette < 0) pertes += 1;
  }
  const distributions = [];
  for (let a = 0; a < duree; a += 1) {
    const col = matrice.map((t) => t[a]);
    distributions.push({
      annee: a + 1,
      moyenne: col.reduce((s, x) => s + x, 0) / n,
      p5: percentile(col, 5),
      p25: percentile(col, 25),
      mediane: percentile(col, 50),
      p75: percentile(col, 75),
      p95: percentile(col, 95),
    });
  }
  return { nombreSimulations: n, distributions, probabilitePerte: pertes / n };
}
