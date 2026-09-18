import { z } from 'zod'

const MAX_M = 200

export const roomTypeSchema = z.enum([
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
])

export const longueurSchema = z
  .number({ error: 'Saisissez une longueur en mètres' })
  .min(0.3, 'La longueur minimale est de 0,30 m')
  .max(MAX_M, `La longueur maximale est de ${MAX_M} m`)

export const rectShapeSchema = z.object({
  kind: z.literal('rect'),
  longueur: longueurSchema,
  largeur: longueurSchema,
})

export const polySideSchema = z.object({
  longueur: z
    .number({ error: 'Saisissez une longueur en mètres' })
    .min(0.05, 'La longueur minimale est de 0,05 m')
    .max(MAX_M, `La longueur maximale est de ${MAX_M} m`),
  angle: z
    .number({ error: 'Saisissez un angle en degrés' })
    .gt(0, "L'angle doit être supérieur à 0°")
    .lt(360, "L'angle doit être inférieur à 360°"),
})

export const polyShapeSchema = z.object({
  kind: z.literal('polygone'),
  cotes: z.array(polySideSchema).min(3, 'Un polygone comporte au moins 3 côtés').max(40, 'Au plus 40 côtés'),
})

export const roomShapeSchema = z.discriminatedUnion('kind', [rectShapeSchema, polyShapeSchema])

export const openingSchema = z.object({
  id: z.string(),
  type: z.enum(['porte', 'porte_fenetre', 'fenetre', 'baie']),
  cote: z.union([z.number().int().min(0), z.enum(['nord', 'sud', 'est', 'ouest'])]),
  position: z.number({ error: 'Saisissez une position en mètres' }).min(0, 'La position ne peut pas être négative'),
  largeur: z
    .number({ error: 'Saisissez une largeur en mètres' })
    .min(0.4, 'La largeur minimale est de 0,40 m')
    .max(12, 'La largeur maximale est de 12 m'),
  hauteur: z
    .number({ error: 'Saisissez une hauteur en mètres' })
    .min(0.3, 'La hauteur minimale est de 0,30 m')
    .max(6, 'La hauteur maximale est de 6 m'),
  allege: z.number().min(0, "L'allège ne peut pas être négative").max(3, "L'allège est trop haute").optional(),
  sens: z.enum(['int_gauche', 'int_droite', 'ext_gauche', 'ext_droite']),
})

export const roomSchema = z.object({
  id: z.string(),
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(60, 'Nom trop long'),
  type: roomTypeSchema,
  forme: roomShapeSchema,
  hauteur: z.number().min(1, 'Hauteur minimale : 1 m').max(10, 'Hauteur maximale : 10 m').optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  rotation: z.number().min(-360).max(360),
  ouvertures: z.array(openingSchema),
})

export const projectSchema = z.object({
  id: z.string(),
  version: z.literal(1),
  nom: z.string().trim().min(1, 'Le nom du projet est obligatoire').max(80),
  adresse: z.string().max(200).optional(),
  hauteurPlafond: z.number().min(1.5, 'Hauteur minimale : 1,50 m').max(10, 'Hauteur maximale : 10 m'),
  epaisseurMurExterieur: z.number().min(0.05, 'Minimum 0,05 m').max(1, 'Maximum 1 m'),
  epaisseurMurInterieur: z.number().min(0.05, 'Minimum 0,05 m').max(0.6, 'Maximum 0,60 m'),
  agencement: z.enum(['auto', 'manuel']),
  nord: z.number(),
  typesHorsHabitable: z.array(roomTypeSchema),
  pieces: z.array(roomSchema),
  creeLe: z.string(),
  modifieLe: z.string(),
})

export type ProjectInput = z.input<typeof projectSchema>

/** Fichier d'export JSON : un projet ou une liste de projets. */
export const projectFileSchema = z.union([projectSchema, z.object({ projets: z.array(projectSchema) })])
