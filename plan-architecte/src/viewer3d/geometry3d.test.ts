import { describe, expect, it } from 'vitest'
import { createProject, createRoom } from '../model/defaults'
import { computeWalls } from '../geometry/walls'
import { wallPieces } from './geometry3d'

describe('wallPieces', () => {
  it('découpe une fenêtre en allège, linteau et trumeaux', () => {
    const p = createProject('t')
    const r = createRoom('chambre')
    r.ouvertures = [{ id: 'f', type: 'fenetre', cote: 'sud', position: 1, largeur: 1.2, hauteur: 1.25, allege: 0.9, sens: 'int_gauche' }]
    p.pieces = [r]
    const south = computeWalls(p).find((w) => w.edgeIndex === 0)!
    const pieces = wallPieces(south)
    expect(pieces).toHaveLength(4)
    const allege = pieces.find((x) => x.y0 === 0 && Math.abs(x.y1 - 0.9) < 1e-9)
    const linteau = pieces.find((x) => Math.abs(x.y0 - 2.15) < 1e-9 && Math.abs(x.y1 - 2.5) < 1e-9)
    expect(allege).toBeDefined()
    expect(linteau).toBeDefined()
  })

  it('coupe les murs à la hauteur de la maquette ouverte', () => {
    const p = createProject('t')
    const r = createRoom('chambre')
    r.ouvertures = [{ id: 'd', type: 'porte', cote: 'sud', position: 1, largeur: 0.83, hauteur: 2.04, sens: 'int_gauche' }]
    p.pieces = [r]
    const south = computeWalls(p).find((w) => w.edgeIndex === 0)!
    const pieces = wallPieces(south, 1.2)
    expect(pieces.every((x) => x.y1 <= 1.2)).toBe(true)
    expect(pieces).toHaveLength(2)
  })
})
