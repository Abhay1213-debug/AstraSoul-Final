import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { services } from '../data/services'
import { whatsappUrl } from '../lib/contact'
import { PACKAGES, comboKey, priceFor, withGst, type ServiceSlug } from '../shared/booking'

const bookLink = (picked: readonly ServiceSlug[]) => `/consultation/request?service=${encodeURIComponent(comboKey(picked))}`

export function CustomPlan() {
  return (
    <p className="custom-plan">
      Want a different combination?{' '}
      <a href={whatsappUrl('Hello Ankiro, I would like a customised consultation plan.')} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> Drop us a message for a customised plan</a>
    </p>
  )
}

/** Packages, as rows that open the booking with that package chosen. `only` limits them to packages with that service. */
export function PackageRows({ only }: { only?: ServiceSlug }) {
  return (
    <ul>
      {PACKAGES.filter((pk) => !only || pk.services.includes(only)).map((pk) => {
        const p = priceFor(pk.services)
        return p ? (
          <li key={comboKey(pk.services)}>
            <span className="price-list__name">
              <Link to={bookLink(pk.services)}>{pk.name}</Link>
              {pk.recommended && <span className="badge badge--pick">Highly recommended</span>}
              {pk.note && <small>{pk.note}</small>}
            </span>
            <span className="price-list__price">{withGst(p)}</span>
          </li>
        ) : null
      })}
    </ul>
  )
}

/** Every price for a voice consultation, before GST. Each row opens the booking with that choice made. */
export function PriceList() {
  return (
    <div className="price-list">
      <div>
        <h3>One service</h3>
        <ul>
          {services.map((s) => {
            const p = priceFor([s.slug])
            return p ? (
              <li key={s.slug}>
                <span className="price-list__name"><Link to={bookLink([s.slug])}>{s.name}</Link></span>
                <span className="price-list__price">{withGst(p)}</span>
              </li>
            ) : null
          })}
        </ul>
      </div>
      <div>
        <h3>Packages</h3>
        <PackageRows />
      </div>
      <CustomPlan />
    </div>
  )
}
