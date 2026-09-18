import type { OpeningSens, OpeningType, Project, Room, Vec2 } from '../model/types'
import { openingsOnSide } from './openings'
import { roomPolygon, signedArea } from './polygon'
import { add, dist, dot, leftNormal, lineIntersection, mul, norm, rightNormal, sub } from './vec'

export type WallKind = 'exterieur' | 'mitoyen'

export interface WallOpening {
  id: string
  ownerRoomId: string
  type: OpeningType
  /** Abscisses le long du segment, en mètres depuis `a`. */
  start: number
  end: number
  hauteur: number
  allege: number
  sens: OpeningSens
  /** Vrai si l'ouverture appartient à la pièce voisine (mur mitoyen). */
  mirrored: boolean
  /** Épaisseur totale du mur à cet endroit (les deux moitiés d'un mur mitoyen). */
  fullThickness: number
}

export interface WallSegment {
  id: string
  roomId: string
  edgeIndex: number
  a: Vec2
  b: Vec2
  dir: Vec2
  /** Normale extérieure unitaire. */
  normal: Vec2
  thickness: number
  kind: WallKind
  partnerRoomId?: string
  outerA: Vec2
  outerB: Vec2
  length: number
  height: number
  openings: WallOpening[]
}

interface EdgeInfo {
  roomId: string
  index: number
  a: Vec2
  b: Vec2
  dir: Vec2
  normal: Vec2
  length: number
}

interface Overlap {
  s0: number
  s1: number
  gap: number
  partner: EdgeInfo
}

interface Interval {
  s0: number
  s1: number
  thickness: number
  kind: WallKind
  partner?: EdgeInfo
  gap: number
}

const MIN_OVERLAP = 0.05
const MIN_HALF = 0.005

export function roomHeight(project: Project, room: Room): number {
  return room.hauteur ?? project.hauteurPlafond
}

function edgesOf(room: Room): EdgeInfo[] {
  const poly = roomPolygon(room)
  const ccw = signedArea(poly) >= 0
  const edges: EdgeInfo[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const d = norm(sub(b, a))
    edges.push({
      roomId: room.id,
      index: i,
      a,
      b,
      dir: d,
      normal: ccw ? rightNormal(d) : leftNormal(d),
      length: dist(a, b),
    })
  }
  return edges
}

function findOverlaps(e: EdgeInfo, others: EdgeInfo[], maxGap: number): Overlap[] {
  const res: Overlap[] = []
  for (const f of others) {
    if (f.roomId === e.roomId) continue
    if (dot(e.dir, f.dir) > -0.995) continue
    const gap = dot(sub(f.a, e.a), e.normal)
    if (gap < -0.01 || gap > maxGap) continue
    const sc = dot(sub(f.a, e.a), e.dir)
    const sd = dot(sub(f.b, e.a), e.dir)
    const lo = Math.max(0, Math.min(sc, sd))
    const hi = Math.min(e.length, Math.max(sc, sd))
    if (hi - lo < MIN_OVERLAP) continue
    res.push({ s0: lo, s1: hi, gap: Math.max(gap, 0), partner: f })
  }
  return res
}

function buildIntervals(e: EdgeInfo, overlaps: Overlap[], tExt: number): Interval[] {
  const cuts = new Set<number>([0, e.length])
  for (const o of overlaps) {
    cuts.add(o.s0)
    cuts.add(o.s1)
  }
  const sorted = [...cuts].sort((x, y) => x - y)
  const raw: Interval[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const s0 = sorted[i]
    const s1 = sorted[i + 1]
    if (s1 - s0 < 1e-6) continue
    const mid = (s0 + s1) / 2
    const o = overlaps.find((x) => x.s0 <= mid && mid <= x.s1)
    if (o) {
      raw.push({ s0, s1, thickness: Math.max(o.gap / 2, MIN_HALF), kind: 'mitoyen', partner: o.partner, gap: o.gap })
    } else {
      raw.push({ s0, s1, thickness: tExt, kind: 'exterieur', gap: tExt })
    }
  }
  const merged: Interval[] = []
  for (const it of raw) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.kind === it.kind &&
      Math.abs(last.thickness - it.thickness) < 1e-6 &&
      last.partner?.roomId === it.partner?.roomId &&
      last.partner?.index === it.partner?.index
    ) {
      last.s1 = it.s1
    } else {
      merged.push({ ...it })
    }
  }
  return merged
}

function miterPoint(vertex: Vec2, d1: Vec2, n1: Vec2, t1: number, d2: Vec2, n2: Vec2, t2: number, fallbackN: Vec2, fallbackT: number): Vec2 {
  const p1 = add(vertex, mul(n1, t1))
  const p2 = add(vertex, mul(n2, t2))
  const x = lineIntersection(p1, d1, p2, d2)
  const cap = 3 * Math.max(t1, t2) + 0.01
  if (!x || dist(x, vertex) > cap) return add(vertex, mul(fallbackN, fallbackT))
  return x
}

/**
 * Calcule les segments de murs de toutes les pièces : épaisseur extérieure par défaut,
 * demi-épaisseur de l'interstice quand un mur est mitoyen (les deux pièces construisent chacune leur moitié),
 * onglets propres aux angles, et ouvertures (propres et miroir du voisin).
 */
export function computeWalls(project: Project): WallSegment[] {
  const tExt = project.epaisseurMurExterieur
  const maxGap = Math.max(project.epaisseurMurExterieur, project.epaisseurMurInterieur) + 0.1
  const roomsById = new Map(project.pieces.map((r) => [r.id, r]))
  const allEdges: EdgeInfo[] = []
  const edgesByRoom = new Map<string, EdgeInfo[]>()
  for (const room of project.pieces) {
    const es = edgesOf(room)
    edgesByRoom.set(room.id, es)
    allEdges.push(...es)
  }

  // Intervalles par arête (pour connaître l'épaisseur voisine aux sommets).
  const intervalsByEdge = new Map<string, Interval[]>()
  const key = (roomId: string, i: number) => `${roomId}#${i}`
  for (const e of allEdges) {
    intervalsByEdge.set(key(e.roomId, e.index), buildIntervals(e, findOverlaps(e, allEdges, maxGap), tExt))
  }

  const segments: WallSegment[] = []
  for (const room of project.pieces) {
    const edges = edgesByRoom.get(room.id) ?? []
    const n = edges.length
    const height = roomHeight(project, room)
    for (const e of edges) {
      const intervals = intervalsByEdge.get(key(room.id, e.index)) ?? []
      const prev = edges[(e.index - 1 + n) % n]
      const next = edges[(e.index + 1) % n]
      const prevIntervals = intervalsByEdge.get(key(room.id, prev.index)) ?? []
      const nextIntervals = intervalsByEdge.get(key(room.id, next.index)) ?? []
      const tPrev = prevIntervals.length ? prevIntervals[prevIntervals.length - 1].thickness : tExt
      const tNext = nextIntervals.length ? nextIntervals[0].thickness : tExt

      for (let k = 0; k < intervals.length; k++) {
        const it = intervals[k]
        const a = add(e.a, mul(e.dir, it.s0))
        const b = add(e.a, mul(e.dir, it.s1))
        const outerA =
          it.s0 < 1e-6
            ? miterPoint(e.a, prev.dir, prev.normal, tPrev, e.dir, e.normal, it.thickness, e.normal, it.thickness)
            : add(a, mul(e.normal, it.thickness))
        const outerB =
          Math.abs(it.s1 - e.length) < 1e-6
            ? miterPoint(e.b, e.dir, e.normal, it.thickness, next.dir, next.normal, tNext, e.normal, it.thickness)
            : add(b, mul(e.normal, it.thickness))

        const openings: WallOpening[] = []
        const fullThickness = it.kind === 'mitoyen' ? Math.max(it.gap, 2 * MIN_HALF) : it.thickness
        for (const o of openingsOnSide(room, e.index)) {
          const start = Math.max(o.position, it.s0) - it.s0
          const end = Math.min(o.position + o.largeur, it.s1) - it.s0
          if (end - start < 0.01) continue
          openings.push({
            id: o.id,
            ownerRoomId: room.id,
            type: o.type,
            start,
            end,
            hauteur: o.hauteur,
            allege: o.type === 'fenetre' ? (o.allege ?? 0) : 0,
            sens: o.sens,
            mirrored: false,
            fullThickness,
          })
        }
        if (it.partner) {
          const partnerRoom = roomsById.get(it.partner.roomId)
          if (partnerRoom) {
            for (const o of openingsOnSide(partnerRoom, it.partner.index)) {
              const p0 = add(it.partner.a, mul(it.partner.dir, o.position))
              const p1 = add(it.partner.a, mul(it.partner.dir, o.position + o.largeur))
              const u0 = dot(sub(p0, e.a), e.dir)
              const u1 = dot(sub(p1, e.a), e.dir)
              const start = Math.max(Math.min(u0, u1), it.s0) - it.s0
              const end = Math.min(Math.max(u0, u1), it.s1) - it.s0
              if (end - start < 0.01) continue
              openings.push({
                id: o.id,
                ownerRoomId: partnerRoom.id,
                type: o.type,
                start,
                end,
                hauteur: o.hauteur,
                allege: o.type === 'fenetre' ? (o.allege ?? 0) : 0,
                sens: o.sens,
                mirrored: true,
                fullThickness,
              })
            }
          }
        }
        openings.sort((x, y) => x.start - y.start)

        segments.push({
          id: `${room.id}#${e.index}#${k}`,
          roomId: room.id,
          edgeIndex: e.index,
          a,
          b,
          dir: e.dir,
          normal: e.normal,
          thickness: it.thickness,
          kind: it.kind,
          partnerRoomId: it.partner?.roomId,
          outerA,
          outerB,
          length: it.s1 - it.s0,
          height,
          openings,
        })
      }
    }
  }
  return segments
}

/** Points du contour extérieur de tous les murs (pour l'emprise du plan). */
export function wallsOuterPoints(segments: WallSegment[]): Vec2[] {
  const pts: Vec2[] = []
  for (const s of segments) pts.push(s.outerA, s.outerB, s.a, s.b)
  return pts
}

/** Polygone plan (4 points) d'un segment de mur. */
export function segmentQuad(s: WallSegment): Vec2[] {
  return [s.a, s.b, s.outerB, s.outerA]
}

/** Segment de mur contenant l'abscisse `u` (depuis le début du côté) de l'arête donnée. */
export function segmentAt(segments: WallSegment[], roomId: string, edgeIndex: number, u: number, edgeStart: Vec2): WallSegment | undefined {
  const candidates = segments.filter((s) => s.roomId === roomId && s.edgeIndex === edgeIndex)
  for (const s of candidates) {
    const s0 = dot(sub(s.a, edgeStart), s.dir)
    if (u >= s0 - 1e-6 && u <= s0 + s.length + 1e-6) return s
  }
  return candidates[0]
}
