import { describe, expect, it } from 'vitest'
import type { ConsultationRequestDraft } from '../types/domain'
import {
  emptyDraft,
  hasErrors,
  isValidEmail,
  validateDetailsStep,
  validateModeStep,
  validateReviewStep,
  validateServiceStep,
} from './requestValidation'

const TODAY = new Date(2026, 5, 15)

const valid: ConsultationRequestDraft = {
  ...emptyDraft,
  service: 'numerology',
  mode: 'chat',
  fullName: 'Asha Rao',
  email: 'asha@example.com',
  dateOfBirth: '1990-03-29',
  concern: 'I would like to understand my career direction.',
  consent: true,
}

describe('isValidEmail', () => {
  it('accepts plain addresses and rejects junk', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail(' a@b.co ')).toBe(true)
    for (const bad of ['', 'a', 'a@b', 'a@b.', '@b.co', 'a b@c.com', 'a@@b.com']) expect(isValidEmail(bad)).toBe(false)
  })
})

describe('validateDetailsStep', () => {
  it('passes a complete numerology request', () => {
    expect(validateDetailsStep(valid, TODAY)).toEqual({})
  })
  it('flags every missing required field', () => {
    const errors = validateDetailsStep({ ...emptyDraft, service: 'numerology' }, TODAY)
    expect(Object.keys(errors).sort()).toEqual(['concern', 'dateOfBirth', 'email', 'fullName'])
  })
  it('asks every request for a date of birth (details come before the service is chosen)', () => {
    const noDob = { ...valid, dateOfBirth: '' }
    expect(validateDetailsStep(noDob, TODAY).dateOfBirth).toBeTruthy()
    expect(validateDetailsStep({ ...noDob, service: 'palmistry' }, TODAY).dateOfBirth).toBeTruthy()
  })
  it('rejects a future or impossible date of birth', () => {
    expect(validateDetailsStep({ ...valid, dateOfBirth: '2030-01-01' }, TODAY).dateOfBirth).toBeTruthy()
    expect(validateDetailsStep({ ...valid, dateOfBirth: '2023-02-29' }, TODAY).dateOfBirth).toBeTruthy()
  })
  it('rejects bad phone numbers but allows blank', () => {
    expect(validateDetailsStep({ ...valid, phone: '' }, TODAY).phone).toBeUndefined()
    expect(validateDetailsStep({ ...valid, phone: '+91 98765 43210' }, TODAY).phone).toBeUndefined()
    expect(validateDetailsStep({ ...valid, phone: 'abc' }, TODAY).phone).toBeTruthy()
    expect(validateDetailsStep({ ...valid, phone: '123' }, TODAY).phone).toBeTruthy()
  })
  it('enforces concern length bounds', () => {
    expect(validateDetailsStep({ ...valid, concern: 'short' }, TODAY).concern).toBeTruthy()
    expect(validateDetailsStep({ ...valid, concern: 'x'.repeat(1001) }, TODAY).concern).toBeTruthy()
    expect(validateDetailsStep({ ...valid, concern: '   short   ' }, TODAY).concern).toBeTruthy()
  })
})

describe('other steps', () => {
  it('service and mode must be chosen', () => {
    expect(hasErrors(validateServiceStep(emptyDraft))).toBe(true)
    expect(hasErrors(validateServiceStep(valid))).toBe(false)
    expect(hasErrors(validateModeStep(emptyDraft))).toBe(true)
    expect(hasErrors(validateModeStep(valid))).toBe(false)
  })
  it('consent is required', () => {
    expect(hasErrors(validateReviewStep({ ...valid, consent: false }))).toBe(true)
    expect(hasErrors(validateReviewStep(valid))).toBe(false)
  })
})
