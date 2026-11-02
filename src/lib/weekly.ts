import type { MoolankNumber } from './moolank'

/**
 * The weekly Moolank readings, published by the team (from the week's Instagram post) as one small JSON file:
 * public/weekly/moolank.json. A reading is shown only while its week is running, so an old week never lingers.
 * The file format and the automation steps are in docs/WEEKLY-MOOLANK.md.
 */
export interface WeeklyHighlight { label: string; value: string }
export interface WeeklyReading { text: string; highlights: WeeklyHighlight[] }
export interface WeeklyIssue {
  weekStart: string
  weekEnd: string
  /** Link to the Instagram post the readings came from (instagram.com only). */
  post?: string
  readings: Partial<Record<MoolankNumber, WeeklyReading>>
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function parseReading(raw: unknown): WeeklyReading | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { text?: unknown; highlights?: unknown }
  const body = text(r.text, 1200)
  if (!body) return null
  const highlights = Array.isArray(r.highlights)
    ? r.highlights
        .map((h) => ({ label: text((h as WeeklyHighlight)?.label, 40), value: text((h as WeeklyHighlight)?.value, 80) }))
        .filter((h) => h.label && h.value)
        .slice(0, 4)
    : []
  return { text: body, highlights }
}

/** Checks the file's shape and drops anything malformed rather than showing it. */
export function parseWeekly(raw: unknown): WeeklyIssue | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { weekStart?: unknown; weekEnd?: unknown; post?: unknown; readings?: unknown }
  if (typeof r.weekStart !== 'string' || typeof r.weekEnd !== 'string' || !ISO.test(r.weekStart) || !ISO.test(r.weekEnd)) return null
  if (r.weekEnd < r.weekStart || !r.readings || typeof r.readings !== 'object') return null
  const readings: WeeklyIssue['readings'] = {}
  for (let n = 1 as MoolankNumber; n <= 9; n = (n + 1) as MoolankNumber) {
    const reading = parseReading((r.readings as Record<string, unknown>)[String(n)])
    if (reading) readings[n] = reading
  }
  let post: string | undefined
  try {
    const u = typeof r.post === 'string' ? new URL(r.post) : null
    if (u && u.protocol === 'https:' && /(^|\.)instagram\.com$/.test(u.hostname)) post = u.href
  } catch { /* no link */ }
  return { weekStart: r.weekStart, weekEnd: r.weekEnd, post, readings }
}

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The reading for this Moolank, if this week's issue is running today and has one. */
export function currentReading(issue: WeeklyIssue | null, n: MoolankNumber, today = new Date()): WeeklyReading | null {
  if (!issue) return null
  const day = localIso(today)
  if (day < issue.weekStart || day > issue.weekEnd) return null
  return issue.readings[n] ?? null
}

/** True while this week's issue is running and has at least one reading. */
export function weeklyIsRunning(issue: WeeklyIssue | null, today = new Date()): boolean {
  return ([1, 2, 3, 4, 5, 6, 7, 8, 9] as MoolankNumber[]).some((n) => currentReading(issue, n, today))
}

/** "26 Oct to 1 Nov" */
export function formatWeek(issue: WeeklyIssue): string {
  const f = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }
  return `${f(issue.weekStart)} to ${f(issue.weekEnd)}`
}

let pending: Promise<WeeklyIssue | null> | null = null

/** Loads the file once per visit. Any failure (offline, missing file, bad JSON) simply means no weekly reading is shown. */
export function loadWeekly(): Promise<WeeklyIssue | null> {
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}weekly/moolank.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then(parseWeekly)
      .catch(() => null)
  }
  return pending
}

/** Test helper. */
export function resetWeeklyCache() { pending = null }
