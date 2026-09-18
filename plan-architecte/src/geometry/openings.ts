import type { CardinalSide, Opening, Room, RoomShape } from '../model/types'
import { sideCount } from './polygon'

const CARDINAL_INDEX: Record<CardinalSide, number> = { sud: 0, est: 1, nord: 2, ouest: 3 }
const INDEX_CARDINAL: CardinalSide[] = ['sud', 'est', 'nord', 'ouest']

/** Index de côté (0..n-1) d'une ouverture, quelle que soit la forme. */
export function sideIndex(shape: RoomShape, cote: number | CardinalSide): number {
  const n = sideCount(shape)
  if (typeof cote === 'number') return ((Math.floor(cote) % n) + n) % n
  return CARDINAL_INDEX[cote] % n
}

export function cardinalOfIndex(i: number): CardinalSide {
  return INDEX_CARDINAL[((i % 4) + 4) % 4]
}

/** Convertit le côté d'une ouverture quand la forme change de mode (rectangle <-> polygone). */
export function convertOpeningSide(opening: Opening, from: RoomShape, to: RoomShape): Opening {
  const idx = sideIndex(from, opening.cote)
  if (to.kind === 'rect') return { ...opening, cote: cardinalOfIndex(idx) }
  return { ...opening, cote: Math.min(idx, sideCount(to) - 1) }
}

/** Ouvertures d'une pièce rattachées au côté i, triées par position. */
export function openingsOnSide(room: Room, i: number): Opening[] {
  return room.ouvertures.filter((o) => sideIndex(room.forme, o.cote) === i).sort((a, b) => a.position - b.position)
}
