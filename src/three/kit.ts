import * as THREE from 'three'

/**
 * The 3D kit shared by the hero and the Moolank dial: a jeweller's light environment, faceted gem cuts lofted from
 * real proportions, a refractive gem material with dispersion, the gold sun from the Ankiro mark, and a renderer
 * runtime that renders only while visible and lowers its own resolution before it would ever drop frames.
 */

// ---------------------------------------------------------------------------------------------------------------
// Light environment: night-indigo surroundings, one warm sun and four soft boxes for the facets to catch.
// ---------------------------------------------------------------------------------------------------------------
const envVert = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const envFrag = /* glsl */ `
  uniform vec3 sunDir; varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    vec3 low = vec3(0.010, 0.012, 0.040), high = vec3(0.070, 0.080, 0.210);
    vec3 c = mix(low, high, smoothstep(-0.4, 0.9, d.y));
    float s = max(dot(d, sunDir), 0.0);
    c += vec3(3.2, 2.1, 0.9) * pow(s, 28.0) + vec3(0.42, 0.27, 0.10) * pow(s, 3.0);
    c += vec3(0.10, 0.12, 0.30) * pow(max(-d.y, 0.0), 2.0);
    gl_FragColor = vec4(c, 1.0);
  }`

export interface Environment { cube: THREE.Texture; pmrem: THREE.Texture; dispose(): void }

/** Waits for the next animation frame, so heavy set-up work is spread across frames instead of stalling one. */
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export async function makeEnvironmentAsync(renderer: THREE.WebGLRenderer, sun?: THREE.Vector3): Promise<Environment> {
  return makeEnvironment(renderer, sun, nextFrame)
}

export function makeEnvironment(renderer: THREE.WebGLRenderer, sun?: THREE.Vector3): Environment
export function makeEnvironment(renderer: THREE.WebGLRenderer, sun: THREE.Vector3 | undefined, pause: () => Promise<void>): Promise<Environment>
export function makeEnvironment(renderer: THREE.WebGLRenderer, sun = new THREE.Vector3(0.55, 0.62, -0.56), pause?: () => Promise<void>): Environment | Promise<Environment> {
  const scene = new THREE.Scene()
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({ vertexShader: envVert, fragmentShader: envFrag, side: THREE.BackSide, uniforms: { sunDir: { value: sun.clone().normalize() } }, depthWrite: false }),
  )
  scene.add(sky)
  // soft boxes: bright panels the facets reflect, the way jewellery is lit
  const box = (w: number, h: number, pos: [number, number, number], intensity: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...intensity), side: THREE.DoubleSide, toneMapped: false }))
    m.position.set(...pos)
    m.lookAt(0, 0, 0)
    scene.add(m)
  }
  box(14, 5, [-18, 14, 14], [5.0, 4.6, 4.0])
  box(5, 16, [22, 2, 8], [4.2, 3.4, 2.4])
  box(18, 3, [0, -16, 16], [1.6, 1.7, 2.4])
  box(6, 6, [-6, 4, -24], [2.2, 1.6, 0.9])

  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
  const cam = new THREE.CubeCamera(0.1, 100, rt)
  const finish = () => {
    const gen = new THREE.PMREMGenerator(renderer)
    const pm = gen.fromScene(scene, 0.03)
    gen.dispose()
    scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose() } })
    return { cube: rt.texture, pmrem: pm.texture, dispose() { rt.dispose(); pm.dispose() } }
  }
  cam.update(renderer, scene)
  if (!pause) return finish()
  return pause().then(finish)
}

// ---------------------------------------------------------------------------------------------------------------
// Gem cuts. Each cut is an outline lofted through levels (table, crown, girdle, pavilion) and closed at the
// table and the culet. Alternate levels turn half a step, which produces the star, kite and pavilion facets.
// Geometry is non-indexed so every triangle keeps its own flat normal: that is what makes a facet a facet.
// ---------------------------------------------------------------------------------------------------------------
type Level = { s: number; y: number; half?: boolean }
type Outline = (i: number, n: number, half: boolean) => [number, number]

function loft(n: number, outline: Outline, levels: Level[], culetY: number) {
  const rings = levels.map((l) => Array.from({ length: n }, (_, i) => { const [x, z] = outline(i, n, !!l.half); return new THREE.Vector3(x * l.s, l.y, z * l.s) }))
  const pos: number[] = []
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  const top = new THREE.Vector3(0, levels[0].y, 0)
  for (let i = 0; i < n; i++) tri(top, rings[0][(i + 1) % n], rings[0][i])
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1]
    for (let i = 0; i < n; i++) {
      const a0 = A[i], a1 = A[(i + 1) % n], b0 = B[i], b1 = B[(i + 1) % n]
      tri(a0, a1, b1); tri(a0, b1, b0)
    }
  }
  const culet = new THREE.Vector3(0, culetY, 0), last = rings[rings.length - 1]
  for (let i = 0; i < n; i++) tri(last[i], last[(i + 1) % n], culet)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

const ring = (sx = 1, sz = 1): Outline => (i, n, half) => { const a = ((i + (half ? 0.5 : 0)) / n) * Math.PI * 2; return [Math.cos(a) * sx, Math.sin(a) * sz] }
const BRILLIANT: Level[] = [{ s: 0.56, y: 0.31 }, { s: 0.8, y: 0.2, half: true }, { s: 1, y: 0.025 }, { s: 1, y: -0.025 }, { s: 0.52, y: -0.44, half: true }]
const STEP: Level[] = [{ s: 0.6, y: 0.27 }, { s: 0.82, y: 0.19 }, { s: 1, y: 0.03 }, { s: 1, y: -0.03 }, { s: 0.74, y: -0.24 }, { s: 0.42, y: -0.42 }]

/** An outline polygon (x, z) resampled per level, for step cuts with straight sides. */
const poly = (pts: [number, number][]): Outline => (i) => pts[i]
const octagon = (w: number, h: number, c: number): [number, number][] => [[w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c], [-w + c, -h], [w - c, -h], [w, -h + c]]
const hexagon = (w: number, h: number): [number, number][] => [[w, 0], [w * 0.55, h], [-w * 0.55, h], [-w, 0], [-w * 0.55, -h], [w * 0.55, -h]]
const marquise = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [Math.cos(t) * 1.2, Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 1.35) * 0.56] })
const cushion = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), p = 0.35; return [Math.sign(c) * Math.pow(Math.abs(c), p) * 0.92, Math.sign(s) * Math.pow(Math.abs(s), p) * 0.92] })

export type Cut = 'brilliant' | 'oval' | 'emerald' | 'hexagon' | 'marquise' | 'cushion'
export const CUTS: Cut[] = ['brilliant', 'emerald', 'oval', 'hexagon', 'cushion', 'marquise']

export function gemGeometry(cut: Cut): THREE.BufferGeometry {
  switch (cut) {
    case 'brilliant': return loft(16, ring(), BRILLIANT, -0.86)
    case 'oval': return loft(16, ring(1.3, 0.9), BRILLIANT, -0.8)
    case 'emerald': { const o = octagon(1, 0.66, 0.24); return loft(o.length, poly(o), STEP, -0.55) }
    case 'hexagon': { const o = hexagon(1.12, 0.62); return loft(o.length, poly(o), STEP, -0.55) }
    case 'marquise': { const o = marquise(16); return loft(o.length, poly(o), BRILLIANT, -0.62) }
    case 'cushion': { const o = cushion(16); return loft(o.length, poly(o), BRILLIANT, -0.78) }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Gem material: reflection plus three refracted rays (red, green, blue at slightly different indices) that bounce
// off a facet-dependent back face. Brilliance, fire and colour come from the environment, not from painted texture.
// ---------------------------------------------------------------------------------------------------------------
const gemVert = /* glsl */ `
  varying vec3 vPos; varying vec3 vNormal;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPos = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`
const gemFrag = /* glsl */ `
  uniform samplerCube envMap; uniform vec3 tint; uniform float ior; uniform float spread; uniform vec3 lightPos;
  uniform float lift; uniform float alpha; uniform float sparkle;
  varying vec3 vPos; varying vec3 vNormal;
  vec3 hash3(vec3 p){ p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.xxy + p.yzz) * p.zyx) * 2.0 - 1.0; }
  vec3 env(vec3 d){ return textureCube(envMap, d).rgb; }
  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vPos);
    if (!gl_FrontFacing) N = -N;
    float cosT = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.05 + 0.95 * pow(1.0 - cosT, 5.0);
    vec3 R = reflect(-V, N);
    vec3 Nb = normalize(-N + 0.85 * hash3(floor(N * 9.0) + 0.5));
    vec3 Tr = refract(-V, N, 1.0 / (ior - spread));
    vec3 Tg = refract(-V, N, 1.0 / ior);
    vec3 Tb = refract(-V, N, 1.0 / (ior + spread));
    vec3 inner = vec3(env(reflect(Tr, Nb)).r, env(reflect(Tg, Nb)).g, env(reflect(Tb, Nb)).b);
    vec3 L = normalize(lightPos - vPos);
    float glint = pow(max(dot(R, L), 0.0), 90.0) * 7.0 + pow(max(dot(reflect(Tg, Nb), L), 0.0), 26.0) * 2.4;
    vec3 body = inner * tint * 1.7 + tint * lift;
    vec3 col = mix(body, env(R), F) + glint * sparkle * mix(vec3(1.0), tint, 0.35);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

export function gemMaterial(env: THREE.Texture, color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    vertexShader: gemVert,
    fragmentShader: gemFrag,
    transparent: true,
    uniforms: {
      envMap: { value: env },
      tint: { value: new THREE.Color(color) },
      ior: { value: 1.72 },
      spread: { value: 0.045 },
      lightPos: { value: new THREE.Vector3(4, 6, 6) },
      lift: { value: 0.16 },
      alpha: { value: 1 },
      sparkle: { value: 1 },
    },
  })
}

// ---------------------------------------------------------------------------------------------------------------
// The sun from the Ankiro mark: sixteen long pointed rays alternating with sixteen short ones, extruded and
// bevelled in polished gold, with a raised rim and a face that can carry a number.
// ---------------------------------------------------------------------------------------------------------------
export function sunGeometry(points = 16, long = 1.0, short = 0.66, valley = 0.4) {
  const s = new THREE.Shape()
  const n = points * 2
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2
    const r = i % 2 === 1 ? valley : (i / 2) % 2 === 0 ? long : short
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y)
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.022, bevelSegments: 2, curveSegments: 1 })
  g.translate(0, 0, -0.045)
  return g
}

export function goldMaterial(env: THREE.Texture, roughness = 0.2) {
  // A night environment alone makes metal read as bronze; a low warm emission keeps the gold luminous.
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ffcf73'), metalness: 1, roughness, clearcoat: 0.5, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 2.6, emissive: new THREE.Color('#7a4c0c'), emissiveIntensity: 0.55 })
}

/** A crisp numeral (or any short text) drawn into a texture, in the site's display face. */
export function textTexture(text: string, opts: { size?: number; color?: string; italic?: boolean; weight?: number; glow?: string } = {}) {
  const size = opts.size ?? 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const x = c.getContext('2d')!
  x.clearRect(0, 0, size, size)
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.font = `${opts.italic ? 'italic ' : ''}${opts.weight ?? 400} ${Math.round(size * 0.72)}px Fraunces, Georgia, serif`
  if (opts.glow) { x.shadowColor = opts.glow; x.shadowBlur = size * 0.08 }
  x.fillStyle = opts.color ?? '#fff4dc'
  x.fillText(text, size / 2, size * 0.53)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A soft round light, for glows behind gems and the sun (additive, never a hard disc). */
export function glowTexture(inner = 'rgba(255,214,140,1)', outer = 'rgba(242,176,62,0)') {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, inner); g.addColorStop(0.35, 'rgba(250,180,70,0.35)'); g.addColorStop(1, outer)
  x.fillStyle = g; x.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------------------------------------------------------
// Runtime: one renderer per canvas, render only while on screen and the tab is visible, cap the pixel ratio, and
// step the resolution down (never up mid-scroll) when frames run long. Gives up to the still fallback only if even
// the lowest step cannot hold the frame budget.
// ---------------------------------------------------------------------------------------------------------------
export interface Runtime {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Render one frame now (used for still states and reduced motion). */
  renderOnce(): void
  dispose(): void
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

export function createRuntime(canvas: HTMLCanvasElement, opts: { fov?: number; animate: boolean; onFrame: (t: number, dt: number) => void; onGiveUp?: () => void }): Runtime {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 30, 1, 0.1, 100)
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const steps = coarse ? [1.5, 1.25, 1] : [2, 1.6, 1.3, 1]
  let step = steps.findIndex((s) => s <= (window.devicePixelRatio || 1))
  if (step < 0) step = steps.length - 1
  const ratio = () => Math.min(window.devicePixelRatio || 1, steps[step])

  const size = () => {
    const r = canvas.getBoundingClientRect()
    if (!r.width || !r.height) return
    renderer.setPixelRatio(ratio())
    renderer.setSize(r.width, r.height, false)
    camera.aspect = r.width / r.height
    camera.updateProjectionMatrix()
  }
  size()
  const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(size)
  ro?.observe(canvas)

  let visible = false, raf = 0, last = 0, slow = 0, frames = 0, gaveUp = false
  const frame = (now: number) => {
    raf = 0
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
    // Frame-time guard: 40 long frames in a window of 90 step the resolution down; at the floor, hand over to the still.
    if (last && now - last > 24) slow++
    last = now
    if (++frames >= 90) {
      if (slow > 40) {
        if (step < steps.length - 1) { step++; size() } else if (!gaveUp) { gaveUp = true; opts.onGiveUp?.(); return }
      }
      frames = 0; slow = 0
    }
    opts.onFrame(now / 1000, dt)
    renderer.render(scene, camera)
    if (visible && opts.animate && !document.hidden) raf = requestAnimationFrame(frame)
  }
  const start = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame) } }
  const io = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) (opts.animate ? start() : renderOnce()) }, { rootMargin: '120px' })
  io?.observe(canvas)
  const onVis = () => { if (!document.hidden) start() }
  document.addEventListener('visibilitychange', onVis)
  function renderOnce() { opts.onFrame(performance.now() / 1000, 0); renderer.render(scene, camera) }

  return {
    renderer, scene, camera, renderOnce,
    dispose() {
      cancelAnimationFrame(raf)
      io?.disconnect(); ro?.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry?.dispose()
          const m = o.material as THREE.Material & { map?: THREE.Texture }
          m.map?.dispose(); m.dispose()
        }
      })
      renderer.dispose()
    },
  }
}

export { THREE }
