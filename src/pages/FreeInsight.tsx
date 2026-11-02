import { useEffect, useState } from 'react'
import { MoolankCalculator } from '../components/MoolankCalculator'
import { ButtonLink, PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'
import { loadWeekly, weeklyIsRunning } from '../lib/weekly'

export default function FreeInsight() {
  usePageTitle('Free Moolank insight')
  const [weekly, setWeekly] = useState(false)
  useEffect(() => {
    let alive = true
    loadWeekly().then((i) => { if (alive) setWeekly(weeklyIsRunning(i)) })
    return () => { alive = false }
  }, [])
  const gets = [
    'Your Moolank, with the working shown',
    'Six words that sum up your number',
    'Three points on what your number says about you',
    ...(weekly ? ['This week’s reading for your number'] : []),
  ]
  return (
    <>
      <PageHero
        eyebrow="Free insight"
        title={<>Discover your <em>Moolank</em></>}
        lede="Your Moolank is the root number of the day you were born. Enter your date of birth to find yours and what it says about you."
      />
      <section className="section section--paper">
        <div className="container split split--wide-right" style={{ alignItems: 'start' }}>
          <div className="stack">
            <h2>What you <em>get</em></h2>
            <ul className="insight-gets">
              {gets.map((g) => <li key={g}>{g}</li>)}
            </ul>
            <h2>How your Moolank is <em>worked out</em></h2>
            <ol className="insight-steps">
              <li><span>Take the <strong>day of the month</strong> you were born (1–31).</span></li>
              <li><span>Add its digits together. If the result has two digits, add those digits again.</span></li>
              <li><span>Stop when a single digit (1–9) is left. That is your Moolank.</span></li>
            </ol>
            <p>For example: born on the 29th → <span className="example-chip">2 + 9 = 11 → 1 + 1 = 2</span></p>
            <p>Only the day counts, not the month or the year. 11 and 22 are reduced too, to 2 and 4.</p>
            <p><ButtonLink to="/services/numerology" variant="ghost">About numerology consultations</ButtonLink></p>
          </div>
          <MoolankCalculator />
        </div>
      </section>
    </>
  )
}
