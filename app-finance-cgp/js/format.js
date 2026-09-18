/**
 * format.js : typographie française des nombres et des dates.
 * Espace insécable pour les milliers, virgule décimale, unité systématique.
 */

const ESPACE = ' ';

/**
 * Montant en euros : 10 000 €, 10 000,50 €.
 * @param {number} v
 * @param {number} [decimales=0]
 */
export function formaterEuros(v, decimales = 0) {
  return `${formaterNombre(v, decimales)}${ESPACE}€`;
}

/**
 * Nombre avec séparateur de milliers et virgule décimale.
 * @param {number} v
 * @param {number} [decimales=0]
 */
export function formaterNombre(v, decimales = 0) {
  const n = Number(v) || 0;
  const signe = n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(decimales);
  const [entier, dec] = abs.split('.');
  const groupes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE);
  return `${signe}${groupes}${dec ? `,${dec}` : ''}`;
}

/**
 * Pourcentage : 3,25 %.
 * @param {number} fraction
 * @param {number} [decimales=2]
 */
export function formaterPourcentage(fraction, decimales = 2) {
  return `${formaterNombre((Number(fraction) || 0) * 100, decimales)}${ESPACE}%`;
}

/**
 * Date au format JJ/MM/AAAA.
 * @param {Date|string} d
 */
export function formaterDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const jj = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${date.getFullYear()}`;
}

/**
 * Durée en années : 8 ans, 1 an.
 * @param {number} n
 */
export function formaterAnnees(n) {
  return `${formaterNombre(n)} ${n > 1 ? 'ans' : 'an'}`;
}
