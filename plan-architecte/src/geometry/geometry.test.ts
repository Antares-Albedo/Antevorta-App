import { describe, expect, it } from 'vitest'
import { createProject, createRoom } from '../model/defaults'
import { exampleProject } from '../model/example'
import { formatNombre, formatSurface, parseNombre } from '../model/format'
import type { Room } from '../model/types'
import { exteriorChains } from './dimensions'
import { convertOpeningSide, sideIndex } from './openings'
import { autoLayout, snapRoomPosition } from './placement'
import {
  area,
  autoCloseSides,
  centroid,
  interiorPoint,
  isSelfIntersecting,
  pointInPolygon,
  polygonFromSides,
  polygonsOverlap,
  roomPolygon,
  shapePolygon,
  sideLength,
} from './polygon'
import { templateById } from './templates'
import { checkPolygonSides, validateProject, validateRoom } from './validation'
import { computeWalls } from './walls'
import { computeSurfaces } from '../surfaces/compute'

describe('polygonFromSides', () => {
  it('construit un rectangle fermé', () => {
    const b = polygonFromSides(templateById('rectangle'))
    expect(b.points).toHaveLength(4)
    expect(b.closureError).toBeCloseTo(0, 6)
    expect(area(b.points)).toBeCloseTo(12, 6)
  })

  it('construit une pièce en L', () => {
    const b = polygonFromSides(templateById('L'))
    expect(b.closureError).toBeCloseTo(0, 6)
    // 5x4 moins encoche 2x2
    expect(area(b.points)).toBeCloseTo(16, 6)
    expect(isSelfIntersecting(b.points)).toBe(false)
  })

  it('construit une pièce en T', () => {
    const b = polygonFromSides(templateById('T'))
    expect(b.closureError).toBeCloseTo(0, 6)
    // barre 6x2 + jambe 2x2
    expect(area(b.points)).toBeCloseTo(16, 6)
  })

  it('construit une pièce en U', () => {
    const b = polygonFromSides(templateById('U'))
    expect(b.closureError).toBeCloseTo(0, 6)
    // 6x4 moins creux 2x2
    expect(area(b.points)).toBeCloseTo(20, 6)
    const ip = interiorPoint(b.points)
    expect(pointInPolygon(ip, b.points)).toBe(true)
  })

  it('construit un pan coupé à 45°', () => {
    const b = polygonFromSides(templateById('pan_coupe'))
    expect(b.closureError).toBeLessThan(0.01)
    // 4x3 moins le triangle 1x1/2
    expect(area(b.points)).toBeCloseTo(11.5, 1)
  })

  it('détecte un polygone non fermé', () => {
    const sides = [
      { longueur: 4, angle: 90 },
      { longueur: 3, angle: 90 },
      { longueur: 4, angle: 90 },
      { longueur: 2, angle: 90 },
    ]
    const b = polygonFromSides(sides)
    expect(b.closureError).toBeCloseTo(1, 6)
    const check = checkPolygonSides(sides)
    expect(check.errors.some((e) => e.includes("n'est pas fermé"))).toBe(true)
    expect(check.canAutoClose).toBe(false)
  })

  it('propose la fermeture automatique sous 5 cm', () => {
    const sides = [
      { longueur: 4, angle: 90 },
      { longueur: 3, angle: 90 },
      { longueur: 4, angle: 90 },
      { longueur: 2.97, angle: 90 },
    ]
    const check = checkPolygonSides(sides)
    expect(check.closureError).toBeCloseTo(0.03, 6)
    expect(check.canAutoClose).toBe(true)
    const closed = autoCloseSides(sides)
    const b = polygonFromSides(closed)
    expect(b.closureError).toBeLessThan(0.006)
    expect(closed[3].longueur).toBeCloseTo(3, 2)
  })

  it('ferme automatiquement un polygone dont le dernier angle est légèrement faux', () => {
    const sides = [
      { longueur: 5, angle: 90 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 270 },
      { longueur: 2, angle: 90 },
      { longueur: 3, angle: 89.5 },
      { longueur: 4, angle: 90 },
    ]
    const closed = autoCloseSides(sides)
    expect(polygonFromSides(closed).closureError).toBeLessThan(0.01)
  })

  it('détecte les angles incohérents', () => {
    const sides = [
      { longueur: 4, angle: 90 },
      { longueur: 3, angle: 80 },
      { longueur: 4, angle: 90 },
      { longueur: 3, angle: 90 },
    ]
    const check = checkPolygonSides(sides)
    expect(check.angleSumError).toBeCloseTo(-10, 6)
    expect(check.errors.some((e) => e.includes('Angles incohérents'))).toBe(true)
  })

  it('détecte un polygone auto-intersecté', () => {
    const bow = [
      { x: 0, y: 0 },
      { x: 4, y: 3 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ]
    expect(isSelfIntersecting(bow)).toBe(true)
    const rect = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]
    expect(isSelfIntersecting(rect)).toBe(false)
  })
})

describe('surfaces', () => {
  it('calcule le centroïde et la surface du rectangle', () => {
    const poly = shapePolygon({ kind: 'rect', longueur: 4, largeur: 3 })
    expect(area(poly)).toBe(12)
    expect(centroid(poly)).toEqual({ x: 2, y: 1.5 })
  })

  it("place le libellé à l'intérieur d'une pièce en L", () => {
    const poly = polygonFromSides(templateById('L')).points
    const c = centroid(poly)
    const ip = interiorPoint(poly)
    expect(pointInPolygon(ip, poly)).toBe(true)
    expect(Number.isFinite(c.x)).toBe(true)
  })

  it("calcule les surfaces de l'exemple T3 à 0,01 m² près", () => {
    const p = exampleProject()
    const s = computeSurfaces(p)
    const byName = Object.fromEntries(s.pieces.map((r) => [r.nom, r.surface]))
    expect(byName['Séjour']).toBeCloseTo(23.25, 2)
    expect(byName['Cuisine']).toBeCloseTo(10, 1)
    expect(byName['Entrée']).toBeCloseTo(4.4, 2)
    expect(byName['Chambre 1']).toBeCloseTo(11.52, 2)
    expect(byName['WC']).toBeCloseTo(1.5, 2)
    const total = s.pieces.reduce((acc, r) => acc + r.surface, 0)
    expect(s.totale).toBeCloseTo(total, 2)
    expect(s.habitable).toBeCloseTo(total, 2)
    expect(s.annexe).toBe(0)
    expect(s.nbInvalides).toBe(0)
  })

  it('exclut garage, cellier et faible hauteur de la surface habitable', () => {
    const p = createProject('Test')
    const garage = createRoom('garage')
    const chambre = createRoom('chambre')
    const combles: Room = { ...createRoom('bureau'), hauteur: 1.7 }
    p.pieces = [garage, chambre, combles]
    const s = computeSurfaces(p)
    expect(s.annexe).toBeCloseTo(5.5 * 3, 2)
    expect(s.habitable).toBeCloseTo(3.5 * 3, 2)
    expect(s.basseHauteur).toBeCloseTo(3 * 2.5, 2)
    expect(s.totale).toBeCloseTo(16.5 + 10.5 + 7.5, 2)
  })

  it('exclut les formes invalides du total', () => {
    const p = createProject('Test')
    const bad: Room = {
      ...createRoom('chambre'),
      forme: {
        kind: 'polygone',
        cotes: [
          { longueur: 4, angle: 90 },
          { longueur: 3, angle: 90 },
          { longueur: 4, angle: 90 },
          { longueur: 2, angle: 90 },
        ],
      },
    }
    p.pieces = [bad]
    const s = computeSurfaces(p)
    expect(s.nbInvalides).toBe(1)
    expect(s.totale).toBe(0)
  })
})

describe('ouvertures', () => {
  it('convertit les côtés cardinaux en index', () => {
    const rect = { kind: 'rect' as const, longueur: 4, largeur: 3 }
    expect(sideIndex(rect, 'sud')).toBe(0)
    expect(sideIndex(rect, 'est')).toBe(1)
    expect(sideIndex(rect, 'nord')).toBe(2)
    expect(sideIndex(rect, 'ouest')).toBe(3)
    expect(sideLength(rect, 0)).toBe(4)
    expect(sideLength(rect, 1)).toBe(3)
    const poly = { kind: 'polygone' as const, cotes: templateById('L') }
    const o = { id: 'o', type: 'porte' as const, cote: 'nord' as const, position: 0, largeur: 0.8, hauteur: 2, sens: 'int_gauche' as const }
    expect(convertOpeningSide(o, rect, poly).cote).toBe(2)
    expect(convertOpeningSide({ ...o, cote: 5 }, poly, rect).cote).toBe('est')
  })

  it("signale une ouverture plus large que le côté et les chevauchements", () => {
    const p = createProject('Test')
    const wc = createRoom('wc') // 1,5 x 0,9
    wc.ouvertures = [
      { id: 'a', type: 'porte', cote: 'est', position: 0, largeur: 1.2, hauteur: 2.04, sens: 'int_gauche' },
      { id: 'b', type: 'porte', cote: 'sud', position: 0.2, largeur: 0.7, hauteur: 2.04, sens: 'int_gauche' },
      { id: 'c', type: 'porte', cote: 'sud', position: 0.6, largeur: 0.7, hauteur: 2.04, sens: 'int_gauche' },
    ]
    p.pieces = [wc]
    const { errors } = validateRoom(wc, p)
    expect(errors['ouvertures.0.largeur']).toMatch(/plus large que le côté/)
    expect(errors['ouvertures.2.position']).toMatch(/Chevauche/)
  })
})

describe('murs', () => {
  it('produit quatre murs extérieurs pour une pièce isolée', () => {
    const p = createProject('Test')
    p.pieces = [createRoom('chambre')]
    const walls = computeWalls(p)
    expect(walls).toHaveLength(4)
    expect(walls.every((w) => w.kind === 'exterieur' && Math.abs(w.thickness - 0.2) < 1e-9)).toBe(true)
    // Onglet à l'angle : le coin extérieur est décalé de 0,20 m sur les deux axes.
    const south = walls.find((w) => w.edgeIndex === 0)!
    expect(south.outerA.x).toBeCloseTo(-0.2, 6)
    expect(south.outerA.y).toBeCloseTo(-0.2, 6)
  })

  it('détecte un mur mitoyen entre deux pièces accolées et le partage en deux moitiés', () => {
    const p = createProject('Test')
    const a = createRoom('chambre') // 3,5 x 3
    const b = { ...createRoom('chambre'), id: 'b', position: { x: 3.6, y: 0 } }
    p.pieces = [a, b]
    p.agencement = 'manuel'
    const walls = computeWalls(p)
    const aEast = walls.filter((w) => w.roomId === a.id && w.edgeIndex === 1)
    expect(aEast).toHaveLength(1)
    expect(aEast[0].kind).toBe('mitoyen')
    expect(aEast[0].thickness).toBeCloseTo(0.05, 6)
    expect(aEast[0].partnerRoomId).toBe('b')
    const bWest = walls.filter((w) => w.roomId === 'b' && w.edgeIndex === 3)
    expect(bWest[0].kind).toBe('mitoyen')
  })

  it('reporte les ouvertures du voisin sur un mur mitoyen et découpe la partie non mitoyenne', () => {
    const p = createProject('Test')
    p.agencement = 'manuel'
    const a = createRoom('sejour') // 6 x 4,5
    const b = { ...createRoom('wc'), id: 'wc', position: { x: 1, y: 4.6 } } // 1,5 x 0,9 au-dessus du séjour
    b.ouvertures = [{ id: 'd', type: 'porte', cote: 'sud', position: 0.3, largeur: 0.7, hauteur: 2.04, sens: 'int_gauche' }]
    p.pieces = [a, b]
    const walls = computeWalls(p)
    const north = walls.filter((w) => w.roomId === a.id && w.edgeIndex === 2).sort((x, y) => x.a.x - y.a.x)
    // nord du séjour va de (6,4.5) vers (0,4.5) : extérieur, mitoyen, extérieur
    expect(north).toHaveLength(3)
    const shared = north.find((w) => w.kind === 'mitoyen')!
    expect(shared.length).toBeCloseTo(1.5, 6)
    expect(shared.openings).toHaveLength(1)
    expect(shared.openings[0].mirrored).toBe(true)
    expect(shared.openings[0].end - shared.openings[0].start).toBeCloseTo(0.7, 6)
    expect(shared.openings[0].fullThickness).toBeCloseTo(0.1, 6)
  })

  it('gère les murs biais du pan coupé', () => {
    const p = createProject('Test')
    const r = { ...createRoom('cuisine'), forme: { kind: 'polygone' as const, cotes: templateById('pan_coupe') } }
    p.pieces = [r]
    const walls = computeWalls(p)
    expect(walls).toHaveLength(5)
    const biais = walls.find((w) => w.edgeIndex === 2)!
    expect(Math.abs(biais.normal.x - Math.SQRT1_2)).toBeLessThan(1e-6)
    expect(Math.abs(biais.normal.y - Math.SQRT1_2)).toBeLessThan(1e-6)
    const chains = exteriorChains(walls)
    expect(chains).toHaveLength(4)
    const sud = chains.find((c) => c.side === 'sud')!
    expect(sud.coords[0]).toBeCloseTo(-0.2, 3)
    expect(sud.coords[sud.coords.length - 1]).toBeCloseTo(4.2, 3)
  })
})

describe('placement automatique', () => {
  it("ne produit aucun chevauchement sur l'exemple", () => {
    const p = exampleProject()
    const rooms = autoLayout(p)
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(polygonsOverlap(roomPolygon(rooms[i]), roomPolygon(rooms[j]))).toBe(false)
      }
    }
    const validation = validateProject({ ...p, pieces: rooms })
    expect(validation.project).toHaveLength(0)
  })

  it('crée des murs mitoyens entre pièces accolées', () => {
    const p = exampleProject()
    const laid = { ...p, pieces: autoLayout(p) }
    const walls = computeWalls(laid)
    expect(walls.some((w) => w.kind === 'mitoyen')).toBe(true)
  })

  it('aimante une pièce sur la grille et sur les voisins', () => {
    const a = createRoom('chambre')
    const b = { ...createRoom('chambre'), id: 'b' }
    const pos = snapRoomPosition(b, { x: 3.53, y: 0.02 }, [a], 0.1, 0.05)
    expect(pos.x).toBeCloseTo(3.6, 6)
    expect(pos.y).toBeCloseTo(0, 6)
  })

  it('signale les pièces qui se superposent en mode manuel', () => {
    const p = createProject('Test')
    p.agencement = 'manuel'
    p.pieces = [createRoom('chambre'), { ...createRoom('chambre'), id: 'b', position: { x: 1, y: 1 } }]
    const v = validateProject(p)
    expect(v.project).toHaveLength(1)
    expect(v.project[0].message).toMatch(/se superposent/)
  })
})

describe('format', () => {
  it('formate en français', () => {
    expect(formatNombre(1234.5)).toBe('1 234,50')
    expect(formatSurface(12)).toBe('12,00 m²')
    expect(parseNombre('3,50')).toBe(3.5)
    expect(parseNombre('1 200')).toBe(1200)
  })
})
