import { Sparkles } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { moolankMeanings } from '../data/moolankMeanings'
import { moolankFromIso, type DateParts, type MoolankResult } from '../lib/moolank'
import { ButtonLink, Notice } from './ui'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: string | number) => String(n).padStart(2, '0')

/**
 * Free introductory insight. Deterministic (see lib/moolank.ts) and calculated entirely in the
 * browser — the date entered is never stored or transmitted. The calculation is instant, so there
 * is intentionally no artificial "loading" state.
 */
export function MoolankCalculator() {
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<{ moolank: MoolankResult; date: DateParts }>()
  const errId = useId()
  const resultRef = useRef<HTMLDivElement>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setResult(undefined)
    if (!day || !month || !year.trim()) {
      setError('Please choose your day, month and year of birth.')
      return
    }
    if (!/^\d{4}$/.test(year.trim())) {
      setError('Please enter the year as four digits, for example 1990.')
      return
    }
    const r = moolankFromIso(`${year.trim()}-${pad(month)}-${pad(day)}`)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(undefined)
    setResult({ moolank: r.result, date: r.date })
    requestAnimationFrame(() => resultRef.current?.focus())
  }

  const meaning = result ? moolankMeanings[result.moolank.moolank] : undefined
  const invalid = Boolean(error)

  return (
    <div className="calc" data-clarity-mask="True">
      <form className="calc__form" onSubmit={onSubmit} noValidate aria-label="Moolank calculator">
        <fieldset className="calc__fieldset" aria-describedby={error ? errId : undefined}>
          <legend>Date of birth</legend>
          <p className="hint">Only your date of birth is needed. It is calculated in your browser and is never stored or sent anywhere.</p>
          <div className="dob">
            <label className="dob__field">
              <span>Day</span>
              <select className="select" value={day} aria-invalid={invalid} autoComplete="bday-day" onChange={(e) => setDay(e.target.value)}>
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
            <label className="dob__field dob__field--month">
              <span>Month</span>
              <select className="select" value={month} aria-invalid={invalid} autoComplete="bday-month" onChange={(e) => setMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="dob__field">
              <span>Year</span>
              <input className="input" inputMode="numeric" maxLength={4} placeholder="YYYY" value={year} aria-invalid={invalid} autoComplete="bday-year" onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          {error && <p className="field-error" id={errId} role="alert"><span>{error}</span></p>}
        </fieldset>
        <button type="submit" className="btn btn--primary btn--block">
          <Sparkles size={18} aria-hidden="true" /> Find my Moolank
        </button>
      </form>

      <div ref={resultRef} tabIndex={-1} aria-live="polite" className="calc__live">
        {result && meaning && (
          <div className="moolank-result">
            <p className="eyebrow">Your Moolank</p>
            <div className="moolank-number" role="img" aria-label={`Moolank ${result.moolank.moolank}`}>{result.moolank.moolank}</div>
            <p className="moolank-intro">Traditionally associated with</p>
            <ul className="theme-list">
              {meaning.themes.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <div className="moolank-working">
              <h3>How this was calculated</h3>
              <p className="calc-line" aria-label="Calculation">{result.moolank.explanation}</p>
              <p className="hint">
                Your Moolank is the day of the month you were born, with its digits added together until a single digit (1–9)
                remains. Month and year are not used. Numbers such as 11 and 22 are reduced fully (to 2 and 4).
              </p>
            </div>
            <Notice>
              <p>This is a general, traditional introduction — not a prediction and not personalised advice. For personalised guidance, a human expert looks at your own situation.</p>
            </Notice>
            <ButtonLink to="/consultation/request?service=numerology" variant="dark" arrow>Request a numerology consultation</ButtonLink>
          </div>
        )}
      </div>
    </div>
  )
}
