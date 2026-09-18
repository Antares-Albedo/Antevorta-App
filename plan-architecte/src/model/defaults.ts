import type { OpeningSens, OpeningType, Project, Room, RoomShape, RoomType } from './types'

export const ROOM_TYPES: RoomType[] = [
  'sejour',
  'cuisine',
  'chambre',
  'salle_de_bain',
  'wc',
  'entree',
  'degagement',
  'bureau',
  'cellier',
  'garage',
]

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  sejour: 'Séjour',
  cuisine: 'Cuisine',
  chambre: 'Chambre',
  salle_de_bain: 'Salle de bain',
  wc: 'WC',
  entree: 'Entrée',
  degagement: 'Dégagement',
  bureau: 'Bureau',
  cellier: 'Cellier',
  garage: 'Garage',
}

export const OPENING_TYPE_LABELS: Record<OpeningType, string> = {
  porte: 'Porte',
  porte_fenetre: 'Porte-fenêtre',
  fenetre: 'Fenêtre',
  baie: 'Baie coulissante',
}

export const OPENING_SENS_LABELS: Record<OpeningSens, string> = {
  int_gauche: "Vers l'intérieur, charnière à gauche",
  int_droite: "Vers l'intérieur, charnière à droite",
  ext_gauche: "Vers l'extérieur, charnière à gauche",
  ext_droite: "Vers l'extérieur, charnière à droite",
}

export const CARDINAL_LABELS = { sud: 'Sud (bas)', est: 'Est (droite)', nord: 'Nord (haut)', ouest: 'Ouest (gauche)' } as const

/** Sols par type de pièce, pour la 3D. */
export const FLOOR_BY_TYPE: Record<RoomType, 'parquet' | 'carrelage' | 'beton'> = {
  sejour: 'parquet',
  chambre: 'parquet',
  bureau: 'parquet',
  degagement: 'parquet',
  cuisine: 'carrelage',
  salle_de_bain: 'carrelage',
  wc: 'carrelage',
  entree: 'carrelage',
  cellier: 'carrelage',
  garage: 'beton',
}

/** Couleurs de remplissage discrètes par type de pièce (plan 2D). */
export const ROOM_FILL_BY_TYPE: Record<RoomType, string> = {
  sejour: '#fdf6e3',
  cuisine: '#eef6fb',
  chambre: '#f3f0fa',
  salle_de_bain: '#e9f5f7',
  wc: '#e9f5f7',
  entree: '#f5f5f0',
  degagement: '#f7f7f7',
  bureau: '#f3f0fa',
  cellier: '#f0f0ec',
  garage: '#ececec',
}

/** Dimensions par défaut réalistes (longueur x largeur en mètres) selon le type. */
export const DEFAULT_DIMS: Record<RoomType, [number, number]> = {
  sejour: [6, 4.5],
  cuisine: [3.5, 3],
  chambre: [3.5, 3],
  salle_de_bain: [2.5, 2],
  wc: [1.5, 0.9],
  entree: [2.5, 1.8],
  degagement: [4, 1.1],
  bureau: [3, 2.5],
  cellier: [2, 1.5],
  garage: [5.5, 3],
}

/** Valeurs par défaut des ouvertures selon leur type (largeur, hauteur, allège). */
export const DEFAULT_OPENING: Record<OpeningType, { largeur: number; hauteur: number; allege?: number }> = {
  porte: { largeur: 0.83, hauteur: 2.04 },
  porte_fenetre: { largeur: 1.4, hauteur: 2.15 },
  fenetre: { largeur: 1.2, hauteur: 1.25, allege: 0.9 },
  baie: { largeur: 2.4, hauteur: 2.15 },
}

export const HAUTEUR_MIN_HABITABLE = 1.8
export const GRID_STEP = 0.05
export const CLOSURE_TOLERANCE = 0.05

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function defaultRoomName(type: RoomType, existing: Room[]): string {
  const base = ROOM_TYPE_LABELS[type]
  const count = existing.filter((r) => r.type === type).length
  return count === 0 ? base : `${base} ${count + 1}`
}

export function createRoom(type: RoomType, existing: Room[] = []): Room {
  const [longueur, largeur] = DEFAULT_DIMS[type]
  const forme: RoomShape = { kind: 'rect', longueur, largeur }
  return {
    id: newId(),
    nom: defaultRoomName(type, existing),
    type,
    forme,
    position: { x: 0, y: 0 },
    rotation: 0,
    ouvertures: [],
  }
}

export function createProject(nom = 'Nouveau projet'): Project {
  const now = new Date().toISOString()
  return {
    id: newId(),
    version: 1,
    nom,
    adresse: '',
    hauteurPlafond: 2.5,
    epaisseurMurExterieur: 0.2,
    epaisseurMurInterieur: 0.1,
    agencement: 'auto',
    nord: 0,
    typesHorsHabitable: ['garage', 'cellier'],
    pieces: [],
    creeLe: now,
    modifieLe: now,
  }
}
