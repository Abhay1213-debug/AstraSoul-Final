import type { CSSProperties } from 'react'

const C = 300
const at = (i: number, r: number) => [C + r * Math.sin((i * 2 * Math.PI) / 9), C - r * Math.cos((i * 2 * Math.PI) / 9)] as const

/**
 * The numerology wheel, as the display of the calculator. Nine nodes, the {9/4} star drawn line by line from
 * the scene's progress (--p), turned by --rot (degrees) which the section animates. Numerals counter-rotate so
 * they stay upright. When a result exists the chosen number is lit and the wheel has already turned to it.
 */
export function MoolankWheel({ chosen }: { chosen?: number }) {
  const nodes = Array.from({ length: 9 }, (_, i) => at(i, 196))
  return (
    <svg className="wheel" viewBox="0 0 600 600" role="img" aria-label={chosen ? `Numerology wheel turned to the number ${chosen}` : 'Numerology wheel with the numbers one to nine'}>
      <g className="wheel-fixed" fill="none">
        <circle cx={C} cy={C} r="288" className="w-ring" />
        {Array.from({ length: 108 }, (_, i) => (
          <line key={i} x1={C} y1={C - 288} x2={C} y2={C - (i % 12 === 0 ? 270 : 278)} transform={`rotate(${i * (360 / 108)} ${C} ${C})`} className="w-tick" />
        ))}
      </g>
      <g className="wheel-rot" fill="none">
        <circle cx={C} cy={C} r="232" className="w-ring w-ring--soft" />
        <circle cx={C} cy={C} r="196" className="w-ring" />
        <circle cx={C} cy={C} r="120" className="w-ring w-ring--dash" />
        {nodes.map((p, i) => {
          const q = nodes[(i + 4) % 9]
          return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} pathLength={1} className="w-line" style={{ '--i': i } as CSSProperties} />
        })}
        {nodes.map((p, i) => {
          const [lx, ly] = at(i, 244)
          const on = chosen === i + 1
          return (
            <g key={i} className={`w-node${on ? ' is-chosen' : ''}`} style={{ '--i': i } as CSSProperties}>
              <circle cx={p[0]} cy={p[1]} r={on ? 11 : 5} className="w-dot" />
              {on && <circle cx={p[0]} cy={p[1]} r="22" className="w-halo" />}
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="w-label">{i + 1}</text>
            </g>
          )
        })}
      </g>
      <circle cx={C} cy={C} r="7" className="w-core" />
      {chosen && <circle cx={C} cy={C} r="84" className="w-plate" />}
      {chosen && <text x={C} y={C + 6} textAnchor="middle" dominantBaseline="central" className="w-num">{chosen}</text>}
    </svg>
  )
}
