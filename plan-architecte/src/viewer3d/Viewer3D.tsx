import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import type { Project } from '../model/types'
import type { WallSegment } from '../geometry/walls'
import { useStore } from '../store/useStore'
import { glRef } from './capture'
import { Scene, type PresetView } from './Scene'

interface Props {
  project: Project
  walls: WallSegment[]
  compact?: boolean
}

const VIEWS: { id: PresetView; label: string }[] = [
  { id: 'perspective', label: 'Perspective' },
  { id: 'dessus', label: 'Dessus' },
  { id: 'nord', label: 'Nord' },
  { id: 'sud', label: 'Sud' },
  { id: 'est', label: 'Est' },
  { id: 'ouest', label: 'Ouest' },
]

export function Viewer3D({ project, walls, compact }: Props) {
  const ui = useStore((s) => s.ui)
  const setUI = useStore((s) => s.setUI)
  const selectionner = useStore((s) => s.selectionner)
  const [presetView, setPresetView] = useState<{ view: PresetView; nonce: number }>({ view: 'perspective', nonce: 0 })
  const walkKeys = useRef<Set<string>>(new Set())
  const [webglOk, setWebglOk] = useState(true)

  useEffect(() => {
    try {
      const c = document.createElement('canvas')
      const ok = !!(c.getContext('webgl2') || c.getContext('webgl'))
      setWebglOk(ok)
    } catch {
      setWebglOk(false)
    }
  }, [])

  useEffect(() => {
    if (!ui.modeVisite) return
    const map: Record<string, string> = {
      ArrowUp: 'avant',
      ArrowDown: 'arriere',
      ArrowLeft: 'tourne_gauche',
      ArrowRight: 'tourne_droite',
      z: 'avant',
      w: 'avant',
      s: 'arriere',
      q: 'gauche',
      a: 'gauche',
      d: 'droite',
    }
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      const k = map[e.key]
      if (k) {
        walkKeys.current.add(k)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = map[e.key]
      if (k) walkKeys.current.delete(k)
    }
    const keys = walkKeys.current
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      keys.clear()
    }
  }, [ui.modeVisite])

  const setView = useCallback((view: PresetView) => {
    setUI({ modeVisite: false })
    setPresetView((p) => ({ view, nonce: p.nonce + 1 }))
  }, [setUI])

  const touchBtn = (key: string, label: string, aria: string) => (
    <button
      type="button"
      className="btn h-10 w-10 select-none px-0 text-lg"
      aria-label={aria}
      onPointerDown={(e) => {
        e.preventDefault()
        walkKeys.current.add(key)
      }}
      onPointerUp={() => walkKeys.current.delete(key)}
      onPointerLeave={() => walkKeys.current.delete(key)}
      onPointerCancel={() => walkKeys.current.delete(key)}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col" data-testid="vue-3d">
      <div className="no-print flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1 text-xs" role="toolbar" aria-label="Options de la vue 3D">
        <span className="mr-1 text-slate-500">Vues :</span>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className={`btn btn-sm ${presetView.view === v.id && !ui.modeVisite ? 'active' : ''}`} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
        <span className="mx-1 h-4 border-l border-slate-300" />
        <button type="button" className={`btn btn-sm ${ui.rotationAuto ? 'active' : ''}`} onClick={() => setUI({ rotationAuto: !ui.rotationAuto, modeVisite: false })} aria-pressed={ui.rotationAuto} title="Rotation automatique pour présentation">
          Rotation auto
        </button>
        <button type="button" className={`btn btn-sm ${ui.maquetteOuverte ? 'active' : ''}`} onClick={() => setUI({ maquetteOuverte: !ui.maquetteOuverte })} aria-pressed={ui.maquetteOuverte} title="Murs coupés à 1,20 m pour voir l'intérieur">
          Maquette ouverte
        </button>
        <button type="button" className={`btn btn-sm ${ui.afficherPlafonds ? 'active' : ''}`} onClick={() => setUI({ afficherPlafonds: !ui.afficherPlafonds })} aria-pressed={ui.afficherPlafonds} disabled={ui.maquetteOuverte}>
          Plafonds
        </button>
        <button type="button" className={`btn btn-sm ${ui.modeVisite ? 'active' : ''}`} onClick={() => setUI({ modeVisite: !ui.modeVisite, rotationAuto: false })} aria-pressed={ui.modeVisite} title="Visite à hauteur d'œil (1,60 m) : flèches ou ZQSD, glisser pour regarder">
          Visite
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {webglOk ? (
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [10, 8, 10], fov: 50, near: 0.05, far: 500 }}
            gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl, scene, camera }) => {
              glRef.current = { gl, scene, camera }
            }}
            style={{ touchAction: 'none' }}
            aria-label="Maquette 3D du logement"
            role="img"
          >
            <Suspense fallback={null}>
              <Scene
                project={project}
                walls={walls}
                selectedRoomId={ui.selectedRoomId}
                afficherPlafonds={ui.afficherPlafonds}
                maquetteOuverte={ui.maquetteOuverte}
                rotationAuto={ui.rotationAuto}
                modeVisite={ui.modeVisite}
                presetView={presetView}
                onSelectRoom={(id) => selectionner(id)}
                walkKeys={walkKeys}
              />
            </Suspense>
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-600">
            La 3D nécessite WebGL, qui n'est pas disponible dans ce navigateur. Le plan 2D et les surfaces restent utilisables.
          </div>
        )}
        {ui.modeVisite && (
          <div className="absolute bottom-3 left-3 flex flex-col items-center gap-1 rounded bg-white/85 p-2 shadow" aria-label="Déplacement en mode visite">
            {touchBtn('avant', '▲', 'Avancer')}
            <div className="flex gap-1">
              {touchBtn('tourne_gauche', '↶', 'Tourner à gauche')}
              {touchBtn('arriere', '▼', 'Reculer')}
              {touchBtn('tourne_droite', '↷', 'Tourner à droite')}
            </div>
            <div className="flex gap-1">
              {touchBtn('gauche', '◀', 'Pas à gauche')}
              {touchBtn('droite', '▶', 'Pas à droite')}
            </div>
          </div>
        )}
        {!compact && project.pieces.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">Ajoutez une pièce pour voir la maquette 3D.</div>
        )}
      </div>
    </div>
  )
}
