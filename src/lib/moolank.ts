/**
 * Moolank (मूलांक) — "root number" in Indian numerology.
 *
 * Method used here (documented in the UI as well):
 *   1. Take only the DAY of the month of birth (1–31).
 *   2. Add its digits. Repeat until a single digit (1–9) remains.
 *   Examples: 5 → 5 · 14 → 1+4 = 5 · 29 → 2+9 = 11 → 1+1 = 2.
 *
 * Unlike some Western systems, 11 and 22 are NOT kept as "master numbers";
 * they are reduced fully (11 → 2, 22 → 4).
 *
 * Everything here is deterministic and runs entirely in the browser; no data is sent anywhere.
 */

export type MoolankNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface DateParts {
  day: number
  month: number
  year: number
}

export type DateValidationResult =
  | { ok: true; date: DateParts }
  | { ok: false; error: string }

export interface MoolankResult {
  moolank: MoolankNumber
  /** Numbers the reduction passed through, starting with the day, e.g. [29, 11, 2]. */
  steps: number[]
  /** Human-readable explanation, e.g. "29 → 2 + 9 = 11 → 1 + 1 = 2". */
  explanation: string
}

export const MIN_BIRTH_YEAR = 1900

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(month: number, year: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function digitSum(n: number): number {
  return String(n)
    .split('')
    .reduce((sum, d) => sum + Number(d), 0)
}

/**
 * Validates a calendar date. `today` is injectable so tests are deterministic.
 * Rejects non-integers, impossible dates (e.g. 31 Apr, 29 Feb in a non-leap year),
 * years before 1900, and dates in the future.
 */
export function validateDate(parts: DateParts, today: Date = new Date()): DateValidationResult {
  const { day, month, year } = parts
  if (![day, month, year].every(Number.isInteger)) {
    return { ok: false, error: 'Please enter a complete date of birth.' }
  }
  if (year < MIN_BIRTH_YEAR) {
    return { ok: false, error: `Please enter a year ${MIN_BIRTH_YEAR} or later.` }
  }
  if (month < 1 || month > 12) {
    return { ok: false, error: 'Month must be between 1 and 12.' }
  }
  if (day < 1 || day > daysInMonth(month, year)) {
    return { ok: false, error: 'That day does not exist in the selected month.' }
  }
  const candidate = new Date(year, month - 1, day)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (candidate.getTime() > todayStart.getTime()) {
    return { ok: false, error: 'Date of birth cannot be in the future.' }
  }
  return { ok: true, date: { day, month, year } }
}

/**
 * Parses an ISO date string as produced by `<input type="date">` (YYYY-MM-DD) and validates it.
 * Strict: exactly 4-digit year, 2-digit month and day.
 */
export function parseIsoDate(value: string, today: Date = new Date()): DateValidationResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) {
    return { ok: false, error: 'Please enter a valid date of birth.' }
  }
  return validateDate({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }, today)
}

/** Reduces a positive integer to a single digit by repeated digit addition. */
export function reduceToSingleDigit(n: number): { value: MoolankNumber; steps: number[]; explanation: string } {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError('Value must be a positive integer.')
  }
  const steps = [n]
  const parts = [String(n)]
  let current = n
  while (current > 9) {
    const digits = String(current).split('').join(' + ')
    const next = digitSum(current)
    parts.push(`${digits} = ${next}`)
    steps.push(next)
    current = next
  }
  return { value: current as MoolankNumber, steps, explanation: parts.join(' → ') }
}

/** Moolank for an already-validated date: the reduced day of the month. */
export function calculateMoolank(date: DateParts): MoolankResult {
  if (!Number.isInteger(date.day) || date.day < 1 || date.day > 31) {
    throw new RangeError('Day must be an integer between 1 and 31.')
  }
  const { value, steps, explanation } = reduceToSingleDigit(date.day)
  return { moolank: value, steps, explanation }
}

/** Convenience: validate an ISO date string and compute its Moolank. */
export function moolankFromIso(
  value: string,
  today: Date = new Date(),
): { ok: true; result: MoolankResult; date: DateParts } | { ok: false; error: string } {
  const parsed = parseIsoDate(value, today)
  if (!parsed.ok) return parsed
  return { ok: true, result: calculateMoolank(parsed.date), date: parsed.date }
}
