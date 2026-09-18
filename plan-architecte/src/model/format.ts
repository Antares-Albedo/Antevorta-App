/** Formatage français des nombres : espace pour les milliers, virgule décimale. */
export function formatNombre(value: number, decimales = 2): string {
  if (!Number.isFinite(value)) return '—'
  const fixed = Math.abs(value).toFixed(decimales)
  const [entier, dec] = fixed.split('.')
  const entierEspace = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const signe = value < 0 && Number(fixed) !== 0 ? '-' : ''
  return dec ? `${signe}${entierEspace},${dec}` : `${signe}${entierEspace}`
}

export function formatMetres(value: number): string {
  return `${formatNombre(value, 2)} m`
}

export function formatSurface(value: number): string {
  return `${formatNombre(value, 2)} m²`
}

export function formatCentimetres(value: number): string {
  return `${formatNombre(value * 100, 1)} cm`
}

export function formatDate(date: Date = new Date()): string {
  const jj = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${jj}/${mm}/${date.getFullYear()}`
}

/** Analyse une saisie française ("3,50", "3.5", "1 200") en nombre. */
export function parseNombre(text: string): number {
  const cleaned = text.replace(/\s/g, '').replace(',', '.')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN
  return Number(cleaned)
}

export function arrondi2(value: number): number {
  return Math.round(value * 100) / 100
}
