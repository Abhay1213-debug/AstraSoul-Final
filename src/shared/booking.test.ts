import { describe, expect, it } from 'vitest'
import {
  bookableDates, comboKey, comboName, formatTime, indiaNow, isBookable, MIN_PRICE_INR, normaliseServices, PACKAGES, parseBookingRequest, priceFor,
  prices, sessionMinutesFor, slotTimes, slotsCovered, withGst,
} from './booking'

// 30 Oct 2026, 2:00 pm in India (08:30 UTC)
const NOW = new Date('2026-10-30T08:30:00Z')
const details = { name: 'Asha Rao', email: 'asha@example.com', phone: '98765 43210', dateOfBirth: '1990-03-29', language: '', concern: 'Career direction this year.' }

describe('booking rules', () => {
  it('has no price below what Dodo Payments accepts', () => {
    expect(Object.values(prices).filter((p) => p === undefined || p < MIN_PRICE_INR)).toEqual([])
  })

  it('offers ten slots each evening, 5:30 to 8:30 pm, twenty minutes apart', () => {
    expect(slotTimes()).toEqual(['17:30', '17:50', '18:10', '18:30', '18:50', '19:10', '19:30', '19:50', '20:10', '20:30'])
    expect(slotTimes().map(formatTime).slice(0, 3)).toEqual(['5:30 pm', '5:50 pm', '6:10 pm'])
  })

  it('works in Indian time whatever the server clock', () => {
    expect(indiaNow(NOW)).toEqual({ date: '2026-10-30', minutes: 14 * 60 })
    expect(indiaNow(new Date('2026-10-30T19:00:00Z')).date).toBe('2026-10-31') // half past midnight in India
  })

  it('opens two weeks of dates starting today', () => {
    const d = bookableDates(NOW)
    expect(d).toHaveLength(14)
    expect(d[0]).toBe('2026-10-30')
    expect(d[13]).toBe('2026-11-12')
  })

  it('closes a slot an hour before it starts, and anything outside the two weeks', () => {
    const late = new Date('2026-10-30T12:15:00Z') // 5:45 pm in India
    expect(isBookable('2026-10-30', '17:50', late)).toBe(false)
    expect(isBookable('2026-10-30', '18:50', late)).toBe(true)
    expect(isBookable('2026-11-13', '17:30', NOW)).toBe(false)
    expect(isBookable('2026-10-31', '17:40', NOW)).toBe(false) // not a slot
  })

  it('accepts any combination of services, in a fixed order', () => {
    expect(normaliseServices(['palmistry', 'gemstone-guidance', 'palmistry'])).toEqual(['palmistry', 'gemstone-guidance'])
    expect(normaliseServices(['astrology'])).toBeNull()
    expect(normaliseServices([])).toBeNull()
    expect(comboKey(['gemstone-guidance', 'palmistry'])).toBe('palmistry+gemstone-guidance')
    expect(comboName(['gemstone-guidance', 'palmistry'])).toBe('Palmistry + Gemstone Guidance')
  })

  it('prices every service and package before GST; other combinations are a customised plan', () => {
    expect(priceFor(['numerology'])).toBe(499)
    expect(priceFor(['palmistry'])).toBe(899)
    expect(priceFor(['gemstone-guidance'])).toBe(699)
    expect(priceFor(['color-therapy'])).toBe(299)
    expect(priceFor(['palmistry', 'numerology'])).toBe(1299)
    expect(priceFor(['numerology', 'gemstone-guidance'])).toBe(1099)
    expect(priceFor(['palmistry', 'gemstone-guidance'])).toBe(1499)
    expect(priceFor(['gemstone-guidance', 'color-therapy'])).toBe(899)
    expect(priceFor(['numerology', 'palmistry', 'gemstone-guidance', 'color-therapy'])).toBe(2099)
    expect(priceFor(['numerology', 'color-therapy'])).toBeNull()
    expect(priceFor(['numerology'], 50)).toBe(499) // the test price only fills a gap
    expect(withGst(1299)).toBe('₹1,299 + GST')
    expect(PACKAGES.every((p) => priceFor(p.services))).toBe(true)
    expect(comboName(['palmistry', 'numerology'])).toBe('Palmistry + Numerology')
    expect(comboName(['color-therapy', 'numerology', 'palmistry', 'gemstone-guidance'])).toBe('Diamond package')
  })

  it('makes the Diamond package a 25-minute call that also takes the next slot; everything else is 10 minutes', () => {
    expect(sessionMinutesFor(['numerology'])).toBe(10)
    expect(sessionMinutesFor(['numerology', 'palmistry'])).toBe(10)
    expect(sessionMinutesFor(['numerology', 'palmistry', 'gemstone-guidance', 'color-therapy'])).toBe(25)
    expect(sessionMinutesFor(['numerology'], true)).toBe(20)
    expect(slotsCovered('17:30', 10)).toEqual(['17:30'])
    expect(slotsCovered('17:30', 20)).toEqual(['17:30'])
    expect(slotsCovered('17:30', 25)).toEqual(['17:30', '17:50'])
    expect(slotsCovered('20:30', 25)).toEqual(['20:30']) // the last slot simply runs on to 8:55 pm
  })

  it('checks a booking request completely, as the server does', () => {
    const good = { details, services: ['numerology'], date: '2026-10-31', time: '17:30', extend: false, consent: true }
    expect(parseBookingRequest(good, NOW).ok).toBe(true)
    expect(parseBookingRequest({ ...good, consent: false }, NOW).ok).toBe(false)
    expect(parseBookingRequest({ ...good, services: ['astrology'] }, NOW).ok).toBe(false)
    expect(parseBookingRequest({ ...good, time: '17:31' }, NOW).ok).toBe(false)
    const bad = parseBookingRequest({ ...good, details: { ...details, phone: '', dateOfBirth: '2030-01-01' } }, NOW)
    expect(bad.ok).toBe(false)
    expect(!bad.ok && Object.keys(bad.fields ?? {})).toEqual(['phone', 'dateOfBirth'])
  })
})
