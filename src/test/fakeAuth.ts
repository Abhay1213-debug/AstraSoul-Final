import type { AuthErrorCode, AuthResult, AuthService, AuthUser, MfaState, SignInInput, SignUpInput } from '../lib/auth'

/**
 * A stand-in for the real account service, used ONLY by tests. It lives in src/test so it can never be imported by the
 * site itself (a test checks this). It keeps everything in memory and never touches the network or Supabase.
 */
export interface FakeAuth extends AuthService {
  calls: { signUp: SignUpInput[]; signIn: SignInInput[]; signOut: number; getUser: number; resetRequests: string[]; passwordUpdates: string[]; resends: string[] }
  /** Make the next signUp/signIn/signOut fail with this code. */
  failNext(code: AuthErrorCode): void
  /** Sign someone in/out without going through the forms. */
  setUser(user: AuthUser | null): void
  /** Hold getUser() open until released (to test the "checking your account" state). */
  holdGetUser(): () => void
  /** Set the authenticator state the stand-in reports (default: level aal1, no authenticator set up). */
  setMfa(state: MfaState): void
  mfaCalls: { enrol: number; verify: Array<{ factorId: string; code: string }> }
}

export function createFakeAuth(options: { user?: AuthUser | null; needsConfirmation?: boolean } = {}): FakeAuth {
  let user: AuthUser | null = options.user ?? null
  let pendingFailure: AuthErrorCode | null = null
  let gate: Promise<void> | null = null
  const listeners = new Set<(u: AuthUser | null) => void>()
  let mfa: MfaState = { level: 'aal1', verifiedFactorId: null }
  const mfaCalls: FakeAuth['mfaCalls'] = { enrol: 0, verify: [] }
  const accounts = new Map<string, { password: string; fullName: string }>()
  const emit = () => listeners.forEach((l) => l(user))
  const takeFailure = (): AuthResult<never> | null => {
    if (!pendingFailure) return null
    const code = pendingFailure
    pendingFailure = null
    return { ok: false, code }
  }

  return {
    calls: { signUp: [], signIn: [], signOut: 0, getUser: 0, resetRequests: [], passwordUpdates: [], resends: [] },
    mfaCalls,
    setMfa(state) {
      mfa = state
    },
    async getMfaState() {
      return takeFailure() ?? { ok: true, data: mfa }
    },
    async enrollTotp() {
      mfaCalls.enrol++
      return takeFailure() ?? { ok: true, data: { factorId: 'f-new', qrCode: 'data:image/svg+xml;base64,AAAA', secret: 'TESTSECRETTESTSECRET' } }
    },
    async verifyTotp(factorId, code) {
      mfaCalls.verify.push({ factorId, code })
      const failure = takeFailure()
      if (failure) return failure
      if (code !== '123456') return { ok: false, code: 'invalid_code' }
      mfa = { level: 'aal2', verifiedFactorId: factorId }
      return { ok: true, data: undefined }
    },
    failNext(code) {
      pendingFailure = code
    },
    setUser(u) {
      user = u
      emit()
    },
    holdGetUser() {
      let release!: () => void
      gate = new Promise<void>((r) => (release = r))
      return () => release()
    },
    async getUser() {
      this.calls.getUser++
      if (gate) await gate
      return user
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async signUp(input) {
      this.calls.signUp.push(input)
      const failure = takeFailure()
      if (failure) return failure
      accounts.set(input.email, { password: input.password, fullName: input.fullName })
      if (options.needsConfirmation === false) {
        user = { id: 'u-new', email: input.email, fullName: input.fullName }
        emit()
        return { ok: true, data: { needsConfirmation: false } }
      }
      return { ok: true, data: { needsConfirmation: true } }
    },
    async signIn(input) {
      this.calls.signIn.push(input)
      const failure = takeFailure()
      if (failure) return failure
      const account = accounts.get(input.email)
      if (!account || account.password !== input.password) return { ok: false, code: 'invalid_credentials' }
      user = { id: 'u-1', email: input.email, fullName: account.fullName }
      emit()
      return { ok: true, data: undefined }
    },
    async resendConfirmation(email) {
      this.calls.resends.push(email)
      return takeFailure() ?? { ok: true, data: undefined }
    },
    async requestPasswordReset(email) {
      this.calls.resetRequests.push(email)
      // Like the real service: the same answer whether or not the address has an account.
      return takeFailure() ?? { ok: true, data: undefined }
    },
    async updatePassword(newPassword) {
      this.calls.passwordUpdates.push(newPassword)
      const failure = takeFailure()
      if (failure) return failure
      if (!user) return { ok: false, code: 'session_expired' }
      const account = accounts.get(user.email)
      if (account?.password === newPassword) return { ok: false, code: 'same_password' }
      accounts.set(user.email, { password: newPassword, fullName: user.fullName })
      return { ok: true, data: undefined }
    },
    async signOut() {
      this.calls.signOut++
      const failure = takeFailure()
      if (failure) return failure
      user = null
      emit()
      return { ok: true, data: undefined }
    },
  }
}

/** Register an account directly (so a log-in test does not have to go through sign-up first). */
export async function seedAccount(fake: FakeAuth, email: string, password: string, fullName: string) {
  const before = fake.calls.signUp.length
  await fake.signUp({ email, password, fullName })
  fake.calls.signUp.length = before
}
