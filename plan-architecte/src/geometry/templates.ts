import type { PolySide } from '../model/types'

export interface PolygonTemplate {
  id: 'rectangle' | 'L' | 'T' | 'U' | 'pan_coupe'
  label: string
  description: string
  cotes: PolySide[]
}

const r2 = (x: number) => Math.round(x * 100) / 100

export const POLYGON_TEMPLATES: PolygonTemplate[] = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    description: '4 côtés à angle droit',
    cotes: [
      { longueur: 4, angle: 90 },
      { longueur: 3, angle: 90 },
      { longueur: 4, angle: 90 },
      { longueur: 3, angle: 90 },
    ],
  },
  {
    id: 'L',
    label: 'Pièce en L',
    description: '6 côtés, un angle rentrant',
    cotes: [
      { longueur: 5, angle: 90 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 270 },
      { longueur: 2, angle: 90 },
      { longueur: 3, angle: 90 },
      { longueur: 4, angle: 90 },
    ],
  },
  {
    id: 'T',
    label: 'Pièce en T',
    description: '8 côtés, deux angles rentrants',
    cotes: [
      { longueur: 6, angle: 90 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 270 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 270 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 90 },
    ],
  },
  {
    id: 'U',
    label: 'Pièce en U',
    description: '8 côtés, deux angles rentrants',
    cotes: [
      { longueur: 6, angle: 90 },
      { longueur: 4, angle: 90 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 270 },
      { longueur: 2, angle: 270 },
      { longueur: 2, angle: 90 },
      { longueur: 2, angle: 90 },
      { longueur: 4, angle: 90 },
    ],
  },
  {
    id: 'pan_coupe',
    label: 'Pan coupé à 45°',
    description: 'Rectangle avec un angle coupé',
    cotes: [
      { longueur: 4, angle: 90 },
      { longueur: 2, angle: 135 },
      { longueur: r2(Math.SQRT2), angle: 135 },
      { longueur: 3, angle: 90 },
      { longueur: 3, angle: 90 },
    ],
  },
]

export function templateById(id: PolygonTemplate['id']): PolySide[] {
  const t = POLYGON_TEMPLATES.find((x) => x.id === id) ?? POLYGON_TEMPLATES[0]
  return t.cotes.map((c) => ({ ...c }))
}
