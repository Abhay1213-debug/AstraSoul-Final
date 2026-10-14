import { useId, type CSSProperties } from 'react'
import type { ServiceSlug } from '../types/domain'

/**
 * Original SVG artwork — no external image assets.
 * Service illustrations take their colours from the `.theme-*` CSS variables
 * (--t-bg, --t-ink, --t-accent) so each service has its own identity from one system.
 */

/** React ids contain ':' which is awkward inside url(#…); make them safe. */
const useSvgId = (prefix: string) => `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`

const line = (opacity = 1, width = 1.2): CSSProperties => ({ stroke: 'var(--t-accent)', strokeWidth: width, strokeOpacity: opacity, fill: 'none' })

// ======================================================================= Gem

const GEM = {
  a: [112, 92], b: [208, 92], t: [160, 270],
  g: [[52, 140], [104, 140], [160, 140], [216, 140], [268, 140]],
}

export function GemFacets({ fill, ink }: { fill: string; ink: string }) {
  const { a, b, t, g } = GEM
  const pts = (...p: number[][]) => p.map((q) => q.join(',')).join(' ')
  const facets: [number[][], number][] = [
    [[g[0], a, g[1]], 0.5], [[a, g[1], g[2]], 0.9], [[a, b, g[2]], 0.65], [[b, g[2], g[3]], 1], [[b, g[3], g[4]], 0.55],
    [[g[0], g[1], t], 0.7], [[g[1], g[2], t], 0.4], [[g[2], g[3], t], 0.8], [[g[3], g[4], t], 0.35],
  ]
  return (
    <g strokeLinejoin="round">
      {facets.map(([p, o], i) => <polygon key={i} points={pts(...p)} fill={fill} fillOpacity={o} stroke={ink} strokeOpacity="0.75" strokeWidth="2" />)}
      <polygon points={pts(a, b, g[2])} fill="#fff" fillOpacity="0.18" />
    </g>
  )
}

// ======================================================================= Services

const gradStops = (id: string, opacityA = 0.55, opacityB = 0) => (
  <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style={{ stopColor: 'var(--t-accent)', stopOpacity: opacityA }} />
    <stop offset="1" style={{ stopColor: 'var(--t-accent)', stopOpacity: opacityB }} />
  </radialGradient>
)

export function NumerologyArt() {
  const k = useSvgId('nm')
  const cx = 160, cy = 160
  const at = (i: number, r: number) => [cx + r * Math.sin((i * 2 * Math.PI) / 9), cy - r * Math.cos((i * 2 * Math.PI) / 9)]
  const pts = Array.from({ length: 9 }, (_, i) => at(i, 90))
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true">
      <defs>{gradStops(`${k}g`, 0.28)}</defs>
      <circle cx={cx} cy={cy} r="158" fill={`url(#${k}g)`} />
      <circle cx={cx} cy={cy} r="147" style={line(0.5)} />
      <circle cx={cx} cy={cy} r="105" style={line(0.28)} />
      {Array.from({ length: 90 }, (_, i) => (
        <line key={i} x1={cx} y1={cy - 147} x2={cx} y2={cy - (i % 10 === 0 ? 136 : 141)} transform={`rotate(${i * 4} ${cx} ${cy})`} style={line(i % 10 === 0 ? 0.7 : 0.35, 1)} />
      ))}
      <polygon points={pts.map((p) => p.join(',')).join(' ')} style={line(0.7)} />
      {pts.map((p, i) => <line key={i} x1={p[0]} y1={p[1]} x2={pts[(i + 4) % 9][0]} y2={pts[(i + 4) % 9][1]} style={line(0.6, 1)} />)}
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.6" style={{ fill: 'var(--t-accent)' }} />)}
      {Array.from({ length: 9 }, (_, i) => {
        const [x, y] = at(i, 122)
        return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--t-accent)', fontFamily: 'var(--font-display)', fontSize: 21, fontStyle: 'italic' }}>{i + 1}</text>
      })}
      <circle cx={cx} cy={cy} r="20" style={line(0.5)} />
      <circle cx={cx} cy={cy} r="7" style={{ fill: 'var(--t-accent)' }} />
    </svg>
  )
}

/** Tapered finger: base centre at (0,0), pointing up. */
const finger = (len: number, w0 = 27, w1 = 21) =>
  `M${-w0 / 2} 0L${-w1 / 2} ${-len}A${w1 / 2} ${w1 / 2} 0 0 1 ${w1 / 2} ${-len}L${w0 / 2} 0`

export function PalmistryArt() {
  const k = useSvgId('pm')
  const fingers: [number, number, number][] = [[112, 96, -10], [144, 114, -3], [176, 104, 4], [207, 82, 12]]
  const outline: CSSProperties = { ...line(0.9, 1.6), strokeLinejoin: 'round', strokeLinecap: 'round' }
  const crease: CSSProperties = { ...line(1, 1.7), strokeLinecap: 'round' }
  return (
    <svg viewBox="0 0 320 360" aria-hidden="true">
      <defs>
        {gradStops(`${k}g`, 0.3)}
        <linearGradient id={`${k}p`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--t-accent)', stopOpacity: 0.16 }} />
          <stop offset="1" style={{ stopColor: 'var(--t-accent)', stopOpacity: 0.03 }} />
        </linearGradient>
      </defs>
      <circle cx="160" cy="214" r="170" fill={`url(#${k}g)`} />
      <circle cx="160" cy="214" r="150" style={line(0.28)} />
      <circle cx="160" cy="214" r="120" style={{ ...line(0.28), strokeDasharray: '1 8' }} />
      <path d={finger(86, 30, 24)} transform="translate(98 284) rotate(-54)" style={outline} />
      {fingers.map(([x, len, a]) => <path key={x} d={finger(len)} transform={`translate(${x} 208) rotate(${a})`} style={outline} />)}
      <path d="M96 204C90 262 94 304 124 330C146 348 176 348 198 330C226 304 230 262 224 204Z" style={{ fill: 'var(--t-bg)' }} />
      <path d="M96 204C90 262 94 304 124 330C146 348 176 348 198 330C226 304 230 262 224 204Z" fill={`url(#${k}p)`} />
      <path d="M96 208C91 262 95 304 124 330C146 348 176 348 198 330C226 304 230 262 224 208" style={outline} />
      <path d="M102 240C150 214 196 220 222 244" style={crease} />
      <path d="M102 268C150 252 196 258 218 280" style={crease} />
      <path d="M146 212C112 246 112 298 150 330" style={crease} />
      <path d="M172 332C166 300 170 268 178 238" style={{ ...crease, strokeOpacity: 0.6, strokeWidth: 1.2 }} />
      {[[102, 240], [222, 244], [150, 330], [178, 238]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.2" style={{ fill: 'var(--t-accent)' }} />)}
    </svg>
  )
}

export function GemstoneArt() {
  const k = useSvgId('gm')
  const rays = Array.from({ length: 16 }, (_, i) => i * 22.5)
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true">
      <defs>
        {gradStops(`${k}g`, 0.34)}
        <linearGradient id={`${k}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--t-ink)', stopOpacity: 0.55 }} />
          <stop offset="0.5" style={{ stopColor: 'var(--t-accent)', stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: 'var(--t-accent)', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle cx="160" cy="170" r="156" fill={`url(#${k}g)`} />
      <circle cx="160" cy="170" r="142" style={line(0.3)} />
      {rays.map((a) => <line key={a} x1="160" y1="170" x2="160" y2="20" transform={`rotate(${a} 160 170)`} style={{ ...line(0.22, 1), strokeDasharray: '2 9' }} />)}
      <ellipse cx="160" cy="284" rx="86" ry="9" style={{ fill: 'var(--t-accent)', opacity: 0.18 }} />
      <GemFacets fill={`url(#${k}f)`} ink="var(--t-bg)" />
      {[[240, 70, 11], [74, 108, 7], [262, 176, 6]].map(([x, y, s]) => (
        <path key={x} d={`M${x} ${y - s}L${x + s * 0.28} ${y - s * 0.28}L${x + s} ${y}L${x + s * 0.28} ${y + s * 0.28}L${x} ${y + s}L${x - s * 0.28} ${y + s * 0.28}L${x - s} ${y}L${x - s * 0.28} ${y - s * 0.28}Z`} style={{ fill: 'var(--t-accent)', opacity: 0.85 }} />
      ))}
    </svg>
  )
}

export function ColorArt() {
  const k = useSvgId('cl')
  const circles: [number, number, string][] = [[124, 122, '#c17d61'], [196, 122, '#a7ac91'], [124, 194, '#d8b56d'], [196, 194, '#604651']]
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true">
      <defs>
        <radialGradient id={`${k}d`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#f9f4e6" />
        </radialGradient>
        {circles.map(([, , c], i) => (
          <radialGradient key={c} id={`${k}c${i}`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor={c} stopOpacity="0.75" />
            <stop offset="1" stopColor={c} stopOpacity="1" />
          </radialGradient>
        ))}
      </defs>
      <circle cx="160" cy="158" r="146" fill={`url(#${k}d)`} />
      <circle cx="160" cy="158" r="146" style={line(0.4)} />
      <g style={{ mixBlendMode: 'multiply' }}>
        {circles.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="72" fill={`url(#${k}c${i})`} />)}
      </g>
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i * 10 * Math.PI) / 180
        return <circle key={i} cx={160 + 158 * Math.sin(a)} cy={158 - 158 * Math.cos(a)} r={i % 3 === 0 ? 3 : 1.6} fill={circles[Math.floor(i / 9) % 4][2]} />
      })}
    </svg>
  )
}

export function ServiceArt({ slug }: { slug: ServiceSlug }) {
  switch (slug) {
    case 'numerology': return <NumerologyArt />
    case 'palmistry': return <PalmistryArt />
    case 'gemstone-guidance': return <GemstoneArt />
    case 'color-therapy': return <ColorArt />
  }
}

// ======================================================================= Decoration

/** Faint concentric rings with tick marks, used behind headings and sections. */
export function Rings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 600" aria-hidden="true" fill="none" stroke="currentColor">
      {[290, 230, 170, 110].map((r, i) => <circle key={r} cx="300" cy="300" r={r} strokeWidth="1" strokeDasharray={i % 2 ? '1 9' : undefined} />)}
      {Array.from({ length: 36 }, (_, i) => <line key={i} x1="300" y1="6" x2="300" y2={i % 3 === 0 ? 26 : 16} transform={`rotate(${i * 10} 300 300)`} strokeWidth="1" />)}
    </svg>
  )
}
