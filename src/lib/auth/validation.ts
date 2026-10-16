/** Input checks for the sign-up and log-in forms. Pure functions: easy to test, no network, no storage. */

export const NAME_MIN = 2
export const NAME_MAX = 80
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 72 // the authentication service itself only uses the first 72 characters

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const normaliseEmail = (s: string) => s.trim().toLowerCase()

export interface SignUpDraft {
  fullName: string
  email: string
  password: string
  confirmPassword: string
}
export type SignUpErrors = Partial<Record<keyof SignUpDraft, string>>

function checkNewPassword(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN) return `Please use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Please use ${PASSWORD_MAX} characters or fewer.`
  if (password.trim().length === 0) return 'A password can’t be only spaces.'
  if (email && password.toLowerCase() === email) return 'Please don’t use your email address as your password.'
  return null
}

export function validateSignUp(d: SignUpDraft): SignUpErrors {
  const e: SignUpErrors = {}
  const name = d.fullName.trim()
  if (name.length < NAME_MIN || name.length > NAME_MAX) e.fullName = `Please enter your name (${NAME_MIN}–${NAME_MAX} characters).`

  const email = normaliseEmail(d.email)
  if (!EMAIL_RE.test(email) || email.length > 320) e.email = 'Please enter a valid email address.'

  const passwordProblem = checkNewPassword(d.password, email)
  if (passwordProblem) e.password = passwordProblem

  if (!e.password && d.confirmPassword !== d.password) e.confirmPassword = 'The two passwords don’t match.'
  return e
}

export interface SignInDraft {
  email: string
  password: string
}
export type SignInErrors = Partial<Record<keyof SignInDraft, string>>

export function validateSignIn(d: SignInDraft): SignInErrors {
  const e: SignInErrors = {}
  if (!EMAIL_RE.test(normaliseEmail(d.email))) e.email = 'Please enter a valid email address.'
  // No minimum length here: someone with an older password must still be able to log in.
  if (d.password.length === 0) e.password = 'Please enter your password.'
  else if (d.password.length > 1024) e.password = 'That password is too long.'
  return e
}

/** The part of the name used in greetings. Falls back to a neutral word. */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0]
  return first ? first : 'there'
}

export interface NewPasswordDraft {
  password: string
  confirmPassword: string
}
export type NewPasswordErrors = Partial<Record<keyof NewPasswordDraft, string>>

/** Used when choosing a new password after a reset. Same rules as sign-up. */
export function validateNewPassword(d: NewPasswordDraft, email = ''): NewPasswordErrors {
  const e: NewPasswordErrors = {}
  const problem = checkNewPassword(d.password, normaliseEmail(email))
  if (problem) e.password = problem
  else if (d.confirmPassword !== d.password) e.confirmPassword = 'The two passwords don’t match.'
  return e
}

/** Only an email address is needed to ask for a reset link. */
export function validateResetRequest(email: string): string | null {
  return EMAIL_RE.test(normaliseEmail(email)) && normaliseEmail(email).length <= 320 ? null : 'Please enter a valid email address.'
}
