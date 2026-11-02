import { createRuntime, gemGeometry, gemMaterial, glowTexture, makeEnvironmentAsync, nextFrame, THREE, type Cut } from './kit'

/**
 * Hero gems: seven cut stones hanging in the golden light around her, at different depths. The canvas sits behind
 * the photographic figure, so stones behind her head are genuinely hidden by her hair. Scroll pushes the camera in
 * and lifts near stones faster than far ones; the pointer leans the camera. Colours follow the gems of the mark.
 */
const STONES: { cut: Cut; color: string; at: [number, number, number]; s: number; spin: number }[] = [
  { cut: 'brilliant', color: '#ff8fb2', at: [0.35, 1.12, 0.3], s: 0.19, spin: 0.5 },
  { cut: 'emerald', color: '#5fe0a0', at: [0.95, 1.4, -1.6], s: 0.21, spin: -0.35 },
  { cut: 'marquise', color: '#ffc85a', at: [4.0, 1.5, 0.1], s: 0.14, spin: 0.7 },
  { cut: 'oval', color: '#6aa8ff', at: [3.0, 1.2, -0.8], s: 0.2, spin: -0.5 },
  { cut: 'cushion', color: '#b48cff', at: [3.75, 0.05, -0.2], s: 0.18, spin: 0.38 },
  { cut: 'hexagon', color: '#47d6c4', at: [2.25, 1.5, -2.4], s: 0.2, spin: 0.42 },
  { cut: 'brilliant', color: '#f6e7c8', at: [0.9, 0.5, -3.2], s: 0.1, spin: 0.9 },
]

export async function mountHeroGems(canvas: HTMLCanvasElement, opts: { section: HTMLElement; stage: HTMLElement; reduced: boolean; onReady: () => void; onGiveUp: () => void; alive: () => boolean }): Promise<(() => void) | null> {
  let ready = false
  const items: { mesh: THREE.Mesh; glow: THREE.Sprite; base: THREE.Vector3; spin: number; s: number; phase: number }[] = []
  let born = 0
  const rt = createRuntime(canvas, {
    fov: 30,
    animate: !opts.reduced,
    onGiveUp: opts.onGiveUp,
    onFrame: (t, dt) => {
      if (!ready) return
      const p = parseFloat(opts.section.style.getPropertyValue('--p')) || 0
      const mx = parseFloat(opts.stage.style.getPropertyValue('--mx')) || 0
      const my = parseFloat(opts.stage.style.getPropertyValue('--my')) || 0
      born = opts.reduced ? 1 : Math.min(1, born + dt * 0.9)
      const enter = 1 - Math.pow(1 - born, 3)
      rt.camera.position.set(mx * 0.3, -my * 0.18, 10 - p * 1.6)
      rt.camera.lookAt(1.2, 0.6, 0)
      items.forEach((it, i) => {
        const depth = (it.base.z + 3.5) / 4.5 // 0 far .. 1 near
        const bob = opts.reduced ? 0 : Math.sin(t * 0.6 + it.phase) * 0.06
        it.mesh.position.set(it.base.x, it.base.y + bob + p * (0.5 + depth * 1.3), it.base.z)
        it.mesh.rotation.set(1.15 + Math.sin(t * 0.3 + i) * 0.12, t * it.spin + it.phase, Math.sin(t * 0.25 + it.phase) * 0.2)
        const sc = it.s * (0.55 + 0.45 * enter)
        it.mesh.scale.setScalar(sc)
        ;(it.mesh.material as THREE.ShaderMaterial).uniforms.alpha.value = enter
        it.glow.position.copy(it.mesh.position)
        it.glow.scale.setScalar(it.s * 4.6)
        it.glow.material.opacity = 0.26 * enter * (0.8 + 0.2 * Math.sin(t * 1.3 + it.phase))
      })
    },
  })
  await nextFrame()
  if (!opts.alive()) { rt.dispose(); return null }
  const env = await makeEnvironmentAsync(rt.renderer, new THREE.Vector3(0.6, 0.55, -0.6))
  await nextFrame()
  if (!opts.alive()) { env.dispose(); rt.dispose(); return null }
  const glowTex = glowTexture()
  // On narrow screens the hero is recomposed with her head at the top, so the stones gather closer around it.
  const compact = canvas.clientWidth < 700
  const head = new THREE.Vector3(1.5, 0.3, 0)
  STONES.forEach((s, i) => {
    const mat = gemMaterial(env.cube, s.color)
    mat.uniforms.lightPos.value.set(5, 6, -2)
    mat.uniforms.lift.value = 0.22
    const mesh = new THREE.Mesh(gemGeometry(s.cut), mat)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(s.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    rt.scene.add(glow, mesh)
    const base = new THREE.Vector3(...s.at)
    if (compact) base.sub(head).multiply(new THREE.Vector3(0.55, 0.55, 1)).add(head).add(new THREE.Vector3(0, -0.12, 0))
    items.push({ mesh, glow, base, spin: s.spin, s: s.s * (compact ? 0.85 : 1), phase: i * 1.7 })
  })
  await nextFrame()
  try { await rt.renderer.compileAsync(rt.scene, rt.camera) } catch { /* compiled on first render instead */ }
  if (!opts.alive()) { env.dispose(); glowTex.dispose(); rt.dispose(); return null }
  ready = true
  rt.renderOnce()
  opts.onReady()
  return () => { env.dispose(); glowTex.dispose(); rt.dispose() }
}
