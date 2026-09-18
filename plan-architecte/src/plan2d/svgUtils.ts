import type { Vec2 } from '../model/types'

/** Conversion du repère plan (y vers le nord) vers le repère SVG (y vers le bas). */
export const sx = (p: Vec2): number => p.x
export const sy = (p: Vec2): number => -p.y

export function pathFromPoints(points: Vec2[], close = true): string {
  if (points.length === 0) return ''
  const parts = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)} ${(-p.y).toFixed(4)}`)
  return parts.join(' ') + (close ? ' Z' : '')
}

/** Angle SVG (degrés) d'un vecteur du plan, borné pour un texte lisible. */
export function readableAngle(d: Vec2): number {
  let deg = (-Math.atan2(d.y, d.x) * 180) / Math.PI
  if (deg > 90) deg -= 180
  if (deg < -90) deg += 180
  return deg
}

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55
}

/** Points d'un arc autour de `center`, du point `from` vers le point `to` par le plus court chemin. */
export function arcPoints(center: Vec2, from: Vec2, to: Vec2, radius: number, steps = 14): Vec2[] {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x)
  const a1 = Math.atan2(to.y - center.y, to.x - center.x)
  let delta = a1 - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const pts: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (delta * i) / steps
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
  }
  return pts
}
