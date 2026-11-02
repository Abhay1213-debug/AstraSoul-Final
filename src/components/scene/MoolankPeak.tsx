import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanPin, useScrollScene } from '../../hooks/useScrollScene'
import { MoolankCalculator } from '../MoolankCalculator'
import { TextLink } from '../ui'
import { MoolankWheel } from './MoolankWheel'
import { SunDial } from './Gl'

/**
 * Act 6, the peak and the signature move. The wheel draws itself as you arrive, then the page holds still and
 * starts responding: enter a date of birth and the wheel physically turns to your number. The date never leaves
 * the calculator; the wheel only ever receives the single digit that comes out.
 */
export function MoolankPeak() {
  const pin = useCanPin()
  const scene = useScrollScene<HTMLElement>({ mode: pin ? 'pin' : 'pass', from: 0.95, to: 0.2, rest: 1 })
  const wheel = useRef<HTMLDivElement>(null)
  const [chosen, setChosen] = useState<number | undefined>()
  const target = useRef<number | undefined>(undefined)
  target.current = chosen
  // The 3D dial replaces the drawn wheel once its first frame exists; the drawn wheel stays as the fallback.
  const [gl, setGl] = useState<'off' | 'on' | 'failed'>('off')
  const glOn = useRef(false)
  glOn.current = gl === 'on'
  const onGl = useCallback((s: 'off' | 'on' | 'failed') => setGl(s), [])

  // The wheel eases toward its resting angle: a slow drift with scroll, or the angle that puts the chosen number on top.
  useEffect(() => {
    const el = wheel.current
    const sec = scene.current
    if (!el || !sec) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let rot = 0, raf = 0, visible = true
    const tick = () => {
      if (glOn.current) { raf = visible ? requestAnimationFrame(tick) : 0; return }
      const n = target.current
      const p = parseFloat(sec.style.getPropertyValue('--p')) || 0
      const goal = n ? -(n - 1) * 40 : reduce ? 0 : p * 40
      const k = n ? 0.05 : 0.18
      rot += (goal - rot) * k
      el.style.setProperty('--rot', rot.toFixed(2))
      raf = visible ? requestAnimationFrame(tick) : 0
    }
    tick()
    const io = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible && !raf) tick()
    })
    io?.observe(sec)
    return () => { io?.disconnect(); cancelAnimationFrame(raf) }
  }, [scene])

  return (
    <section className={`peak${pin ? ' peak--pinned' : ''}${chosen ? ' has-result' : ''}`} data-veil="0.45" ref={scene} aria-labelledby="insight-h">
      <div className="peak-stage">
        <div className={`peak-wheel${gl === 'on' ? ' has-gl' : ''}`} ref={wheel}>
          <MoolankWheel chosen={chosen} />
          <SunDial section={scene} chosen={chosen} onState={onGl} />
        </div>
        <div className="peak-copy">
          <span className="eyebrow">Free insight</span>
          <h2 id="insight-h">Discover your <em>Moolank</em></h2>
          <div className="peak-lede">
            <p className="lede">Your Moolank is your “root number”, taken from the day of the month you were born. Enter your date of birth and watch the sun turn to yours.</p>
          </div>
          <MoolankCalculator foldForm onResult={(n) => setChosen(n ?? undefined)} />
          <p className="peak-note"><TextLink to="/free-insight">About the free insight</TextLink></p>
        </div>
      </div>
    </section>
  )
}
