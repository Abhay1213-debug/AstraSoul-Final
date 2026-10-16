import { describe, expect, it } from 'vitest'
import { safeNext } from './safeNext'

describe('safeNext (no open redirects)', () => {
  it('keeps plain internal paths', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard')
    expect(safeNext('/consultation/request?service=numerology')).toBe('/consultation/request?service=numerology')
  })
  it('falls back to the dashboard when there is nothing usable', () => {
    for (const v of [null, undefined, '', 'dashboard', 'https://evil.example', 'http://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'data:text/html,hi', '/ok\u0000bad', '/a\\b', '/' + 'x'.repeat(250)]) {
      expect(safeNext(v), String(v)).toBe('/dashboard')
    }
  })
  it('never bounces between the log-in and sign-up pages', () => {
    for (const v of ['/login', '/login?next=/x', '/signup', '/signup/', '//login']) expect(safeNext(v), v).toBe('/dashboard')
  })
  it('accepts a custom fallback', () => {
    expect(safeNext('https://evil.example', '/')).toBe('/')
  })
})
