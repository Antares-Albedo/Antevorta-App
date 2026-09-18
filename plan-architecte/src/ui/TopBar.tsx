import { useEffect, useRef, useState } from 'react'
import type { Project } from '../model/types'
import { useStore, type Onglet } from '../store/useStore'
import { export3dCapture, exportJson, exportPdf, exportPng, exportSvg } from '../export/exporters'
import { capture3D } from '../viewer3d/capture'
import { useToast } from './Toast'

interface Props {
  project: Project
}

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'plan', label: 'Plan 2D' },
  { id: '3d', label: 'Vue 3D' },
  { id: 'partage', label: 'Vue partagée' },
]

export function TopBar({ project }: Props) {
  const ui = useStore((s) => s.ui)
  const setUI = useStore((s) => s.setUI)
  const annuler = useStore((s) => s.annuler)
  const retablir = useStore((s) => s.retablir)
  const peutAnnuler = useStore((s) => s.past.length > 0)
  const peutRetablir = useStore((s) => s.future.length > 0)
  const toast = useToast((s) => s.push)
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOuvert) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOuvert(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [menuOuvert])

  const opts = { format: ui.format, echelle: ui.echelle, afficherGrille: ui.afficherGrille, hachures: ui.hachures }
  const run = async (label: string, fn: () => Promise<void> | void) => {
    setMenuOuvert(false)
    setBusy(true)
    try {
      await fn()
      toast(`${label} exporté`)
    } catch (e) {
      console.error(e)
      toast(`Échec de l'export ${label} : ${(e as Error).message}`, 'erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="no-print flex flex-wrap items-center gap-1 border-b border-slate-300 bg-slate-800 px-2 py-1 text-sm text-white">
      <button type="button" className="rounded px-2 py-1 font-semibold hover:bg-slate-700" onClick={() => setUI({ projetsOuvert: true })} title="Gérer les projets" data-testid="bouton-projets">
        ☰ Projets
      </button>
      <span className="max-w-[30vw] truncate px-1 text-slate-200" title={project.nom} data-testid="titre-projet">
        {project.nom}
      </span>
      <nav className="mx-2 flex rounded bg-slate-700 p-0.5" aria-label="Vues" data-tour="onglets">
        {ONGLETS.map((o) => (
          <button key={o.id} type="button" className={`rounded px-3 py-1 ${ui.onglet === o.id ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-slate-600'}`} onClick={() => setUI({ onglet: o.id })} aria-pressed={ui.onglet === o.id} data-testid={`onglet-${o.id}`}>
            {o.label}
          </button>
        ))}
      </nav>
      <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" onClick={annuler} disabled={!peutAnnuler} title="Annuler (Ctrl+Z)" aria-label="Annuler" data-testid="annuler">
        ↶
      </button>
      <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" onClick={retablir} disabled={!peutRetablir} title="Rétablir (Ctrl+Y)" aria-label="Rétablir" data-testid="retablir">
        ↷
      </button>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 lg:hidden" onClick={() => setUI({ panneauSaisieOuvert: !ui.panneauSaisieOuvert })} aria-pressed={ui.panneauSaisieOuvert} title="Afficher ou masquer la saisie">
          Saisie
        </button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => setUI({ panneauSurfacesOuvert: !ui.panneauSurfacesOuvert })} aria-pressed={ui.panneauSurfacesOuvert} title="Afficher ou masquer le panneau des surfaces" data-testid="bouton-surfaces">
          Surfaces
        </button>
        <div className="relative" ref={menuRef} data-tour="export">
          <button type="button" className="rounded bg-blue-600 px-3 py-1 font-medium hover:bg-blue-500 disabled:opacity-60" onClick={() => setMenuOuvert((v) => !v)} aria-haspopup="menu" aria-expanded={menuOuvert} disabled={busy} data-testid="bouton-exporter">
            {busy ? 'Export…' : 'Exporter ▾'}
          </button>
          {menuOuvert && (
            <div role="menu" className="absolute right-0 z-40 mt-1 w-64 rounded border border-slate-200 bg-white py-1 text-slate-800 shadow-lg">
              {[
                ['Plan en SVG', () => exportSvg(project, opts)],
                ['Plan en PNG', () => exportPng(project, opts)],
                ['Plan en PDF (A4/A3)', () => exportPdf(project, opts)],
                [
                  'Capture PNG de la vue 3D',
                  () => {
                    const data = capture3D()
                    if (!data) throw new Error("ouvrez d'abord l'onglet Vue 3D")
                    export3dCapture(data, project.nom)
                  },
                ],
                ['Projet en JSON', () => exportJson([project])],
              ].map(([label, fn]) => (
                <button key={String(label)} type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100" onClick={() => run(String(label), fn as () => Promise<void> | void)}>
                  {String(label)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => setUI({ aideOuverte: true })} aria-label="Aide" title="Aide et raccourcis" data-testid="bouton-aide">
          ?
        </button>
      </div>
    </header>
  )
}
