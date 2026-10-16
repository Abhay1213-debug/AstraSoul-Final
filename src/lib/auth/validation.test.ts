import { describe, expect, it } from 'vitest'
import { firstName, normaliseEmail, validateSignIn, validateSignUp } from './validation'

const good = { fullName: 'Asha Rao', email: 'asha@example.com', password: 'blue-river-lantern', confirmPassword: 'blue-river-lantern' }

describe('validateSignUp', () => {
  it('accepts a good form', () => {
    expect(validateSignUp(good)).toEqual({})
  })
  it('requires a sensible name (2–80 characters, not just spaces)', () => {
    expect(validateSignUp({ ...good, fullName: '' }).fullName).toBeTruthy()
    expect(validateSignUp({ ...good, fullName: 'A' }).fullName).toBeTruthy()
    expect(validateSignUp({ ...good, fullName: '   ' }).fullName).toBeTruthy()
    expect(validateSignUp({ ...good, fullName: 'x'.repeat(81) }).fullName).toBeTruthy()
    expect(validateSignUp({ ...good, fullName: 'x'.repeat(80) }).fullName).toBeUndefined()
  })
  it('requires a valid email, ignoring surrounding spaces and capitals', () => {
    for (const bad of ['', 'asha', 'asha@', '@example.com', 'asha@example', 'a sha@example.com']) {
      expect(validateSignUp({ ...good, email: bad }).email, bad).toBeTruthy()
    }
    expect(validateSignUp({ ...good, email: '  Asha@Example.COM ' }).email).toBeUndefined()
    expect(normaliseEmail('  Asha@Example.COM ')).toBe('asha@example.com')
  })
  it('requires a password of 10–72 characters that is not blank or the email', () => {
    expect(validateSignUp({ ...good, password: 'short', confirmPassword: 'short' }).password).toBeTruthy()
    expect(validateSignUp({ ...good, password: ' '.repeat(12), confirmPassword: ' '.repeat(12) }).password).toBeTruthy()
    expect(validateSignUp({ ...good, password: 'a'.repeat(73), confirmPassword: 'a'.repeat(73) }).password).toBeTruthy()
    expect(validateSignUp({ ...good, password: 'a'.repeat(72), confirmPassword: 'a'.repeat(72) }).password).toBeUndefined()
    expect(validateSignUp({ ...good, email: 'asha.rao@example.com', password: 'asha.rao@example.com', confirmPassword: 'asha.rao@example.com' }).password).toBeTruthy()
  })
  it('requires both passwords to match', () => {
    expect(validateSignUp({ ...good, confirmPassword: 'something-else-entirely' }).confirmPassword).toBeTruthy()
  })
})

describe('validateSignIn', () => {
  it('needs a valid email and any non-empty password (no minimum, so older passwords still work)', () => {
    expect(validateSignIn({ email: 'asha@example.com', password: 'x' })).toEqual({})
    expect(validateSignIn({ email: 'nope', password: 'x' }).email).toBeTruthy()
    expect(validateSignIn({ email: 'asha@example.com', password: '' }).password).toBeTruthy()
  })
})

describe('firstName', () => {
  it('greets by first name, with a neutral fallback', () => {
    expect(firstName('Asha Rao')).toBe('Asha')
    expect(firstName('  Asha  ')).toBe('Asha')
    expect(firstName('')).toBe('there')
  })
})

describe('password reset validation', () => {
  it('validateNewPassword applies the same rules as sign-up', async () => {
    const { validateNewPassword } = await import('./validation')
    expect(validateNewPassword({ password: 'short', confirmPassword: 'short' }).password).toMatch(/at least 10/)
    expect(validateNewPassword({ password: 'x'.repeat(73), confirmPassword: 'x'.repeat(73) }).password).toMatch(/72/)
    expect(validateNewPassword({ password: 'a@b.co    ', confirmPassword: 'a@b.co    ' }, 'A@B.co').password).toBeUndefined()
    expect(validateNewPassword({ password: 'asha@example.com', confirmPassword: 'asha@example.com' }, 'Asha@Example.com').password).toMatch(/email address/)
    expect(validateNewPassword({ password: 'green-harbour-lamp', confirmPassword: 'other-words-here' }).confirmPassword).toMatch(/match/)
    expect(validateNewPassword({ password: 'green-harbour-lamp', confirmPassword: 'green-harbour-lamp' })).toEqual({})
  })

  it('validateResetRequest accepts only a plausible email', async () => {
    const { validateResetRequest } = await import('./validation')
    expect(validateResetRequest(' Asha@Example.com ')).toBeNull()
    expect(validateResetRequest('nope')).toMatch(/valid email/)
    expect(validateResetRequest('')).toMatch(/valid email/)
  })
})
