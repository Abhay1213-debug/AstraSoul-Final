import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Service } from '../types/domain'
import { ServiceArt } from './art'
import { Reveal } from './ui'

/** Bento tile: each service has its own colour theme and illustration composition (see sections.css). */
export function ServiceCard({ service, index }: { service: Service; index: number }) {
  return (
    <Reveal delay={index * 0.08} className={`tile-wrap tile-wrap--${service.slug}`}>
      <Link to={`/services/${service.slug}`} className={`tile tile--${service.slug} theme-${service.slug}`} style={{ height: '100%' }}>
        <div className="tile__art"><ServiceArt slug={service.slug} /></div>
        <div className="tile__text">
          <div className="tile__num">0{index + 1}</div>
          <h3>{service.name}</h3>
          <p>{service.summary}</p>
          <span className="tile__go">Learn more <i><ArrowRight size={16} aria-hidden="true" /></i></span>
        </div>
      </Link>
    </Reveal>
  )
}
