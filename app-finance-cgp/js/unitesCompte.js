/**
 * unitesCompte.js : rendement des unités de compte, en valeur moyenne ou par
 * simulation Monte Carlo (rendement annuel log-normal de moyenne égale au
 * rendement attendu).
 */

import { creerGenerateur, normale, percentile } from './aleatoire.js';

/**
 * Rendement d'un exercice.
 * @param {object} parametres rendementMoyen, volatilite
 * @param {number|null} [bruit] tirage normal centré réduit ; null = déterministe
 * @returns {number}
 */
export function rendementUC(parametres, bruit = null) {
  if (bruit === null || bruit === undefined || !(parametres.volatilite > 0)) return parametres.rendementMoyen;
  const mu = Math.log(1 + parametres.rendementMoyen);
  const sigma = parametres.volatilite;
  return Math.exp(mu - 0.5 * sigma * sigma + sigma * bruit) - 1;
}

/**
 * Capitalisation d'un support UC sur un exercice, frais de gestion prélevés
 * sur l'encours moyen.
 * @param {object} p valeurDebut, fluxDebut, fluxMilieu, rendement, tauxFraisGestion
 * @returns {{valeurFin:number, gains:number, fraisGestion:number}}
 */
export function capitaliserUC(p) {
  const fluxDebut = p.fluxDebut || 0;
  const fluxMilieu = p.fluxMilieu || 0;
  const base = p.valeurDebut + fluxDebut;
  const facteurMilieu = p.rendement > -1 ? (1 + p.rendement) ** 0.5 : 0;
  const gains = base * p.rendement + fluxMilieu * (facteurMilieu - 1);
  const encoursMoyen = Math.max(base + fluxMilieu / 2, 0);
  const fraisGestion = encoursMoyen * (p.tauxFraisGestion || 0);
  const valeurFin = Math.max(base + fluxMilieu + gains - fraisGestion, 0);
  return { valeurFin, gains, fraisGestion };
}

/**
 * Simulation Monte Carlo d'un capital unique en UC.
 * @param {number} capital
 * @param {object} parametres rendementMoyen, volatilite
 * @param {number} duree années
 * @param {object} [options] nombreSimulations, graine, tauxFraisGestion
 * @returns {{nombreSimulations:number, annees:Array<{annee:number, moyenne:number, p5:number, p25:number, mediane:number, p75:number, p95:number}>, probabilitePerte:number}}
 */
export function monteCarloUC(capital, parametres, duree, options = {}) {
  const n = Math.max(1, options.nombreSimulations || 500);
  const uniforme = creerGenerateur(options.graine ?? 42);
  const frais = options.tauxFraisGestion || 0;
  const trajectoires = [];
  for (let i = 0; i < n; i += 1) {
    const t = [];
    let v = capital;
    for (let a = 0; a < duree; a += 1) {
      const r = rendementUC(parametres, normale(uniforme));
      v = Math.max(v * (1 + r - frais), 0);
      t.push(v);
    }
    trajectoires.push(t);
  }
  const annees = [];
  for (let a = 0; a < duree; a += 1) {
    const col = trajectoires.map((t) => t[a]);
    annees.push({
      annee: a + 1,
      moyenne: col.reduce((s, x) => s + x, 0) / n,
      p5: percentile(col, 5),
      p25: percentile(col, 25),
      mediane: percentile(col, 50),
      p75: percentile(col, 75),
      p95: percentile(col, 95),
    });
  }
  const finales = trajectoires.map((t) => t[duree - 1]);
  return { nombreSimulations: n, annees, probabilitePerte: finales.filter((v) => v < capital).length / n };
}
