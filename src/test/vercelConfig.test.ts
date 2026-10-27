import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[]; rewrites: { source: string }[] }
const csp = config.headers[0].headers.find((h) => h.key === 'Content-Security-Policy')!.value
const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''

describe('security policy (vercel.json)', () => {
  it('only allows our own scripts plus Microsoft Clarity, never inline or eval scripts', () => {
    const scripts = directive('script-src')
    expect(scripts).toBe("script-src 'self' https://www.clarity.ms https://scripts.clarity.ms")
    expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval/)
  })

  it('lets Clarity send its data, and nothing else new', () => {
    expect(directive('connect-src')).toContain('https://*.clarity.ms')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('serves the Clarity loader as a real file, not the app page', () => {
    expect(config.rewrites[0].source).toContain('clarity-init')
  })
})

describe('Clarity loader (public/clarity-init.js)', () => {
  const file = readFileSync('public/clarity-init.js', 'utf8')
  it('runs only on the live domain, so local and preview visits are never recorded', () => {
    expect(file).toMatch(/ankiro\\\.in/)
    expect(file).toContain('return')
  })
  it('loads the Ankiro project from clarity.ms', () => {
    expect(file).toContain('https://www.clarity.ms/tag/')
    expect(file).toContain('z49mhm8v45')
  })
})
