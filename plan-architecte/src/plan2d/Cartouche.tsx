import { ROOM_TYPE_LABELS } from '../model/defaults'
import { formatDate, formatSurface } from '../model/format'
import type { Project } from '../model/types'
import type { SurfacesSummary } from '../surfaces/compute'
import { cartoucheRowHeight } from './planLayout'

interface Props {
  project: Project
  surfaces: SurfacesSummary
  x: number
  y: number
  w: number
  h: number
  scaleDenom: number
  format: string
}

const FONT = 'Arial, Helvetica, sans-serif'

export function Cartouche({ project, surfaces, x, y, w, h, scaleDenom, format }: Props) {
  const rowH = cartoucheRowHeight(project.pieces.length)
  const pad = 2
  let cy = y + pad
  const col = { nom: x + pad, type: x + w * 0.46, surface: x + w - pad }
  const lines: JSX.Element[] = []
  const line = (yy: number) => <line key={`l${yy}`} x1={x} y1={yy} x2={x + w} y2={yy} stroke="#111" strokeWidth={0.2} />

  const title = (
    <text key="titre" x={x + pad} y={cy + 4} fontSize={3.4} fontWeight="bold" fontFamily={FONT} fill="#111">
      {project.nom}
    </text>
  )
  cy += 6
  const adresse = (
    <text key="adresse" x={x + pad} y={cy + 2.6} fontSize={2.2} fontFamily={FONT} fill="#111">
      {project.adresse ? project.adresse : 'Plan de niveau'}
    </text>
  )
  cy += 4
  const meta = (
    <text key="meta" x={x + pad} y={cy + 2.6} fontSize={2.2} fontFamily={FONT} fill="#111">
      {`Date : ${formatDate()}   Échelle : 1/${scaleDenom}   Format : ${format} paysage`}
    </text>
  )
  cy += 4
  lines.push(line(cy))
  const header = (
    <g key="entete" fontSize={2.2} fontWeight="bold" fontFamily={FONT} fill="#111">
      <text x={col.nom} y={cy + 3.4}>
        Pièce
      </text>
      <text x={col.type} y={cy + 3.4}>
        Type
      </text>
      <text x={col.surface} y={cy + 3.4} textAnchor="end">
        Surface
      </text>
    </g>
  )
  cy += 5
  lines.push(line(cy))
  const rows = surfaces.pieces.map((p) => {
    const el = (
      <g key={p.id} fontSize={rowH > 3.3 ? 2.1 : 1.9} fontFamily={FONT} fill="#111">
        <text x={col.nom} y={cy + rowH - 0.9}>
          {p.nom.length > 22 ? p.nom.slice(0, 21) + '…' : p.nom}
        </text>
        <text x={col.type} y={cy + rowH - 0.9}>
          {ROOM_TYPE_LABELS[p.type]}
        </text>
        <text x={col.surface} y={cy + rowH - 0.9} textAnchor="end">
          {p.valide ? formatSurface(p.surface) : 'invalide'}
        </text>
      </g>
    )
    cy += rowH
    return el
  })
  lines.push(line(cy))
  const totals = [
    ['Surface habitable', surfaces.habitable, true],
    ['Surface annexe', surfaces.annexe, false],
    ['Surface totale au sol', surfaces.totale, true],
  ].map(([label, value, bold]) => {
    const el = (
      <g key={String(label)} fontSize={2.2} fontFamily={FONT} fill="#111" fontWeight={bold ? 'bold' : 'normal'}>
        <text x={col.nom} y={cy + 2.7}>
          {String(label)}
        </text>
        <text x={col.surface} y={cy + 2.7} textAnchor="end">
          {formatSurface(Number(value))}
        </text>
      </g>
    )
    cy += 3.6
    return el
  })
  lines.push(line(cy))
  const mention = (
    <text key="mention" x={x + w / 2} y={cy + 3.4} fontSize={2} fontStyle="italic" textAnchor="middle" fontFamily={FONT} fill="#334155">
      Plan indicatif non contractuel
    </text>
  )

  return (
    <g data-layer="cartouche">
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#111" strokeWidth={0.35} />
      {title}
      {adresse}
      {meta}
      {lines}
      {header}
      {rows}
      {totals}
      {mention}
    </g>
  )
}
