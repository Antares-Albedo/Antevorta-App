import { HAUTEUR_MIN_HABITABLE, ROOM_TYPE_LABELS, ROOM_TYPES } from '../model/defaults'
import { formatNombre, formatSurface } from '../model/format'
import type { Project, RoomType } from '../model/types'
import { useStore } from '../store/useStore'
import type { SurfacesSummary } from './compute'

interface Props {
  project: Project
  surfaces: SurfacesSummary
}

export function SurfacesPanel({ project, surfaces }: Props) {
  const selectedRoomId = useStore((s) => s.ui.selectedRoomId)
  const selectionner = useStore((s) => s.selectionner)
  const modifierParametres = useStore((s) => s.modifierParametres)
  const toggleType = (t: RoomType, excluded: boolean) => {
    const set = new Set(project.typesHorsHabitable)
    if (excluded) set.add(t)
    else set.delete(t)
    modifierParametres({ typesHorsHabitable: ROOM_TYPES.filter((x) => set.has(x)) })
  }
  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="panneau-surfaces" data-tour="surfaces">
      <h2 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">Surfaces</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-2 py-1">Pièce</th>
              <th className="px-1 py-1">Type</th>
              <th className="px-2 py-1 text-right">m²</th>
            </tr>
          </thead>
          <tbody>
            {surfaces.pieces.map((p) => (
              <tr key={p.id} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${p.id === selectedRoomId ? 'bg-blue-100' : ''}`} onClick={() => selectionner(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && selectionner(p.id)} aria-selected={p.id === selectedRoomId} role="row" data-testid={`surface-${p.id}`}>
                <td className="px-2 py-1 font-medium text-slate-800">
                  {p.nom}
                  {!p.habitable && p.valide && !p.annexe && <span className="ml-1 text-[10px] text-amber-700" title={`Hauteur ${formatNombre(p.hauteur)} m < ${formatNombre(HAUTEUR_MIN_HABITABLE)} m`}>(h)</span>}
                </td>
                <td className="px-1 py-1 text-slate-500">{ROOM_TYPE_LABELS[p.type]}</td>
                <td className="px-2 py-1 text-right tabular-nums" data-testid={`surface-valeur-${p.id}`}>
                  {p.valide ? formatNombre(p.surface) : <span className="text-red-600" title="Forme invalide">—</span>}
                </td>
              </tr>
            ))}
            {surfaces.pieces.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                  Aucune pièce
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <div className="flex justify-between py-0.5">
          <span>Surface habitable</span>
          <span className="tabular-nums" data-testid="total-habitable">
            {formatSurface(surfaces.habitable)}
          </span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Surface annexe</span>
          <span className="tabular-nums" data-testid="total-annexe">
            {formatSurface(surfaces.annexe)}
          </span>
        </div>
        {surfaces.basseHauteur > 0 && (
          <div className="flex justify-between py-0.5 text-amber-800">
            <span>Hauteur &lt; 1,80 m</span>
            <span className="tabular-nums">{formatSurface(surfaces.basseHauteur)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-slate-300 pt-1 text-sm font-bold text-slate-900">
          <span>Total au sol</span>
          <span className="tabular-nums" data-testid="total-general">
            {formatSurface(surfaces.totale)}
          </span>
        </div>
        {surfaces.nbInvalides > 0 && (
          <p className="mt-1 text-red-600">
            {surfaces.nbInvalides} pièce{surfaces.nbInvalides > 1 ? 's' : ''} non comptée{surfaces.nbInvalides > 1 ? 's' : ''} (forme invalide)
          </p>
        )}
        <details className="mt-2">
          <summary className="cursor-pointer text-slate-600">Types exclus de la surface habitable</summary>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
            {ROOM_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1">
                <input type="checkbox" checked={project.typesHorsHabitable.includes(t)} onChange={(e) => toggleType(t, e.target.checked)} />
                {ROOM_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}
