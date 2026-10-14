import { describe, expect, it } from 'vitest'
import { consultationModes } from '../data/consultationModes'
import { services } from '../data/services'
import { emptyDraft } from './requestValidation'
import { buildMailto, buildRequestSummary } from './requestSummary'

const draft = {
  ...emptyDraft,
  service: 'palmistry' as const,
  mode: 'video' as const,
  fullName: 'Asha Rao',
  email: 'asha@example.com',
  concern: 'About my direction & plans',
}
const service = services.find((s) => s.slug === 'palmistry')!
const mode = consultationModes.find((m) => m.id === 'video')!

describe('buildRequestSummary', () => {
  const text = buildRequestSummary(draft, service, mode, 'TestBrand')
  it('states it is not a confirmed booking or payment', () => {
    expect(text).toMatch(/Not a confirmed booking/i)
    expect(text).toMatch(/no payment has been taken/i)
  })
  it('includes the key fields and placeholder price', () => {
    expect(text).toContain('Service: Palmistry')
    expect(text).toContain('Consultation mode: Video consultation')
    expect(text).toContain('Price to be confirmed')
    expect(text).toContain('Asha Rao')
    expect(text).toContain('Palm photographs: to be shared securely')
  })
  it('omits optional fields that are empty', () => {
    expect(text).not.toContain('Phone')
    expect(text).not.toContain('Date of birth')
  })
})

describe('buildMailto', () => {
  it('returns null when no contact email is configured', () => {
    expect(buildMailto('', 'S', 'B')).toBeNull()
    expect(buildMailto('   ', 'S', 'B')).toBeNull()
  })
  it('encodes subject and body', () => {
    const url = buildMailto('team@example.com', 'Hi there', 'a&b\nc')!
    expect(url).toBe('mailto:team@example.com?subject=Hi%20there&body=a%26b%0Ac')
  })
})
