import { renderToStaticMarkup } from 'react-dom/server'
import type { Project } from '../model/types'
import { computeWalls } from '../geometry/walls'
import { validateProject } from '../geometry/validation'
import { computeSurfaces } from '../surfaces/compute'
import { PlanSheet } from '../plan2d/PlanSheet'
import { computeSheetLayout, type ScaleChoice, type SheetFormat, type SheetLayout } from '../plan2d/planLayout'

export interface PlanExportOptions {
  format: SheetFormat
  echelle: ScaleChoice
  afficherGrille: boolean
  hachures: boolean
}

/** Rendu SVG autonome de la feuille de plan (sans interactivité). */
export function renderPlanSvg(project: Project, opts: PlanExportOptions): { svg: string; layout: SheetLayout } {
  const walls = computeWalls(project)
  const validation = validateProject(project)
  const surfaces = computeSurfaces(project, validation)
  const layout = computeSheetLayout(project, walls, opts.format, opts.echelle)
  const markup = renderToStaticMarkup(
    <PlanSheet
      project={project}
      walls={walls}
      validation={validation}
      surfaces={surfaces}
      layout={layout}
      afficherGrille={opts.afficherGrille}
      hachures={opts.hachures}
      selectedRoomId={null}
      interactive={false}
    />,
  )
  return { svg: '<?xml version="1.0" encoding="UTF-8"?>\n' + markup, layout }
}
