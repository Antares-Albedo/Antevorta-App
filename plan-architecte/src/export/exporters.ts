import type { Project } from '../model/types'
import { projectFileSchema } from '../model/schema'
import { downloadBlob, downloadDataUrl, safeFilename } from './download'
import { renderPlanSvg, type PlanExportOptions } from './planSvg'

export function exportSvg(project: Project, opts: PlanExportOptions): void {
  const { svg } = renderPlanSvg(project, opts)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(project.nom)}-plan.svg`)
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Impossible de convertir le SVG en image'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

export async function exportPng(project: Project, opts: PlanExportOptions, pixelsPerMm = 8): Promise<void> {
  const { svg, layout } = renderPlanSvg(project, opts)
  const img = await svgToImage(svg)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(layout.W * pixelsPerMm)
  canvas.height = Math.round(layout.H * pixelsPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Export PNG impossible')
  downloadBlob(blob, `${safeFilename(project.nom)}-plan.png`)
}

export async function exportPdf(project: Project, opts: PlanExportOptions): Promise<void> {
  const [{ jsPDF }, svg2pdf] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  void svg2pdf
  const { svg, layout } = renderPlanSvg(project, opts)
  const holder = document.createElement('div')
  holder.style.position = 'fixed'
  holder.style.left = '-10000px'
  holder.style.top = '0'
  holder.innerHTML = svg
  const el = holder.querySelector('svg')
  if (!el) throw new Error('SVG introuvable')
  document.body.appendChild(holder)
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: layout.format.toLowerCase() as 'a4' | 'a3', compress: true })
    doc.setProperties({ title: `${project.nom} - plan`, subject: 'Plan indicatif non contractuel', creator: 'Plan Architecte 2D/3D' })
    await doc.svg(el, { x: 0, y: 0, width: layout.W, height: layout.H })
    doc.save(`${safeFilename(project.nom)}-plan.pdf`)
  } finally {
    holder.remove()
  }
}

export function exportJson(projects: Project[], filename?: string): void {
  const payload = projects.length === 1 ? projects[0] : { projets: projects }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filename ?? `${safeFilename(projects[0]?.nom ?? 'projets')}.json`)
}

export function parseProjectFile(text: string): Project[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide")
  }
  const parsed = projectFileSchema.safeParse(data)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(`Fichier de projet invalide : ${first?.path.join('.') || 'racine'} - ${first?.message ?? 'structure inattendue'}`)
  }
  const v = parsed.data
  return ('projets' in v ? v.projets : [v]) as Project[]
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
    reader.readAsText(file, 'utf-8')
  })
}

export function export3dCapture(dataUrl: string, projectName: string): void {
  downloadDataUrl(dataUrl, `${safeFilename(projectName)}-3d.png`)
}
