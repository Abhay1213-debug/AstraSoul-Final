import { createRuntime, gemGeometry, gemMaterial, glowTexture, goldMaterial, makeEnvironmentAsync, nextFrame, sunGeometry, textTexture, THREE, type Cut } from './kit'

/**
 * The Moolank dial: the gold sun of the Ankiro mark at the centre, nine cut stones on a ring (one per number,
 * 1 at the top, clockwise), numerals that always stay upright, and a fine ring of ticks. On arrival the stones fly
 * in from scattered positions and settle into the ring. When a number is found the ring turns that stone to the top,
 * it comes forward and lights, and the sun writes the number on its face.
 */
const COLORS = ['#ff6f7d', '#ffa25a', '#ffd25a', '#7ee08a', '#47d6c4', '#6aa8ff', '#8b8cff', '#b48cff', '#ff8fd0']
const CUTS: Cut[] = ['brilliant', 'emerald', 'oval', 'hexagon', 'cushion', 'brilliant', 'marquise', 'emerald', 'oval']
const R = 2.35
const angleOf = (n: number) => Math.PI / 2 - ((n - 1) * 2 * Math.PI) / 9

export interface Dial { setChosen(n: number | null): void; dispose(): void }

/** Set-up is spread over several frames (renderer, light, models, shader compile) so it never stalls scrolling. */
export async function mountSunDial(canvas: HTMLCanvasElement, opts: { section: HTMLElement; reduced: boolean; onReady: () => void; onGiveUp: () => void; alive: () => boolean }): Promise<Dial | null> {
  let ready = false
  let chosen: number | null = null
  let rot = 0, lit = 0, numberIn = 0, pointerX = 0, pointerY = 0
  const stones: { mesh: THREE.Mesh; glow: THREE.Sprite; label: THREE.Sprite; from: THREE.Vector3; n: number; spin: number }[] = []
  const dial = new THREE.Group()
  const ringGroup = new THREE.Group()
  const sun = new THREE.Group()
  let face: THREE.Mesh | null = null
  let faceTex: THREE.Texture | null = null
  let sunGlow: THREE.Sprite

  const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)
  const rt = createRuntime(canvas, {
    fov: 30,
    animate: !opts.reduced,
    onGiveUp: opts.onGiveUp,
    onFrame: (t, dt) => {
      if (!ready) return
      const p = opts.reduced ? 1 : parseFloat(opts.section.style.getPropertyValue('--p')) || 0
      const k = dt ? 1 - Math.exp(-dt * 3.2) : 1
      const goal = chosen ? ((chosen - 1) * 2 * Math.PI) / 9 : opts.reduced ? 0 : p * 0.7
      rot += (goal - rot) * (chosen ? k * 0.9 : k)
      lit += ((chosen ? 1 : 0) - lit) * k
      numberIn += ((chosen ? 1 : 0) - numberIn) * (dt ? 1 - Math.exp(-dt * 2.4) : 1)
      ringGroup.rotation.z = rot
      dial.rotation.set(0.28 - pointerY * 0.08, -0.16 + pointerX * 0.12, 0)
      const assemble = (i: number) => ease((p - 0.02 - i * 0.025) / 0.3)
      stones.forEach((s, i) => {
        const a = angleOf(s.n), on = chosen === s.n ? lit : 0
        const slot = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, on * 0.7)
        const e = assemble(i)
        s.mesh.position.lerpVectors(s.from, slot, e)
        s.mesh.rotation.set(1.05 + Math.sin(t * 0.4 + i) * 0.1, (opts.reduced ? 0.6 : t * s.spin) + i, -ringGroup.rotation.z)
        s.mesh.scale.setScalar(0.34 * (1 + on * 0.55))
        const m = s.mesh.material as THREE.ShaderMaterial
        m.uniforms.alpha.value = e * (1 - lit * 0.45 + on * 0.45)
        m.uniforms.sparkle.value = 1 + on * 1.6
        s.glow.position.copy(s.mesh.position)
        s.glow.scale.setScalar(1.6 + on * 1.4)
        s.glow.material.opacity = e * (0.22 + on * 0.5)
        const la = angleOf(s.n)
        s.label.position.set(Math.cos(la) * 3.1, Math.sin(la) * 3.1, 0)
        s.label.material.opacity = ease((p - 0.25) / 0.2) * (chosen ? (chosen === s.n ? 1 : 0.35) : 0.85)
        s.label.scale.setScalar(chosen === s.n ? 0.62 + on * 0.18 : 0.5)
      })
      const sunIn = ease(p / 0.32)
      sun.scale.setScalar(1.18 * (0.6 + 0.4 * sunIn) * (1 + 0.04 * numberIn))
      sun.rotation.z = (1 - sunIn) * -1.2 + (opts.reduced ? 0 : Math.sin(t * 0.2) * 0.03)
      sunGlow.material.opacity = sunIn * (0.55 + 0.45 * numberIn)
      sunGlow.scale.setScalar(5.2 + numberIn * 1.6)
      if (face) {
        const fm = face.material as THREE.MeshBasicMaterial
        fm.opacity = numberIn
        face.scale.setScalar(0.85 + 0.15 * numberIn)
      }
    },
  })
  rt.camera.position.set(0, 0, 15)
  rt.camera.lookAt(0, 0, 0)

  await nextFrame()
  if (!opts.alive()) { rt.dispose(); return null }
  const env = await makeEnvironmentAsync(rt.renderer, new THREE.Vector3(-0.4, 0.7, 0.6))
  await nextFrame()
  if (!opts.alive()) { env.dispose(); rt.dispose(); return null }
  const gold = goldMaterial(env.pmrem, 0.2)
  const glowTex = glowTexture()

  // the sun: rays, a raised rim, a polished face and a soft light behind (never a hard halo)
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
  sunGlow.position.z = -0.4
  const rays = new THREE.Mesh(sunGeometry(), gold)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 12, 64), gold)
  rim.position.z = 0.06
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 64), goldMaterial(env.pmrem, 0.32))
  disc.rotation.x = Math.PI / 2
  disc.position.z = 0.02
  sun.add(rays, rim, disc)

  // fine ticks around the outside, like the ring of the mark
  const tick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.11, 0.012), gold, 108)
  const tm = new THREE.Matrix4()
  for (let i = 0; i < 108; i++) {
    const a = (i / 108) * Math.PI * 2, r = i % 12 === 0 ? 3.62 : 3.66
    tm.makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * r, Math.sin(a) * r, 0)
    if (i % 12 === 0) tm.scale(new THREE.Vector3(1.4, 2, 1.4))
    tick.setMatrixAt(i, tm)
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(R, 0.008, 6, 160), gold)
  const outer = new THREE.Mesh(new THREE.TorusGeometry(3.78, 0.006, 6, 200), gold)

  const scatter = (i: number) => { const a = i * 2.4 + 0.7; return new THREE.Vector3(Math.cos(a) * (5 + (i % 3)), Math.sin(a) * (3.6 + (i % 2)), -3 - (i % 4)) }
  for (let n = 1; n <= 9; n++) {
    const i = n - 1
    const mat = gemMaterial(env.cube, COLORS[i])
    mat.uniforms.lightPos.value.set(-3, 5, 9)
    mat.uniforms.lift.value = 0.24
    const mesh = new THREE.Mesh(gemGeometry(CUTS[i]), mat)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(COLORS[i]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(String(n), { italic: true, color: '#e9ecff' }), transparent: true, depthWrite: false, opacity: 0 }))
    ringGroup.add(glow, mesh, label)
    stones.push({ mesh, glow, label, from: scatter(i), n, spin: 0.3 + (i % 4) * 0.12 })
  }
  ringGroup.add(band)
  dial.add(sunGlow, outer, tick, ringGroup, sun)
  rt.scene.add(dial)
  // two lights for crisp highlights along the bevels of the rays
  const key = new THREE.DirectionalLight('#fff1d6', 3.2)
  key.position.set(-4, 6, 9)
  const fill = new THREE.PointLight('#ffb84d', 30, 20)
  fill.position.set(2.5, -2, 5)
  rt.scene.add(key, fill)

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const r = canvas.getBoundingClientRect()
    pointerX = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2))
    pointerY = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2))
  }
  if (!opts.reduced) window.addEventListener('pointermove', onPointer, { passive: true })

  await nextFrame()
  // compile every shader without blocking (parallel compile where the browser supports it)
  try { await rt.renderer.compileAsync(rt.scene, rt.camera) } catch { /* fall back to compiling on first render */ }
  if (!opts.alive()) { window.removeEventListener('pointermove', onPointer); env.dispose(); glowTex.dispose(); rt.dispose(); return null }
  ready = true
  rt.renderOnce()
  opts.onReady()
  return {
    setChosen(n) {
      chosen = n
      if (face) { sun.remove(face); faceTex?.dispose(); (face.material as THREE.Material).dispose(); face.geometry.dispose(); face = null }
      if (n) {
        faceTex = textTexture(String(n), { size: 512, color: '#fff3d6', weight: 500, glow: 'rgba(255,200,110,0.9)' })
        face = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }))
        face.position.z = 0.075
        sun.add(face)
      }
      if (opts.reduced) { rot = n ? ((n - 1) * 2 * Math.PI) / 9 : 0; lit = n ? 1 : 0; numberIn = lit; rt.renderOnce() }
    },
    dispose() { window.removeEventListener('pointermove', onPointer); env.dispose(); glowTex.dispose(); faceTex?.dispose(); rt.dispose() },
  }
}
