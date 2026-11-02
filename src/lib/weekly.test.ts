import { describe, expect, it } from 'vitest'
import { currentReading, formatWeek, parseWeekly, weeklyIsRunning } from './weekly'

const issue = {
  weekStart: '2026-10-26',
  weekEnd: '2026-11-01',
  post: 'https://www.instagram.com/p/xyz/',
  readings: { 1: { text: 'Start the thing.', highlights: [{ label: 'Colour', value: 'Gold' }] }, 7: { text: '  ' } },
}

describe('weekly Moolank readings', () => {
  it('reads a well-formed issue and drops empty readings', () => {
    const w = parseWeekly(issue)!
    expect(w.readings[1]).toEqual({ text: 'Start the thing.', highlights: [{ label: 'Colour', value: 'Gold' }] })
    expect(w.readings[7]).toBeUndefined()
    expect(w.post).toBe('https://www.instagram.com/p/xyz/')
  })

  it('rejects files without a valid week, and links that are not Instagram', () => {
    expect(parseWeekly({ ...issue, weekStart: '' })).toBeNull()
    expect(parseWeekly({ ...issue, weekEnd: '2026-10-01' })).toBeNull()
    expect(parseWeekly('nonsense')).toBeNull()
    expect(parseWeekly({ ...issue, post: 'https://evil.example/instagram.com' })!.post).toBeUndefined()
    expect(parseWeekly({ ...issue, post: 'javascript:alert(1)' })!.post).toBeUndefined()
  })

  it('shows a reading only inside its week', () => {
    const w = parseWeekly(issue)
    expect(currentReading(w, 1, new Date(2026, 9, 26))?.text).toBe('Start the thing.')
    expect(currentReading(w, 1, new Date(2026, 10, 1, 23, 30))?.text).toBe('Start the thing.')
    expect(currentReading(w, 1, new Date(2026, 10, 2))).toBeNull()
    expect(currentReading(w, 1, new Date(2026, 9, 25))).toBeNull()
    expect(currentReading(w, 2, new Date(2026, 9, 28))).toBeNull()
    expect(weeklyIsRunning(w, new Date(2026, 9, 28))).toBe(true)
    expect(weeklyIsRunning(w, new Date(2026, 10, 5))).toBe(false)
    expect(weeklyIsRunning(parseWeekly({ weekStart: '', weekEnd: '', readings: {} }))).toBe(false)
  })

  it('formats the week for display', () => {
    expect(formatWeek(parseWeekly(issue)!)).toBe('26 Oct to 1 Nov')
  })
})
