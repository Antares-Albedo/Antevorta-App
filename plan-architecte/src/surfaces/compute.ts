import { HAUTEUR_MIN_HABITABLE } from '../model/defaults'
import type { Project, RoomType } from '../model/types'
import { area, shapePolygon } from '../geometry/polygon'
import { validateProject, type ValidationResult } from '../geometry/validation'
import { roomHeight } from '../geometry/walls'

export interface RoomSurface {
  id: string
  nom: string
  type: RoomType
  surface: number
  hauteur: number
  habitable: boolean
  annexe: boolean
  valide: boolean
}

export interface SurfacesSummary {
  pieces: RoomSurface[]
  habitable: number
  annexe: number
  /** Surfaces comptées ni en habitable ni en annexe (hauteur < 1,80 m). */
  basseHauteur: number
  totale: number
  nbInvalides: number
}

export function roomArea(room: Project['pieces'][number]): number {
  return Math.round(area(shapePolygon(room.forme)) * 10000) / 10000
}

export function computeSurfaces(project: Project, validation?: ValidationResult): SurfacesSummary {
  const val = validation ?? validateProject(project)
  const pieces: RoomSurface[] = project.pieces.map((r) => {
    const valide = val.shapeValid[r.id] !== false
    const surface = valide ? Math.round(roomArea(r) * 100) / 100 : 0
    const hauteur = roomHeight(project, r)
    const annexe = project.typesHorsHabitable.includes(r.type)
    const habitable = valide && !annexe && hauteur >= HAUTEUR_MIN_HABITABLE
    return { id: r.id, nom: r.nom, type: r.type, surface, hauteur, habitable, annexe, valide }
  })
  const r2 = (x: number) => Math.round(x * 100) / 100
  const habitable = r2(pieces.filter((p) => p.habitable).reduce((s, p) => s + p.surface, 0))
  const annexe = r2(pieces.filter((p) => p.valide && p.annexe).reduce((s, p) => s + p.surface, 0))
  const totale = r2(pieces.filter((p) => p.valide).reduce((s, p) => s + p.surface, 0))
  const basseHauteur = r2(totale - habitable - annexe)
  return { pieces, habitable, annexe, basseHauteur: Math.max(0, basseHauteur), totale, nbInvalides: pieces.filter((p) => !p.valide).length }
}
