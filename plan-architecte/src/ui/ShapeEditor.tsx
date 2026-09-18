import { useMemo } from 'react'
import { formatCentimetres, formatNombre } from '../model/format'
import type { PolySide, RoomShape } from '../model/types'
import { autoCloseSides, bbox, polygonFromSides } from '../geometry/polygon'
import { POLYGON_TEMPLATES, templateById, type PolygonTemplate } from '../geometry/templates'
import { checkPolygonSides, type FieldErrors } from '../geometry/validation'
import { NumberField } from './Field'

interface Props {
  shape: RoomShape
  errors: FieldErrors
  onChange: (shape: RoomShape, coalesceKey?: string) => void
}

/** Aperçu miniature instantané d'un polygone (ou d'une saisie en cours). */
export function ShapePreview({ sides, size = 120 }: { sides: PolySide[]; size?: number }) {
  const build = useMemo(() => polygonFromSides(sides), [sides])
  const pts = build.trace
  const b = bbox(pts)
  const w = Math.max(b.maxX - b.minX, 0.1)
  const h = Math.max(b.maxY - b.minY, 0.1)
  const scale = (size - 16) / Math.max(w, h)
  const ox = 8 + ((size - 16) - w * scale) / 2 - b.minX * scale
  const oy = 8 + ((size - 16) - h * scale) / 2 + b.maxY * scale
  const path = build.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(ox + p.x * scale).toFixed(1)} ${(oy - p.y * scale).toFixed(1)}`).join(' ') + ' Z'
  const trace = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(ox + p.x * scale).toFixed(1)} ${(oy - p.y * scale).toFixed(1)}`).join(' ')
  const closed = build.closureError < 0.05
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded border border-slate-200 bg-white" aria-label="Aperçu de la forme" role="img">
      <path d={path} fill={closed ? '#dbeafe' : '#fee2e2'} stroke="none" />
      <path d={trace} fill="none" stroke={closed ? '#1e3a8a' : '#dc2626'} strokeWidth={1.5} strokeLinejoin="round" />
      {pts.length > 0 && <circle cx={ox + pts[0].x * scale} cy={oy - pts[0].y * scale} r={2.5} fill="#16a34a" />}
      {build.points.map((p, i) => (
        <text key={i} x={ox + (p.x + build.points[(i + 1) % build.points.length].x) / 2 * scale} y={oy - ((p.y + build.points[(i + 1) % build.points.length].y) / 2) * scale} fontSize={8} textAnchor="middle" dominantBaseline="middle" fill="#334155">
          {i + 1}
        </text>
      ))}
    </svg>
  )
}

export function ShapeEditor({ shape, errors, onChange }: Props) {
  const check = useMemo(() => (shape.kind === 'polygone' ? checkPolygonSides(shape.cotes) : null), [shape])

  const switchMode = (kind: 'rect' | 'polygone') => {
    if (kind === shape.kind) return
    if (kind === 'rect') {
      const b = bbox(polygonFromSides(shape.kind === 'polygone' ? shape.cotes : []).points)
      onChange({ kind: 'rect', longueur: Math.max(0.3, Math.round((b.maxX - b.minX) * 100) / 100 || 4), largeur: Math.max(0.3, Math.round((b.maxY - b.minY) * 100) / 100 || 3) })
    } else if (shape.kind === 'rect') {
      onChange({
        kind: 'polygone',
        cotes: [
          { longueur: shape.longueur, angle: 90 },
          { longueur: shape.largeur, angle: 90 },
          { longueur: shape.longueur, angle: 90 },
          { longueur: shape.largeur, angle: 90 },
        ],
      })
    }
  }

  const updateSides = (cotes: PolySide[], key?: string) => onChange({ kind: 'polygone', cotes }, key)

  return (
    <fieldset className="flex flex-col gap-2 rounded border border-slate-200 p-2">
      <legend className="px-1 text-xs font-semibold text-slate-700">Forme de la pièce</legend>
      <div className="flex gap-1" role="radiogroup" aria-label="Mode de forme">
        <button type="button" className={`btn btn-sm ${shape.kind === 'rect' ? 'active' : ''}`} role="radio" aria-checked={shape.kind === 'rect'} onClick={() => switchMode('rect')} title="Longueur et largeur">
          Rectangle
        </button>
        <button type="button" className={`btn btn-sm ${shape.kind === 'polygone' ? 'active' : ''}`} role="radio" aria-checked={shape.kind === 'polygone'} onClick={() => switchMode('polygone')} title="Liste de côtés et d'angles : pièces en L, en T, pans coupés, murs biais">
          Polygone
        </button>
      </div>

      {shape.kind === 'rect' ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Longueur" unit="m" value={shape.longueur} min={0.3} max={200} error={errors['forme.longueur']} aide="Mesure intérieure, de mur à mur, dans le sens est-ouest" testId="champ-longueur" onChange={(v) => onChange({ ...shape, longueur: v }, 'longueur')} />
          <NumberField label="Largeur" unit="m" value={shape.largeur} min={0.3} max={200} error={errors['forme.largeur']} aide="Mesure intérieure, de mur à mur, dans le sens nord-sud" testId="champ-largeur" onChange={(v) => onChange({ ...shape, largeur: v }, 'largeur')} />
        </div>
      ) : (
        <PolygonEditor cotes={shape.cotes} errors={errors} check={check} onChange={updateSides} />
      )}
    </fieldset>
  )
}

function PolygonEditor({ cotes, errors, check, onChange }: { cotes: PolySide[]; errors: FieldErrors; check: ReturnType<typeof checkPolygonSides> | null; onChange: (cotes: PolySide[], key?: string) => void }) {
  const setSide = (i: number, patch: Partial<PolySide>, key: string) => onChange(cotes.map((c, j) => (j === i ? { ...c, ...patch } : c)), key)
  const remove = (i: number) => onChange(cotes.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= cotes.length) return
    const next = [...cotes]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const addSide = () => onChange([...cotes, { longueur: 1, angle: 90 }])
  const applyTemplate = (id: PolygonTemplate['id']) => onChange(templateById(id))
  const shapeError = errors['forme']
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-slate-600">Modèles :</span>
        {POLYGON_TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="btn btn-sm" title={t.description} onClick={() => applyTemplate(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <ShapePreview sides={cotes} />
        <div className="flex-1 text-xs text-slate-600">
          <p>Les côtés sont parcourus dans le sens inverse des aiguilles d'une montre à partir du point vert (côté 1 vers l'est). L'angle est l'angle intérieur entre un côté et le suivant.</p>
          {check && (
            <p className={`mt-1 ${check.closureError > 0.05 ? 'text-red-600' : check.closureError > 0.0005 ? 'text-amber-700' : 'text-green-700'}`} data-testid="ecart-fermeture">
              Écart de fermeture : {formatCentimetres(check.closureError)}
            </p>
          )}
          {check?.canAutoClose && (
            <button type="button" className="btn btn-sm mt-1" onClick={() => onChange(autoCloseSides(cotes))} data-testid="bouton-ajuster">
              Ajuster automatiquement le dernier côté
            </button>
          )}
        </div>
      </div>
      {shapeError && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700" role="alert" data-testid="erreur-forme">
          {shapeError}
        </p>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-600">
            <th className="w-6">#</th>
            <th>Longueur (m)</th>
            <th>Angle (°)</th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody>
          {cotes.map((c, i) => (
            <tr key={i} className="align-top">
              <td className="pt-2 text-slate-500">{i + 1}</td>
              <td className="pr-1">
                <NumberField label={`Longueur du côté ${i + 1}`} value={c.longueur} min={0.05} max={200} error={errors[`forme.cotes.${i}.longueur`]} aide="Longueur intérieure du côté, en mètres" testId={`cote-${i}-longueur`} onChange={(v) => setSide(i, { longueur: v }, `cote-${i}-l`)} className="[&>label]:sr-only" />
              </td>
              <td className="pr-1">
                <NumberField label={`Angle après le côté ${i + 1}`} value={c.angle} step={1} min={1} max={359} decimals={1} error={errors[`forme.cotes.${i}.angle`]} aide="Angle intérieur avec le côté suivant : 90° pour un angle droit, 270° pour un angle rentrant, 135° pour un pan coupé" testId={`cote-${i}-angle`} onChange={(v) => setSide(i, { angle: v }, `cote-${i}-a`)} className="[&>label]:sr-only" />
              </td>
              <td className="pt-1">
                <div className="flex gap-0.5">
                  <button type="button" className="btn btn-sm px-1" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter le côté ${i + 1}`} title="Monter">
                    ↑
                  </button>
                  <button type="button" className="btn btn-sm px-1" onClick={() => move(i, 1)} disabled={i === cotes.length - 1} aria-label={`Descendre le côté ${i + 1}`} title="Descendre">
                    ↓
                  </button>
                  <button type="button" className="btn btn-sm px-1 text-red-700" onClick={() => remove(i)} disabled={cotes.length <= 3} aria-label={`Supprimer le côté ${i + 1}`} title="Supprimer">
                    ×
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between">
        <button type="button" className="btn btn-sm" onClick={addSide} data-testid="ajouter-cote">
          + Ajouter un côté
        </button>
        {check && <span className="text-xs text-slate-500">Somme des angles : {formatNombre(cotes.reduce((s, c) => s + c.angle, 0), 1)}° (attendu {(cotes.length - 2) * 180}°)</span>}
      </div>
    </div>
  )
}
