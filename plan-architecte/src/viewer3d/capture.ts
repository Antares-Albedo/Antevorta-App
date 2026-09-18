import type * as THREE from 'three'

/** Référence au rendu WebGL courant, alimentée par le composant Viewer3D, pour la capture PNG. */
export const glRef: { current: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera } | null } = { current: null }

export function capture3D(): string | null {
  const g = glRef.current
  if (!g) return null
  g.gl.render(g.scene, g.camera)
  return g.gl.domElement.toDataURL('image/png')
}
