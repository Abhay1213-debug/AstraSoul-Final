import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Scroll-driven scenes. One shared scroll/resize loop reads every registered scene's geometry first and
 * writes every CSS variable second, so many scenes cost one layout pass per frame.
 *
 * A scene exposes its progress as `--p` (0 to 1) on its own element; all motion is authored in CSS from it.
 *  - `pin`  : the element is taller than the viewport and holds a sticky stage; p runs across the extra height.
 *  - `pass` : p runs while the element's top travels from `from` to `to` (fractions of the viewport height).
 * With reduced motion no loop runs and `--p` is fixed to `rest`, so the composition is complete and still.
 */
type Mode = 'pin' | 'pass'
export interface SceneOptions { mode?: Mode; from?: number; to?: number; rest?: number }

type Job = () => (() => void) | void
const jobs = new Set<Job>()
let queued = false
let bound = false

const run = () => {
  queued = false
  const writes: (() => void)[] = []
  jobs.forEach((j) => { const w = j(); if (w) writes.push(w) })
  writes.forEach((w) => w())
}
const kick = () => {
  if (queued) return
  queued = true
  requestAnimationFrame(run)
}
const bind = () => {
  if (bound) return
  bound = true
  window.addEventListener('scroll', kick, { passive: true })
  window.addEventListener('resize', kick)
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

export function useScrollScene<T extends HTMLElement>({ mode = 'pass', from = 1, to = 0.2, rest = 0 }: SceneOptions = {}) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.style.setProperty('--p', String(rest))
      return
    }
    let last = -1
    const job: Job = () => {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      let p: number
      if (mode === 'pin') {
        const travel = r.height - vh
        p = travel > 0 ? clamp01(-r.top / travel) : 0
      } else {
        p = clamp01((vh * from - r.top) / (vh * (from - to)))
      }
      if (Math.abs(p - last) < 0.0004) return
      last = p
      return () => el.style.setProperty('--p', p.toFixed(4))
    }
    jobs.add(job)
    bind()
    job()?.() // first write happens before paint, so a scene never flashes its end state
    kick()
    return () => { jobs.delete(job) }
  }, [mode, from, to, rest])
  return ref
}

/** Register a custom read-then-write job on the shared scroll/resize loop (same contract as a scene). */
export function useFrameJob(job: Job, deps: unknown[] = []) {
  useLayoutEffect(() => {
    jobs.add(job)
    bind()
    job()?.()
    kick()
    return () => { jobs.delete(job) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** True on screens wide and tall enough to hold a pinned stage; phones get a normal flow instead. */
export function useCanPin() {
  const q = '(min-width: 900px) and (min-height: 620px)'
  const [can, setCan] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches && !prefersReducedMotion())
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const on = () => setCan(m.matches && !prefersReducedMotion())
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return can
}

/**
 * Smoothed pointer position as `--mx` / `--my` (-1 to 1) on the element. Fine pointers only, never locks
 * or captures the cursor, and stops when the element is off screen.
 */
export function usePointerDepth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion() || !window.matchMedia?.('(pointer: fine)').matches) return
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0, visible = true
    const loop = () => {
      x += (tx - x) * 0.07
      y += (ty - y) * 0.07
      el.style.setProperty('--mx', x.toFixed(3))
      el.style.setProperty('--my', y.toFixed(3))
      raf = visible && (Math.abs(tx - x) > 0.002 || Math.abs(ty - y) > 0.002) ? requestAnimationFrame(loop) : 0
    }
    const wake = () => { if (!raf && visible) raf = requestAnimationFrame(loop) }
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2
      ty = (e.clientY / window.innerHeight - 0.5) * 2
      wake()
    }
    const io = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake() })
    io?.observe(el)
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      io?.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])
  return ref
}
