import { lazy, Suspense, useEffect, useMemo } from 'react'
import { GRID_STEP } from './model/defaults'
import { validateProject } from './geometry/validation'
import { computeWalls } from './geometry/walls'
import { computeSurfaces } from './surfaces/compute'
import { SurfacesPanel } from './surfaces/SurfacesPanel'
import { Plan2DView } from './plan2d/Plan2DView'
import { selectProjetCourant, useStore } from './store/useStore'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Guide } from './ui/Guide'
import { HelpDialog } from './ui/HelpDialog'
import { ProjectsDialog } from './ui/ProjectsDialog'
import { Sidebar } from './ui/Sidebar'
import { ToastContainer } from './ui/Toast'
import { TopBar } from './ui/TopBar'
import { Welcome } from './ui/Welcome'
import { useMediaQuery } from './ui/useMediaQuery'

const Viewer3D = lazy(() => import('./viewer3d/Viewer3D').then((m) => ({ default: m.Viewer3D })))

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable
}

function Workspace() {
  const project = useStore(selectProjetCourant)
  const ui = useStore((s) => s.ui)
  const setUI = useStore((s) => s.setUI)
  const annuler = useStore((s) => s.annuler)
  const retablir = useStore((s) => s.retablir)
  const supprimerPiece = useStore((s) => s.supprimerPiece)
  const selectionner = useStore((s) => s.selectionner)
  const deplacerPiece = useStore((s) => s.deplacerPiece)
  const grandEcran = useMediaQuery('(min-width: 1024px)')

  const walls = useMemo(() => (project ? computeWalls(project) : []), [project])
  const validation = useMemo(() => (project ? validateProject(project) : { rooms: {}, project: [], shapeValid: {} }), [project])
  const surfaces = useMemo(() => (project ? computeSurfaces(project, validation) : { pieces: [], habitable: 0, annexe: 0, basseHauteur: 0, totale: 0, nbInvalides: 0 }), [project, validation])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!project) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isEditable(e.target)) return
        e.preventDefault()
        annuler()
        return
      }
      if ((ctrl && e.key.toLowerCase() === 'y') || (ctrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
        if (isEditable(e.target)) return
        e.preventDefault()
        retablir()
        return
      }
      if (isEditable(e.target)) return
      if (ui.guideOuvert || ui.aideOuverte || ui.projetsOuvert) return
      const sel = ui.selectedRoomId ? project.pieces.find((r) => r.id === ui.selectedRoomId) : undefined
      if (e.key === 'Escape') {
        selectionner(null)
        return
      }
      if (!sel) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        supprimerPiece(sel.id)
        return
      }
      if (ui.modeVisite && ui.onglet !== 'plan') return
      const step = e.shiftKey ? 0.5 : GRID_STEP
      const moves: Record<string, [number, number]> = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }
      const m = moves[e.key]
      if (m) {
        e.preventDefault()
        deplacerPiece(sel.id, { x: Math.round((sel.position.x + m[0]) * 1000) / 1000, y: Math.round((sel.position.y + m[1]) * 1000) / 1000 }, `key-${sel.id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [project, ui, annuler, retablir, supprimerPiece, selectionner, deplacerPiece])

  if (!project) return <Welcome />

  const plan = (
    <ErrorBoundary zone="le plan 2D">
      <Plan2DView project={project} walls={walls} validation={validation} surfaces={surfaces} compact={ui.onglet === 'partage'} />
    </ErrorBoundary>
  )
  const vue3d = (
    <ErrorBoundary zone="la vue 3D">
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">Chargement de la 3D…</div>}>
        <Viewer3D project={project} walls={walls} compact={ui.onglet === 'partage'} />
      </Suspense>
    </ErrorBoundary>
  )

  return (
    <div className="flex h-full flex-col">
      <TopBar project={project} />
      <div className="flex min-h-0 flex-1">
        {ui.panneauSaisieOuvert && (
          <aside className="w-full shrink-0 border-r border-slate-300 bg-white sm:w-[360px] lg:w-[380px]" aria-label="Saisie des pièces">
            <ErrorBoundary zone="le panneau de saisie">
              <Sidebar project={project} validation={validation} surfaces={surfaces} />
            </ErrorBoundary>
          </aside>
        )}
        <main className={`min-w-0 flex-1 ${ui.panneauSaisieOuvert ? 'hidden sm:block' : ''}`} aria-label="Zone principale">
          {ui.onglet === 'plan' && plan}
          {ui.onglet === '3d' && vue3d}
          {ui.onglet === 'partage' && (
            <div className="grid h-full grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
              <div className="min-h-0 border-b border-slate-300 lg:border-b-0 lg:border-r">{plan}</div>
              <div className="min-h-0">{vue3d}</div>
            </div>
          )}
        </main>
        {ui.panneauSurfacesOuvert && grandEcran && (
          <aside className="w-[300px] shrink-0 border-l border-slate-300 bg-white" aria-label="Surfaces">
            <ErrorBoundary zone="le panneau des surfaces">
              <SurfacesPanel project={project} surfaces={surfaces} />
            </ErrorBoundary>
          </aside>
        )}
      </div>
      {/* Tablette et mobile : panneau des surfaces repliable en bas, le total reste toujours visible. */}
      {!grandEcran && (
      <div className="z-30 border-t border-slate-300 bg-white shadow-2xl" data-testid="surfaces-tablette">
        <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-sm" onClick={() => setUI({ panneauSurfacesOuvert: !ui.panneauSurfacesOuvert })} aria-expanded={ui.panneauSurfacesOuvert}>
          <span className="font-semibold text-slate-800">Surfaces</span>
          <span className="text-slate-700">
            Total au sol : <strong>{surfaces.totale.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</strong> {ui.panneauSurfacesOuvert ? '▼' : '▲'}
          </span>
        </button>
        {ui.panneauSurfacesOuvert && (
          <div className="h-[36vh] border-t border-slate-200">
            <SurfacesPanel project={project} surfaces={surfaces} />
          </div>
        )}
      </div>
      )}
    </div>
  )
}

export default function App() {
  const ui = useStore((s) => s.ui)
  const setUI = useStore((s) => s.setUI)
  const hasProject = useStore((s) => !!s.projetCourantId)

  useEffect(() => {
    if (hasProject && !ui.guideDesactive && !ui.guideOuvert && !sessionStorage.getItem('guide-montre')) {
      sessionStorage.setItem('guide-montre', '1')
      setUI({ guideOuvert: true })
    }
  }, [hasProject, ui.guideDesactive, ui.guideOuvert, setUI])

  return (
    <ErrorBoundary zone="l'application">
      <div className="h-full">
        <Workspace />
        {ui.projetsOuvert && <ProjectsDialog />}
        {ui.guideOuvert && hasProject && <Guide />}
        {ui.aideOuverte && <HelpDialog />}
        <ToastContainer />
      </div>
    </ErrorBoundary>
  )
}
