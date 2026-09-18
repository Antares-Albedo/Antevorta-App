import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { FLOOR_BY_TYPE } from '../model/defaults'
import type { Project, Vec2 } from '../model/types'
import { bbox, roomPolygon } from '../geometry/polygon'
import { roomHeight, type WallSegment } from '../geometry/walls'
import { segmentYaw, wallPieces } from './geometry3d'
import { floorTexture } from './textures'

export type PresetView = 'perspective' | 'dessus' | 'nord' | 'sud' | 'est' | 'ouest'

export interface SceneProps {
  project: Project
  walls: WallSegment[]
  selectedRoomId: string | null
  afficherPlafonds: boolean
  maquetteOuverte: boolean
  rotationAuto: boolean
  modeVisite: boolean
  presetView: { view: PresetView; nonce: number }
  onSelectRoom: (id: string | null) => void
  walkKeys: React.MutableRefObject<Set<string>>
}

const CUT_HEIGHT = 1.2
const EYE_HEIGHT = 1.6

function shapeFromPolygon(poly: Vec2[]): THREE.Shape {
  const shape = new THREE.Shape()
  poly.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)))
  shape.closePath()
  return shape
}

function buildingBounds(project: Project) {
  const pts = project.pieces.flatMap((r) => roomPolygon(r))
  if (pts.length === 0) return { cx: 0, cz: 0, r: 6, minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const b = bbox(pts)
  const cx = (b.minX + b.maxX) / 2
  const cz = -(b.minY + b.maxY) / 2
  const r = Math.max(b.maxX - b.minX, b.maxY - b.minY, 4)
  return { cx, cz, r, ...b }
}

/* ------------------------------------------------------------------ */

function RoomFloor({ project, roomId, selected, onSelect, afficherPlafonds }: { project: Project; roomId: string; selected: boolean; onSelect: (id: string) => void; afficherPlafonds: boolean }) {
  const room = project.pieces.find((r) => r.id === roomId)
  const poly = useMemo(() => (room ? roomPolygon(room) : []), [room])
  const geometry = useMemo(() => {
    if (poly.length < 3) return null
    const g = new THREE.ShapeGeometry(shapeFromPolygon(poly))
    // UV = coordonnées monde en mètres (texture répétée au mètre)
    const pos = g.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i)
      uv[i * 2 + 1] = pos.getY(i)
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    return g
  }, [poly])
  const texture = useMemo(() => (room ? floorTexture(FLOOR_BY_TYPE[room.type]) : null), [room])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!room || !geometry) return null
  const h = roomHeight(project, room)
  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          onSelect(room.id)
        }}
      >
        <meshStandardMaterial map={texture ?? undefined} color={selected ? '#9ec5ff' : '#ffffff'} emissive={selected ? '#1d4ed8' : '#000000'} emissiveIntensity={selected ? 0.25 : 0} roughness={0.85} />
      </mesh>
      {afficherPlafonds && (
        <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, h, 0]}>
          <meshStandardMaterial color="#f8fafc" side={THREE.DoubleSide} roughness={1} />
        </mesh>
      )}
    </group>
  )
}

function WallPieceMesh({ poly, y0, y1 }: { poly: Vec2[]; y0: number; y1: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapeFromPolygon(poly), { depth: y1 - y0, bevelEnabled: false })
    return g
  }, [poly, y0, y1])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, y0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#f1efe8" roughness={0.9} />
    </mesh>
  )
}

function Walls({ walls, maquetteOuverte }: { walls: WallSegment[]; maquetteOuverte: boolean }) {
  const pieces = useMemo(() => walls.flatMap((s) => wallPieces(s, maquetteOuverte ? CUT_HEIGHT : undefined).map((p, i) => ({ ...p, key: `${s.id}-${i}` }))), [walls, maquetteOuverte])
  return (
    <group>
      {pieces.map((p) => (
        <WallPieceMesh key={p.key} poly={p.poly} y0={p.y0} y1={p.y1} />
      ))}
    </group>
  )
}

/* Menuiseries : cadres, vantaux, vitrages semi-transparents. */
function Joinery({ walls, maquetteOuverte }: { walls: WallSegment[]; maquetteOuverte: boolean }) {
  const items = useMemo(() => {
    const out: JSX.Element[] = []
    for (const s of walls) {
      const yaw = segmentYaw(s)
      for (const o of s.openings) {
        if (o.mirrored) continue
        const T = o.fullThickness
        const w = o.end - o.start
        const H = maquetteOuverte ? Math.min(o.allege + o.hauteur, CUT_HEIGHT) : o.allege + o.hauteur
        const low = o.allege
        if (H <= low + 0.01) continue
        const h = H - low
        const cx = o.start + w / 2
        const frameW = 0.06
        const frameD = T + 0.01
        const frameColor = o.type === 'porte' ? '#e8e4dc' : '#f5f5f5'
        const glass = o.type !== 'porte'
        out.push(
          <group key={`${s.id}-${o.id}`} position={[s.a.x, 0, -s.a.y]} rotation={[0, yaw, 0]}>
            {/* montants */}
            <mesh position={[o.start + frameW / 2, low + h / 2, T / 2]} castShadow>
              <boxGeometry args={[frameW, h, frameD]} />
              <meshStandardMaterial color={frameColor} />
            </mesh>
            <mesh position={[o.end - frameW / 2, low + h / 2, T / 2]} castShadow>
              <boxGeometry args={[frameW, h, frameD]} />
              <meshStandardMaterial color={frameColor} />
            </mesh>
            {/* traverse haute */}
            {!maquetteOuverte || o.allege + o.hauteur <= CUT_HEIGHT ? (
              <mesh position={[cx, H - frameW / 2, T / 2]}>
                <boxGeometry args={[w, frameW, frameD]} />
                <meshStandardMaterial color={frameColor} />
              </mesh>
            ) : null}
            {/* seuil / traverse basse pour les fenêtres */}
            {low > 0.01 && (
              <mesh position={[cx, low + frameW / 2, T / 2]}>
                <boxGeometry args={[w, frameW, frameD]} />
                <meshStandardMaterial color={frameColor} />
              </mesh>
            )}
            {glass ? (
              <>
                <mesh position={[cx, low + h / 2, T / 2]}>
                  <boxGeometry args={[w - 2 * frameW, h - 2 * frameW, 0.02]} />
                  <meshPhysicalMaterial color="#bfe0f5" transparent opacity={0.35} roughness={0.05} metalness={0.1} transmission={0} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
                {/* meneau central */}
                <mesh position={[cx, low + h / 2, T / 2]}>
                  <boxGeometry args={[0.04, h - 2 * frameW, frameD * 0.8]} />
                  <meshStandardMaterial color={frameColor} />
                </mesh>
              </>
            ) : (
              <mesh position={[cx, low + h / 2, 0.03]} castShadow>
                <boxGeometry args={[w - 2 * frameW, h - frameW, 0.04]} />
                <meshStandardMaterial color="#9a6a3a" roughness={0.7} />
              </mesh>
            )}
          </group>,
        )
      }
    }
    return out
  }, [walls, maquetteOuverte])
  return <group>{items}</group>
}

/* ------------------------------------------------------------------ */

function CameraRig({ project, controlsRef, presetView, modeVisite }: { project: Project; controlsRef: React.RefObject<OrbitControlsImpl | null>; presetView: SceneProps['presetView']; modeVisite: boolean }) {
  const { camera } = useThree()
  const bounds = useMemo(() => buildingBounds(project), [project])
  const lastNonce = useRef(-1)
  useEffect(() => {
    if (modeVisite) return
    if (lastNonce.current === presetView.nonce) return
    lastNonce.current = presetView.nonce
    const { cx, cz, r } = bounds
    const c = controlsRef.current
    const target = new THREE.Vector3(cx, 0.6, cz)
    let pos: THREE.Vector3
    switch (presetView.view) {
      case 'dessus':
        pos = new THREE.Vector3(cx, r * 2.4, cz + 0.01)
        break
      case 'nord':
        pos = new THREE.Vector3(cx, r * 0.45, cz - r * 1.7)
        break
      case 'sud':
        pos = new THREE.Vector3(cx, r * 0.45, cz + r * 1.7)
        break
      case 'est':
        pos = new THREE.Vector3(cx + r * 1.7, r * 0.45, cz)
        break
      case 'ouest':
        pos = new THREE.Vector3(cx - r * 1.7, r * 0.45, cz)
        break
      default:
        pos = new THREE.Vector3(cx + r * 0.95, r * 0.85, cz + r * 1.05)
    }
    camera.position.copy(pos)
    if (c) {
      c.target.copy(target)
      c.update()
    } else {
      camera.lookAt(target)
    }
  }, [presetView, bounds, camera, controlsRef, modeVisite])
  return null
}

/** Mode visite à hauteur d'œil : clavier (flèches / ZQSD / WASD), boutons tactiles, orientation par glisser. */
function WalkControls({ project, keys }: { project: Project; keys: React.MutableRefObject<Set<string>> }) {
  const { camera, gl } = useThree()
  const yaw = useRef(0)
  const pitch = useRef(0)
  const bounds = useMemo(() => buildingBounds(project), [project])
  useEffect(() => {
    const { cx, minY } = bounds
    camera.position.set(cx, EYE_HEIGHT, -minY - 1.2)
    yaw.current = Math.PI
    pitch.current = 0
    camera.rotation.set(0, 0, 0)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
  }, [bounds, camera])
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let last = { x: 0, y: 0 }
    const down = (e: PointerEvent) => {
      dragging = true
      last = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      yaw.current -= dx * 0.005
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - dy * 0.004))
    }
    const up = () => {
      dragging = false
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl])
  useFrame((_, delta) => {
    const k = keys.current
    const speed = 1.6 * Math.min(delta, 0.1)
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const right = new THREE.Vector3(forward.z, 0, -forward.x)
    if (k.has('avant')) camera.position.addScaledVector(forward, speed)
    if (k.has('arriere')) camera.position.addScaledVector(forward, -speed)
    if (k.has('gauche')) camera.position.addScaledVector(right, -speed)
    if (k.has('droite')) camera.position.addScaledVector(right, speed)
    if (k.has('tourne_gauche')) yaw.current += 1.4 * Math.min(delta, 0.1)
    if (k.has('tourne_droite')) yaw.current -= 1.4 * Math.min(delta, 0.1)
    camera.position.y = EYE_HEIGHT
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current
  })
  return null
}

export function Scene(props: SceneProps) {
  const { project, walls, selectedRoomId, afficherPlafonds, maquetteOuverte, rotationAuto, modeVisite, presetView, onSelectRoom, walkKeys } = props
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const bounds = useMemo(() => buildingBounds(project), [project])
  const shadowSize = bounds.r * 1.2
  return (
    <>
      <color attach="background" args={['#e8edf3']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dfe9f5', '#b8b2a5', 0.35]} />
      <directionalLight
        position={[bounds.cx + bounds.r * 0.8, bounds.r * 1.4, bounds.cz + bounds.r * 0.6]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-shadowSize}
        shadow-camera-right={shadowSize}
        shadow-camera-top={shadowSize}
        shadow-camera-bottom={-shadowSize}
        shadow-camera-near={0.5}
        shadow-camera-far={bounds.r * 6}
        target-position={[bounds.cx, 0, bounds.cz]}
      />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={1.2} rotation-x={Math.PI / 2} position={[0, 6, 0]} scale={[12, 12, 1]} color="#ffffff" />
        <Lightformer intensity={0.5} rotation-y={Math.PI / 2} position={[-6, 2, 0]} scale={[8, 4, 1]} color="#dbe7f5" />
        <Lightformer intensity={0.5} rotation-y={-Math.PI / 2} position={[6, 2, 0]} scale={[8, 4, 1]} color="#f5ecd9" />
      </Environment>
      {/* sol environnant */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.01, bounds.cz]} receiveShadow onClick={() => onSelectRoom(null)}>
        <planeGeometry args={[bounds.r * 8, bounds.r * 8]} />
        <meshStandardMaterial color="#d7dce3" roughness={1} />
      </mesh>
      <ContactShadows position={[bounds.cx, 0, bounds.cz]} opacity={0.45} scale={bounds.r * 3} blur={2.2} far={4} resolution={512} frames={1} />
      <group>
        {project.pieces.map((r) => (
          <RoomFloor key={r.id} project={project} roomId={r.id} selected={r.id === selectedRoomId} onSelect={onSelectRoom} afficherPlafonds={afficherPlafonds && !maquetteOuverte} />
        ))}
        <Walls walls={walls} maquetteOuverte={maquetteOuverte} />
        <Joinery walls={walls} maquetteOuverte={maquetteOuverte} />
      </group>
      <CameraRig project={project} controlsRef={controlsRef} presetView={presetView} modeVisite={modeVisite} />
      {modeVisite ? (
        <WalkControls project={project} keys={walkKeys} />
      ) : (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          autoRotate={rotationAuto}
          autoRotateSpeed={1.2}
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={1.5}
          maxDistance={Math.max(40, bounds.r * 6)}
          enablePan
          target={[bounds.cx, 0.6, bounds.cz]}
        />
      )}
    </>
  )
}
