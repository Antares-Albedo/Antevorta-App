import type { PolySide, Room, RoomShape, Vec2 } from '../model/types'
import { add, cross, dist, dot, len, mul, norm, rotate, segmentsIntersect, sub, v } from './vec'

export interface PolygonBuild {
  /** Sommets successifs, le dernier étant le point d'arrivée théorique (n+1 points). */
  trace: Vec2[]
  /** Polygone fermé de n sommets (dernier sommet forcé sur le premier). */
  points: Vec2[]
  /** Écart de fermeture en mètres (distance entre l'arrivée et le départ). */
  closureError: number
}

/**
 * Construit un polygone à partir d'une liste de côtés (longueur + angle intérieur avec le côté suivant).
 * Le premier côté part de l'origine vers l'est ; le parcours est trigonométrique (intérieur à gauche).
 */
export function polygonFromSides(sides: PolySide[]): PolygonBuild {
  const trace: Vec2[] = [v(0, 0)]
  let dir = 0
  let p = v(0, 0)
  for (const side of sides) {
    const l = Number.isFinite(side.longueur) ? side.longueur : 0
    p = add(p, mul(v(Math.cos(dir), Math.sin(dir)), l))
    trace.push(p)
    const a = Number.isFinite(side.angle) ? side.angle : 90
    dir += ((180 - a) * Math.PI) / 180
  }
  const closureError = sides.length >= 2 ? dist(trace[trace.length - 1], trace[0]) : Infinity
  const points = trace.slice(0, -1)
  return { trace, points, closureError }
}

/** Somme attendue des angles intérieurs : (n - 2) x 180. */
export function expectedAngleSum(n: number): number {
  return (n - 2) * 180
}

export function angleSum(sides: PolySide[]): number {
  return sides.reduce((s, c) => s + (Number.isFinite(c.angle) ? c.angle : 0), 0)
}

/**
 * Ajuste le dernier côté (longueur) et les deux angles adjacents pour fermer exactement le polygone.
 * Retourne une nouvelle liste de côtés.
 */
export function autoCloseSides(sides: PolySide[]): PolySide[] {
  if (sides.length < 3) return sides
  const n = sides.length
  const { trace } = polygonFromSides(sides.slice(0, n - 1))
  const start = trace[0]
  const pPrev = trace[n - 2] // début de l'avant-dernier côté
  const pLast = trace[n - 1] // début du dernier côté
  const dPrev = norm(sub(pLast, pPrev))
  const dLast = sub(start, pLast)
  const l = len(dLast)
  if (l < 1e-6) return sides
  const dl = norm(dLast)
  const dFirst = v(1, 0)
  const anglePrev = interiorAngle(dPrev, dl)
  const angleLast = interiorAngle(dl, dFirst)
  const result = sides.map((s) => ({ ...s }))
  result[n - 2] = { ...result[n - 2], angle: Math.round(anglePrev * 100) / 100 }
  result[n - 1] = { longueur: Math.round(l * 100) / 100, angle: Math.round(angleLast * 100) / 100 }
  return result
}

/** Angle intérieur (en degrés) entre la direction d'arrivée d1 et la direction de départ d2 (virage à gauche = angle < 180). */
export function interiorAngle(d1: Vec2, d2: Vec2): number {
  const turn = Math.atan2(cross(d1, d2), dot(d1, d2)) // rad, positif = gauche
  let a = 180 - (turn * 180) / Math.PI
  if (a <= 0) a += 360
  if (a >= 360) a -= 360
  return a
}

/** Polygone local d'une forme (sens trigonométrique, origine au premier sommet). */
export function shapePolygon(shape: RoomShape): Vec2[] {
  if (shape.kind === 'rect') {
    const L = shape.longueur
    const W = shape.largeur
    return [v(0, 0), v(L, 0), v(L, W), v(0, W)]
  }
  return polygonFromSides(shape.cotes).points
}

/** Nombre de côtés d'une forme. */
export function sideCount(shape: RoomShape): number {
  return shape.kind === 'rect' ? 4 : shape.cotes.length
}

/** Longueur du côté i d'une forme. */
export function sideLength(shape: RoomShape, i: number): number {
  const poly = shapePolygon(shape)
  const n = poly.length
  if (n === 0) return 0
  return dist(poly[i % n], poly[(i + 1) % n])
}

/** Polygone d'une pièce dans le repère du plan (rotation puis translation). */
export function roomPolygon(room: Room): Vec2[] {
  return shapePolygon(room.forme).map((p) => add(rotate(p, room.rotation), room.position))
}

/** Aire signée par la formule du lacet (positive si trigonométrique). */
export function signedArea(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function area(poly: Vec2[]): number {
  return Math.abs(signedArea(poly))
}

export function perimeter(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length])
  return s
}

export function centroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly)
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bbox(points: Vec2[]): BBox {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]
    const pj = poly[j]
    const intersect = pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x
    if (intersect) inside = !inside
  }
  return inside
}

/** Distance signée d'un point au contour (positive à l'intérieur). */
export function distanceToEdges(pt: Vec2, poly: Vec2[]): number {
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    min = Math.min(min, pointSegmentDistance(pt, a, b))
  }
  return (pointInPolygon(pt, poly) ? 1 : -1) * min
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-12) return dist(p, a)
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  return dist(p, add(a, mul(ab, t)))
}

/**
 * Point intérieur « visuel » : le centroïde s'il est bien à l'intérieur, sinon le point le plus
 * éloigné des bords (recherche sur grille puis affinage), utile pour les formes en L ou en U.
 */
export function interiorPoint(poly: Vec2[]): Vec2 {
  if (poly.length < 3) return centroid(poly)
  const c = centroid(poly)
  const box = bbox(poly)
  const w = box.maxX - box.minX
  const h = box.maxY - box.minY
  const minDim = Math.min(w, h)
  if (distanceToEdges(c, poly) > Math.min(0.5, minDim * 0.25)) return c
  let best = c
  let bestD = distanceToEdges(c, poly)
  const N = 24
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = { x: box.minX + (w * i) / N, y: box.minY + (h * j) / N }
      const d = distanceToEdges(p, poly)
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
  }
  let step = Math.max(w, h) / N
  for (let k = 0; k < 6; k++) {
    step /= 2
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        const p = { x: best.x + dx * step, y: best.y + dy * step }
        const d = distanceToEdges(p, poly)
        if (d > bestD) {
          bestD = d
          best = p
        }
      }
    }
  }
  return best
}

/** Vrai si deux côtés non adjacents se croisent. */
export function isSelfIntersecting(poly: Vec2[]): boolean {
  const n = poly.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue
      const c = poly[j]
      const d = poly[(j + 1) % n]
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}

/** Test de chevauchement de deux polygones convexes ou non (croisement d'arêtes ou inclusion). */
export function polygonsOverlap(a: Vec2[], b: Vec2[], tol = 0.005): boolean {
  const ba = bbox(a)
  const bb = bbox(b)
  if (ba.maxX <= bb.minX + tol || bb.maxX <= ba.minX + tol || ba.maxY <= bb.minY + tol || bb.maxY <= ba.minY + tol) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  const ca = interiorPoint(a)
  const cb = interiorPoint(b)
  if (pointInPolygon(ca, b) || pointInPolygon(cb, a)) return true
  return false
}
