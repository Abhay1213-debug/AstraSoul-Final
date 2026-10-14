import { Link } from 'react-router-dom'
import { siteConfig } from '../config/site'
import { services } from '../data/services'
import { Rings } from './art'
import { Logo } from './Logo'
import { ButtonLink } from './ui'

export function Footer() {
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
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </nav>
          <nav aria-label="Account and legal">
            <h2>Account &amp; legal</h2>
            <ul>
              <li><Link to="/login">Log in</Link></li>
              <li><Link to="/signup">Sign up</Link></li>
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
          <p>© {new Date().getFullYear()} {siteConfig.brandName}. Early pilot — some features are still being built; each page says what is and is not available.</p>
        </div>
      </div>
    </footer>
  )
}
