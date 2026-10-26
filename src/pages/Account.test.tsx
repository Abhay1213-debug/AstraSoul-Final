import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routes } from '../App'
import { AuthProvider } from '../lib/auth'
import { createFakeAuth, seedAccount, type FakeAuth } from '../test/fakeAuth'

/** These tests drive the REAL pages with a stand-in account service: nothing leaves the computer, no Supabase is involved. */
function mount(path: string, fake: FakeAuth | null) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const utils = render(
    <AuthProvider service={fake}>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return { router, ...utils, user: userEvent.setup() }
}

/** Renders the page and waits until the brief "checking your account" step is over (the provider looks the session up first). */
async function renderAt(path: string, fake: FakeAuth | null) {
  const out = mount(path, fake)
  await waitFor(() => expect(screen.queryByText(/checking your account/i)).toBeNull())
  return out
}

const PASSWORD = 'blue-river-lantern'

async function fillSignup(user: ReturnType<typeof userEvent.setup>, over: Partial<Record<'name' | 'email' | 'pw' | 'pw2', string>> = {}) {
  await user.type(screen.getByLabelText(/full name/i), over.name ?? '  Asha Rao ')
  await user.type(screen.getByLabelText(/^email/i), over.email ?? 'Asha@Example.com ')
  await user.type(screen.getByLabelText(/^password/i), over.pw ?? PASSWORD)
  await user.type(screen.getByLabelText(/confirm password/i), over.pw2 ?? PASSWORD)
}

describe('accounts switched OFF (the default)', () => {
  it.each(['/login', '/signup', '/forgot-password', '/reset-password', '/dashboard'])('%s says no account is needed and shows no password field', async (path) => {
    const { container } = await renderAt(path, null)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/you don’t need an account/i)
    expect(container.querySelector('input[type=password]')).toBeNull()
  })
})

describe('sign-up', () => {
  it('shows a real form when accounts are switched on', async () => {
    await renderAt('/signup', createFakeAuth())
    expect(screen.getByRole('heading', { level: 1, name: /create an account/i })).toBeInTheDocument()
    expect(screen.queryByText(/you don’t need an account/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'new-password')
  })

  it('explains each mistake and does not contact the service', async () => {
    const fake = createFakeAuth()
    const { user } = await renderAt('/signup', fake)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText(/please enter your name/i)).toBeInTheDocument()
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
    expect(screen.getByText(/please use at least 10 characters/i)).toBeInTheDocument()
    expect(fake.calls.signUp).toHaveLength(0)
  })

  it('rejects mismatched passwords', async () => {
    const fake = createFakeAuth()
    const { user } = await renderAt('/signup', fake)
    await fillSignup(user, { pw2: 'a-different-password' })
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText(/don’t match/i)).toBeInTheDocument()
    expect(fake.calls.signUp).toHaveLength(0)
  })

  it('sends tidy values, then asks the person to check their email (and never echoes the password)', async () => {
    const fake = createFakeAuth()
    const { user, container } = await renderAt('/signup', fake)
    await fillSignup(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    expect(fake.calls.signUp).toEqual([{ fullName: 'Asha Rao', email: 'asha@example.com', password: PASSWORD }])
    expect(screen.getByRole('status')).toHaveTextContent('asha@example.com')
    expect(container.textContent).not.toContain(PASSWORD)
    expect(container.querySelector('input[type=password]')).toBeNull()
  })

  it('the confirmation message does not claim an email was definitely sent (it cannot know)', async () => {
    const { user } = await renderAt('/signup', createFakeAuth())
    await fillSignup(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/if .* can be used for a new account, a confirmation link is on its way/i)
  })

  it('goes straight to the dashboard if no confirmation is needed', async () => {
    const { user } = await renderAt('/signup', createFakeAuth({ needsConfirmation: false }))
    await fillSignup(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('heading', { level: 1, name: /welcome, asha/i })).toBeInTheDocument()
  })

  it.each([
    ['rate_limited', /too many attempts/i],
    ['weak_password', /too easy to guess/i],
    ['signup_disabled', /can’t be created right now/i],
    ['network', /couldn’t reach the server/i],
    ['unknown', /something went wrong/i],
  ] as const)('shows a fixed, friendly message for %s and clears both password boxes', async (code, text) => {
    const fake = createFakeAuth()
    const { user } = await renderAt('/signup', fake)
    await fillSignup(user)
    fake.failNext(code)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByLabelText(/^password/i)).toHaveValue('')
    expect(screen.getByLabelText(/confirm password/i)).toHaveValue('')
  })

  it('cannot be submitted twice while waiting', async () => {
    const fake = createFakeAuth()
    let release!: () => void
    const original = fake.signUp.bind(fake)
    fake.signUp = (input) => new Promise((resolve) => { release = () => resolve(original(input)) })
    const { user } = await renderAt('/signup', fake)
    await fillSignup(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    const busy = screen.getByRole('button', { name: /creating your account/i })
    expect(busy).toBeDisabled()
    await act(async () => release())
  })

  it('is redirected away if already signed in', async () => {
    await renderAt('/signup', createFakeAuth({ user: { id: 'u', email: 'a@b.co', fullName: 'Asha Rao' } }))
    expect(await screen.findByRole('heading', { level: 1, name: /welcome, asha/i })).toBeInTheDocument()
  })
})

describe('log-in', () => {
  async function ready() {
    const fake = createFakeAuth()
    await seedAccount(fake, 'asha@example.com', PASSWORD, 'Asha Rao')
    return fake
  }

  it('shows a real form with the right autofill hints', async () => {
    await renderAt('/login', await ready())
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('autocomplete', 'email')
  })

  it('logs in and lands on the dashboard', async () => {
    const fake = await ready()
    const { user } = await renderAt('/login', fake)
    await user.type(screen.getByLabelText(/^email/i), 'ASHA@example.com')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(await screen.findByRole('heading', { level: 1, name: /welcome, asha/i })).toBeInTheDocument()
    expect(fake.calls.signIn).toEqual([{ email: 'asha@example.com', password: PASSWORD }])
  })

  it('a wrong password gives one generic message (never says which half was wrong) and clears the password', async () => {
    const { user } = await renderAt('/login', await ready())
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'not-the-password')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/email and password don’t match/i)
    expect(screen.getByLabelText(/^password/i)).toHaveValue('')
    expect(screen.getByLabelText(/^email/i)).toHaveValue('asha@example.com')
  })

  it('an unknown email gets exactly the same message as a wrong password', async () => {
    const { user } = await renderAt('/login', await ready())
    await user.type(screen.getByLabelText(/^email/i), 'nobody@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'whatever-it-is')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/email and password don’t match/i)
  })

  it('asks for an unconfirmed email to be confirmed first', async () => {
    const fake = await ready()
    const { user } = await renderAt('/login', fake)
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.com')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    fake.failNext('email_not_confirmed')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/confirm your email first/i)
  })

  it('requires both boxes', async () => {
    const fake = await ready()
    const { user } = await renderAt('/login', fake)
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument()
    expect(fake.calls.signIn).toHaveLength(0)
  })

  it('returns to the page the person was heading for, but only if it is an internal path', async () => {
    const fake = await ready()
    const { user, router } = await renderAt('/login?next=%2Fconsultation%2Frequest', fake)
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.com')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/consultation/request'))
  })

  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil.example'])('ignores the unsafe "next" value %s', async (bad) => {
    const fake = await ready()
    const { user, router } = await renderAt(`/login?next=${encodeURIComponent(bad)}`, fake)
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.com')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })

  it('shows "checking your account" (and no form) while the session is being looked up', async () => {
    const fake = createFakeAuth()
    const release = fake.holdGetUser()
    const { container } = mount('/login', fake)
    expect(screen.getByRole('status')).toHaveTextContent(/checking your account/i)
    expect(container.querySelector('input[type=password]')).toBeNull()
    await act(async () => release())
    expect(await screen.findByLabelText(/^password/i)).toBeInTheDocument()
  })
})

describe('dashboard', () => {
  it('sends a signed-out visitor to log in (and brings them back afterwards)', async () => {
    const { router } = await renderAt('/dashboard', createFakeAuth())
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Fdashboard')
  })

  it('greets the signed-in customer, shows no invented data, and never lists "refunded" as a request status', async () => {
    await renderAt('/dashboard', createFakeAuth({ user: { id: 'u', email: 'asha@example.com', fullName: 'Asha Rao' } }))
    expect(await screen.findByRole('heading', { level: 1, name: /welcome, asha/i })).toBeInTheDocument()
    expect(screen.getByText(/signed in as asha@example.com/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/online requests aren’t switched on yet/i)
    expect(document.body.textContent).not.toMatch(/refunded/i)
  })

  it('shows the name as plain text (markup in a name is not interpreted)', async () => {
    await renderAt('/dashboard', createFakeAuth({ user: { id: 'u', email: 'x@example.com', fullName: '<img src=x onerror=alert(1)> Kim' } }))
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.querySelector('img')).toBeNull()
    expect(h1).toHaveTextContent('<img')
  })

  it('logs out and returns to the home page', async () => {
    const fake = createFakeAuth({ user: { id: 'u', email: 'asha@example.com', fullName: 'Asha Rao' } })
    const { user, router } = await renderAt('/dashboard', fake)
    await user.click(await screen.findByRole('button', { name: /^log out$/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(fake.calls.signOut).toBe(1)
  })

  it('stays put and tells nobody anything odd if logging out fails', async () => {
    const fake = createFakeAuth({ user: { id: 'u', email: 'asha@example.com', fullName: 'Asha Rao' } })
    const { user, router } = await renderAt('/dashboard', fake)
    fake.failNext('network')
    await user.click(await screen.findByRole('button', { name: /^log out$/i }))
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(await screen.findByRole('button', { name: /^log out$/i })).toBeEnabled()
  })
})

describe('header', () => {
  it('offers "Log in" when signed out and "My dashboard" when signed in', async () => {
    const signedOut = await renderAt('/about', createFakeAuth())
    const nav = within(document.querySelector('.header-actions') as HTMLElement)
    expect(await nav.findByRole('link', { name: /^log in$/i })).toBeInTheDocument()
    signedOut.unmount()
    await renderAt('/about', createFakeAuth({ user: { id: 'u', email: 'a@b.co', fullName: 'Asha Rao' } }))
    const nav2 = within(document.querySelector('.header-actions') as HTMLElement)
    expect(await nav2.findByRole('link', { name: /my dashboard/i })).toBeInTheDocument()
    expect(nav2.queryByRole('link', { name: /^log in$/i })).toBeNull()
  })
})

describe('forgot password', () => {
  it('asks only for an email and gives the same answer for any address', async () => {
    const fake = createFakeAuth()
    const { user, container } = await renderAt('/forgot-password', fake)
    expect(screen.getByRole('heading', { level: 1, name: /reset your password/i })).toBeInTheDocument()
    expect(container.querySelector('input[type=password]')).toBeNull()
    await user.type(screen.getByLabelText(/^email/i), '  Nobody@Example.com ')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(fake.calls.resetRequests).toEqual(['nobody@example.com'])
    expect(await screen.findByRole('status')).toHaveTextContent(/if nobody@example\.com has an account/i)
    expect(screen.getByRole('status')).not.toHaveTextContent(/no account|not found|doesn’t exist/i)
  })

  it('rejects an invalid email without contacting the service', async () => {
    const fake = createFakeAuth()
    const { user } = await renderAt('/forgot-password', fake)
    await user.type(screen.getByLabelText(/^email/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
    expect(fake.calls.resetRequests).toHaveLength(0)
  })

  it.each([
    ['rate_limited', /too many attempts/i],
    ['network', /couldn’t reach the server/i],
  ] as const)('shows a fixed message when the service says %s', async (code, text) => {
    const fake = createFakeAuth()
    fake.failNext(code)
    const { user } = await renderAt('/forgot-password', fake)
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('sends someone who is already signed in to the dashboard', async () => {
    const { router } = await renderAt('/forgot-password', createFakeAuth({ user: { id: 'u', email: 'a@b.co', fullName: 'Asha Rao' } }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })

  it('is linked from the log-in page', async () => {
    await renderAt('/login', createFakeAuth())
    expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute('href', '/forgot-password')
  })
})

describe('choose a new password (after the emailed link)', () => {
  const asha = { id: 'u-1', email: 'asha@example.com', fullName: 'Asha Rao' }

  it('without a valid link (signed out) says the link is not valid and offers a new one', async () => {
    const { container } = await renderAt('/reset-password', createFakeAuth())
    expect(screen.getByRole('status')).toHaveTextContent(/link isn’t valid any more/i)
    expect(container.querySelector('input[type=password]')).toBeNull()
    expect(screen.getByRole('link', { name: /ask for a new link/i })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows the form to someone the link has signed in, and saves a valid new password', async () => {
    const fake = createFakeAuth({ user: asha })
    const { user } = await renderAt('/reset-password', fake)
    expect(screen.getByLabelText(/^new password/i)).toHaveAttribute('autocomplete', 'new-password')
    await user.type(screen.getByLabelText(/^new password/i), 'green-harbour-lamp')
    await user.type(screen.getByLabelText(/confirm new password/i), 'green-harbour-lamp')
    await user.click(screen.getByRole('button', { name: /save new password/i }))
    expect(await screen.findByRole('heading', { name: /your password has been changed/i })).toBeInTheDocument()
    expect(fake.calls.passwordUpdates).toEqual(['green-harbour-lamp'])
    expect(screen.getByRole('link', { name: /go to my dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('explains each mistake and does not contact the service', async () => {
    const fake = createFakeAuth({ user: asha })
    const { user } = await renderAt('/reset-password', fake)
    await user.click(screen.getByRole('button', { name: /save new password/i }))
    expect(screen.getByText(/please use at least 10 characters/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^new password/i), 'green-harbour-lamp')
    await user.type(screen.getByLabelText(/confirm new password/i), 'different-words-here')
    await user.click(screen.getByRole('button', { name: /save new password/i }))
    expect(screen.getByText(/two passwords don’t match/i)).toBeInTheDocument()
    expect(fake.calls.passwordUpdates).toHaveLength(0)
  })

  it('refuses the email address as the password', async () => {
    const fake = createFakeAuth({ user: asha })
    const { user } = await renderAt('/reset-password', fake)
    await user.type(screen.getByLabelText(/^new password/i), 'asha@example.com')
    await user.click(screen.getByRole('button', { name: /save new password/i }))
    expect(screen.getByText(/don’t use your email address/i)).toBeInTheDocument()
    expect(fake.calls.passwordUpdates).toHaveLength(0)
  })

  it('clears the password fields after every attempt, success or failure', async () => {
    const fake = createFakeAuth({ user: asha })
    fake.failNext('same_password')
    const { user } = await renderAt('/reset-password', fake)
    await user.type(screen.getByLabelText(/^new password/i), 'green-harbour-lamp')
    await user.type(screen.getByLabelText(/confirm new password/i), 'green-harbour-lamp')
    await user.click(screen.getByRole('button', { name: /save new password/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/same as your current password/i)
    expect(screen.getByLabelText(/^new password/i)).toHaveValue('')
    expect(screen.getByLabelText(/confirm new password/i)).toHaveValue('')
  })

  it('offers a new link when the temporary sign-in has expired', async () => {
    const fake = createFakeAuth({ user: asha })
    fake.failNext('session_expired')
    const { user } = await renderAt('/reset-password', fake)
    await user.type(screen.getByLabelText(/^new password/i), 'green-harbour-lamp')
    await user.type(screen.getByLabelText(/confirm new password/i), 'green-harbour-lamp')
    await user.click(screen.getByRole('button', { name: /save new password/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/expired or has already been used/i)
    expect(within(alert).getByRole('link', { name: /ask for a new link/i })).toHaveAttribute('href', '/forgot-password')
  })
})
