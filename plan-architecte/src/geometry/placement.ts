import type { Project, Room, RoomType, Vec2 } from '../model/types'
import { bbox, roomPolygon, shapePolygon } from './polygon'

const DAY: RoomType[] = ['entree', 'sejour', 'cuisine', 'bureau']
const NIGHT: RoomType[] = ['chambre']
const WATER: RoomType[] = ['salle_de_bain', 'wc']
const SERVICE: RoomType[] = ['cellier', 'garage']

function orderIndex(list: RoomType[], t: RoomType): number {
  const i = list.indexOf(t)
  return i === -1 ? 99 : i
}

interface Box {
  room: Room
  w: number
  h: number
  minX: number
  minY: number
}

function boxOf(room: Room): Box {
  const b = bbox(shapePolygon(room.forme))
  return { room, w: b.maxX - b.minX, h: b.maxY - b.minY, minX: b.minX, minY: b.minY }
}

function placeRow(boxes: Box[], y: number, gap: number, startX: number): { rooms: Room[]; width: number; height: number } {
  let x = startX
  let height = 0
  const rooms: Room[] = []
  for (const b of boxes) {
    rooms.push({ ...b.room, rotation: 0, position: { x: x - b.minX, y: y - b.minY } })
    x += b.w + gap
    height = Math.max(height, b.h)
  }
  return { rooms, width: Math.max(0, x - gap - startX), height }
}

/**
 * Agencement automatique : pièces de jour en bas (entrée, séjour, cuisine, bureau) suivies des locaux de service,
 * dégagement au centre s'il existe, chambres puis pièces d'eau en haut. Aucun chevauchement (emprises rectangulaires).
 */
export function autoLayout(project: Project): Room[] {
  const gap = project.epaisseurMurInterieur
  const boxes = project.pieces.map(boxOf)
  const day = boxes
    .filter((b) => DAY.includes(b.room.type))
    .sort((a, b) => orderIndex(DAY, a.room.type) - orderIndex(DAY, b.room.type))
  const service = boxes
    .filter((b) => SERVICE.includes(b.room.type))
    .sort((a, b) => orderIndex(SERVICE, a.room.type) - orderIndex(SERVICE, b.room.type))
  const night = boxes.filter((b) => NIGHT.includes(b.room.type))
  const water = boxes.filter((b) => WATER.includes(b.room.type))
  const corridors = boxes.filter((b) => b.room.type === 'degagement')

  let rowA = [...day, ...service]
  let rowB = [...night, ...water]
  if (rowA.length === 0) {
    rowA = rowB
    rowB = []
  }

  const result: Room[] = []
  const a = placeRow(rowA, 0, gap, 0)
  result.push(...a.rooms)
  let y = a.height + gap

  if (corridors.length > 0) {
    const c = placeRow(corridors, y, gap, 0)
    result.push(...c.rooms)
    y += c.height + gap
  }

  if (rowB.length > 0) {
    const b = placeRow(rowB, y, gap, 0)
    result.push(...b.rooms)
  }

  const byId = new Map(result.map((r) => [r.id, r]))
  return project.pieces.map((r) => byId.get(r.id) ?? r)
}

export function applyAutoLayout(project: Project): Project {
  if (project.agencement !== 'auto') return project
  return { ...project, pieces: autoLayout(project) }
}

export function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step
}

/**
 * Aimantation d'une pièce déplacée : grille puis murs voisins (accolement avec l'épaisseur de mur, ou alignement).
 */
export function snapRoomPosition(room: Room, target: Vec2, others: Room[], gap: number, gridStep: number, tolerance = 0.15): Vec2 {
  const moved = { ...room, position: target }
  const b = bbox(roomPolygon(moved))
  let dx = snapToGrid(target.x, gridStep) - target.x
  let dy = snapToGrid(target.y, gridStep) - target.y
  let bestDx = tolerance
  let bestDy = tolerance
  for (const o of others) {
    if (o.id === room.id) continue
    const ob = bbox(roomPolygon(o))
    const candidatesX = [ob.maxX + gap - b.minX, ob.minX - gap - b.maxX, ob.minX - b.minX, ob.maxX - b.maxX]
    const candidatesY = [ob.maxY + gap - b.minY, ob.minY - gap - b.maxY, ob.minY - b.minY, ob.maxY - b.maxY]
    for (const c of candidatesX) {
      if (Math.abs(c) < bestDx) {
        bestDx = Math.abs(c)
        dx = c
      }
    }
    for (const c of candidatesY) {
      if (Math.abs(c) < bestDy) {
        bestDy = Math.abs(c)
        dy = c
      }
    }
  }
  return { x: Math.round((target.x + dx) * 1000) / 1000, y: Math.round((target.y + dy) * 1000) / 1000 }
}
