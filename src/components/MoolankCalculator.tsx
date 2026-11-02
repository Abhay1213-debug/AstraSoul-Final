import { Sparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { birthDaysFor, moolankMeanings } from '../data/moolankMeanings'
import { moolankFromIso, type DateParts, type MoolankNumber, type MoolankResult } from '../lib/moolank'
import { currentReading, formatWeek, loadWeekly, type WeeklyIssue } from '../lib/weekly'
import { ButtonLink } from './ui'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: string | number) => String(n).padStart(2, '0')
const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`
const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`)

/** This week's reading for a Moolank, once the weekly file has loaded (nothing is shown while it loads or if there is none). */
function useWeekly(n: MoolankNumber | undefined) {
  const [issue, setIssue] = useState<WeeklyIssue | null>(null)
  useEffect(() => {
    if (!n) return
    let alive = true
    loadWeekly().then((i) => { if (alive) setIssue(i) })
    return () => { alive = false }
  }, [n])
  const reading = n ? currentReading(issue, n) : null
  return reading && issue ? { reading, issue } : null
}

/**
 * Free Moolank insight. Deterministic (see lib/moolank.ts) and calculated entirely in the browser: the date entered is
 * never stored or transmitted. The calculation is instant, so there is intentionally no artificial "loading" state.
 */
export function MoolankCalculator({ onResult, foldForm = false }: { onResult?: (moolank: number | null) => void; foldForm?: boolean } = {}) {
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<{ moolank: MoolankResult; date: DateParts }>()
  const errId = useId()
  const resultRef = useRef<HTMLDivElement>(null)
  const dayRef = useRef<HTMLSelectElement>(null)
  const n = result?.moolank.moolank
  const weekly = useWeekly(n)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setResult(undefined)
    onResult?.(null)
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
    onResult?.(r.result.moolank) // only the single digit leaves the calculator, never the date
    requestAnimationFrame(() => resultRef.current?.focus())
  }

  const meaning = n ? moolankMeanings[n] : undefined
  const invalid = Boolean(error)
  // Where space is short (the home page scene) the form folds into one line once there is a result.
  const folded = foldForm && Boolean(result)

  function changeDate() {
    setResult(undefined)
    onResult?.(null)
    requestAnimationFrame(() => dayRef.current?.focus())
  }

  return (
    <div className="calc" data-clarity-mask="True">
      {folded && result && (
        <p className="calc__entered">
          <span>Born {result.date.day} {MONTHS[result.date.month - 1]} {result.date.year}</span>
          <button type="button" onClick={changeDate}>Change date</button>
        </p>
      )}
      <form className="calc__form" onSubmit={onSubmit} noValidate aria-label="Moolank calculator" hidden={folded}>
        <fieldset className="calc__fieldset" aria-describedby={error ? errId : undefined}>
          <legend>Date of birth</legend>
          <div className="dob">
            <label className="dob__field">
              <span>Day</span>
              <select ref={dayRef} className="select" value={day} aria-invalid={invalid} autoComplete="bday-day" onChange={(e) => setDay(e.target.value)}>
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
        {result && n && meaning && (
          <div className="moolank-result">
            <p className="eyebrow">Your Moolank</p>
            <div className="moolank-number" role="img" aria-label={`Moolank ${n}`}>{n}</div>
            <p className="moolank-born">Shared by everyone born on the {listOf(birthDaysFor(n).map(ordinal))} of any month</p>
            <ul className="theme-list" aria-label={`Moolank ${n} keywords`}>
              {meaning.keywords.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <ul className="moolank-points">
              {meaning.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
            {weekly && (
              <section className="moolank-week" aria-labelledby="week-h">
                <h3 id="week-h">This week for Moolank {n} <span>{formatWeek(weekly.issue)}</span></h3>
                {weekly.reading.text.split(/\n{2,}/).map((para) => <p key={para}>{para}</p>)}
                {weekly.reading.highlights.length > 0 && (
                  <dl className="moolank-week__facts">
                    {weekly.reading.highlights.map((h) => <div key={h.label}><dt>{h.label}</dt><dd>{h.value}</dd></div>)}
                  </dl>
                )}
                {weekly.issue.post && <a className="moolank-week__post" href={weekly.issue.post} target="_blank" rel="noopener noreferrer">See this week’s post on Instagram</a>}
              </section>
            )}
            <details className="moolank-working">
              <summary>How this was calculated</summary>
              <p className="calc-line" aria-label="Calculation">{result.moolank.explanation}</p>
              <p className="hint">Your Moolank is the day of the month you were born, with its digits added together until one digit is left.</p>
            </details>
            <ButtonLink to="/consultation/request?service=numerology" variant="dark" arrow>Book a numerology consultation</ButtonLink>
          </div>
        )}
      </div>
    </div>
  )
}
