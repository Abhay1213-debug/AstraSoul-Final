import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Service } from '../types/domain'
import { ServiceArt } from './art'
import { Reveal } from './ui'

/** Bento tile: each service has its own colour theme and illustration composition (see sections.css). */
export function ServiceCard({ service, index, rail = false }: { service: Service; index: number; rail?: boolean }) {
  const tile = (
      <Link to={`/services/${service.slug}`} className={`tile tile--${service.slug} theme-${service.slug}`} style={{ height: '100%' }}>
        <div className="tile__art"><ServiceArt slug={service.slug} /></div>
        <div className="tile__text">
          <h3>{service.name}</h3>
          <p>{service.summary}</p>
          <span className="tile__go">Learn more <i><ArrowRight size={16} aria-hidden="true" /></i></span>
        </div>
      </Link>
  )
  if (rail) return <div className={`tile-wrap tile-wrap--${service.slug} rail-card`}>{tile}</div>
  return <Reveal delay={index * 0.08} className={`tile-wrap tile-wrap--${service.slug}`}>{tile}</Reveal>
}
