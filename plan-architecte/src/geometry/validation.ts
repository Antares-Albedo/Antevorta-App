import { CLOSURE_TOLERANCE } from '../model/defaults'
import { formatCentimetres, formatMetres } from '../model/format'
import { roomSchema } from '../model/schema'
import type { Project, Room } from '../model/types'
import { sideIndex } from './openings'
import { angleSum, expectedAngleSum, isSelfIntersecting, polygonFromSides, polygonsOverlap, roomPolygon, sideLength } from './polygon'
import { roomHeight } from './walls'

export type FieldErrors = Record<string, string>

export interface ProjectIssue {
  roomIds: string[]
  message: string
}

export interface ValidationResult {
  rooms: Record<string, FieldErrors>
  project: ProjectIssue[]
  /** Vrai si la forme de la pièce est exploitable (fermée et non croisée). */
  shapeValid: Record<string, boolean>
}

export interface ShapeCheck {
  closureError: number
  canAutoClose: boolean
  angleSumError: number
  selfIntersecting: boolean
  errors: string[]
}

export function checkPolygonSides(sides: { longueur: number; angle: number }[]): ShapeCheck {
  const errors: string[] = []
  if (sides.length < 3) {
    return { closureError: Infinity, canAutoClose: false, angleSumError: 0, selfIntersecting: false, errors: ['Au moins 3 côtés sont nécessaires'] }
  }
  const build = polygonFromSides(sides)
  const sum = angleSum(sides)
  const angleSumError = sum - expectedAngleSum(sides.length)
  const selfIntersecting = isSelfIntersecting(build.points)
  const canAutoClose = build.closureError > 0.0005 && build.closureError <= CLOSURE_TOLERANCE
  if (Math.abs(angleSumError) > 0.5) {
    errors.push(
      `Angles incohérents : la somme vaut ${sum.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}° au lieu de ${expectedAngleSum(sides.length)}° attendus pour ${sides.length} côtés`,
    )
  }
  if (build.closureError > CLOSURE_TOLERANCE) {
    errors.push(`Le polygone n'est pas fermé : écart de ${formatCentimetres(build.closureError)} (maximum 5 cm)`)
  }
  if (selfIntersecting) errors.push('Les côtés se croisent : le contour doit être simple')
  return { closureError: build.closureError, canAutoClose, angleSumError, selfIntersecting, errors }
}

export function validateRoom(room: Room, project: Project): { errors: FieldErrors; shapeValid: boolean } {
  const errors: FieldErrors = {}
  const parsed = roomSchema.safeParse(room)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.')
      if (!(path in errors)) errors[path] = issue.message
    }
  }
  let shapeValid = true
  if (room.forme.kind === 'polygone') {
    const check = checkPolygonSides(room.forme.cotes)
    if (check.errors.length > 0) {
      errors['forme'] = check.errors.join('. ')
      if (check.closureError > CLOSURE_TOLERANCE || check.selfIntersecting) shapeValid = false
    }
  } else if (room.forme.longueur < 0.3 || room.forme.largeur < 0.3 || !Number.isFinite(room.forme.longueur) || !Number.isFinite(room.forme.largeur)) {
    shapeValid = false
  }

  const h = roomHeight(project, room)
  room.ouvertures.forEach((o, k) => {
    const idx = sideIndex(room.forme, o.cote)
    const L = sideLength(room.forme, idx)
    const prefix = `ouvertures.${k}`
    if (Number.isFinite(o.position) && Number.isFinite(o.largeur)) {
      if (o.largeur > L + 1e-6) {
        errors[`${prefix}.largeur`] ??= `L'ouverture est plus large que le côté (${formatMetres(L)})`
      } else if (o.position + o.largeur > L + 1e-6) {
        errors[`${prefix}.position`] ??= `L'ouverture dépasse la fin du côté (longueur ${formatMetres(L)})`
      }
    }
    if (o.hauteur + (o.type === 'fenetre' ? (o.allege ?? 0) : 0) > h + 1e-6) {
      errors[`${prefix}.hauteur`] ??= `Dépasse la hauteur sous plafond (${formatMetres(h)})`
    }
    room.ouvertures.forEach((p, j) => {
      if (j <= k) return
      if (sideIndex(room.forme, p.cote) !== idx) return
      const overlap = o.position < p.position + p.largeur && p.position < o.position + o.largeur
      if (overlap) {
        errors[`ouvertures.${j}.position`] ??= `Chevauche l'ouverture n°${k + 1} du même côté`
      }
    })
  })

  return { errors, shapeValid }
}

export function validateProject(project: Project): ValidationResult {
  const rooms: Record<string, FieldErrors> = {}
  const shapeValid: Record<string, boolean> = {}
  for (const r of project.pieces) {
    const res = validateRoom(r, project)
    rooms[r.id] = res.errors
    shapeValid[r.id] = res.shapeValid
  }
  const issues: ProjectIssue[] = []
  const polys = project.pieces.map((r) => ({ id: r.id, nom: r.nom, poly: shapeValid[r.id] ? roomPolygon(r) : [] }))
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (polys[i].poly.length < 3 || polys[j].poly.length < 3) continue
      if (polygonsOverlap(polys[i].poly, polys[j].poly)) {
        issues.push({ roomIds: [polys[i].id, polys[j].id], message: `« ${polys[i].nom} » et « ${polys[j].nom} » se superposent` })
      }
    }
  }
  return { rooms, project: issues, shapeValid }
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}
