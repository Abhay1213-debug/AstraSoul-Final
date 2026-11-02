import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SkyBackdrop } from './SkyBackdrop'
import { HERO_SKY_SRC } from './photo'

describe('persistent sky', () => {
  it('draws the night-sky plate twice (sharp and soft) and is hidden from assistive tech', () => {
    render(<MemoryRouter><SkyBackdrop /></MemoryRouter>)
    const sky = document.querySelector('.sky') as HTMLElement
    expect(sky).toHaveAttribute('aria-hidden', 'true')
    const imgs = sky.querySelectorAll('img')
    expect(imgs).toHaveLength(2)
    imgs.forEach((i) => expect(i.getAttribute('src')).toBe(HERO_SKY_SRC))
    expect(sky.querySelector('.sky-soft')).not.toBeNull()
  })

  it('is driven by sections on the home page and fully softened on every other page', () => {
    render(<MemoryRouter initialEntries={['/']}><SkyBackdrop /></MemoryRouter>)
    expect(document.querySelector('.sky')).toHaveAttribute('data-mode', 'home')
    document.body.innerHTML = ''
    render(<MemoryRouter initialEntries={['/contact']}><SkyBackdrop /></MemoryRouter>)
    expect(document.querySelector('.sky')).toHaveAttribute('data-mode', 'inner')
  })
})
