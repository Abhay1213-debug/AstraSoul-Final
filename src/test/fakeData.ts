import type {
  AuditInfo, DataResult, DataService, ExpertInfo, ExpertInput, Mode, NewRequestInput, NoteInfo, PaymentInfo, PaymentSettings, PriceInfo,
  ProfileInfo, RequestFilter, RequestInfo, RequestPatch, ServiceInfo, SettingKey, StaffRoleInfo,
} from '../lib/data'

/**
 * A stand-in for the real database, used ONLY by tests (it lives in src/test so the site can never import it - a test checks this).
 * It keeps everything in memory and never touches the network or Supabase.
 *
 * It copies the RULES the real database enforces (who can see what, the status steps, the payment checks) so the SCREENS can be tested.
 * It is NOT evidence that the real database enforces them: that is shown by supabase/tests/isolation_tests.sql, run against Supabase.
 */
export interface Actor {
  id: string | null
  /** 'admin' only has powers when `aal2` is true, like the real database. */
  staff?: { role: 'admin' | 'staff'; expertId?: string | null }
  aal2?: boolean
}

export interface FakeData extends DataService {
  /** Who is "logged in" for the next calls. */
  actAs(actor: Actor): void
  tables: {
    profiles: Map<string, ProfileInfo>
    requests: RequestInfo[]
    notes: Array<NoteInfo>
    audit: AuditInfo[]
    experts: ExpertInfo[]
    services: ServiceInfo[]
    prices: PriceInfo[]
    settings: Record<SettingKey, string>
  }
  /** Every call made, by method name (to check that a screen did or did not contact the service). */
  calls: string[]
  /** Make the next call fail with this code. */
  failNext(code: Parameters<typeof failResult>[0]): void
  setConsent(version: string | null): void
  addProfile(p: Partial<ProfileInfo> & { id: string }): void
}

function failResult(code: import('../lib/data').DataErrorCode): DataResult<never> {
  return { ok: false, code }
}

const MODES: Mode[] = ['chat', 'voice', 'video']
const SERVICES: ServiceInfo[] = [
  { slug: 'numerology', name: 'Numerology', dobRequirement: 'required', active: true, displayOrder: 1 },
  { slug: 'palmistry', name: 'Palmistry', dobRequirement: 'none', active: true, displayOrder: 2 },
  { slug: 'gemstone-guidance', name: 'Gemstone Guidance', dobRequirement: 'optional', active: true, displayOrder: 3 },
  { slug: 'color-therapy', name: 'Color Therapy', dobRequirement: 'none', active: true, displayOrder: 4 },
]

export function createFakeData(): FakeData {
  let actor: Actor = { id: null }
  let pending: import('../lib/data').DataErrorCode | null = null
  let consent: string | null = null
  let seq = 0
  const calls: string[] = []
  const tables: FakeData['tables'] = {
    profiles: new Map(),
    requests: [],
    notes: [],
    audit: [],
    experts: [],
    services: SERVICES.map((s) => ({ ...s })),
    prices: SERVICES.flatMap((s) => MODES.map((m): PriceInfo => ({ serviceSlug: s.slug, mode: m, amountMinor: null }))),
    settings: { upi_id: '', payee_name: '', payment_instructions: '' },
  }
  const id = (p: string) => `${p}-${++seq}`
  const now = () => new Date().toISOString()
  const ok = <T,>(data: T): DataResult<T> => ({ ok: true, data })

  const isAdmin = () => actor.staff?.role === 'admin' && actor.aal2 === true
  const staffExpert = () => (actor.staff?.role === 'staff' ? actor.staff.expertId ?? null : null)
  const log = (action: string, entity: string, entityId: string) =>
    tables.audit.unshift({ id: id('a'), at: now(), actorKind: isAdmin() ? 'admin' : actor.staff ? 'staff' : 'customer', action, entity, entityId })

  /** What this actor may see, mirroring the Row Level Security policies. */
  const visibleRequests = () =>
    tables.requests.filter((r) =>
      isAdmin() ? true : r.customerId === actor.id || (staffExpert() !== null && r.assignedExpertId === staffExpert()),
    )

  function guard<T>(name: string, fn: () => DataResult<T>): Promise<DataResult<T>> {
    calls.push(name)
    if (pending) {
      const code = pending
      pending = null
      return Promise.resolve(failResult(code))
    }
    return Promise.resolve(fn())
  }
  const needLogin = <T,>(fn: () => DataResult<T>) => (): DataResult<T> => (actor.id ? fn() : failResult('not_signed_in'))

  const confirmationProblem = (r: RequestInfo, expertId: string): import('../lib/data').DataErrorCode | null => {
    const e = tables.experts.find((x) => x.id === expertId)
    if (!e || !e.active) return 'expert_unavailable'
    if (!e.serviceSlugs.includes(r.serviceSlug)) return 'expert_service_mismatch'
    if (!e.modes.includes(r.mode)) return 'expert_mode_mismatch'
    return null
  }

  /** Row Level Security shows payments only to administrators and to the customer they belong to - never to an expert. */
  const withVisiblePayments = (r: RequestInfo): RequestInfo => (isAdmin() || r.customerId === actor.id ? r : { ...r, payments: [] })

  const OPEN = ['submitted', 'awaiting_confirmation', 'confirmed']
  const NEXT: Record<string, string[]> = {
    submitted: ['awaiting_confirmation', 'cancelled'],
    awaiting_confirmation: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled', 'awaiting_confirmation'],
  }

  const svc: FakeData = {
    tables,
    calls,
    actAs(a) {
      actor = a
    },
    failNext(code) {
      pending = code
    },
    setConsent(v) {
      consent = v
    },
    addProfile(p) {
      tables.profiles.set(p.id, { email: '', fullName: 'Test Person', phone: '', dateOfBirth: '', preferredLanguage: '', ...p })
    },

    listServices: () => guard('listServices', () => ok(tables.services.filter((s) => s.active).map((s) => ({ ...s })))),
    listPrices: () => guard('listPrices', () => ok(tables.prices.map((p) => ({ ...p })))),
    listExperts: () => guard('listExperts', () => ok(tables.experts.filter((e) => e.active).map((e) => ({ ...e })))),
    getActiveConsentVersion: () => guard('getActiveConsentVersion', needLogin(() => ok(consent))),

    getMyProfile: () => guard('getMyProfile', needLogin(() => ok(tables.profiles.get(actor.id!) ?? null))),
    updateMyProfile: (p) =>
      guard('updateMyProfile', needLogin(() => {
        const cur = tables.profiles.get(actor.id!)
        if (!cur) return failResult('forbidden')
        if (p.fullName.trim().length < 2 || p.fullName.trim().length > 80) return failResult('invalid_input')
        tables.profiles.set(actor.id!, { ...cur, fullName: p.fullName.trim(), phone: p.phone.trim(), dateOfBirth: p.dateOfBirth, preferredLanguage: p.preferredLanguage.trim() })
        return ok(undefined)
      })),
    getPaymentSettings: () =>
      guard('getPaymentSettings', needLogin(() => {
        if (actor.staff?.role === 'staff') return ok({ upiId: '', payeeName: '', instructions: '' }) // staff may not read the payment settings
        const s: PaymentSettings = { upiId: tables.settings.upi_id, payeeName: tables.settings.payee_name, instructions: tables.settings.payment_instructions }
        return ok(s)
      })),

    listMyRequests: () => guard('listMyRequests', needLogin(() => ok(tables.requests.filter((r) => r.customerId === actor.id).map(clone)))),
    getMyRequest: (rid) =>
      guard('getMyRequest', needLogin(() => ok(clone(tables.requests.find((r) => r.id === rid && r.customerId === actor.id)) ?? null))),

    createRequest: (input: NewRequestInput) =>
      guard('createRequest', needLogin(() => {
        const profile = tables.profiles.get(actor.id!)
        if (!profile) return failResult('profile_missing')
        if (!consent || input.consentVersion !== consent) return failResult('consent_unavailable')
        const service = tables.services.find((s) => s.slug === input.serviceSlug)
        if (!service || !service.active) return failResult('service_unavailable')
        if (!MODES.includes(input.mode)) return failResult('invalid_input')
        const concern = input.concern.trim()
        if (concern.length < 10 || concern.length > 1000) return failResult('invalid_input')
        if (service.dobRequirement === 'required' && !input.dateOfBirth) return failResult('date_of_birth_required')
        const mine = tables.requests.filter((r) => r.customerId === actor.id)
        if (mine.filter((r) => OPEN.includes(r.status)).length >= 3) return failResult('too_many_open_requests')
        if (mine.length >= 10) return failResult('too_many_requests_24h')
        const row: RequestInfo = {
          id: id('req'), customerId: actor.id!, customerName: profile.fullName, serviceSlug: input.serviceSlug, mode: input.mode, concern,
          dateOfBirth: service.dobRequirement === 'none' ? '' : input.dateOfBirth, preferredLanguage: input.preferredLanguage.trim(),
          status: 'submitted', assignedExpertId: null, scheduledAt: null, meetingLink: null, createdAt: now(), updatedAt: now(), payments: [],
        }
        tables.requests.unshift(row)
        log('insert', 'consultation_requests', row.id)
        return ok({ id: row.id })
      })),

    cancelMyRequest: (rid) =>
      guard('cancelMyRequest', needLogin(() => {
        const r = tables.requests.find((x) => x.id === rid && x.customerId === actor.id)
        if (!r || !['submitted', 'awaiting_confirmation'].includes(r.status)) return failResult('cannot_cancel')
        if (r.payments.some((p) => p.status === 'succeeded')) return failResult('payment_received')
        r.status = 'cancelled'
        r.updatedAt = now()
        log('update', 'consultation_requests', r.id)
        return ok(undefined)
      })),

    submitPaymentReference: (i) =>
      guard('submitPaymentReference', needLogin(() => {
        const r = tables.requests.find((x) => x.id === i.requestId && x.customerId === actor.id)
        if (!r) return failResult('request_not_payable')
        const ref = i.upiReference.toUpperCase().replace(/[^A-Z0-9]/g, '')
        if (!/^[A-Z0-9]{8,35}$/.test(ref)) return failResult('invalid_reference')
        const name = i.payerName.trim()
        if (name.length < 2 || name.length > 80 || /[0-9]{4,}/.test(name)) return failResult('invalid_payer_name')
        if (!i.paidOn || i.paidOn > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) return failResult('invalid_payment_date')
        if (!['submitted', 'awaiting_confirmation', 'confirmed'].includes(r.status)) return failResult('request_not_payable')
        const price = tables.prices.find((p) => p.serviceSlug === r.serviceSlug && p.mode === r.mode)?.amountMinor
        if (price == null) return failResult('price_not_set')
        if (r.payments.some((p) => p.status === 'succeeded')) return failResult('already_paid')
        if (r.payments.some((p) => p.status === 'pending')) return failResult('claim_already_pending')
        if (r.payments.length >= 5) return failResult('too_many_payment_attempts')
        const spent = tables.requests.flatMap((x) => x.payments.map((p) => ({ p, owner: x.customerId }))).some(
          ({ p, owner }) => p.upiReference === ref && (p.status !== 'failed' || owner !== actor.id),
        )
        if (spent) return failResult('reference_unavailable')
        const pay: PaymentInfo = {
          id: id('pay'), requestId: r.id, status: 'pending', amountMinor: price, upiReference: ref, payerName: name, paidOn: i.paidOn,
          submittedAt: now(), receivedAmountMinor: null, verifiedAt: null, refundedAt: null,
        }
        r.payments.unshift(pay)
        ;(pay as PaymentInfo & { submittedBy?: string }).submittedBy = actor.id!
        log('insert', 'payments', pay.id)
        return ok(undefined)
      })),

    getMyStaffRole: () =>
      guard('getMyStaffRole', needLogin(() => {
        const s = actor.staff
        const info: StaffRoleInfo | null = s ? { role: s.role, active: true, expertId: s.expertId ?? null } : null
        return ok(info)
      })),

    listRequests: (f: RequestFilter = {}) =>
      guard('listRequests', needLogin(() => {
        let list = visibleRequests().map(withVisiblePayments)
        if (f.status && f.status !== 'all') list = list.filter((r) => r.status === f.status)
        const s = (f.search ?? '').trim().toLowerCase()
        if (s) list = list.filter((r) => r.customerName.toLowerCase().includes(s) || r.serviceSlug.includes(s) || r.id.startsWith(s))
        return ok(list.map(clone))
      })),
    getRequest: (rid) => guard('getRequest', needLogin(() => ok(clone(visibleRequests().map(withVisiblePayments).find((r) => r.id === rid)) ?? null))),
    getCustomerProfile: (cid) =>
      guard('getCustomerProfile', needLogin(() => ok(isAdmin() || cid === actor.id ? tables.profiles.get(cid) ?? null : null))),
    listNotes: (rid) =>
      guard('listNotes', needLogin(() => {
        if (!visibleRequests().some((r) => r.id === rid)) return ok([])
        if (isAdmin()) return ok(tables.notes.filter((n) => n.requestId === rid))
        if (staffExpert() !== null) return ok(tables.notes.filter((n) => n.requestId === rid && n.kind === 'general'))
        return ok([]) // customers never read notes
      })),
    addNote: (rid, body) =>
      guard('addNote', needLogin(() => {
        const r = visibleRequests().find((x) => x.id === rid)
        if (!r || !(isAdmin() || staffExpert() !== null)) return failResult('forbidden')
        if (body.trim().length < 1 || body.length > 2000) return failResult('invalid_input')
        tables.notes.push({ id: id('n'), requestId: rid, body: body.trim(), kind: 'general', createdAt: now() })
        log('insert', 'request_notes', rid)
        return ok(undefined)
      })),

    updateRequest: (rid, patch: RequestPatch) =>
      guard('updateRequest', needLogin(() => {
        const r = visibleRequests().find((x) => x.id === rid)
        const staff = staffExpert() !== null && r?.assignedExpertId === staffExpert()
        if (!r || !(isAdmin() || staff)) return failResult('forbidden')
        const next = { ...r, ...patch }
        if (staff) {
          if (patch.assignedExpertId !== undefined && patch.assignedExpertId !== r.assignedExpertId) return failResult('forbidden')
          if (patch.scheduledAt !== undefined && patch.scheduledAt !== r.scheduledAt) return failResult('forbidden')
          if (patch.status && patch.status !== r.status && !(r.status === 'confirmed' && patch.status === 'completed')) return failResult('forbidden')
        }
        if (patch.status && patch.status !== r.status && !(NEXT[r.status] ?? []).includes(patch.status)) return failResult('invalid_status_transition')
        if (patch.status === undefined && ['completed', 'cancelled'].includes(r.status) && (patch.assignedExpertId !== undefined || patch.scheduledAt !== undefined || patch.meetingLink !== undefined)) return failResult('request_is_closed')
        if (next.status === 'confirmed') {
          if (!next.assignedExpertId || !next.scheduledAt) return failResult('expert_and_schedule_required')
          const problem = confirmationProblem(r, next.assignedExpertId)
          if (problem) return failResult(problem)
          if (new Date(next.scheduledAt).getTime() < Date.now() - 5 * 60000) return failResult('schedule_in_past')
        }
        if (['submitted', 'awaiting_confirmation', 'cancelled'].includes(next.status)) next.meetingLink = null
        Object.assign(r, next, { updatedAt: now() })
        log('update', 'consultation_requests', r.id)
        return ok(undefined)
      })),

    verifyPayment: (pid, decision, received) =>
      guard('verifyPayment', needLogin(() => {
        if (!isAdmin()) return failResult('forbidden')
        const r = tables.requests.find((x) => x.payments.some((p) => p.id === pid))
        const p = r?.payments.find((x) => x.id === pid)
        if (!r || !p) return failResult('payment_not_pending')
        if ((p as PaymentInfo & { submittedBy?: string }).submittedBy === actor.id || r.customerId === actor.id) return failResult('self_verification_forbidden')
        if (p.status !== 'pending') return failResult('payment_not_pending')
        if (decision === 'succeeded' && received !== p.amountMinor) return failResult('amount_mismatch')
        p.status = decision
        p.receivedAmountMinor = received
        p.verifiedAt = now()
        log('update', 'payments', p.id)
        return ok(undefined)
      })),
    refundPayment: (pid) =>
      guard('refundPayment', needLogin(() => {
        if (!isAdmin()) return failResult('forbidden')
        const r = tables.requests.find((x) => x.payments.some((p) => p.id === pid))
        const p = r?.payments.find((x) => x.id === pid)
        if (!r || !p || p.status !== 'succeeded') return failResult('payment_not_refundable')
        if (r.customerId === actor.id) return failResult('self_verification_forbidden')
        p.status = 'refunded'
        p.refundedAt = now()
        log('update', 'payments', p.id)
        return ok(undefined)
      })),

    listAllServices: () => guard('listAllServices', needLogin(() => (isAdmin() ? ok(tables.services.map((s) => ({ ...s }))) : ok(tables.services.filter((s) => s.active).map((s) => ({ ...s })))))),
    updateService: (slug, p) =>
      guard('updateService', needLogin(() => {
        const s = tables.services.find((x) => x.slug === slug)
        if (!isAdmin() || !s) return failResult('forbidden')
        if (p.name.trim().length < 2 || p.name.trim().length > 80) return failResult('invalid_input')
        Object.assign(s, { name: p.name.trim(), active: p.active, displayOrder: p.displayOrder })
        log('update', 'services', slug)
        return ok(undefined)
      })),
    setPrice: (slug, mode, amount) =>
      guard('setPrice', needLogin(() => {
        const p = tables.prices.find((x) => x.serviceSlug === slug && x.mode === mode)
        if (!isAdmin() || !p) return failResult('forbidden')
        if (amount !== null && (!Number.isInteger(amount) || amount <= 0 || amount > 10000000)) return failResult('invalid_input')
        p.amountMinor = amount
        log('update', 'service_prices', `${slug}/${mode}`)
        return ok(undefined)
      })),
    listAllExperts: () => guard('listAllExperts', needLogin(() => (isAdmin() ? ok(tables.experts.map((e) => ({ ...e }))) : ok(tables.experts.filter((e) => e.active).map((e) => ({ ...e })))))),
    saveExpert: (input: ExpertInput) =>
      guard('saveExpert', needLogin(() => {
        if (!isAdmin()) return failResult('forbidden')
        if (input.displayName.trim().length < 2 || input.displayName.trim().length > 80 || input.bio.length > 600) return failResult('invalid_input')
        const existing = input.id ? tables.experts.find((e) => e.id === input.id) : undefined
        if (input.id && !existing) return failResult('forbidden')
        const row: ExpertInfo = { ...input, id: existing?.id ?? id('exp'), displayName: input.displayName.trim(), bio: input.bio.trim(), availabilityNote: input.availabilityNote.trim() }
        if (existing) Object.assign(existing, row)
        else tables.experts.push(row)
        log(existing ? 'update' : 'insert', 'experts', row.id)
        return ok({ id: row.id })
      })),
    saveSetting: (key, value) =>
      guard('saveSetting', needLogin(() => {
        if (!isAdmin()) return failResult('forbidden')
        const v = value.trim()
        if (v.length < 1 || v.length > 500) return failResult('invalid_input')
        if (key === 'upi_id' && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(v)) return failResult('invalid_input')
        tables.settings[key] = v
        log('update', 'app_settings', key)
        return ok(undefined)
      })),
    listAudit: (limit = 100) => guard('listAudit', needLogin(() => (isAdmin() ? ok(tables.audit.slice(0, limit)) : ok([])))),
  }
  return svc
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T)
}
