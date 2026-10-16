import type { AuthErrorCode } from './types'

/** What the customer sees for each failure. Fixed wording: nothing from the server is shown, and nothing reveals whether an email exists. */
export const authErrorMessage: Record<AuthErrorCode, string> = {
  invalid_credentials: 'That email and password don’t match. Please check them and try again.',
  email_not_confirmed: 'Please confirm your email first: open the link we sent you, then log in.',
  weak_password: 'That password is too easy to guess. Please choose a longer, less common one.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  signup_disabled: 'New accounts can’t be created right now. Please try again later.',
  same_password: 'That is the same as your current password. Please choose a different one.',
  invalid_code: 'That code didn’t work. Open your authenticator app and enter the current 6-digit code (it changes every 30 seconds).',
  session_expired: 'This link has expired or has already been used. Please ask for a new one.',
  network: 'We couldn’t reach the server. Please check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
}
