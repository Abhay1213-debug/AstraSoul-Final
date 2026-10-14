import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MoolankCalculator } from './MoolankCalculator'

const setup = () => {
  render(<MemoryRouter><MoolankCalculator /></MemoryRouter>)
  const user = userEvent.setup()
  return {
    user,
    day: screen.getByLabelText('Day'),
    month: screen.getByLabelText('Month'),
    year: screen.getByLabelText('Year'),
    button: screen.getByRole('button', { name: /find my moolank/i }),
  }
}

describe('<MoolankCalculator />', () => {
  it('asks for a complete date and shows no result when empty', async () => {
    const { user, button } = setup()
    await user.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(/choose your day, month and year/i)
    expect(screen.queryByText(/your moolank/i)).not.toBeInTheDocument()
  })

  it('shows the number, themes and working for a valid date, with no astrology references', async () => {
    const { user, day, month, year, button } = setup()
    await user.selectOptions(day, '29')
    await user.selectOptions(month, 'March')
    await user.type(year, '1990')
    await user.click(button)
    expect(screen.getByRole('img', { name: 'Moolank 2' })).toBeInTheDocument()
    expect(screen.getByText('29 → 2 + 9 = 11 → 1 + 1 = 2')).toBeInTheDocument()
    expect(screen.getByText('Intuition')).toBeInTheDocument()
    expect(screen.getByText(/not a prediction/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/planet|zodiac|horoscope|astrolog/i)
    expect(screen.getByRole('link', { name: /numerology consultation/i })).toHaveAttribute('href', '/consultation/request?service=numerology')
  })

  it('rejects a day that does not exist in the month (31 April)', async () => {
    const { user, day, month, year, button } = setup()
    await user.selectOptions(day, '31')
    await user.selectOptions(month, 'April')
    await user.type(year, '2000')
    await user.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(/does not exist/i)
  })

  it('accepts 29 February only in a leap year', async () => {
    const { user, day, month, year, button } = setup()
    await user.selectOptions(day, '29')
    await user.selectOptions(month, 'February')
    await user.type(year, '2023')
    await user.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(/does not exist/i)
    await user.clear(year)
    await user.type(year, '2000')
    await user.click(button)
    expect(screen.getByRole('img', { name: 'Moolank 2' })).toBeInTheDocument()
  })

  it('rejects a future date and a pre-1900 year', async () => {
    const { user, day, month, year, button } = setup()
    await user.selectOptions(day, '1')
    await user.selectOptions(month, 'January')
    await user.type(year, '2999')
    await user.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(/future/i)
    await user.clear(year)
    await user.type(year, '1850')
    await user.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(/1900/)
  })

  it('requires a four-digit year', async () => {
    const { user, day, month, year, button } = setup()
    await user.selectOptions(day, '5')
    await user.selectOptions(month, 'May')
    await user.type(year, '90')
    await user.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(/four digits/i)
  })

  it('clears a previous result when a later entry is invalid', async () => {
    const { user, day, month, year, button } = setup()
    await user.selectOptions(day, '29')
    await user.selectOptions(month, 'March')
    await user.type(year, '1990')
    await user.click(button)
    expect(screen.getByRole('img', { name: 'Moolank 2' })).toBeInTheDocument()
    await user.clear(year)
    await user.click(button)
    expect(screen.queryByRole('img', { name: 'Moolank 2' })).not.toBeInTheDocument()
  })
})
