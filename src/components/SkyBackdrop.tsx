import { useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { prefersReducedMotion, useFrameJob } from '../hooks/useScrollScene'
import { HERO_SKY_SIZE, HERO_SKY_SRC } from './photo'

/** Deterministic star field so server, client and screenshots always agree. */
function field(n: number, seed: number) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  return Array.from({ length: n }, () => ({ x: rnd() * 100, y: rnd() * 100, r: 0.5 + rnd() * 1.1, d: rnd() * 6 }))
}
const STARS = field(70, 41)

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
/** Smooth ease between a and b; works when a > b (descending). */
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/**
 * One night sky for the whole site, fixed behind every page. It drifts with the page (--sp) and clears or softens
 * behind content (--v, 0 sharp to 1 fully blurred and dimmed). On the home page the veil is driven by sections that
 * declare data-veil="<strength>": it starts easing in about a quarter of a screen BEFORE a section arrives and eases
 * out as the section leaves, so the sky never snaps. On every other page content needs clarity, so the veil is full.
 */
export function SkyBackdrop() {
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const mode = pathname === '/' ? 'home' : 'inner'
  const reduced = prefersReducedMotion()

  useFrameJob(() => {
    const el = ref.current
    if (!el || reduced) return
    const vh = window.innerHeight
    const doc = document.documentElement
    const sp = clamp01(window.scrollY / Math.max(1, doc.scrollHeight - vh))
    let v = 0
    if (el.dataset.mode === 'inner') v = 1
    else {
      document.querySelectorAll<HTMLElement>('[data-veil]').forEach((n) => {
        const r = n.getBoundingClientRect()
        const strength = parseFloat(n.dataset.veil || '1')
        v = Math.max(v, strength * smooth(vh * 1.25, vh * 0.4, r.top) * smooth(vh * 0.05, vh * 0.6, r.bottom))
      })
    }
    return () => {
      el.style.setProperty('--sp', sp.toFixed(4))
      el.style.setProperty('--v', v.toFixed(3))
    }
  }, [mode, reduced])

  return (
    <div className="sky" ref={ref} data-mode={mode} aria-hidden="true" style={reduced ? ({ '--v': mode === 'home' ? 0.55 : 1, '--sp': 0 } as React.CSSProperties) : undefined}>
      <div className="sky-plate">
        <img className="sky-img" src={HERO_SKY_SRC} alt="" width={HERO_SKY_SIZE.width} height={HERO_SKY_SIZE.height} decoding="async" fetchPriority="high" />
        <img className="sky-img sky-soft" src={HERO_SKY_SRC} alt="" width={HERO_SKY_SIZE.width} height={HERO_SKY_SIZE.height} decoding="async" />
      </div>
      <svg className="sky-stars" focusable="false">
        {STARS.map((s, i) => <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} className={i % 4 === 0 ? 'tw' : undefined} style={{ animationDelay: `${s.d}s` }} />)}
      </svg>
      <div className="sky-dim" />
    </div>
  )
}
