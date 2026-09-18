import type { Vec2 } from '../model/types'
import { bbox } from './polygon'
import { dot } from './vec'
import { wallsOuterPoints, type WallSegment } from './walls'

export type ChainSide = 'sud' | 'nord' | 'est' | 'ouest'

export interface DimensionChain {
  side: ChainSide
  /** Coordonnées (x pour sud/nord, y pour est/ouest) des points de rupture, triées. */
  coords: number[]
  /** Pour chaque coordonnée, position (sur l'axe perpendiculaire) de la face de mur la plus proche de la chaîne. */
  origins: number[]
  /** Position de la ligne de cote partielle sur l'axe perpendiculaire. */
  line: number
  /** Position de la ligne de cote totale. */
  totalLine: number
  total: [number, number]
}

const DIRS: Record<ChainSide, Vec2> = {
  sud: { x: 0, y: -1 },
  nord: { x: 0, y: 1 },
  est: { x: 1, y: 0 },
  ouest: { x: -1, y: 0 },
}

function uniqSorted(values: number[], tol = 0.02): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const x of sorted) {
    if (out.length === 0 || x - out[out.length - 1] > tol) out.push(x)
  }
  return out
}

/** Chaînes de cotes extérieures (partielles et totales) sur les quatre côtés du bâtiment. */
export function exteriorChains(segments: WallSegment[], offset = 0.7, totalOffset = 1.3): DimensionChain[] {
  const pts = wallsOuterPoints(segments)
  if (pts.length === 0) return []
  const box = bbox(pts)
  const chains: DimensionChain[] = []
  for (const side of ['sud', 'nord', 'est', 'ouest'] as ChainSide[]) {
    const dir = DIRS[side]
    const horizontal = side === 'sud' || side === 'nord'
    const samples: { c: number; p: number }[] = []
    for (const s of segments) {
      if (s.kind !== 'exterieur') continue
      if (dot(s.normal, dir) < 0.3) continue
      for (const pt of [s.outerA, s.outerB]) samples.push(horizontal ? { c: pt.x, p: pt.y } : { c: pt.y, p: pt.x })
    }
    // Extrémités de l'emprise, rattachées à la face la plus extérieure rencontrée.
    for (const pt of pts) {
      const c = horizontal ? pt.x : pt.y
      const p = horizontal ? pt.y : pt.x
      const isEnd = horizontal ? Math.abs(c - box.minX) < 1e-6 || Math.abs(c - box.maxX) < 1e-6 : Math.abs(c - box.minY) < 1e-6 || Math.abs(c - box.maxY) < 1e-6
      if (isEnd) samples.push({ c, p })
    }
    const coords = uniqSorted(samples.map((x) => x.c))
    const towardChain = side === 'sud' || side === 'ouest' ? -1 : 1
    const origins = coords.map((c) => {
      const near = samples.filter((x) => Math.abs(x.c - c) <= 0.02).map((x) => x.p)
      return towardChain < 0 ? Math.min(...near) : Math.max(...near)
    })
    const total: [number, number] = horizontal ? [box.minX, box.maxX] : [box.minY, box.maxY]
    let line: number
    let totalLine: number
    switch (side) {
      case 'sud':
        line = box.minY - offset
        totalLine = box.minY - totalOffset
        break
      case 'nord':
        line = box.maxY + offset
        totalLine = box.maxY + totalOffset
        break
      case 'est':
        line = box.maxX + offset
        totalLine = box.maxX + totalOffset
        break
      default:
        line = box.minX - offset
        totalLine = box.minX - totalOffset
    }
    chains.push({ side, coords, origins, line, totalLine, total })
  }
  return chains
}
