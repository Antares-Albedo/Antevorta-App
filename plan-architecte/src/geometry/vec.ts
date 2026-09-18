import type { Vec2 } from '../model/types'

export const EPS = 1e-9

export const v = (x: number, y: number): Vec2 => ({ x, y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))
export const norm = (a: Vec2): Vec2 => {
  const l = len(a)
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}
/** Normale à droite (extérieure pour un polygone parcouru dans le sens trigonométrique). */
export const rightNormal = (d: Vec2): Vec2 => ({ x: d.y, y: -d.x })
/** Normale à gauche (intérieure pour un polygone trigonométrique). */
export const leftNormal = (d: Vec2): Vec2 => ({ x: -d.y, y: d.x })
export const rotate = (a: Vec2, deg: number): Vec2 => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }
}
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const eq = (a: Vec2, b: Vec2, tol = 1e-6): boolean => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol

/** Intersection de deux droites (p + t·d) ; null si parallèles. */
export function lineIntersection(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const denom = cross(d1, d2)
  if (Math.abs(denom) < 1e-9) return null
  const t = cross(sub(p2, p1), d2) / denom
  return add(p1, mul(d1, t))
}

/** Intersection stricte de deux segments [a,b] et [c,d] (hors extrémités communes). */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(d, c), sub(a, c))
  const d2 = cross(sub(d, c), sub(b, c))
  const d3 = cross(sub(b, a), sub(c, a))
  const d4 = cross(sub(b, a), sub(d, a))
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true
  }
  return false
}

export function round(value: number, decimals = 2): number {
  const k = 10 ** decimals
  return Math.round(value * k) / k
}
