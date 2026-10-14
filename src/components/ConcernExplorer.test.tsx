import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ConcernExplorer } from './ConcernExplorer'

const setup = () => {
  render(<MemoryRouter><ConcernExplorer /></MemoryRouter>)
  return userEvent.setup()
}

describe('<ConcernExplorer />', () => {
  it('starts on the first concern and suggests numerology', () => {
    setup()
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent(/personality, patterns and decisions/i)
    expect(screen.getByRole('link', { name: /request a consultation/i })).toHaveAttribute('href', '/consultation/request?service=numerology')
  })

  it('updates the suggestion when a different concern is chosen', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /reading based on my own hands/i }))
    expect(screen.getByRole('link', { name: /about palmistry/i })).toHaveAttribute('href', '/services/palmistry')
    expect(screen.queryByRole('link', { name: /about numerology/i })).not.toBeInTheDocument()
  })

  it('offers two suggestions for a career or study decision, and says they are suggestions', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /career or study decision/i }))
    expect(screen.getByRole('link', { name: /about numerology/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /about palmistry/i })).toBeInTheDocument()
    expect(screen.getByText(/suggestions only/i)).toBeInTheDocument()
  })

  it('routes "doesn’t fit" to the contact page instead of guessing', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /doesn’t fit any of these/i }))
    expect(screen.getByRole('link', { name: /ask us/i })).toHaveAttribute('href', '/contact')
  })
})
