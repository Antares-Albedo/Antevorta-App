import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createProject, createRoom, DEFAULT_OPENING, newId } from '../model/defaults'
import { exampleProject } from '../model/example'
import type { Opening, OpeningType, Project, Room, RoomType, Vec2 } from '../model/types'
import { applyAutoLayout } from '../geometry/placement'

export type Onglet = 'plan' | '3d' | 'partage'

export interface UIState {
  onglet: Onglet
  selectedRoomId: string | null
  afficherGrille: boolean
  afficherPlafonds: boolean
  maquetteOuverte: boolean
  rotationAuto: boolean
  hachures: boolean
  echelle: 50 | 100 | 'auto'
  format: 'A4' | 'A3'
  guideDesactive: boolean
  guideOuvert: boolean
  aideOuverte: boolean
  projetsOuvert: boolean
  panneauSurfacesOuvert: boolean
  panneauSaisieOuvert: boolean
  modeVisite: boolean
}

const defaultUI: UIState = {
  onglet: 'plan',
  selectedRoomId: null,
  afficherGrille: true,
  afficherPlafonds: false,
  maquetteOuverte: false,
  rotationAuto: false,
  hachures: false,
  echelle: 'auto',
  format: 'A4',
  guideDesactive: false,
  guideOuvert: false,
  aideOuverte: false,
  projetsOuvert: false,
  panneauSurfacesOuvert: true,
  panneauSaisieOuvert: true,
  modeVisite: false,
}

const HISTORY_LIMIT = 100
const COALESCE_MS = 700

export interface StoreState {
  projets: Record<string, Project>
  projetCourantId: string | null
  ui: UIState
  past: Project[]
  future: Project[]
  lastEditKey: string | null
  lastEditTime: number

  projetCourant: () => Project | null
  setUI: (patch: Partial<UIState>) => void
  selectionner: (id: string | null) => void

  creerProjet: (nom?: string) => string
  ouvrirProjet: (id: string) => void
  fermerProjet: () => void
  chargerExemple: () => void
  renommerProjet: (id: string, nom: string) => void
  dupliquerProjet: (id: string) => void
  supprimerProjet: (id: string) => void
  importerProjets: (projets: Project[]) => string | null
  remplacerProjetCourant: (projet: Project) => void

  modifierProjet: (fn: (p: Project) => Project, coalesceKey?: string) => void
  modifierParametres: (patch: Partial<Project>, coalesceKey?: string) => void
  ajouterPiece: (type: RoomType) => string
  modifierPiece: (id: string, fn: (r: Room) => Room, coalesceKey?: string) => void
  supprimerPiece: (id: string) => void
  dupliquerPiece: (id: string) => void
  deplacerPiece: (id: string, position: Vec2, coalesceKey?: string) => void
  reordonnerPiece: (id: string, direction: -1 | 1) => void
  ajouterOuverture: (roomId: string, type: OpeningType) => string
  modifierOuverture: (roomId: string, id: string, fn: (o: Opening) => Opening, coalesceKey?: string) => void
  supprimerOuverture: (roomId: string, id: string) => void

  annuler: () => void
  retablir: () => void
  peutAnnuler: () => boolean
  peutRetablir: () => boolean
}

function touch(p: Project): Project {
  return { ...p, modifieLe: new Date().toISOString() }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      projets: {},
      projetCourantId: null,
      ui: defaultUI,
      past: [],
      future: [],
      lastEditKey: null,
      lastEditTime: 0,

      projetCourant: () => {
        const { projets, projetCourantId } = get()
        return projetCourantId ? (projets[projetCourantId] ?? null) : null
      },
      setUI: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
      selectionner: (id) => set((s) => ({ ui: { ...s.ui, selectedRoomId: id } })),

      creerProjet: (nom) => {
        const p = createProject(nom)
        set((s) => ({
          projets: { ...s.projets, [p.id]: p },
          projetCourantId: p.id,
          past: [],
          future: [],
          ui: { ...s.ui, selectedRoomId: null, projetsOuvert: false },
        }))
        return p.id
      },
      ouvrirProjet: (id) =>
        set((s) => (s.projets[id] ? { projetCourantId: id, past: [], future: [], ui: { ...s.ui, selectedRoomId: null, projetsOuvert: false } } : {})),
      fermerProjet: () => set((s) => ({ projetCourantId: null, past: [], future: [], ui: { ...s.ui, selectedRoomId: null } })),
      chargerExemple: () => {
        const ex = applyAutoLayout({ ...exampleProject(), id: newId() })
        set((s) => ({
          projets: { ...s.projets, [ex.id]: ex },
          projetCourantId: ex.id,
          past: [],
          future: [],
          ui: { ...s.ui, selectedRoomId: null, projetsOuvert: false },
        }))
      },
      renommerProjet: (id, nom) =>
        set((s) => (s.projets[id] ? { projets: { ...s.projets, [id]: touch({ ...s.projets[id], nom }) } } : {})),
      dupliquerProjet: (id) =>
        set((s) => {
          const src = s.projets[id]
          if (!src) return {}
          const copy: Project = touch({ ...structuredClone(src), id: newId(), nom: `${src.nom} (copie)`, creeLe: new Date().toISOString() })
          return { projets: { ...s.projets, [copy.id]: copy } }
        }),
      supprimerProjet: (id) =>
        set((s) => {
          const projets = { ...s.projets }
          delete projets[id]
          const projetCourantId = s.projetCourantId === id ? null : s.projetCourantId
          return { projets, projetCourantId, past: s.projetCourantId === id ? [] : s.past, future: s.projetCourantId === id ? [] : s.future }
        }),
      importerProjets: (projets) => {
        if (projets.length === 0) return null
        const imported = projets.map((p) => applyAutoLayout(touch({ ...p, id: get().projets[p.id] ? newId() : p.id })))
        set((s) => {
          const map = { ...s.projets }
          for (const p of imported) map[p.id] = p
          return { projets: map, projetCourantId: imported[0].id, past: [], future: [], ui: { ...s.ui, selectedRoomId: null, projetsOuvert: false } }
        })
        return imported[0].id
      },
      remplacerProjetCourant: (projet) =>
        set((s) => (s.projetCourantId ? { projets: { ...s.projets, [s.projetCourantId]: { ...projet, id: s.projetCourantId } } } : {})),

      modifierProjet: (fn, coalesceKey) => {
        const s = get()
        const id = s.projetCourantId
        if (!id) return
        const current = s.projets[id]
        if (!current) return
        const next = applyAutoLayout(touch(fn(current)))
        const now = Date.now()
        const coalesce = coalesceKey !== undefined && coalesceKey === s.lastEditKey && now - s.lastEditTime < COALESCE_MS
        const past = coalesce ? s.past : [...s.past, current].slice(-HISTORY_LIMIT)
        set({
          projets: { ...s.projets, [id]: next },
          past,
          future: [],
          lastEditKey: coalesceKey ?? null,
          lastEditTime: now,
        })
      },
      modifierParametres: (patch, coalesceKey) => get().modifierProjet((p) => ({ ...p, ...patch }), coalesceKey),
      ajouterPiece: (type) => {
        const room = createRoom(type, get().projetCourant()?.pieces ?? [])
        get().modifierProjet((p) => {
          const others = p.pieces
          const maxX = others.reduce((m, r) => Math.max(m, r.position.x + 8), 0)
          return { ...p, pieces: [...others, { ...room, position: { x: p.agencement === 'manuel' ? maxX : 0, y: 0 } }] }
        })
        set((s) => ({ ui: { ...s.ui, selectedRoomId: room.id } }))
        return room.id
      },
      modifierPiece: (id, fn, coalesceKey) =>
        get().modifierProjet((p) => ({ ...p, pieces: p.pieces.map((r) => (r.id === id ? fn(r) : r)) }), coalesceKey),
      supprimerPiece: (id) => {
        get().modifierProjet((p) => ({ ...p, pieces: p.pieces.filter((r) => r.id !== id) }))
        set((s) => (s.ui.selectedRoomId === id ? { ui: { ...s.ui, selectedRoomId: null } } : {}))
      },
      dupliquerPiece: (id) => {
        const copyId = newId()
        get().modifierProjet((p) => {
          const src = p.pieces.find((r) => r.id === id)
          if (!src) return p
          const copy: Room = {
            ...structuredClone(src),
            id: copyId,
            nom: `${src.nom} (copie)`,
            position: { x: src.position.x + 1, y: src.position.y - 1 },
            ouvertures: src.ouvertures.map((o) => ({ ...o, id: newId() })),
          }
          return { ...p, pieces: [...p.pieces, copy] }
        })
        set((s) => ({ ui: { ...s.ui, selectedRoomId: copyId } }))
      },
      deplacerPiece: (id, position, coalesceKey) =>
        get().modifierProjet(
          (p) => ({ ...p, agencement: 'manuel', pieces: p.pieces.map((r) => (r.id === id ? { ...r, position } : r)) }),
          coalesceKey,
        ),
      reordonnerPiece: (id, direction) =>
        get().modifierProjet((p) => {
          const i = p.pieces.findIndex((r) => r.id === id)
          const j = i + direction
          if (i < 0 || j < 0 || j >= p.pieces.length) return p
          const pieces = [...p.pieces]
          ;[pieces[i], pieces[j]] = [pieces[j], pieces[i]]
          return { ...p, pieces }
        }),
      ajouterOuverture: (roomId, type) => {
        const id = newId()
        get().modifierPiece(roomId, (r) => {
          const d = DEFAULT_OPENING[type]
          const opening: Opening = {
            id,
            type,
            cote: r.forme.kind === 'rect' ? 'sud' : 0,
            position: 0.2,
            largeur: d.largeur,
            hauteur: d.hauteur,
            allege: d.allege,
            sens: 'int_gauche',
          }
          return { ...r, ouvertures: [...r.ouvertures, opening] }
        })
        return id
      },
      modifierOuverture: (roomId, id, fn, coalesceKey) =>
        get().modifierPiece(roomId, (r) => ({ ...r, ouvertures: r.ouvertures.map((o) => (o.id === id ? fn(o) : o)) }), coalesceKey),
      supprimerOuverture: (roomId, id) => get().modifierPiece(roomId, (r) => ({ ...r, ouvertures: r.ouvertures.filter((o) => o.id !== id) })),

      annuler: () => {
        const s = get()
        const id = s.projetCourantId
        if (!id || s.past.length === 0) return
        const previous = s.past[s.past.length - 1]
        const current = s.projets[id]
        set({
          projets: { ...s.projets, [id]: previous },
          past: s.past.slice(0, -1),
          future: [current, ...s.future].slice(0, HISTORY_LIMIT),
          lastEditKey: null,
        })
      },
      retablir: () => {
        const s = get()
        const id = s.projetCourantId
        if (!id || s.future.length === 0) return
        const next = s.future[0]
        const current = s.projets[id]
        set({
          projets: { ...s.projets, [id]: next },
          past: [...s.past, current].slice(-HISTORY_LIMIT),
          future: s.future.slice(1),
          lastEditKey: null,
        })
      },
      peutAnnuler: () => get().past.length > 0,
      peutRetablir: () => get().future.length > 0,
    }),
    {
      name: 'plan-architecte-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ projets: s.projets, projetCourantId: s.projetCourantId, ui: { ...s.ui, guideOuvert: false, aideOuverte: false, projetsOuvert: false, modeVisite: false, rotationAuto: false } }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoreState>
        const premierLancement = !p.ui
        const petitEcran = typeof window !== 'undefined' && window.innerWidth < 1024
        return { ...current, ...p, ui: { ...defaultUI, ...(premierLancement && petitEcran ? { panneauSurfacesOuvert: false } : {}), ...(p.ui ?? {}) } }
      },
    },
  ),
)

/** Sélecteur du projet courant (mémorisé par référence). */
export const selectProjetCourant = (s: StoreState): Project | null => (s.projetCourantId ? (s.projets[s.projetCourantId] ?? null) : null)
