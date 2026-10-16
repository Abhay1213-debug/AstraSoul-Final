/**
 * The ONLY shape the website knows about accounts. Pages and components talk to an `AuthService`; they never touch
 * Supabase directly. This keeps the real backend in one small adapter (supabaseAuth.ts) and lets the screens be tested
 * with a fake service that never leaves the computer.
 */
export interface AuthUser {
  id: string
  email: string
  /** The display name the customer typed at sign-up ('' if unknown). Shown as plain text only. */
  fullName: string
}

/** Short, fixed reasons. Raw server messages are never passed to the screen (they can be technical or revealing). */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  | 'signup_disabled'
  | 'same_password'
  | 'session_expired'
  | 'invalid_code'
  | 'network'
  | 'unknown'

export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; code: AuthErrorCode }

export interface SignUpInput {
  fullName: string
  email: string
  password: string
}

export interface SignInInput {
  email: string
  password: string
}

/** Where the signed-in person is in the two-step (authenticator app) check that administrators and experts need. */
export interface MfaState {
  /** 'aal2' = the authenticator code has been entered in this session. */
  level: 'aal1' | 'aal2'
  /** The id of a VERIFIED authenticator the person has set up, or null if they have none yet. */
  verifiedFactorId: string | null
}

export interface TotpEnrolment {
  factorId: string
  /** An image (data address) of the QR code to scan with an authenticator app. */
  qrCode: string
  /** The same secret as text, for typing into the app by hand. Shown once; never stored by the website. */
  secret: string
}

export interface AuthService {
  /** The currently signed-in customer, or null. (Convenience for the screens; the database never trusts the browser.) */
  getUser(): Promise<AuthUser | null>
  /** Calls `listener` whenever the signed-in customer changes. Returns an unsubscribe function. */
  onChange(listener: (user: AuthUser | null) => void): () => void
  signUp(input: SignUpInput): Promise<AuthResult<{ needsConfirmation: boolean }>>
  signIn(input: SignInInput): Promise<AuthResult>
  signOut(): Promise<AuthResult>
  /** Sends the sign-up confirmation email again. Reports success for ANY well-formed address (never reveals who has an account). */
  resendConfirmation(email: string): Promise<AuthResult>
  /** Asks for a "choose a new password" email. Reports success for ANY well-formed address (it never reveals who has an account). */
  requestPasswordReset(email: string): Promise<AuthResult>
  /** Sets a new password for the person who is signed in (including the temporary sign-in that the emailed link creates). */
  updatePassword(newPassword: string): Promise<AuthResult>
  /** Administrators and experts must also pass an authenticator-app check; the database refuses their powers without it. */
  getMfaState(): Promise<AuthResult<MfaState>>
  enrollTotp(): Promise<AuthResult<TotpEnrolment>>
  /** Checks a 6-digit code. For a newly set-up authenticator this also marks it as verified. */
  verifyTotp(factorId: string, code: string): Promise<AuthResult>
}
