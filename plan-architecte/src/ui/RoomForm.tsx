import { ROOM_TYPE_LABELS, ROOM_TYPES } from '../model/defaults'
import type { Room, RoomType } from '../model/types'
import { convertOpeningSide } from '../geometry/openings'
import type { FieldErrors } from '../geometry/validation'
import { useStore } from '../store/useStore'
import { NumberField, SelectField, TextField } from './Field'
import { OpeningsEditor } from './OpeningsEditor'
import { ShapeEditor } from './ShapeEditor'

interface Props {
  room: Room
  errors: FieldErrors
  hauteurProjet: number
  agencement: 'auto' | 'manuel'
}

export function RoomForm({ room, errors, hauteurProjet, agencement }: Props) {
  const modifierPiece = useStore((s) => s.modifierPiece)
  const supprimerPiece = useStore((s) => s.supprimerPiece)
  const dupliquerPiece = useStore((s) => s.dupliquerPiece)
  const patch = (p: Partial<Room>, key?: string) => modifierPiece(room.id, (r) => ({ ...r, ...p }), key)

  return (
    <div className="flex flex-col gap-2" data-testid="formulaire-piece">
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Nom" value={room.nom} error={errors['nom']} aide="Nom affiché sur le plan et dans le tableau des surfaces" testId="champ-nom" onChange={(v) => patch({ nom: v }, 'nom')} />
        <SelectField label="Type" value={room.type} aide="Le type détermine le sol en 3D et le classement en surface habitable ou annexe" options={ROOM_TYPES.map((t: RoomType) => ({ value: t, label: ROOM_TYPE_LABELS[t] }))} onChange={(v) => patch({ type: v as RoomType })} />
      </div>
      <ShapeEditor
        shape={room.forme}
        errors={errors}
        onChange={(forme, key) =>
          modifierPiece(room.id, (r) => ({ ...r, forme, ouvertures: r.forme.kind === forme.kind ? r.ouvertures : r.ouvertures.map((o) => convertOpeningSide(o, r.forme, forme)) }), key)
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Hauteur sous plafond" unit="m" value={room.hauteur} placeholder={String(hauteurProjet).replace('.', ',')} min={1} max={10} error={errors['hauteur']} aide={`Laissez vide pour utiliser la hauteur du projet (${hauteurProjet.toString().replace('.', ',')} m). Une hauteur inférieure à 1,80 m exclut la pièce de la surface habitable.`} onChange={(v) => patch({ hauteur: v }, 'hauteur')} />
        <div className="flex items-end">
          {room.hauteur !== undefined && (
            <button type="button" className="btn btn-sm" onClick={() => patch({ hauteur: undefined })}>
              Hauteur du projet
            </button>
          )}
        </div>
      </div>
      <fieldset className="rounded border border-slate-200 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-700">Position {agencement === 'auto' ? '(agencement automatique)' : '(manuelle)'}</legend>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="X" unit="m" value={room.position.x} disabled={agencement === 'auto'} aide="Position horizontale du premier sommet de la pièce sur le plan (vers l'est)" onChange={(v) => patch({ position: { ...room.position, x: v } }, 'posx')} />
          <NumberField label="Y" unit="m" value={room.position.y} disabled={agencement === 'auto'} aide="Position verticale du premier sommet de la pièce sur le plan (vers le nord)" onChange={(v) => patch({ position: { ...room.position, y: v } }, 'posy')} />
          <NumberField label="Rotation" unit="°" step={5} decimals={1} value={room.rotation} disabled={agencement === 'auto'} aide="Rotation de la pièce en degrés, sens inverse des aiguilles d'une montre" onChange={(v) => patch({ rotation: v }, 'rot')} />
        </div>
        {agencement === 'auto' && <p className="mt-1 text-xs text-slate-500">Passez en agencement manuel (paramètres du projet) ou glissez la pièce sur le plan pour la positionner.</p>}
      </fieldset>
      <OpeningsEditor room={room} errors={errors} />
      <div className="flex justify-between">
        <button type="button" className="btn btn-sm" onClick={() => dupliquerPiece(room.id)}>
          Dupliquer la pièce
        </button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => supprimerPiece(room.id)} data-testid="supprimer-piece">
          Supprimer la pièce
        </button>
      </div>
    </div>
  )
}
