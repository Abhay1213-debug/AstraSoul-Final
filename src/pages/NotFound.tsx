import { ButtonLink, PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

export default function NotFound() {
  usePageTitle('Page not found')
  return (
    <PageHero title="We couldn’t find that page" lede="The link may be out of date, or the page may not exist.">
      <div className="cluster" style={{ marginTop: 'var(--space-5)' }}>
        <ButtonLink to="/">Go to the home page</ButtonLink>
        <ButtonLink to="/services" variant="ghost">Browse services</ButtonLink>
      </div>
    </PageHero>
  )
}
