import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { ROOM_FILL_BY_TYPE } from '../model/defaults'
import { formatNombre, formatSurface } from '../model/format'
import type { Opening, Project, Room, Vec2 } from '../model/types'
import { sideIndex } from '../geometry/openings'
import { bbox, interiorPoint, roomPolygon, signedArea } from '../geometry/polygon'
import { add, dist, leftNormal, mul, norm, rightNormal, sub } from '../geometry/vec'
import { segmentAt, segmentQuad, type WallSegment } from '../geometry/walls'
import { exteriorChains } from '../geometry/dimensions'
import type { SurfacesSummary } from '../surfaces/compute'
import type { ValidationResult } from '../geometry/validation'
import { arcPoints, estimateTextWidth, pathFromPoints, readableAngle, sx, sy } from './svgUtils'

/** Épaisseurs de trait en mm (hiérarchie : épais, moyen, fin). */
export const LINE = { epais: 0.5, moyen: 0.3, fin: 0.13, tresFin: 0.08 }
export const FONT = { titre: 3.2, libelle: 3, surface: 2.3, cote: 2, coteInt: 1.8, petit: 1.9 }

export interface LayerProps {
  project: Project
  walls: WallSegment[]
  /** mm par mètre : permet de convertir des mm de papier en unités monde. */
  k: number
}

export const mm = (k: number, v: number) => v / k

/* ------------------------------------------------------------------ */
/* Sols des pièces (sélection, erreurs, glisser-déposer)               */
/* ------------------------------------------------------------------ */

interface RoomFloorsProps extends LayerProps {
  selectedRoomId: string | null
  validation: ValidationResult
  onSelect?: (id: string) => void
  onDragStart?: (id: string, e: ReactPointerEvent<SVGPathElement>) => void
  interactive: boolean
}

export function RoomFloorsLayer({ project, k, selectedRoomId, validation, onSelect, onDragStart, interactive }: RoomFloorsProps) {
  const overlapping = new Set(validation.project.flatMap((i) => i.roomIds))
  return (
    <g data-layer="sols">
      {project.pieces.map((room) => {
        const poly = roomPolygon(room)
        const invalid = validation.shapeValid[room.id] === false
        const selected = room.id === selectedRoomId
        const overlap = overlapping.has(room.id)
        const fill = invalid ? '#fee2e2' : selected ? '#dbeafe' : ROOM_FILL_BY_TYPE[room.type]
        const stroke = invalid ? '#dc2626' : selected ? '#2563eb' : overlap ? '#ea580c' : 'none'
        const style: CSSProperties = interactive ? { cursor: 'move', touchAction: 'none' } : {}
        return (
          <path
            key={room.id}
            data-room-id={room.id}
            data-testid={`room-floor-${room.id}`}
            d={pathFromPoints(poly)}
            fill={fill}
            stroke={stroke}
            strokeWidth={mm(k, 0.4)}
            strokeDasharray={selected || invalid ? `${mm(k, 1.2)} ${mm(k, 0.8)}` : undefined}
            style={style}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={`Pièce ${room.nom}`}
            onClick={interactive ? () => onSelect?.(room.id) : undefined}
            onKeyDown={interactive ? (e) => e.key === 'Enter' && onSelect?.(room.id) : undefined}
            onPointerDown={interactive ? (e) => onDragStart?.(room.id, e) : undefined}
          />
        )
      })}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Murs                                                                */
/* ------------------------------------------------------------------ */

interface WallsProps extends LayerProps {
  hachures: boolean
}

export function WallsLayer({ walls, k, hachures }: WallsProps) {
  const fill = hachures ? 'url(#hachures-mur)' : '#111111'
  const stroke = '#111111'
  const steps: { a: Vec2; b: Vec2 }[] = []
  const grouped = new Map<string, WallSegment[]>()
  for (const s of walls) {
    const key = `${s.roomId}#${s.edgeIndex}`
    const arr = grouped.get(key) ?? []
    arr.push(s)
    grouped.set(key, arr)
  }
  for (const arr of grouped.values()) {
    for (let i = 0; i < arr.length - 1; i++) steps.push({ a: arr[i].outerB, b: arr[i + 1].outerA })
  }
  return (
    <g data-layer="murs">
      <defs>
        <pattern id="hachures-mur" patternUnits="userSpaceOnUse" width={mm(k, 1.6)} height={mm(k, 1.6)} patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={mm(k, 1.6)} stroke="#111" strokeWidth={mm(k, 0.18)} />
        </pattern>
      </defs>
      {walls.map((s) => (
        <path key={s.id} d={pathFromPoints(segmentQuad(s))} fill={fill} stroke="none" />
      ))}
      {walls.map((s) => {
        const cuts = s.openings.map((o) => {
          const p0 = add(s.a, mul(s.dir, o.start))
          const p1 = add(s.a, mul(s.dir, o.end))
          const off = mul(s.normal, s.thickness + 0.001)
          const back = mul(s.normal, -0.001)
          return pathFromPoints([add(p0, back), add(p1, back), add(p1, off), add(p0, off)])
        })
        return cuts.map((d, i) => <path key={`${s.id}-cut-${i}`} d={d} fill="#ffffff" stroke="none" />)
      })}
      {hachures && (
        <g stroke={stroke} strokeWidth={mm(k, LINE.epais)} strokeLinecap="round" fill="none">
          {walls.map((s) => (
            <g key={`${s.id}-outline`}>
              <line x1={sx(s.a)} y1={sy(s.a)} x2={sx(s.b)} y2={sy(s.b)} />
              {s.kind === 'exterieur' && <line x1={sx(s.outerA)} y1={sy(s.outerA)} x2={sx(s.outerB)} y2={sy(s.outerB)} />}
            </g>
          ))}
          {steps.map((st, i) => (
            <line key={`step-${i}`} x1={sx(st.a)} y1={sy(st.a)} x2={sx(st.b)} y2={sy(st.b)} />
          ))}
        </g>
      )}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Symboles d'ouvertures                                               */
/* ------------------------------------------------------------------ */

interface OpeningGeom {
  p0: Vec2
  p1: Vec2
  dir: Vec2
  normal: Vec2
  T: number
  w: number
}

function openingGeometry(room: Room, o: Opening, walls: WallSegment[]): OpeningGeom | null {
  const poly = roomPolygon(room)
  const n = poly.length
  if (n < 3) return null
  const i = sideIndex(room.forme, o.cote)
  const a = poly[i]
  const b = poly[(i + 1) % n]
  const d = norm(sub(b, a))
  const ccw = signedArea(poly) >= 0
  const normal = ccw ? rightNormal(d) : leftNormal(d)
  const L = dist(a, b)
  const pos = Math.max(0, Math.min(o.position, Math.max(0, L - o.largeur)))
  const w = Math.min(o.largeur, L)
  const p0 = add(a, mul(d, pos))
  const p1 = add(a, mul(d, pos + w))
  const seg = segmentAt(walls, room.id, i, pos + w / 2, a)
  const T = seg ? (seg.openings.find((x) => x.id === o.id)?.fullThickness ?? seg.thickness) : 0.2
  return { p0, p1, dir: d, normal, T, w }
}

export function OpeningsLayer({ project, walls, k }: LayerProps) {
  const sw = mm(k, LINE.moyen)
  const swFin = mm(k, LINE.fin)
  return (
    <g data-layer="ouvertures" fill="none" stroke="#111" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {project.pieces.flatMap((room) =>
        room.ouvertures.map((o) => {
          const g = openingGeometry(room, o, walls)
          if (!g) return null
          const { p0, p1, normal, T, w } = g
          const outer0 = add(p0, mul(normal, T))
          const outer1 = add(p1, mul(normal, T))
          const jambs = (
            <>
              <line x1={sx(p0)} y1={sy(p0)} x2={sx(outer0)} y2={sy(outer0)} />
              <line x1={sx(p1)} y1={sy(p1)} x2={sx(outer1)} y2={sy(outer1)} />
            </>
          )
          if (o.type === 'fenetre') {
            const l0a = add(p0, mul(normal, T * 0.35))
            const l0b = add(p1, mul(normal, T * 0.35))
            const l1a = add(p0, mul(normal, T * 0.65))
            const l1b = add(p1, mul(normal, T * 0.65))
            return (
              <g key={o.id} data-opening-id={o.id}>
                {jambs}
                <line x1={sx(l0a)} y1={sy(l0a)} x2={sx(l0b)} y2={sy(l0b)} strokeWidth={swFin} />
                <line x1={sx(l1a)} y1={sy(l1a)} x2={sx(l1b)} y2={sy(l1b)} strokeWidth={swFin} />
              </g>
            )
          }
          if (o.type === 'baie') {
            const mid = 0.5
            const half = w / 2 + 0.06
            const dirv = norm(sub(p1, p0))
            const a1 = add(p0, mul(normal, T * 0.35))
            const b1 = add(a1, mul(dirv, half))
            const b2 = add(p1, mul(normal, T * 0.65))
            const a2 = add(b2, mul(dirv, -half))
            const c1 = add(p0, mul(normal, T * mid))
            const c2 = add(p1, mul(normal, T * mid))
            return (
              <g key={o.id} data-opening-id={o.id}>
                {jambs}
                <line x1={sx(c1)} y1={sy(c1)} x2={sx(c2)} y2={sy(c2)} strokeWidth={swFin} />
                <line x1={sx(a1)} y1={sy(a1)} x2={sx(b1)} y2={sy(b1)} strokeWidth={mm(k, LINE.epais)} />
                <line x1={sx(a2)} y1={sy(a2)} x2={sx(b2)} y2={sy(b2)} strokeWidth={mm(k, LINE.epais)} />
              </g>
            )
          }
          // Porte et porte-fenêtre : vantail + arc de débattement
          const left = o.sens.endsWith('gauche')
          const inward = o.sens.startsWith('int')
          const hingeInner = left ? p1 : p0
          const jambInner = left ? p0 : p1
          const hinge = inward ? hingeInner : add(hingeInner, mul(normal, T))
          const jamb = inward ? jambInner : add(jambInner, mul(normal, T))
          const leafDir = inward ? mul(normal, -1) : normal
          const leafEnd = add(hinge, mul(leafDir, w))
          const arc = arcPoints(hinge, leafEnd, jamb, w)
          const glazing =
            o.type === 'porte_fenetre' ? (
              <line
                x1={sx(add(p0, mul(normal, T / 2)))}
                y1={sy(add(p0, mul(normal, T / 2)))}
                x2={sx(add(p1, mul(normal, T / 2)))}
                y2={sy(add(p1, mul(normal, T / 2)))}
                strokeWidth={swFin}
              />
            ) : null
          return (
            <g key={o.id} data-opening-id={o.id}>
              {jambs}
              {glazing}
              <line x1={sx(hinge)} y1={sy(hinge)} x2={sx(leafEnd)} y2={sy(leafEnd)} strokeWidth={mm(k, LINE.epais)} />
              <path d={pathFromPoints(arc, false)} strokeWidth={swFin} />
            </g>
          )
        }),
      )}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Cotations                                                           */
/* ------------------------------------------------------------------ */

function Tick({ p, dir, k }: { p: Vec2; dir: Vec2; k: number }) {
  // Barbule à 45° (convention architecte)
  const n = leftNormal(dir)
  const l = mm(k, 0.9)
  const a = add(p, mul(add(dir, n), -l / Math.SQRT2))
  const b = add(p, mul(add(dir, n), l / Math.SQRT2))
  return <line x1={sx(a)} y1={sy(a)} x2={sx(b)} y2={sy(b)} strokeWidth={mm(k, LINE.moyen)} />
}

function DimText({ at, dir, text, k, size, offset }: { at: Vec2; dir: Vec2; text: string; k: number; size: number; offset: number }) {
  const n = leftNormal(dir)
  const p = add(at, mul(n, offset))
  const angle = readableAngle(dir)
  return (
    <text
      x={sx(p)}
      y={sy(p)}
      fontSize={mm(k, size)}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${angle.toFixed(2)} ${sx(p).toFixed(4)} ${sy(p).toFixed(4)})`}
      fill="#111"
      stroke="none"
      fontFamily="Arial, Helvetica, sans-serif"
    >
      {text}
    </text>
  )
}

export function InteriorDimensionsLayer({ project, k }: LayerProps) {
  return (
    <g data-layer="cotes-interieures" stroke="#334155" strokeWidth={mm(k, LINE.fin)} fill="none">
      {project.pieces.map((room) => {
        const poly = roomPolygon(room)
        if (poly.length < 3) return null
        const ccw = signedArea(poly) >= 0
        const box = bbox(poly)
        const minDim = Math.min(box.maxX - box.minX, box.maxY - box.minY)
        const petite = minDim < 1.6
        const inset = petite ? Math.min(0.16, minDim * 0.15) : Math.min(0.32, minDim * 0.22)
        if (inset < 0.08) return null
        return (
          <g key={room.id}>
            {poly.map((a, i) => {
              const b = poly[(i + 1) % poly.length]
              const L = dist(a, b)
              if (L < (petite ? 1.2 : 0.3)) return null
              const d = norm(sub(b, a))
              const inward = ccw ? leftNormal(d) : rightNormal(d)
              const a2 = add(add(a, mul(inward, inset)), mul(d, inset * 0.6))
              const b2 = add(add(b, mul(inward, inset)), mul(d, -inset * 0.6))
              if (dist(a2, b2) < 0.15) return null
              const mid = mul(add(a2, b2), 0.5)
              const size = petite ? FONT.coteInt * 0.75 : L < 1 ? FONT.coteInt * 0.85 : FONT.coteInt
              return (
                <g key={i}>
                  <line x1={sx(a2)} y1={sy(a2)} x2={sx(b2)} y2={sy(b2)} />
                  <Tick p={a2} dir={d} k={k} />
                  <Tick p={b2} dir={d} k={k} />
                  <DimText at={mid} dir={d} text={formatNombre(L, 2)} k={k} size={size} offset={(ccw ? 1 : -1) * mm(k, petite ? 1.1 : 1.4)} />
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
}

export function ExteriorDimensionsLayer({ walls, k }: LayerProps) {
  const chains = exteriorChains(walls, 0.7, 1.35)
  return (
    <g data-layer="cotes-exterieures" stroke="#111" strokeWidth={mm(k, LINE.fin)} fill="none">
      {chains.map((c) => {
        const horizontal = c.side === 'sud' || c.side === 'nord'
        const dir: Vec2 = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 }
        const at = (coord: number, line: number): Vec2 => (horizontal ? { x: coord, y: line } : { x: line, y: coord })
        const outward = c.side === 'sud' || c.side === 'ouest' ? -1 : 1
        const towardBuilding = horizontal ? (c.side === 'sud' ? 1 : -1) : c.side === 'ouest' ? 1 : -1
        const textOffsetPartial = (horizontal ? 1 : -1) * towardBuilding * mm(k, 1.6)
        const textOffsetTotal = -textOffsetPartial
        const extEnd = c.totalLine + outward * 0.25
        return (
          <g key={c.side}>
            {c.coords.map((x, i) => {
              const p = at(x, c.origins[i] + outward * 0.12)
              const q = at(x, extEnd)
              return <line key={`ext-${x}`} x1={sx(p)} y1={sy(p)} x2={sx(q)} y2={sy(q)} strokeWidth={mm(k, LINE.tresFin)} />
            })}
            <line x1={sx(at(c.coords[0], c.line))} y1={sy(at(c.coords[0], c.line))} x2={sx(at(c.coords[c.coords.length - 1], c.line))} y2={sy(at(c.coords[c.coords.length - 1], c.line))} />
            {c.coords.map((x, i) => {
              const tick = <Tick key={`t-${i}`} p={at(x, c.line)} dir={dir} k={k} />
              if (i === c.coords.length - 1) return tick
              const next = c.coords[i + 1]
              const L = next - x
              const mid = at((x + next) / 2, c.line)
              return (
                <g key={`p-${i}`}>
                  {tick}
                  {L * k > 5 && <DimText at={mid} dir={dir} text={formatNombre(L, 2)} k={k} size={FONT.cote} offset={textOffsetPartial} />}
                </g>
              )
            })}
            <line x1={sx(at(c.total[0], c.totalLine))} y1={sy(at(c.total[0], c.totalLine))} x2={sx(at(c.total[1], c.totalLine))} y2={sy(at(c.total[1], c.totalLine))} />
            <Tick p={at(c.total[0], c.totalLine)} dir={dir} k={k} />
            <Tick p={at(c.total[1], c.totalLine)} dir={dir} k={k} />
            <DimText at={at((c.total[0] + c.total[1]) / 2, c.totalLine)} dir={dir} text={formatNombre(c.total[1] - c.total[0], 2)} k={k} size={FONT.cote} offset={textOffsetTotal} />
          </g>
        )
      })}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Libellés des pièces                                                 */
/* ------------------------------------------------------------------ */

interface LabelsProps extends LayerProps {
  surfaces: SurfacesSummary
}

export function RoomLabelsLayer({ project, k, surfaces }: LabelsProps) {
  return (
    <g data-layer="libelles" fontFamily="Arial, Helvetica, sans-serif" fill="#111" textAnchor="middle">
      {project.pieces.map((room) => {
        const poly = roomPolygon(room)
        if (poly.length < 3) return null
        const c = interiorPoint(poly)
        const box = bbox(poly)
        const availW = (box.maxX - box.minX) * 0.9
        const availH = (box.maxY - box.minY) * k
        const s = surfaces.pieces.find((p) => p.id === room.id)
        const nameSize = Math.max(1.5, Math.min(FONT.libelle, (availW * k) / Math.max(1, estimateTextWidth(room.nom, 1)), availH / 4))
        const areaSize = Math.max(1.5, Math.min(FONT.surface, nameSize * 0.8))
        const surfaceText = s && s.valide ? formatSurface(s.surface) : 'Forme invalide'
        return (
          <g key={room.id} data-room-label={room.id}>
            <text x={sx(c)} y={sy(c) - mm(k, 0.6)} fontSize={mm(k, nameSize)} fontWeight="bold" dominantBaseline="auto">
              {room.nom}
            </text>
            <text x={sx(c)} y={sy(c) + mm(k, areaSize + 0.6)} fontSize={mm(k, areaSize)} fill={s && s.valide ? '#111' : '#dc2626'} dominantBaseline="auto">
              {surfaceText}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Grille                                                              */
/* ------------------------------------------------------------------ */

export function GridLayer({ k, extent }: { k: number; extent: { minX: number; minY: number; maxX: number; maxY: number } }) {
  const xs: number[] = []
  const ys: number[] = []
  for (let x = Math.floor(extent.minX); x <= Math.ceil(extent.maxX); x++) xs.push(x)
  for (let y = Math.floor(extent.minY); y <= Math.ceil(extent.maxY); y++) ys.push(y)
  return (
    <g data-layer="grille" stroke="#cbd5e1" strokeWidth={mm(k, 0.1)}>
      {xs.map((x) => (
        <line key={`x${x}`} x1={x} y1={-extent.minY} x2={x} y2={-extent.maxY} />
      ))}
      {ys.map((y) => (
        <line key={`y${y}`} x1={extent.minX} y1={-y} x2={extent.maxX} y2={-y} />
      ))}
    </g>
  )
}
