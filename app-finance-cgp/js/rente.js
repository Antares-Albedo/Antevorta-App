/**
 * rente.js : sortie en rente viagère et phase de consommation du capital.
 */

import { calculerFiscaliteRachat, abattementAnnuel } from './fiscalite.js';

/**
 * Taux de conversion interpolé pour un âge donné.
 * @param {number} age
 * @param {object} table data/table-rente.json
 * @returns {number}
 */
export function tauxConversion(age, table) {
  const points = [...table.tauxConversionParAge].sort((a, b) => a.age - b.age);
  if (age <= points[0].age) return points[0].taux;
  if (age >= points[points.length - 1].age) return points[points.length - 1].taux;
  for (let i = 1; i < points.length; i += 1) {
    if (age <= points[i].age) {
      const a = points[i - 1];
      const b = points[i];
      return a.taux + (b.taux - a.taux) * ((age - a.age) / (b.age - a.age));
    }
  }
  return points[points.length - 1].taux;
}

/**
 * Conversion d'un capital en rente viagère annuelle.
 * @param {number} capital
 * @param {number} age âge du crédirentier à la liquidation
 * @param {string} typeRente clé de table.coefficientsTypeRente
 * @param {object} table
 * @param {object} [options] { fraisSurArrerages: fraction, revalorisation: fraction }
 * @returns {{tauxConversion:number, coefficient:number, renteAnnuelle:number, renteMensuelle:number, renteNetteFrais:number}}
 */
export function convertirEnRente(capital, age, typeRente, table, options = {}) {
  const taux = tauxConversion(age, table);
  const coefficient = table.coefficientsTypeRente[typeRente] ?? 1;
  const renteAnnuelle = capital * taux * coefficient;
  const frais = options.fraisSurArrerages || 0;
  return {
    tauxConversion: taux,
    coefficient,
    renteAnnuelle,
    renteMensuelle: renteAnnuelle / 12,
    renteNetteFrais: renteAnnuelle * (1 - frais),
  };
}

/**
 * Fraction imposable d'une rente viagère à titre onéreux selon l'âge d'entrée en jouissance.
 * @param {number} age
 * @returns {number}
 */
export function fractionImposableRente(age) {
  if (age < 50) return 0.70;
  if (age < 60) return 0.50;
  if (age < 70) return 0.40;
  return 0.30;
}

/**
 * Phase de consommation du capital par rachats programmés, avec fiscalité de chaque rachat.
 *
 * @param {object} p
 * @param {number} p.capital capital au démarrage
 * @param {number} p.primesNettes primes nettes au démarrage (capital non taxable)
 * @param {number} p.gainsDejaSoumisPS gains déjà soumis aux prélèvements sociaux
 * @param {number} p.rachatAnnuel montant brut racheté chaque année
 * @param {number} [p.indexation=0] revalorisation annuelle du rachat
 * @param {number} p.rendementNet rendement net de frais du capital restant (fraction)
 * @param {number} [p.anciennete=8] ancienneté fiscale au démarrage
 * @param {number} [p.maxAnnees=40]
 * @param {object} p.fiscal paramètres du foyer
 * @param {object} p.constantes
 * @param {object} p.baremeIR
 * @param {number} [p.primesAvant2017=0]
 * @returns {{lignes:Array<object>, anneeEpuisement:number|null, totalNetPercu:number, totalImpots:number}}
 */
export function projeterConsommation(p) {
  let capital = p.capital;
  let primes = p.primesNettes;
  let gainsPS = p.gainsDejaSoumisPS || 0;
  let primesAvant = p.primesAvant2017 || 0;
  const lignes = [];
  let anneeEpuisement = null;
  let totalNet = 0;
  let totalImpots = 0;
  const max = p.maxAnnees || 40;
  for (let annee = 1; annee <= max; annee += 1) {
    const rachatVoulu = p.rachatAnnuel * (1 + (p.indexation || 0)) ** (annee - 1);
    const rachat = Math.min(rachatVoulu, capital);
    if (rachat <= 0) { anneeEpuisement = anneeEpuisement ?? annee; break; }
    const gains = capital - primes;
    const detail = calculerFiscaliteRachat({
      montantRachat: rachat,
      valeurContrat: capital,
      gainsTotaux: gains,
      gainsDejaSoumisPS: gainsPS,
      primesAvant2017: primesAvant,
      primesApres2017: Math.max(primes - primesAvant, 0),
      anciennete: (p.anciennete ?? 8) + annee - 1,
      abattementRestant: abattementAnnuel(p.fiscal, p.constantes),
      fiscal: p.fiscal,
      constantes: p.constantes,
      baremeIR: p.baremeIR,
    });
    const partAvant = primes > 0 ? primesAvant / primes : 0;
    primesAvant -= detail.partCapital * partAvant;
    primes -= detail.partCapital;
    if (gains > 0) gainsPS = Math.max(gainsPS - detail.quotePartGains * Math.min(gainsPS / gains, 1), 0);
    capital -= rachat;
    const rendement = capital * p.rendementNet;
    capital += rendement;
    totalNet += detail.montantNet;
    totalImpots += detail.impotDefinitif + detail.prelevementsSociaux;
    lignes.push({
      annee,
      capitalDebut: capital - rendement + rachat,
      rachatBrut: rachat,
      impot: detail.impotDefinitif,
      prelevementsSociaux: detail.prelevementsSociaux,
      rachatNet: detail.montantNet,
      rendement,
      capitalFin: capital,
      quotePartGains: detail.quotePartGains,
    });
    if (capital <= 1) { anneeEpuisement = annee; capital = 0; break; }
  }
  return { lignes, anneeEpuisement, totalNetPercu: totalNet, totalImpots };
}
