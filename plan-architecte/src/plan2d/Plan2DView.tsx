import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { GRID_STEP } from '../model/defaults'
import type { Project, Vec2 } from '../model/types'
import { snapRoomPosition } from '../geometry/placement'
import type { ValidationResult } from '../geometry/validation'
import type { WallSegment } from '../geometry/walls'
import type { SurfacesSummary } from '../surfaces/compute'
import { useStore } from '../store/useStore'
import { PlanSheet } from './PlanSheet'
import { computeSheetLayout } from './planLayout'
import { PlanToolbar } from './PlanToolbar'

interface Props {
  project: Project
  walls: WallSegment[]
  validation: ValidationResult
  surfaces: SurfacesSummary
  compact?: boolean
}

interface DragState {
  roomId: string
  startPointer: { x: number; y: number }
  startPos: Vec2
  moved: boolean
}

export function Plan2DView({ project, walls, validation, surfaces, compact }: Props) {
  const ui = useStore((s) => s.ui)
  const selectionner = useStore((s) => s.selectionner)
  const deplacerPiece = useStore((s) => s.deplacerPiece)
  const layout = useMemo(() => computeSheetLayout(project, walls, ui.format, ui.echelle), [project, walls, ui.format, ui.echelle])

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fitMode, setFitMode] = useState<'dessin' | 'feuille' | 'libre'>('dessin')

  // Cadre la vue sur le dessin (zone utile) plutôt que sur la feuille entière.
  useEffect(() => {
    if (fitMode !== 'dessin') return
    if (!layout.hasRooms) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }
    const { extent, k, ox, oy, W, H } = layout
    const x0 = ox + extent.minX * k
    const x1 = ox + extent.maxX * k
    const y0 = oy - extent.maxY * k
    const y1 = oy - extent.minY * k
    const dw = Math.max(1, x1 - x0)
    const dh = Math.max(1, y1 - y0)
    const z = Math.min(12, Math.max(0.4, 0.94 * Math.min(W / dw, H / dh)))
    setZoom(z)
    setPan({ x: W / 2 - ((x0 + x1) / 2) * z, y: H / 2 - ((y0 + y1) / 2) * z })
  }, [layout, fitMode])
  const panRef = useRef<{ start: { x: number; y: number }; origin: { x: number; y: number } } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  /** Géométrie d'affichage : le SVG est centré dans son élément (preserveAspectRatio « meet »). */
  const viewMetrics = useCallback(() => {
    const el = svgRef.current
    if (!el) return { scale: 1, offsetX: 0, offsetY: 0, left: 0, top: 0 }
    const r = el.getBoundingClientRect()
    const scale = Math.min(r.width / layout.W, r.height / layout.H) || 1
    return { scale, offsetX: (r.width - layout.W * scale) / 2, offsetY: (r.height - layout.H * scale) / 2, left: r.left, top: r.top }
  }, [layout.W, layout.H])
  const mmPerPx = useCallback(() => 1 / viewMetrics().scale, [viewMetrics])

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const m = viewMetrics()
      const mx = (e.clientX - m.left - m.offsetX) / m.scale
      const my = (e.clientY - m.top - m.offsetY) / m.scale
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setFitMode('libre')
      setZoom((z) => {
        const nz = Math.min(12, Math.max(0.4, z * factor))
        const ratio = nz / z
        setPan((p) => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }))
        return nz
      })
    },
    [viewMetrics],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const onBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return
    const target = e.target as Element
    if (target.closest('[data-room-id]')) return
    panRef.current = { start: { x: e.clientX, y: e.clientY }, origin: pan }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = mmPerPx()
    if (dragRef.current) {
      const d = dragRef.current
      const dx = ((e.clientX - d.startPointer.x) * f) / zoom / layout.k
      const dy = -((e.clientY - d.startPointer.y) * f) / zoom / layout.k
      if (!d.moved && Math.hypot(dx, dy) < 0.03) return
      d.moved = true
      const room = project.pieces.find((r) => r.id === d.roomId)
      if (!room) return
      const target = { x: d.startPos.x + dx, y: d.startPos.y + dy }
      const snapped = snapRoomPosition(room, target, project.pieces, project.epaisseurMurInterieur, GRID_STEP)
      deplacerPiece(d.roomId, snapped, `drag-${d.roomId}`)
      return
    }
    if (panRef.current) {
      const p = panRef.current
      setFitMode('libre')
      setPan({ x: p.origin.x + (e.clientX - p.start.x) * f, y: p.origin.y + (e.clientY - p.start.y) * f })
    }
  }

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null
      setDragging(null)
    }
    if (panRef.current) {
      const p = panRef.current
      const moved = Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) > 4
      panRef.current = null
      if (!moved) {
        const target = e.target as Element
        if (!target.closest('[data-room-id]')) selectionner(null)
      }
    }
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* déjà relâché */
    }
  }

  const onDragStart = (roomId: string, e: ReactPointerEvent<SVGPathElement>) => {
    const room = project.pieces.find((r) => r.id === roomId)
    if (!room) return
    selectionner(roomId)
    dragRef.current = { roomId, startPointer: { x: e.clientX, y: e.clientY }, startPos: room.position, moved: false }
    setDragging(roomId)
    e.stopPropagation()
    const container = containerRef.current
    if (container) container.setPointerCapture(e.pointerId)
  }

  const resetView = () => setFitMode('dessin')
  const showSheet = () => {
    setFitMode('feuille')
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div className="flex h-full flex-col" data-testid="plan-2d">
      <PlanToolbar
        layout={layout}
        onResetView={resetView}
        onShowSheet={showSheet}
        onZoom={(f) => {
          setFitMode('libre')
          setZoom((z) => Math.min(12, Math.max(0.4, z * f)))
        }}
        compact={compact}
        project={project}
      />
      <div
        ref={containerRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-slate-300 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={(e) => {
          if (panRef.current || dragRef.current) endPointer(e)
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <PlanSheet
            project={project}
            walls={walls}
            validation={validation}
            surfaces={surfaces}
            layout={layout}
            afficherGrille={ui.afficherGrille}
            hachures={ui.hachures}
            selectedRoomId={ui.selectedRoomId}
            interactive
            onSelect={(id) => selectionner(id)}
            onDragStart={onDragStart}
            viewTransform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
            svgProps={{
              ref: svgRef,
              width: undefined,
              height: undefined,
              className: 'max-h-full max-w-full shadow-lg',
              style: { width: '100%', height: '100%', background: 'transparent' },
              role: 'img',
              'aria-label': 'Plan 2D du logement',
              'data-testid': 'plan-svg',
            }}
          />
        </div>
        {!layout.fits && (
          <div className="absolute left-2 top-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900 shadow" role="status">
            Le plan dépasse la feuille : passez en A3 ou à l'échelle 1/100.
          </div>
        )}
        {project.agencement === 'auto' && project.pieces.length > 0 && !compact && (
          <div className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs text-slate-700 shadow">
            Agencement automatique. Glissez une pièce pour passer en mode manuel.
          </div>
        )}
      </div>
    </div>
  )
}
