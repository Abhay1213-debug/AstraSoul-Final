import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Home from '../pages/Home'
import About from '../pages/About'
import { HERO_ALT, HERO_FIGURE_SIZE, HERO_FIGURE_SRC } from './photo'

describe('supplied hero photograph', () => {
  it('is saved in public/images exactly as supplied (byte-identical, unmodified)', () => {
    const bytes = readFileSync('public/images/hero-reference.webp')
    expect(bytes.length).toBe(45218)
    expect(createHash('sha1').update(bytes).digest('hex')).toBe('003962ba6c07e3bd90b14b1cf397c176f936c234')
  })

  it('is the image used in the home hero, with meaningful alt text and priority loading', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    // The hero composites an alpha cutout of her over a night-sky plate, with the supplied reference photograph
    // untouched on disk. No text is baked into the picture: the tagline is real text.
    const hero = document.querySelector('.sh-figure') as HTMLImageElement
    expect(hero).not.toBeNull()
    expect(hero.getAttribute('src')).toBe(HERO_FIGURE_SRC)
    expect(hero).toHaveAttribute('alt', HERO_ALT)
    expect(HERO_ALT).toMatch(/woman in profile/i)
    expect(document.querySelector('.sh-beat')?.textContent).toMatch(/same sky\.\s*a brighter you/i)
    expect(hero).toHaveAttribute('fetchpriority', 'high')
    expect(hero).toHaveAttribute('width', String(HERO_FIGURE_SIZE.width))
    expect(hero).toHaveAttribute('height', String(HERO_FIGURE_SIZE.height))
  })

  it('is reused (not substituted) in the closing section, and About carries the full logo with its tagline', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    const portrait = document.querySelector('.daybreak .db-figure') as HTMLImageElement
    expect(portrait.getAttribute('src')).toBe(HERO_FIGURE_SRC)
    expect(portrait).toHaveAttribute('alt', HERO_ALT)
    render(<MemoryRouter><About /></MemoryRouter>)
    const lockup = document.querySelector('.about-lockup') as HTMLImageElement
    expect(lockup.getAttribute('src')).toMatch(/brand\/logo-light\.webp$/)
    expect(lockup).toHaveAttribute('alt', expect.stringMatching(/where your numbers find their voice/i))
  })

  it('the figure is a real alpha image (WebP with an alpha channel) and the sky plate is a plain WebP', () => {
    const f = readFileSync('public/images/hero-figure.webp')
    expect(f.subarray(0, 4).toString()).toBe('RIFF')
    expect(f.subarray(8, 12).toString()).toBe('WEBP')
    expect(['VP8X', 'VP8L']).toContain(f.subarray(12, 16).toString()) // both carry alpha; plain 'VP8 ' does not
    const sky = readFileSync('public/images/hero-sky.webp')
    expect(sky.subarray(8, 12).toString()).toBe('WEBP')
  })

  it('the illustrated placeholder hero is gone', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.queryByRole('img', { name: /illustration: a calm human profile/i })).not.toBeInTheDocument()
  })
})
