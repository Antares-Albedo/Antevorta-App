import * as THREE from 'three'

type FloorKind = 'parquet' | 'carrelage' | 'beton'
const cache = new Map<FloorKind, THREE.Texture>()

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  return { canvas, ctx }
}

/** Texture procédurale (1 texture = 1 m x 1 m), sans fichier externe. */
export function floorTexture(kind: FloorKind): THREE.Texture | null {
  const cached = cache.get(kind)
  if (cached) return cached
  const size = 256
  const made = makeCanvas(size)
  if (!made) return null
  const { canvas, ctx } = made
  if (kind === 'parquet') {
    ctx.fillStyle = '#c8a273'
    ctx.fillRect(0, 0, size, size)
    const lames = 8
    const h = size / lames
    for (let i = 0; i < lames; i++) {
      const shade = 190 + ((i * 37) % 30)
      ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.78)}, ${Math.round(shade * 0.52)})`
      ctx.fillRect(0, i * h, size, h - 2)
      const joint = ((i * 97) % size) / 2
      ctx.fillStyle = 'rgba(80,50,20,0.5)'
      ctx.fillRect(joint, i * h, 2, h - 2)
      ctx.fillRect((joint + size / 2) % size, i * h, 2, h - 2)
    }
  } else if (kind === 'carrelage') {
    ctx.fillStyle = '#d9dbd6'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = '#a5a8a1'
    ctx.lineWidth = 3
    const n = 3
    for (let i = 0; i <= n; i++) {
      const p = (i * size) / n
      ctx.beginPath()
      ctx.moveTo(p, 0)
      ctx.lineTo(p, size)
      ctx.moveTo(0, p)
      ctx.lineTo(size, p)
      ctx.stroke()
    }
  } else {
    ctx.fillStyle = '#b8b8b4'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 400; i++) {
      const x = (i * 7919) % size
      const y = (i * 104729) % size
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
      ctx.fillRect(x, y, 3, 3)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache.set(kind, tex)
  return tex
}
