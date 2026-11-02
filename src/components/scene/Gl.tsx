import { useEffect, useRef, useState, type RefObject } from 'react'
import { prefersReducedMotion } from '../../hooks/useScrollScene'

/**
 * React mounts for the two 3D moments. three.js is loaded only when a moment is about to be seen, after the page
 * has painted, so text and buttons never wait for it. The canvas fades in once its first frame exists; if WebGL is
 * missing, the visitor has asked to save data, or the device cannot hold the frame budget, the 2D scene stays.
 */
type GlState = 'off' | 'on' | 'failed'

function canUse3D() {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (nav.connection?.saveData) return false
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

/** Calls `load` once the element is within a screen of the viewport. */
function useNear(ref: RefObject<HTMLElement | null>, margin = '100% 0px') {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin, near])
  return near
}

export function HeroGems({ section, stage }: { section: RefObject<HTMLElement | null>; stage: RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<GlState>('off')
  const near = useNear(canvas, '0px')
  useEffect(() => {
    if (!near || !canUse3D()) return
    let dispose: (() => void) | undefined, alive = true
    const go = () => import('../../three/heroGems').then(({ mountHeroGems }) => {
      if (!alive || !canvas.current || !section.current || !stage.current) return
      mountHeroGems(canvas.current, { section: section.current, stage: stage.current, reduced: prefersReducedMotion(), onReady: () => setState('on'), onGiveUp: () => setState('failed'), alive: () => alive })
        .then((d) => { if (d) { if (alive) dispose = d; else d() } })
        .catch(() => setState('failed'))
    })
    // let the first paint and the hero image settle before the 3D starts
    const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const handle = idle ? idle(go, { timeout: 900 }) : window.setTimeout(go, 300)
    return () => { alive = false; if (!idle) clearTimeout(handle); dispose?.() }
  }, [near, section, stage])
  return <canvas ref={canvas} className={`sh-gl is-${state}`} aria-hidden="true" />
}

export function SunDial({ section, chosen, onState }: { section: RefObject<HTMLElement | null>; chosen?: number; onState: (s: GlState) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dial = useRef<{ setChosen(n: number | null): void } | null>(null)
  const [state, setState] = useState<GlState>('off')
  // prepared well ahead of arrival (three screens), during idle time, so it is ready before anyone scrolls to it
  const near = useNear(canvas, '300% 0px')
  useEffect(() => { onState(state) }, [state, onState])
  useEffect(() => {
    if (!near || !canUse3D()) return
    let dispose: (() => void) | undefined, alive = true
    const go = () => import('../../three/sunDial').then(async ({ mountSunDial }) => {
      if (!alive || !canvas.current || !section.current) return
      try { await document.fonts?.load('italic 400 100px Fraunces') } catch { /* fall back to Georgia in the texture */ }
      if (!alive) return
      try {
        const d = await mountSunDial(canvas.current, { section: section.current, reduced: prefersReducedMotion(), onReady: () => setState('on'), onGiveUp: () => setState('failed'), alive: () => alive })
        if (!d) return
        if (!alive) { d.dispose(); return }
        dial.current = d
        dispose = () => d.dispose()
      } catch { setState('failed') }
    })
    const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const handle = idle ? idle(go, { timeout: 1500 }) : window.setTimeout(go, 200)
    return () => { alive = false; if (!idle) clearTimeout(handle); dial.current = null; dispose?.() }
  }, [near, section])
  useEffect(() => { dial.current?.setChosen(chosen ?? null) }, [chosen, state])
  return <canvas ref={canvas} className={`peak-gl is-${state}`} aria-hidden="true" />
}
