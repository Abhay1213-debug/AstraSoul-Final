import { describe, expect, it } from 'vitest'
import {
  calculateMoolank,
  daysInMonth,
  isLeapYear,
  moolankFromIso,
  parseIsoDate,
  reduceToSingleDigit,
  validateDate,
} from './moolank'

const TODAY = new Date(2026, 5, 15) // 15 June 2026, fixed for determinism

describe('calculateMoolank', () => {
  it.each([
    [1, 1],
    [5, 5],
    [9, 9],
    [10, 1],
    [14, 5],
    [18, 9],
    [19, 1],
    [22, 4], // 22 is reduced, not kept as a master number
    [29, 2],
    [30, 3],
    [31, 4],
    [11, 2],
  ])('day %i → Moolank %i', (day, expected) => {
    expect(calculateMoolank({ day, month: 1, year: 2000 }).moolank).toBe(expected)
  })

  it('every possible day maps to a single digit 1–9', () => {
    for (let day = 1; day <= 31; day++) {
      const { moolank } = calculateMoolank({ day, month: 1, year: 2000 })
      expect(moolank).toBeGreaterThanOrEqual(1)
      expect(moolank).toBeLessThanOrEqual(9)
    }
  })

  it('ignores month and year (Moolank depends on the day only)', () => {
    expect(calculateMoolank({ day: 14, month: 2, year: 1985 }).moolank).toBe(
      calculateMoolank({ day: 14, month: 11, year: 2003 }).moolank,
    )
  })

  it('explains the calculation', () => {
    expect(calculateMoolank({ day: 29, month: 3, year: 1990 })).toEqual({
      moolank: 2,
      steps: [29, 11, 2],
      explanation: '29 → 2 + 9 = 11 → 1 + 1 = 2',
    })
    expect(calculateMoolank({ day: 7, month: 3, year: 1990 }).explanation).toBe('7')
    expect(calculateMoolank({ day: 14, month: 3, year: 1990 }).explanation).toBe('14 → 1 + 4 = 5')
  })

  it('throws on a day outside 1–31', () => {
    expect(() => calculateMoolank({ day: 0, month: 1, year: 2000 })).toThrow(RangeError)
    expect(() => calculateMoolank({ day: 32, month: 1, year: 2000 })).toThrow(RangeError)
    expect(() => calculateMoolank({ day: 1.5, month: 1, year: 2000 })).toThrow(RangeError)
  })
})

describe('reduceToSingleDigit', () => {
  it('reduces repeatedly', () => {
    expect(reduceToSingleDigit(99).value).toBe(9)
    expect(reduceToSingleDigit(99).steps).toEqual([99, 18, 9])
  })
  it('rejects non-positive input', () => {
    expect(() => reduceToSingleDigit(0)).toThrow(RangeError)
    expect(() => reduceToSingleDigit(-4)).toThrow(RangeError)
  })
})

describe('calendar helpers', () => {
  it('detects leap years', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2023)).toBe(false)
  })
  it('knows month lengths', () => {
    expect(daysInMonth(2, 2024)).toBe(29)
    expect(daysInMonth(2, 2023)).toBe(28)
    expect(daysInMonth(4, 2023)).toBe(30)
    expect(daysInMonth(12, 2023)).toBe(31)
  })
})

describe('validateDate', () => {
  it('accepts real dates, including 29 Feb in a leap year', () => {
    expect(validateDate({ day: 29, month: 2, year: 2000 }, TODAY).ok).toBe(true)
    expect(validateDate({ day: 15, month: 6, year: 2026 }, TODAY).ok).toBe(true) // today
    expect(validateDate({ day: 1, month: 1, year: 1900 }, TODAY).ok).toBe(true)
  })
  it.each([
    ['29 Feb in a non-leap year', { day: 29, month: 2, year: 2023 }],
    ['29 Feb 1900 (not a leap year)', { day: 29, month: 2, year: 1900 }],
    ['31 April', { day: 31, month: 4, year: 2000 }],
    ['day 0', { day: 0, month: 4, year: 2000 }],
    ['month 13', { day: 1, month: 13, year: 2000 }],
    ['month 0', { day: 1, month: 0, year: 2000 }],
    ['year before 1900', { day: 1, month: 1, year: 1899 }],
    ['tomorrow', { day: 16, month: 6, year: 2026 }],
    ['future year', { day: 1, month: 1, year: 2040 }],
    ['NaN', { day: NaN, month: 1, year: 2000 }],
    ['fractional day', { day: 1.5, month: 1, year: 2000 }],
  ])('rejects %s', (_label, parts) => {
    const result = validateDate(parts, TODAY)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})

describe('parseIsoDate / moolankFromIso', () => {
  it('parses a valid ISO date', () => {
    expect(parseIsoDate('1990-03-29', TODAY)).toEqual({ ok: true, date: { year: 1990, month: 3, day: 29 } })
  })
  it('rejects empty and malformed strings', () => {
    for (const bad of ['', '  ', '29/03/1990', '1990-3-29', '1990-03-9', 'abcd-ef-gh', '19900329']) {
      expect(parseIsoDate(bad, TODAY).ok).toBe(false)
    }
  })
  it('rejects impossible ISO dates', () => {
    expect(parseIsoDate('2023-02-29', TODAY).ok).toBe(false)
    expect(parseIsoDate('2000-13-01', TODAY).ok).toBe(false)
  })
  it('computes Moolank end-to-end', () => {
    const r = moolankFromIso('1990-03-29', TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.moolank).toBe(2)
  })
  it('propagates validation errors', () => {
    const r = moolankFromIso('2030-01-01', TODAY)
    expect(r.ok).toBe(false)
  })
})
