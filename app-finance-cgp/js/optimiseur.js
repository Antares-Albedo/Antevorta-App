/**
 * optimiseur.js : part d'unités de compte qui maximise le rendement global
 * du contrat compte tenu du barème à paliers du fonds en euros.
 *
 * Rendement global net (fraction) pour une part d'UC p :
 *   (1 - p) × tauxFE(p, encours) × (1 - PS) - (1 - p) × fraisFE
 *   + p × (rendementUC - fraisUC)
 * Le risque associé est la volatilité du portefeuille : p × volatilitéUC.
 */

import { tauxFondsEuros } from './fondsEuros.js';

/**
 * Courbe du rendement global en fonction de la part d'UC.
 * @param {object} p
 * @param {number} p.rendementUC rendement UC attendu (brut de frais)
 * @param {number} [p.volatiliteUC=0.15]
 * @param {number} p.encours encours total du contrat
 * @param {object} p.bareme barème du fonds en euros
 * @param {object} p.frais paramètres de frais (gestionFondsEuros, gestionUC)
 * @param {number} [p.tauxPS=0.172] prélèvements sociaux au fil de l'eau sur le fonds en euros (0 pour un rendement brut de PS)
 * @param {number} [p.pas=0.01]
 * @param {object} [p.scenario]
 * @param {number} [p.annee=1]
 * @returns {{points:Array<object>, optimum:object, seuils:Array<object>, zonesDefavorables:Array<object>}}
 */
export function courbeRendement(p) {
  const pas = p.pas || 0.01;
  const tauxPS = p.tauxPS ?? 0.172;
  const points = [];
  for (let i = 0; i <= Math.round(1 / pas); i += 1) {
    const part = Math.min(Math.round(i * pas * 1e6) / 1e6, 1);
    const info = tauxFondsEuros(p.bareme, part, p.encours, { annee: p.annee || 1, scenario: p.scenario });
    const rendementFE = (info.taux - p.frais.gestionFondsEuros) * (1 - tauxPS);
    const rendementUCNet = p.rendementUC - p.frais.gestionUC;
    const rendement = (1 - part) * rendementFE + part * rendementUCNet;
    points.push({
      partUC: part,
      rendement,
      tauxFondsEuros: info.taux,
      tranche: info.tranche,
      indexTranche: info.indexTranche,
      risque: part * (p.volatiliteUC ?? 0.15),
      rendementFondsEurosNet: rendementFE,
      rendementUCNet,
    });
  }
  let optimum = points[0];
  for (const pt of points) if (pt.rendement > optimum.rendement + 1e-12) optimum = pt;

  // Seuils de bascule : gain marginal obtenu en franchissant chaque palier.
  const seuils = [];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].indexTranche !== points[i - 1].indexTranche) {
      seuils.push({
        partUC: points[i].partUC,
        tranche: points[i].tranche,
        tauxAvant: points[i - 1].tauxFondsEuros,
        tauxApres: points[i].tauxFondsEuros,
        rendementAvant: points[i - 1].rendement,
        rendementApres: points[i].rendement,
        gainMarginal: points[i].rendement - points[i - 1].rendement,
        surcroitRisque: points[i].risque - points[i - 1].risque,
      });
    }
  }

  // Zones où augmenter la part d'UC dégrade le rendement global.
  const zonesDefavorables = [];
  let debut = null;
  for (let i = 1; i < points.length; i += 1) {
    const baisse = points[i].rendement < points[i - 1].rendement - 1e-12;
    if (baisse && debut === null) debut = points[i - 1].partUC;
    if (!baisse && debut !== null) {
      zonesDefavorables.push({ de: debut, a: points[i - 1].partUC, perte: pointsRendement(points, debut) - points[i - 1].rendement });
      debut = null;
    }
  }
  if (debut !== null) zonesDefavorables.push({ de: debut, a: 1, perte: pointsRendement(points, debut) - points[points.length - 1].rendement });

  // Opportunités : une part d'UC légèrement supérieure fait basculer sur une tranche nettement plus favorable.
  const opportunites = seuils.filter((s) => s.gainMarginal > 0.001).map((s) => ({
    partUC: s.partUC,
    message: `Passer à ${Math.round(s.partUC * 100)} % d'UC fait basculer sur la tranche « ${s.tranche} » : gain de ${(s.gainMarginal * 100).toFixed(2).replace('.', ',')} pt de rendement global.`,
  }));

  return { points, optimum, seuils, zonesDefavorables, opportunites };
}

function pointsRendement(points, partUC) {
  const pt = points.find((x) => Math.abs(x.partUC - partUC) < 1e-9);
  return pt ? pt.rendement : 0;
}
