import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Project } from '../model/types'
import type { ValidationResult } from '../geometry/validation'
import type { WallSegment } from '../geometry/walls'
import type { SurfacesSummary } from '../surfaces/compute'
import { Cartouche } from './Cartouche'
import {
  ExteriorDimensionsLayer,
  GridLayer,
  InteriorDimensionsLayer,
  OpeningsLayer,
  RoomFloorsLayer,
  RoomLabelsLayer,
  WallsLayer,
} from './layers'
import type { SheetLayout } from './planLayout'

export interface PlanSheetProps {
  project: Project
  walls: WallSegment[]
  validation: ValidationResult
  surfaces: SurfacesSummary
  layout: SheetLayout
  afficherGrille: boolean
  hachures: boolean
  selectedRoomId: string | null
  interactive: boolean
  onSelect?: (id: string) => void
  onDragStart?: (id: string, e: ReactPointerEvent<SVGPathElement>) => void
  /** Transformation d'affichage (zoom/panoramique), non utilisée à l'export. */
  viewTransform?: string
  svgProps?: Record<string, unknown>
  children?: ReactNode
}

function NorthArrow({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y})`} data-layer="nord">
      <circle r={7} fill="#fff" stroke="#111" strokeWidth={0.3} />
      <g transform={`rotate(${angle})`}>
        <path d="M0 -5.5 L2.4 3.5 L0 2 L-2.4 3.5 Z" fill="#111" />
        <path d="M0 -5.5 L2.4 3.5 L0 2 Z" fill="#fff" stroke="#111" strokeWidth={0.2} />
        <text y={-7.8} fontSize={3} textAnchor="middle" fontWeight="bold" fontFamily="Arial, Helvetica, sans-serif" fill="#111">
          N
        </text>
      </g>
    </g>
  )
}

function ScaleBar({ x, y, k, denom }: { x: number; y: number; k: number; denom: number }) {
  const segments = [0, 1, 2, 3, 4, 5]
  return (
    <g transform={`translate(${x} ${y})`} data-layer="echelle" fontFamily="Arial, Helvetica, sans-serif" fontSize={2.2} fill="#111">
      {segments.slice(0, -1).map((s) => (
        <rect key={s} x={s * k} y={0} width={k} height={1.6} fill={s % 2 === 0 ? '#111' : '#fff'} stroke="#111" strokeWidth={0.2} />
      ))}
      {segments.map((s) => (
        <text key={`t${s}`} x={s * k} y={4.6} textAnchor="middle">
          {s}
        </text>
      ))}
      <text x={5 * k + 3} y={1.7}>
        m
      </text>
      <text x={0} y={-1.2} fontSize={2.2}>
        {`Échelle 1/${denom}`}
      </text>
    </g>
  )
}

/** Feuille de plan complète (A4/A3 paysage) : cadre, dessin à l'échelle, cotations, cartouche. */
export function PlanSheet(props: PlanSheetProps) {
  const { project, walls, validation, surfaces, layout, afficherGrille, hachures, selectedRoomId, interactive, onSelect, onDragStart, viewTransform, svgProps, children } = props
  const { W, H, margin, k, ox, oy, cartouche } = layout
  const layerProps = { project, walls, k }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={`${W}mm`}
      height={`${H}mm`}
      fontFamily="Arial, Helvetica, sans-serif"
      {...svgProps}
    >
      <g transform={viewTransform}>
        <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
        <rect x={margin} y={margin} width={W - 2 * margin} height={H - 2 * margin} fill="none" stroke="#111" strokeWidth={0.5} />
        <rect x={margin + 1.5} y={margin + 1.5} width={W - 2 * margin - 3} height={H - 2 * margin - 3} fill="none" stroke="#111" strokeWidth={0.15} />
        <clipPath id="zone-dessin">
          <rect x={margin + 1.5} y={margin + 1.5} width={W - 2 * margin - 3} height={H - 2 * margin - 3} />
        </clipPath>
        <g clipPath="url(#zone-dessin)">
          <g transform={`translate(${ox.toFixed(4)} ${oy.toFixed(4)}) scale(${k})`} data-layer="dessin">
            {afficherGrille && layout.hasRooms && <GridLayer k={k} extent={layout.extent} />}
            <RoomFloorsLayer {...layerProps} selectedRoomId={selectedRoomId} validation={validation} onSelect={onSelect} onDragStart={onDragStart} interactive={interactive} />
            {/* Les couches graphiques laissent passer le pointeur vers les sols (sélection, glisser-déposer). */}
            <g pointerEvents="none">
              <WallsLayer {...layerProps} hachures={hachures} />
              <OpeningsLayer {...layerProps} />
              <InteriorDimensionsLayer {...layerProps} />
              {layout.hasRooms && <ExteriorDimensionsLayer {...layerProps} />}
              <RoomLabelsLayer {...layerProps} surfaces={surfaces} />
            </g>
            {children}
          </g>
        </g>
        {!layout.hasRooms && (
          <text x={W / 2} y={H / 2 - 20} textAnchor="middle" fontSize={5} fill="#64748b">
            Ajoutez une première pièce dans le panneau de gauche
          </text>
        )}
        <NorthArrow x={W - margin - 12} y={margin + 12} angle={project.nord} />
        <ScaleBar x={margin + 6} y={H - margin - 8} k={k} denom={layout.scaleDenom} />
        <Cartouche project={project} surfaces={surfaces} x={cartouche.x} y={cartouche.y} w={cartouche.w} h={cartouche.h} scaleDenom={layout.scaleDenom} format={layout.format} />
      </g>
    </svg>
  )
}
