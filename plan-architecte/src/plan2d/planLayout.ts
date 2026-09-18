import type { Project } from '../model/types'
import { bbox, type BBox } from '../geometry/polygon'
import { wallsOuterPoints, type WallSegment } from '../geometry/walls'

export type SheetFormat = 'A4' | 'A3'
export type ScaleChoice = 50 | 100 | 'auto'

export interface SheetLayout {
  format: SheetFormat
  /** Largeur et hauteur de la feuille en mm (paysage). */
  W: number
  H: number
  margin: number
  /** mm par mètre. */
  k: number
  scaleDenom: 50 | 100
  cartouche: { x: number; y: number; w: number; h: number }
  /** Décalage (mm) de l'origine du monde sur la feuille. */
  ox: number
  oy: number
  /** Emprise du dessin en mètres (murs + cotations). */
  extent: BBox
  outer: BBox
  fits: boolean
  hasRooms: boolean
}

export const SHEETS: Record<SheetFormat, { W: number; H: number }> = {
  A4: { W: 297, H: 210 },
  A3: { W: 420, H: 297 },
}

export const DIM_MARGIN = 1.9
export const CARTOUCHE_WIDTH = 96

export function cartoucheHeight(nbPieces: number): number {
  const rowH = nbPieces > 16 ? 3 : 3.6
  return 6 + 4 + 4 + 5 + nbPieces * rowH + 3 * 3.6 + 5 + 3
}

export function cartoucheRowHeight(nbPieces: number): number {
  return nbPieces > 16 ? 3 : 3.6
}

function regionFits(extentW: number, extentH: number, k: number, rw: number, rh: number): boolean {
  return extentW * k <= rw && extentH * k <= rh
}

export function computeSheetLayout(project: Project, walls: WallSegment[], format: SheetFormat, echelle: ScaleChoice): SheetLayout {
  const { W, H } = SHEETS[format]
  const margin = 10
  const cartW = CARTOUCHE_WIDTH
  const cartH = cartoucheHeight(project.pieces.length)
  const gap = 4
  const hasRooms = project.pieces.length > 0
  const pts = wallsOuterPoints(walls)
  const outer = pts.length ? bbox(pts) : { minX: -3, minY: -2, maxX: 3, maxY: 2 }
  const extent: BBox = {
    minX: outer.minX - DIM_MARGIN,
    minY: outer.minY - DIM_MARGIN,
    maxX: outer.maxX + DIM_MARGIN,
    maxY: outer.maxY + DIM_MARGIN,
  }
  const ew = extent.maxX - extent.minX
  const eh = extent.maxY - extent.minY

  const regions = [
    { x: margin, y: margin, w: W - 2 * margin - cartW - gap, h: H - 2 * margin },
    { x: margin, y: margin, w: W - 2 * margin, h: H - 2 * margin - cartH - gap },
  ]
  const candidates: (50 | 100)[] = echelle === 'auto' ? [50, 100] : [echelle]
  let chosen: { k: number; denom: 50 | 100; region: (typeof regions)[number]; fits: boolean } | null = null
  for (const denom of candidates) {
    const k = 1000 / denom
    for (const region of regions) {
      if (regionFits(ew, eh, k, region.w, region.h)) {
        chosen = { k, denom, region, fits: true }
        break
      }
    }
    if (chosen) break
  }
  if (!chosen) {
    const denom = candidates[candidates.length - 1]
    chosen = { k: 1000 / denom, denom, region: regions[1], fits: false }
  }
  const { k, denom, region, fits } = chosen
  const ox = region.x + (region.w - ew * k) / 2 - extent.minX * k
  const oy = region.y + (region.h - eh * k) / 2 + extent.maxY * k

  return {
    format,
    W,
    H,
    margin,
    k,
    scaleDenom: denom,
    cartouche: { x: W - margin - cartW, y: H - margin - cartH, w: cartW, h: cartH },
    ox,
    oy,
    extent,
    outer,
    fits,
    hasRooms,
  }
}
