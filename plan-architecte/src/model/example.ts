import type { Opening, Project, Room } from './types'

const o = (p: Omit<Opening, 'id'> & { id: string }): Opening => p

/** T3 de démonstration : séjour en L, cuisine avec pan coupé, deux chambres, salle de bain, WC, entrée, dégagement. */
export function exampleProject(): Project {
  const now = new Date().toISOString()
  const pieces: Room[] = [
    {
      id: 'ex-entree',
      nom: 'Entrée',
      type: 'entree',
      forme: { kind: 'rect', longueur: 2.2, largeur: 2 },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [
        o({ id: 'ex-o1', type: 'porte', cote: 'sud', position: 0.6, largeur: 0.93, hauteur: 2.15, sens: 'int_droite' }),
        o({ id: 'ex-o1b', type: 'porte', cote: 'nord', position: 0.6, largeur: 0.83, hauteur: 2.04, sens: 'ext_gauche' }),
      ],
    },
    {
      id: 'ex-sejour',
      nom: 'Séjour',
      type: 'sejour',
      forme: {
        kind: 'polygone',
        cotes: [
          { longueur: 6, angle: 90 },
          { longueur: 3, angle: 90 },
          { longueur: 2.5, angle: 270 },
          { longueur: 1.5, angle: 90 },
          { longueur: 3.5, angle: 90 },
          { longueur: 4.5, angle: 90 },
        ],
      },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [
        o({ id: 'ex-o2', type: 'baie', cote: 0, position: 1.2, largeur: 2.4, hauteur: 2.15, sens: 'int_gauche' }),
        o({ id: 'ex-o3', type: 'fenetre', cote: 1, position: 0.8, largeur: 1.2, hauteur: 1.25, allege: 0.9, sens: 'int_gauche' }),
        o({ id: 'ex-o4', type: 'porte', cote: 4, position: 0.5, largeur: 0.83, hauteur: 2.04, sens: 'int_droite' }),
      ],
    },
    {
      id: 'ex-cuisine',
      nom: 'Cuisine',
      type: 'cuisine',
      forme: {
        kind: 'polygone',
        cotes: [
          { longueur: 3.5, angle: 90 },
          { longueur: 2, angle: 135 },
          { longueur: 1.41, angle: 135 },
          { longueur: 2.5, angle: 90 },
          { longueur: 3, angle: 90 },
        ],
      },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [
        o({ id: 'ex-o5', type: 'fenetre', cote: 0, position: 1.1, largeur: 1.2, hauteur: 1.25, allege: 1.1, sens: 'int_gauche' }),
        o({ id: 'ex-o6', type: 'porte', cote: 3, position: 0.8, largeur: 0.83, hauteur: 2.04, sens: 'int_gauche' }),
      ],
    },
    {
      id: 'ex-degagement',
      nom: 'Dégagement',
      type: 'degagement',
      forme: { kind: 'rect', longueur: 7.9, largeur: 1.1 },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [],
    },
    {
      id: 'ex-chambre1',
      nom: 'Chambre 1',
      type: 'chambre',
      forme: { kind: 'rect', longueur: 3.6, largeur: 3.2 },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [
        o({ id: 'ex-o7', type: 'porte', cote: 'sud', position: 0.3, largeur: 0.83, hauteur: 2.04, sens: 'int_droite' }),
        o({ id: 'ex-o8', type: 'fenetre', cote: 'nord', position: 1.2, largeur: 1.2, hauteur: 1.25, allege: 0.9, sens: 'int_gauche' }),
      ],
    },
    {
      id: 'ex-chambre2',
      nom: 'Chambre 2',
      type: 'chambre',
      forme: { kind: 'rect', longueur: 3.2, largeur: 3.2 },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [
        o({ id: 'ex-o9', type: 'porte', cote: 'sud', position: 0.3, largeur: 0.83, hauteur: 2.04, sens: 'int_droite' }),
        o({ id: 'ex-o10', type: 'fenetre', cote: 'nord', position: 1, largeur: 1.2, hauteur: 1.25, allege: 0.9, sens: 'int_gauche' }),
      ],
    },
    {
      id: 'ex-sdb',
      nom: 'Salle de bain',
      type: 'salle_de_bain',
      forme: { kind: 'rect', longueur: 2.4, largeur: 2.1 },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [
        o({ id: 'ex-o11', type: 'porte', cote: 'sud', position: 0.3, largeur: 0.73, hauteur: 2.04, sens: 'int_droite' }),
        o({ id: 'ex-o12', type: 'fenetre', cote: 'nord', position: 0.8, largeur: 0.8, hauteur: 0.8, allege: 1.3, sens: 'int_gauche' }),
      ],
    },
    {
      id: 'ex-wc',
      nom: 'WC',
      type: 'wc',
      forme: { kind: 'rect', longueur: 1.5, largeur: 1 },
      position: { x: 0, y: 0 },
      rotation: 0,
      ouvertures: [o({ id: 'ex-o13', type: 'porte', cote: 'sud', position: 0.3, largeur: 0.63, hauteur: 2.04, sens: 'ext_droite' })],
    },
  ]
  return {
    id: 'exemple-t3',
    version: 1,
    nom: 'Exemple T3',
    adresse: '12 rue des Lilas, 75000 Paris',
    hauteurPlafond: 2.5,
    epaisseurMurExterieur: 0.2,
    epaisseurMurInterieur: 0.1,
    agencement: 'auto',
    nord: 0,
    typesHorsHabitable: ['garage', 'cellier'],
    pieces,
    creeLe: now,
    modifieLe: now,
  }
}
