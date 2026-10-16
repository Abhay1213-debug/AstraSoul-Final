import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { contactChannels, siteConfig } from '../config/site'
import { services } from '../data/services'
import { Rings } from './art'
import { Logo } from './Logo'
import { ButtonLink } from './ui'

export function Footer() {
  const accountsOn = useAuth().state.status !== 'unavailable'
  return (
    <footer className="site-footer">
      <Rings className="footer-rings" />
      <div className="container">
        <div className="footer-top">
          <p className="footer-statement">Guidance from <em>people</em>, explained with care.</p>
          <div className="cluster">
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
            <ButtonLink to="/free-insight" variant="ghost">Free insight</ButtonLink>
          </div>
        </div>
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p>Personalised spiritual guidance from human experts, with a simple free introductory tool.</p>
          </div>
          <nav aria-label="Services">
            <h2>Services</h2>
            <ul>
              {services.map((s) => (
                <li key={s.slug}><Link to={`/services/${s.slug}`}>{s.name}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Explore">
            <h2>Explore</h2>
            <ul>
              <li><Link to="/how-it-works">How it works</Link></li>
              <li><Link to="/experts">Experts</Link></li>
              <li><Link to="/consultation">Consultation options</Link></li>
              <li><Link to="/free-insight">Free introductory insight</Link></li>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/payment">How payment works</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </nav>
          <nav aria-label="Account and legal">
            <h2>{accountsOn ? 'Account & legal' : 'Legal'}</h2>
            <ul>
              {accountsOn && <li><Link to="/login">Log in</Link></li>}
              {accountsOn && <li><Link to="/signup">Sign up</Link></li>}
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms &amp; Conditions</Link></li>
              <li><Link to="/refund-policy">Refund Policy</Link></li>
            </ul>
          </nav>
        </div>
        <div className="footer-note">
          <p>
            Guidance on this site is offered for reflection and exploration. It does not promise specific outcomes and is not
            medical, legal or financial advice. Detailed recommendations come from human experts, not from software.
          </p>
          <p>
            Contact: <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a> · WhatsApp {contactChannels.whatsappDisplay}
          </p>
          <p>© {new Date().getFullYear()} {siteConfig.brandName}. A personal, hands-on service run from Gurugram, India.</p>
        </div>
      </div>
    </footer>
  )
}
