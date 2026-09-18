import type { Project } from '../model/types'
import { useStore } from '../store/useStore'
import type { SheetLayout } from './planLayout'

interface Props {
  layout: SheetLayout
  onResetView: () => void
  onShowSheet: () => void
  onZoom: (factor: number) => void
  compact?: boolean
  project: Project
}

export function PlanToolbar({ layout, onResetView, onShowSheet, onZoom, compact, project }: Props) {
  const ui = useStore((s) => s.ui)
  const setUI = useStore((s) => s.setUI)
  const modifierParametres = useStore((s) => s.modifierParametres)
  return (
    <div className="no-print flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1 text-xs" role="toolbar" aria-label="Options du plan 2D">
      <label className="flex items-center gap-1">
        <span>Échelle</span>
        <select
          className="field-input w-auto py-0.5"
          value={String(ui.echelle)}
          onChange={(e) => setUI({ echelle: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 50 | 100) })}
          aria-label="Échelle du plan"
        >
          <option value="auto">Auto (1/{layout.scaleDenom})</option>
          <option value="50">1/50</option>
          <option value="100">1/100</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span>Format</span>
        <select className="field-input w-auto py-0.5" value={ui.format} onChange={(e) => setUI({ format: e.target.value as 'A4' | 'A3' })} aria-label="Format de la feuille">
          <option value="A4">A4 paysage</option>
          <option value="A3">A3 paysage</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={ui.afficherGrille} onChange={(e) => setUI({ afficherGrille: e.target.checked })} />
        Grille
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={ui.hachures} onChange={(e) => setUI({ hachures: e.target.checked })} />
        Murs hachurés
      </label>
      {!compact && (
        <label className="flex items-center gap-1" title="Orientation de la flèche du nord (degrés, sens horaire)">
          <span>Nord</span>
          <input
            type="number"
            className="field-input w-16 py-0.5"
            value={project.nord}
            step={5}
            min={-360}
            max={360}
            onChange={(e) => modifierParametres({ nord: Number(e.target.value) || 0 }, 'nord')}
            aria-label="Orientation du nord en degrés"
          />
          <span>°</span>
        </label>
      )}
      <span className="ml-auto flex items-center gap-1">
        <button type="button" className="btn btn-sm" onClick={() => onZoom(1.25)} aria-label="Zoom avant">
          +
        </button>
        <button type="button" className="btn btn-sm" onClick={() => onZoom(1 / 1.25)} aria-label="Zoom arrière">
          −
        </button>
        <button type="button" className="btn btn-sm" onClick={onResetView} aria-label="Cadrer sur le dessin" title="Cadrer sur le dessin">
          Ajuster
        </button>
        <button type="button" className="btn btn-sm" onClick={onShowSheet} aria-label="Afficher la feuille entière" title="Afficher la feuille entière (aperçu avant impression)">
          Feuille
        </button>
      </span>
    </div>
  )
}
