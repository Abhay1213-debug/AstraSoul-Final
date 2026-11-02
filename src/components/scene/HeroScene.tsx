import { Users } from 'lucide-react'
import type { CSSProperties } from 'react'
import { usePointerDepth, useScrollScene } from '../../hooks/useScrollScene'
import { HERO_ALT, HERO_FIGURE_SIZE, HERO_FIGURE_SRC } from '../photo'
import { ButtonLink } from '../ui'
import { proof } from '../../config/site'
import { HeroGems } from './Gl'

/** Deterministic star field so server, client and screenshots always agree. */
function field(n: number, seed: number) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  return Array.from({ length: n }, () => ({ x: rnd() * 100, y: rnd() * 100, r: 0.6 + rnd() * 1.1, d: rnd() * 6 }))
}
const FAR = field(90, 7)
const NEAR = field(34, 21)

const rise = (i: number) => ({ '--i': i }) as CSSProperties

function Stars({ stars, className, twinkle }: { stars: ReturnType<typeof field>; className: string; twinkle?: boolean }) {
  return (
    <svg className={`sh-layer ${className}`} aria-hidden="true" focusable="false">
      {stars.map((s, i) => (
        <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} className={twinkle && i % 3 === 0 ? 'tw' : undefined} style={{ animationDelay: `${s.d}s` }} />
      ))}
    </svg>
  )
}

/**
 * Act 1, the layered night sky. Planes move at different rates from one scroll progress value (--p) and from the
 * pointer (--mx, --my): far stars, the night-sky plate, golden light that brightens behind her, her cutout
 * (which moves against the sky), near stars, then mist and dust passing in front. The headline lives between the planes and the
 * tagline arrives as real text at the end.
 */
export function HeroScene() {
  const scene = useScrollScene<HTMLElement>({ mode: 'pin' })
  const depth = usePointerDepth<HTMLDivElement>()
  return (
    <section className="sh" ref={scene} aria-label="Ankiro">
      <div className="sh-stage" ref={depth}>
        {/* the light behind her, then her glow-wrapped outline, then her: all three share one frame so the light tracks her head */}
        <div className="sh-focus">
          <i className="sh-bloom" aria-hidden="true" />
          <i className="sh-rays" aria-hidden="true" />
          <HeroGems section={scene} stage={depth} />
          <img className="sh-figure-glow" src={HERO_FIGURE_SRC} alt="" aria-hidden="true" width={HERO_FIGURE_SIZE.width} height={HERO_FIGURE_SIZE.height} decoding="async" />
          <img className="sh-figure" src={HERO_FIGURE_SRC} alt={HERO_ALT} width={HERO_FIGURE_SIZE.width} height={HERO_FIGURE_SIZE.height} decoding="async" fetchPriority="high" />
        </div>
        <div className="sh-scrim" aria-hidden="true" />
        <Stars stars={NEAR} className="sh-near" twinkle />

        <div className="sh-copy">
          <span className="eyebrow hero__rise" style={rise(0)}>Where your numbers find their voice</span>
          <h1>
            <span className="hero__rise" style={rise(1)}>Your questions.</span>
            <span className="hero__rise" style={rise(2)}><em>Deeper answers.</em></span>
            <span className="hero__rise" style={rise(3)}>A brighter you.</span>
          </h1>
          <p className="hero__lede hero__rise" style={rise(4)}>
            Numerology, palmistry, gemstone guidance and color therapy, from human experts, on a voice call.
          </p>
          <div className="cluster hero__rise" style={rise(5)}>
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
            <ButtonLink to="/free-insight" variant="ghost">Try the free insight</ButtonLink>
          </div>
          <p className="hero-proof hero__rise" style={rise(6)}><Users size={17} aria-hidden="true" /> {proof.line}</p>
        </div>

        <p className="sh-beat" aria-hidden="true">Same sky.<br /><em>A brighter you.</em></p>

        <div className="sh-layer sh-mist" aria-hidden="true"><i /><i /></div>
        <svg className="sh-layer sh-dust" aria-hidden="true" focusable="false">
          {FAR.slice(0, 14).map((s, i) => <circle key={i} cx={`${(s.x * 0.9 + i * 3.1) % 100}%`} cy={`${(s.y * 1.3 + i * 11) % 130}%`} r={1.4 + (i % 3) * 0.7} />)}
        </svg>
      </div>
    </section>
  )
}
