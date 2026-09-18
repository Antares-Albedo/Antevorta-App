import type { Vec2 } from '../model/types'
import { add, mul } from '../geometry/vec'
import type { WallSegment } from '../geometry/walls'

export interface WallPiece {
  /** Polygone plan (repère du plan, y vers le nord). */
  poly: Vec2[]
  y0: number
  y1: number
}

/**
 * Découpe un segment de mur en morceaux pleins autour des ouvertures :
 * trumeaux pleine hauteur, allèges sous les fenêtres, linteaux au-dessus des ouvertures.
 * `cutHeight` permet la maquette ouverte (murs coupés).
 */
export function wallPieces(s: WallSegment, cutHeight?: number): WallPiece[] {
  const H = cutHeight !== undefined ? Math.min(s.height, cutHeight) : s.height
  const pieces: WallPiece[] = []
  const quad = (u0: number, u1: number): Vec2[] => {
    const a = add(s.a, mul(s.dir, u0))
    const b = add(s.a, mul(s.dir, u1))
    const outerA = u0 <= 1e-6 ? s.outerA : add(a, mul(s.normal, s.thickness))
    const outerB = u1 >= s.length - 1e-6 ? s.outerB : add(b, mul(s.normal, s.thickness))
    return [a, b, outerB, outerA]
  }
  // Fusionne les ouvertures qui se chevauchent le long du segment (propres + miroir).
  const spans: { start: number; end: number; low: number; high: number }[] = []
  for (const o of s.openings) {
    const low = Math.max(0, o.allege)
    const high = Math.min(H, o.allege + o.hauteur)
    if (high <= low + 1e-6) continue
    const last = spans[spans.length - 1]
    if (last && o.start < last.end - 1e-6) {
      last.end = Math.max(last.end, o.end)
      last.low = Math.min(last.low, low)
      last.high = Math.max(last.high, high)
    } else {
      spans.push({ start: Math.max(0, o.start), end: Math.min(s.length, o.end), low, high })
    }
  }
  let u = 0
  for (const sp of spans) {
    if (sp.start - u > 1e-4) pieces.push({ poly: quad(u, sp.start), y0: 0, y1: H })
    if (sp.low > 1e-4) pieces.push({ poly: quad(sp.start, sp.end), y0: 0, y1: sp.low })
    if (H - sp.high > 1e-4) pieces.push({ poly: quad(sp.start, sp.end), y0: sp.high, y1: H })
    u = sp.end
  }
  if (s.length - u > 1e-4) pieces.push({ poly: quad(u, s.length), y0: 0, y1: H })
  return pieces
}

/** Angle de rotation (radians, autour de Y) pour aligner l'axe X local sur la direction du mur. */
export function segmentYaw(s: WallSegment): number {
  return Math.atan2(s.dir.y, s.dir.x)
}
