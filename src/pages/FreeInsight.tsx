import { MoolankCalculator } from '../components/MoolankCalculator'
import { ButtonLink, Notice, PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

export default function FreeInsight() {
  usePageTitle('Free introductory insight')
  return (
    <>
      <PageHero
        eyebrow="Free introductory insight"
        title={<>Discover your <em>Moolank</em></>}
        lede="A simple, free starting point: the root number of your date of birth, with the full working shown."
      />
      <section className="section section--paper">
        <div className="container split split--wide-right" style={{ alignItems: 'start' }}>
          <div className="stack">
            <h2>How your Moolank is <em>worked out</em></h2>
            <ol className="insight-steps">
              <li><span>Take the <strong>day of the month</strong> you were born (1–31).</span></li>
              <li><span>Add its digits together. If the result has two digits, add those digits again.</span></li>
              <li><span>Stop when a single digit (1–9) is left. That is your Moolank.</span></li>
            </ol>
            <p>For example: born on the 29th → <span className="example-chip">2 + 9 = 11 → 1 + 1 = 2</span></p>
            <p>The month and year are not used. Numbers like 11 and 22 are reduced all the way (to 2 and 4) rather than kept as “master numbers”.</p>
            <Notice>
              <p><strong>Private by design.</strong> The calculation happens in your browser. Your date of birth is not stored or sent anywhere from this page.</p>
            </Notice>
            <Notice tone="warn">
              <p><strong>Introductory only.</strong> The themes shown are traditional associations offered for reflection. They are not predictions, and they are not the personalised guidance a human expert provides.</p>
            </Notice>
            <p><ButtonLink to="/services/numerology" variant="ghost">About numerology consultations</ButtonLink></p>
          </div>
          <MoolankCalculator />
        </div>
      </section>
    </>
  )
}
