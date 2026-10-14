import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Home from '../pages/Home'
import About from '../pages/About'
import { HERO_ALT, HERO_SRC } from './photo'

describe('supplied hero photograph', () => {
  it('is saved in public/images exactly as supplied (byte-identical, unmodified)', () => {
    const bytes = readFileSync('public/images/hero-reference.webp')
    expect(bytes.length).toBe(45218)
    expect(createHash('sha1').update(bytes).digest('hex')).toBe('003962ba6c07e3bd90b14b1cf397c176f936c234')
  })

  it('is the image used in the home hero, with meaningful alt text and priority loading', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    const hero = document.querySelector('.hero img.photo--hero') as HTMLImageElement
    expect(hero).not.toBeNull()
    expect(hero.getAttribute('src')).toBe(HERO_SRC)
    expect(hero).toHaveAttribute('alt', HERO_ALT)
    expect(HERO_ALT).toMatch(/woman in profile/i)
    expect(HERO_ALT).toMatch(/same sky\. a brighter you/i)
    expect(hero).toHaveAttribute('fetchpriority', 'high')
    expect(hero).toHaveAttribute('width', '1504')
    expect(hero).toHaveAttribute('height', '632')
  })

  it('is reused (not substituted) as a portrait crop in the closing section and in full on About', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    const portrait = document.querySelector('.stage img.photo--portrait') as HTMLImageElement
    expect(portrait.getAttribute('src')).toBe(HERO_SRC)
    render(<MemoryRouter><About /></MemoryRouter>)
    expect(document.querySelector('.photo-band img.photo--full')?.getAttribute('src')).toBe(HERO_SRC)
  })

  it('the illustrated placeholder hero is gone', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.queryByRole('img', { name: /illustration: a calm human profile/i })).not.toBeInTheDocument()
  })
})
