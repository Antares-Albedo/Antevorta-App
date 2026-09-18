/**
 * aleatoire.js : générateur pseudo-aléatoire reproductible (mulberry32)
 * et tirage normal (Box-Muller). Utilisé par les modules stochastiques.
 */

/**
 * Crée un générateur uniforme sur [0, 1[ à partir d'une graine entière.
 * @param {number} graine
 * @returns {() => number}
 */
export function creerGenerateur(graine = 42) {
  let a = (graine >>> 0) || 1;
  return function suivant() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tirage d'une loi normale centrée réduite.
 * @param {() => number} uniforme
 * @returns {number}
 */
export function normale(uniforme) {
  let u = 0;
  let v = 0;
  while (u === 0) u = uniforme();
  while (v === 0) v = uniforme();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Percentile d'un tableau de nombres (interpolation linéaire).
 * @param {number[]} valeurs
 * @param {number} p entre 0 et 100
 */
export function percentile(valeurs, p) {
  if (!valeurs.length) return 0;
  const tri = [...valeurs].sort((a, b) => a - b);
  const rang = (p / 100) * (tri.length - 1);
  const bas = Math.floor(rang);
  const haut = Math.ceil(rang);
  return tri[bas] + (tri[haut] - tri[bas]) * (rang - bas);
}
