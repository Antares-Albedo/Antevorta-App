import { useState } from 'react'
import { ROOM_TYPE_LABELS, ROOM_TYPES } from '../model/defaults'
import { formatSurface } from '../model/format'
import type { Project, RoomType } from '../model/types'
import type { ValidationResult } from '../geometry/validation'
import type { SurfacesSummary } from '../surfaces/compute'
import { useStore } from '../store/useStore'
import { NumberField, SelectField, TextField } from './Field'
import { RoomForm } from './RoomForm'

interface Props {
  project: Project
  validation: ValidationResult
  surfaces: SurfacesSummary
}

export function Sidebar({ project, validation, surfaces }: Props) {
  const ui = useStore((s) => s.ui)
  const selectionner = useStore((s) => s.selectionner)
  const ajouterPiece = useStore((s) => s.ajouterPiece)
  const modifierParametres = useStore((s) => s.modifierParametres)
  const reordonnerPiece = useStore((s) => s.reordonnerPiece)
  const [typeAjout, setTypeAjout] = useState<RoomType>('sejour')
  const [paramsOuverts, setParamsOuverts] = useState(project.pieces.length === 0)
  const selected = project.pieces.find((r) => r.id === ui.selectedRoomId) ?? null

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="panneau-saisie">
      <section className="border-b border-slate-200">
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setParamsOuverts((v) => !v)} aria-expanded={paramsOuverts} data-testid="bouton-parametres">
          Projet
          <span className="text-xs text-slate-500">{paramsOuverts ? 'Réduire' : 'Paramètres'}</span>
        </button>
        {paramsOuverts && (
          <div className="flex flex-col gap-2 px-3 pb-3" data-tour="projet">
            <TextField label="Nom du projet" value={project.nom} aide="Apparaît dans le cartouche du plan" testId="champ-nom-projet" onChange={(v) => modifierParametres({ nom: v }, 'nom-projet')} />
            <TextField label="Adresse (facultative)" value={project.adresse ?? ''} aide="Adresse du bien, affichée dans le cartouche" onChange={(v) => modifierParametres({ adresse: v }, 'adresse')} />
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Hauteur" unit="m" value={project.hauteurPlafond} min={1.5} max={10} aide="Hauteur sous plafond par défaut des pièces" onChange={(v) => modifierParametres({ hauteurPlafond: v }, 'hsp')} />
              <NumberField label="Mur ext." unit="m" value={project.epaisseurMurExterieur} min={0.05} max={1} aide="Épaisseur des murs extérieurs" onChange={(v) => modifierParametres({ epaisseurMurExterieur: v }, 'mext')} />
              <NumberField label="Mur int." unit="m" value={project.epaisseurMurInterieur} min={0.05} max={0.6} aide="Épaisseur des cloisons entre deux pièces" onChange={(v) => modifierParametres({ epaisseurMurInterieur: v }, 'mint')} />
            </div>
            <SelectField
              label="Agencement des pièces"
              aide="Automatique : les pièces sont placées et accolées de façon cohérente. Manuel : vous saisissez les positions ou glissez les pièces sur le plan."
              value={project.agencement}
              testId="champ-agencement"
              options={[
                { value: 'auto', label: 'Automatique' },
                { value: 'manuel', label: 'Manuel (coordonnées et glisser-déposer)' },
              ]}
              onChange={(v) => modifierParametres({ agencement: v as Project['agencement'] })}
            />
          </div>
        )}
      </section>

      <section className="border-b border-slate-200 px-3 py-2" data-tour="ajout">
        <div className="flex items-end gap-1">
          <SelectField label="Ajouter une pièce" aide="Choisissez le type puis cliquez sur Ajouter. Des dimensions réalistes sont proposées par défaut." value={typeAjout} testId="type-ajout" options={ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t] }))} onChange={(v) => setTypeAjout(v as RoomType)} className="flex-1" />
          <button type="button" className="btn btn-primary" onClick={() => ajouterPiece(typeAjout)} data-testid="ajouter-piece">
            Ajouter
          </button>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto">
        {project.pieces.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">Aucune pièce. Ajoutez une première pièce ci-dessus ou chargez l'exemple depuis le menu Projets.</p>
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Liste des pièces" data-tour="liste">
            {project.pieces.map((r, i) => {
              const errs = validation.rooms[r.id] ?? {}
              const nbErr = Object.keys(errs).length
              const s = surfaces.pieces.find((p) => p.id === r.id)
              const isSel = r.id === ui.selectedRoomId
              return (
                <li key={r.id} className={isSel ? 'bg-blue-50' : ''}>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-1 py-1 text-left text-sm hover:bg-slate-100" onClick={() => selectionner(isSel ? null : r.id)} aria-expanded={isSel} data-testid={`piece-${i}`}>
                      <span className="truncate">
                        <span className="font-medium text-slate-800">{r.nom}</span>
                        <span className="ml-1 text-xs text-slate-500">{ROOM_TYPE_LABELS[r.type]}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                        {nbErr > 0 && (
                          <span className="rounded bg-red-100 px-1 text-red-700" title={Object.values(errs).join('\n')}>
                            {nbErr} erreur{nbErr > 1 ? 's' : ''}
                          </span>
                        )}
                        {s && s.valide ? formatSurface(s.surface) : '—'}
                      </span>
                    </button>
                    <div className="flex flex-col">
                      <button type="button" className="text-[10px] leading-3 text-slate-400 hover:text-slate-700" onClick={() => reordonnerPiece(r.id, -1)} disabled={i === 0} aria-label={`Monter ${r.nom}`}>
                        ▲
                      </button>
                      <button type="button" className="text-[10px] leading-3 text-slate-400 hover:text-slate-700" onClick={() => reordonnerPiece(r.id, 1)} disabled={i === project.pieces.length - 1} aria-label={`Descendre ${r.nom}`}>
                        ▼
                      </button>
                    </div>
                  </div>
                  {isSel && selected && (
                    <div className="border-t border-blue-100 bg-white px-2 py-2" data-tour="formulaire">
                      <RoomForm room={selected} errors={errs} hauteurProjet={project.hauteurPlafond} agencement={project.agencement} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {validation.project.length > 0 && (
          <div className="m-2 rounded bg-amber-50 p-2 text-xs text-amber-800" role="alert">
            {validation.project.map((i, k) => (
              <p key={k}>{i.message}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
