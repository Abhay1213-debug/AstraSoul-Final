import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AuthErrorCode, AuthResult, AuthService, AuthUser } from './types'

/**
 * The ONE adapter between the website's AuthService and the Supabase client.
 *
 * Rules kept here (and checked by tests):
 *  - Passwords are passed straight to the library and never stored, logged, or put in a URL.
 *  - Server error text is NEVER returned; only a short fixed code (see mapError). Nothing is logged.
 *  - Sign-up never reveals whether an email already has an account: "already registered" is reported exactly like
 *    a fresh sign-up that needs email confirmation.
 *  - Nothing about WHO is allowed to do WHAT is decided here. The database (Row Level Security) decides.
 *
 * NOT yet exercised against a real Supabase project: the tests use a stand-in client. The real behaviour is checked in
 * supabase/tests/REAL_SESSION_VALIDATION.md once the database is installed.
 */

interface ErrorLike {
  code?: string
  status?: number
  name?: string
}

export function mapError(err: unknown): AuthErrorCode {
  const e = (err ?? {}) as ErrorLike
  switch (e.code) {
    case 'invalid_credentials':
      return 'invalid_credentials'
    case 'email_not_confirmed':
      return 'email_not_confirmed'
    case 'weak_password':
      return 'weak_password'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'rate_limited'
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'signup_disabled'
    case 'same_password':
      return 'same_password'
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
    case 'mfa_verification_rejected':
      return 'invalid_code'
    case 'reauthentication_needed':
    case 'reauthentication_not_valid':
    case 'session_expired':
    case 'session_not_found':
    case 'bad_jwt':
    case 'no_authorization':
      return 'session_expired'
  }
  if (e.name === 'AuthSessionMissingError') return 'session_expired'
  if (e.status === 429) return 'rate_limited'
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || e.status === 0) return 'network'
  return 'unknown'
}

const ALREADY_REGISTERED = new Set(['user_already_exists', 'email_exists'])

function toUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null
  const raw = (u.user_metadata as { full_name?: unknown } | undefined)?.full_name
  return { id: u.id, email: u.email ?? '', fullName: typeof raw === 'string' ? raw.slice(0, 80) : '' }
}

const fail = (code: AuthErrorCode): AuthResult<never> => ({ ok: false, code })

export function createSupabaseAuthService(client: SupabaseClient, options: { redirectTo?: string; resetRedirectTo?: string } = {}): AuthService {
  return {
    async getUser() {
      try {
        const { data } = await client.auth.getSession()
        return toUser(data.session?.user)
      } catch {
        return null
      }
    },

    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Keep this callback tiny and synchronous: calling the auth library from inside it can deadlock.
        listener(toUser(session?.user))
      })
      return () => data.subscription.unsubscribe()
    },

    async signUp({ fullName, email, password }) {
      try {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: options.redirectTo },
        })
        if (error) {
          if (error.code && ALREADY_REGISTERED.has(error.code)) return { ok: true, data: { needsConfirmation: true } }
          return fail(mapError(error))
        }
        return { ok: true, data: { needsConfirmation: !data.session } }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async signIn({ email, password }) {
      try {
        const { error } = await client.auth.signInWithPassword({ email, password })
        return error ? fail(mapError(error)) : { ok: true, data: undefined }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async resendConfirmation(email) {
      try {
        const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: options.redirectTo } })
        return error ? fail(mapError(error)) : { ok: true, data: undefined }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async requestPasswordReset(email) {
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: options.resetRedirectTo })
        return error ? fail(mapError(error)) : { ok: true, data: undefined }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async updatePassword(newPassword) {
      try {
        const { error } = await client.auth.updateUser({ password: newPassword })
        if (error) return fail(mapError(error))
        // Best effort: end every OTHER login of this account, so an old session someone else may hold does not survive a password change.
        try {
          await client.auth.signOut({ scope: 'others' })
        } catch {
          // the password change itself already succeeded
        }
        return { ok: true, data: undefined }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async getMfaState() {
      try {
        const level = await client.auth.mfa.getAuthenticatorAssuranceLevel()
        if (level.error) return fail(mapError(level.error))
        const factors = await client.auth.mfa.listFactors()
        if (factors.error) return fail(mapError(factors.error))
        // listFactors().totp contains only VERIFIED authenticators
        const verified = factors.data.totp[0]
        return { ok: true, data: { level: level.data.currentLevel === 'aal2' ? 'aal2' : 'aal1', verifiedFactorId: verified?.id ?? null } }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async enrollTotp() {
      try {
        const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `ankiro-${Date.now()}` })
        if (error) return fail(mapError(error))
        return { ok: true, data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async verifyTotp(factorId, code) {
      try {
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code })
        return error ? fail(mapError(error)) : { ok: true, data: undefined }
      } catch (err) {
        return fail(mapError(err))
      }
    },

    async signOut() {
      try {
        const { error } = await client.auth.signOut()
        return error ? fail(mapError(error)) : { ok: true, data: undefined }
      } catch (err) {
        return fail(mapError(err))
      }
    },
  }
}
