import { CARDINAL_LABELS, DEFAULT_OPENING, OPENING_SENS_LABELS, OPENING_TYPE_LABELS } from '../model/defaults'
import { formatMetres } from '../model/format'
import type { Opening, OpeningType, Room } from '../model/types'
import { sideCount, sideLength } from '../geometry/polygon'
import type { FieldErrors } from '../geometry/validation'
import { useStore } from '../store/useStore'
import { NumberField, SelectField } from './Field'

interface Props {
  room: Room
  errors: FieldErrors
}

export function OpeningsEditor({ room, errors }: Props) {
  const ajouterOuverture = useStore((s) => s.ajouterOuverture)
  const modifierOuverture = useStore((s) => s.modifierOuverture)
  const supprimerOuverture = useStore((s) => s.supprimerOuverture)
  const n = sideCount(room.forme)
  const sideOptions =
    room.forme.kind === 'rect'
      ? (['sud', 'est', 'nord', 'ouest'] as const).map((c) => ({ value: c, label: `${CARDINAL_LABELS[c]} - ${formatMetres(sideLength(room.forme, ['sud', 'est', 'nord', 'ouest'].indexOf(c)))}` }))
      : Array.from({ length: n }, (_, i) => ({ value: String(i), label: `Côté ${i + 1} - ${formatMetres(sideLength(room.forme, i))}` }))

  const update = (o: Opening, patch: Partial<Opening>, key?: string) => modifierOuverture(room.id, o.id, (x) => ({ ...x, ...patch }), key)

  return (
    <fieldset className="flex flex-col gap-2 rounded border border-slate-200 p-2">
      <legend className="px-1 text-xs font-semibold text-slate-700">Ouvertures ({room.ouvertures.length})</legend>
      {room.ouvertures.map((o, k) => {
        const p = `ouvertures.${k}`
        return (
          <div key={o.id} className="flex flex-col gap-1.5 rounded border border-slate-100 bg-slate-50 p-2" data-testid={`ouverture-${k}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                {k + 1}. {OPENING_TYPE_LABELS[o.type]}
              </span>
              <button type="button" className="btn btn-sm text-red-700" onClick={() => supprimerOuverture(room.id, o.id)} aria-label={`Supprimer l'ouverture ${k + 1}`}>
                Supprimer
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <SelectField
                label="Type"
                aide="Porte, porte-fenêtre, fenêtre ou baie coulissante"
                value={o.type}
                options={(Object.keys(OPENING_TYPE_LABELS) as OpeningType[]).map((t) => ({ value: t, label: OPENING_TYPE_LABELS[t] }))}
                onChange={(v) => {
                  const t = v as OpeningType
                  const d = DEFAULT_OPENING[t]
                  update(o, { type: t, largeur: d.largeur, hauteur: d.hauteur, allege: d.allege })
                }}
              />
              <SelectField
                label="Côté"
                aide="Mur sur lequel l'ouverture est placée"
                value={String(o.cote)}
                options={sideOptions}
                error={errors[`${p}.cote`]}
                onChange={(v) => update(o, { cote: room.forme.kind === 'rect' ? (v as Opening['cote']) : Number(v) })}
              />
              <NumberField label="Position" unit="m" value={o.position} min={0} error={errors[`${p}.position`]} aide="Distance entre le début du côté et le bord de l'ouverture, en mètres" onChange={(v) => update(o, { position: v }, `${o.id}-pos`)} />
              <NumberField label="Largeur" unit="m" value={o.largeur} min={0.4} max={12} error={errors[`${p}.largeur`]} testId={`ouverture-${k}-largeur`} aide="Largeur de l'ouverture (passage), en mètres" onChange={(v) => update(o, { largeur: v }, `${o.id}-l`)} />
              <NumberField label="Hauteur" unit="m" value={o.hauteur} min={0.3} max={6} error={errors[`${p}.hauteur`]} aide="Hauteur de l'ouverture, en mètres" onChange={(v) => update(o, { hauteur: v }, `${o.id}-h`)} />
              {o.type === 'fenetre' ? (
                <NumberField label="Allège" unit="m" value={o.allege ?? 0} min={0} max={3} error={errors[`${p}.allege`]} aide="Hauteur entre le sol et le bas de la fenêtre" onChange={(v) => update(o, { allege: v }, `${o.id}-a`)} />
              ) : (
                <SelectField label="Sens d'ouverture" aide="Côté de la charnière vu de l'intérieur de la pièce, et sens de débattement" value={o.sens} options={Object.entries(OPENING_SENS_LABELS).map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => update(o, { sens: v as Opening['sens'] })} />
              )}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap gap-1">
        {(Object.keys(OPENING_TYPE_LABELS) as OpeningType[]).map((t) => (
          <button key={t} type="button" className="btn btn-sm" onClick={() => ajouterOuverture(room.id, t)} data-testid={`ajouter-${t}`}>
            + {OPENING_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
