/** Types du modèle de données unique partagé par le plan 2D, la 3D et les surfaces. */

export type RoomType =
  | 'sejour'
  | 'cuisine'
  | 'chambre'
  | 'salle_de_bain'
  | 'wc'
  | 'entree'
  | 'degagement'
  | 'bureau'
  | 'cellier'
  | 'garage'

export interface RectShape {
  kind: 'rect'
  /** Longueur intérieure (axe x local), en mètres. */
  longueur: number
  /** Largeur intérieure (axe y local), en mètres. */
  largeur: number
}

export interface PolySide {
  /** Longueur du côté, en mètres. */
  longueur: number
  /** Angle intérieur, en degrés, entre ce côté et le côté suivant. */
  angle: number
}

export interface PolyShape {
  kind: 'polygone'
  cotes: PolySide[]
}

export type RoomShape = RectShape | PolyShape

export type OpeningType = 'porte' | 'porte_fenetre' | 'fenetre' | 'baie'

export type CardinalSide = 'nord' | 'sud' | 'est' | 'ouest'

/** Sens d'ouverture : vers l'intérieur ou l'extérieur de la pièce, charnière à gauche ou à droite (vue de l'intérieur). */
export type OpeningSens = 'int_gauche' | 'int_droite' | 'ext_gauche' | 'ext_droite'

export interface Opening {
  id: string
  type: OpeningType
  /** Index du côté (polygone) ou orientation (rectangle). */
  cote: number | CardinalSide
  /** Distance depuis le début du côté, en mètres. */
  position: number
  largeur: number
  hauteur: number
  /** Hauteur d'allège pour les fenêtres, en mètres. */
  allege?: number
  sens: OpeningSens
}

export interface Room {
  id: string
  nom: string
  type: RoomType
  forme: RoomShape
  /** Hauteur sous plafond propre à la pièce ; sinon celle du projet. */
  hauteur?: number
  position: { x: number; y: number }
  /** Rotation en degrés, sens trigonométrique. */
  rotation: number
  ouvertures: Opening[]
}

export type LayoutMode = 'auto' | 'manuel'

export interface Project {
  id: string
  version: 1
  nom: string
  adresse?: string
  hauteurPlafond: number
  epaisseurMurExterieur: number
  epaisseurMurInterieur: number
  agencement: LayoutMode
  /** Orientation du nord en degrés (0 = vers le haut du plan). */
  nord: number
  /** Types de pièces exclus de la surface habitable. */
  typesHorsHabitable: RoomType[]
  pieces: Room[]
  creeLe: string
  modifieLe: string
}

export type Vec2 = { x: number; y: number }
