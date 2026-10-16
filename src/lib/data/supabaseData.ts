import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AuditInfo, DataErrorCode, DataResult, DataService, DobRequirement, ExpertInfo, ExpertInput, Mode, NewRequestInput, NoteInfo,
  NoteKind, PaymentClaimInput, PaymentInfo, PaymentSettings, PaymentStatus, PriceInfo, ProfileInfo, RequestFilter, RequestInfo,
  RequestPatch, RequestStatus, ServiceInfo, SettingKey, StaffRoleInfo,
} from './types'

/**
 * The ONE adapter between the website's DataService and the Supabase client.
 *
 * Rules kept here (and checked by tests):
 *  - Only the columns the logged-in role is GRANTED are ever selected (the database refuses anything else).
 *  - Nothing about WHO may do WHAT is decided here. Row Level Security, the triggers and the functions in supabase/migrations decide.
 *  - Server error text is NEVER returned; only a short fixed code (see mapDataError). Nothing is logged.
 *  - Payments are created and decided ONLY by the database functions (submit_payment_reference, verify_payment, refund_payment).
 *
 * NOT yet exercised against the real Supabase project: the tests use a stand-in client and a stand-in service.
 */

interface ErrorLike {
  code?: string
  message?: string
  status?: number
  name?: string
}

/** The exact messages raised by our database functions and triggers (see supabase/migrations 0300 and 0400). */
const MESSAGE_CODES: Record<string, DataErrorCode> = {
  not_authenticated: 'not_signed_in',
  forbidden: 'forbidden',
  immutable_field: 'forbidden',
  cannot_cancel: 'cannot_cancel',
  payment_received: 'payment_received',
  invalid_reference: 'invalid_reference',
  invalid_payer_name: 'invalid_payer_name',
  invalid_payment_date: 'invalid_payment_date',
  invalid_payment_details: 'invalid_payment_details',
  request_not_payable: 'request_not_payable',
  price_not_set: 'price_not_set',
  already_paid: 'already_paid',
  claim_already_pending: 'claim_already_pending',
  too_many_payment_attempts: 'too_many_payment_attempts',
  reference_unavailable: 'reference_unavailable',
  self_verification_forbidden: 'self_verification_forbidden',
  amount_mismatch: 'amount_mismatch',
  payment_not_pending: 'payment_not_pending',
  payment_not_refundable: 'payment_not_refundable',
  invalid_decision: 'invalid_input',
  too_many_open_requests: 'too_many_open_requests',
  too_many_requests_24h: 'too_many_requests_24h',
  consent_version_invalid: 'consent_unavailable',
  date_of_birth_required: 'date_of_birth_required',
  service_unavailable: 'service_unavailable',
  profile_missing: 'profile_missing',
  account_closed: 'account_closed',
  invalid_mode: 'invalid_input',
  invalid_concern: 'invalid_input',
  invalid_date_of_birth: 'invalid_input',
  invalid_language: 'invalid_input',
  invalid_status_transition: 'invalid_status_transition',
  request_is_closed: 'request_is_closed',
  expert_and_schedule_required: 'expert_and_schedule_required',
  schedule_in_past: 'schedule_in_past',
  expert_unavailable: 'expert_unavailable',
  expert_service_mismatch: 'expert_service_mismatch',
  expert_mode_mismatch: 'expert_mode_mismatch',
}

export function mapDataError(err: unknown): DataErrorCode {
  const e = (err ?? {}) as ErrorLike
  const byMessage = typeof e.message === 'string' ? MESSAGE_CODES[e.message.trim()] : undefined
  if (byMessage) return byMessage
  if (e.code === '42501') return 'forbidden' // privilege or Row Level Security refusal
  if (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401) return 'not_signed_in'
  if (e.code === 'PGRST116') return 'not_found'
  if (e.code === '23514' || e.code === '22P02' || e.code === '22007' || e.code === '22008') return 'invalid_input'
  if (e.code === '23505') return 'reference_unavailable'
  if (e.status === 429) return 'rate_limited'
  if (e.status === 403) return 'forbidden'
  if (e.name === 'TypeError' || e.name === 'AuthRetryableFetchError' || e.status === 0) return 'network'
  return 'unknown'
}

const fail = (code: DataErrorCode): DataResult<never> => ({ ok: false, code })
const ok = <T>(data: T): DataResult<T> => ({ ok: true, data })

type Row = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null)
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const REQUEST_COLUMNS =
  'id, customer_id, customer_name, service_slug, mode, concern, date_of_birth, preferred_language, status, assigned_expert_id, scheduled_at, meeting_link, created_at, updated_at'
// Only the payment columns the database lets a logged-in user read (never who submitted/verified).
const PAYMENT_COLUMNS =
  'id, request_id, status, amount_minor, upi_reference, payer_name, paid_on, submitted_at, received_amount_minor, verified_at, refunded_at'
const REQUEST_WITH_PAYMENTS = `${REQUEST_COLUMNS}, payments(${PAYMENT_COLUMNS})`

const toPayment = (r: Row): PaymentInfo => ({
  id: str(r.id),
  requestId: str(r.request_id),
  status: str(r.status) as PaymentStatus,
  amountMinor: num(r.amount_minor),
  upiReference: str(r.upi_reference),
  payerName: str(r.payer_name),
  paidOn: str(r.paid_on),
  submittedAt: str(r.submitted_at),
  receivedAmountMinor: numOrNull(r.received_amount_minor),
  verifiedAt: strOrNull(r.verified_at),
  refundedAt: strOrNull(r.refunded_at),
})

const toRequest = (r: Row): RequestInfo => ({
  id: str(r.id),
  customerId: str(r.customer_id),
  customerName: str(r.customer_name),
  serviceSlug: str(r.service_slug),
  mode: str(r.mode) as Mode,
  concern: str(r.concern),
  dateOfBirth: str(r.date_of_birth),
  preferredLanguage: str(r.preferred_language),
  status: str(r.status) as RequestStatus,
  assignedExpertId: strOrNull(r.assigned_expert_id),
  scheduledAt: strOrNull(r.scheduled_at),
  meetingLink: strOrNull(r.meeting_link),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  payments: (Array.isArray(r.payments) ? (r.payments as Row[]) : []).map(toPayment).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
})

const toService = (r: Row): ServiceInfo => ({
  slug: str(r.slug),
  name: str(r.name),
  dobRequirement: str(r.dob_requirement) as DobRequirement,
  active: r.active === true,
  displayOrder: num(r.display_order),
})

const toExpert = (r: Row): ExpertInfo => ({
  id: str(r.id),
  displayName: str(r.display_name),
  bio: str(r.bio),
  languages: arr(r.languages),
  modes: arr(r.modes) as Mode[],
  availabilityNote: str(r.availability_note),
  active: r.active === true,
  serviceSlugs: (Array.isArray(r.expert_services) ? (r.expert_services as Row[]) : []).map((x) => str(x.service_slug)).filter(Boolean),
})

const EXPERT_COLUMNS = 'id, display_name, bio, languages, modes, availability_note, active, expert_services(service_slug)'
const SERVICE_COLUMNS = 'slug, name, dob_requirement, active, display_order'

export function createSupabaseDataService(client: SupabaseClient): DataService {
  /** The signed-in account id from the LOCAL session (no network). Convenience only; the database re-checks every call. */
  async function myId(): Promise<string | null> {
    const { data } = await client.auth.getSession()
    return data.session?.user.id ?? null
  }

  /** Runs one operation; turns any failure (including a thrown one) into a fixed code. */
  async function run<T>(op: () => Promise<DataResult<T>>): Promise<DataResult<T>> {
    try {
      return await op()
    } catch (err) {
      return fail(mapDataError(err))
    }
  }

  async function rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<DataResult<Row[]>> {
    const { data, error } = await query
    if (error) return fail(mapDataError(error))
    return ok(Array.isArray(data) ? (data as Row[]) : [])
  }

  async function one(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<DataResult<Row | null>> {
    const { data, error } = await query
    if (error) return fail(mapDataError(error))
    return ok(data && typeof data === 'object' ? (data as Row) : null)
  }

  /** A write that must change exactly one row. A refusal by Row Level Security shows up as "0 rows", not as an error. */
  async function changed(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<DataResult> {
    const { data, error } = await query
    if (error) return fail(mapDataError(error))
    return Array.isArray(data) && data.length > 0 ? ok(undefined) : fail('forbidden')
  }

  const rpc = (name: string, args: Record<string, unknown>) =>
    run(async () => {
      const { error } = await client.rpc(name, args)
      return error ? fail(mapDataError(error)) : ok(undefined)
    })

  return {
    listServices: () =>
      run(async () => {
        const r = await rows(client.from('services').select(SERVICE_COLUMNS).eq('active', true).order('display_order'))
        return r.ok ? ok(r.data.map(toService)) : r
      }),

    listPrices: () =>
      run(async () => {
        const r = await rows(client.from('service_prices').select('service_slug, mode, amount_minor'))
        return r.ok
          ? ok(r.data.map((x): PriceInfo => ({ serviceSlug: str(x.service_slug), mode: str(x.mode) as Mode, amountMinor: numOrNull(x.amount_minor) })))
          : r
      }),

    listExperts: () =>
      run(async () => {
        const r = await rows(client.from('experts').select(EXPERT_COLUMNS).eq('active', true).order('display_name'))
        return r.ok ? ok(r.data.map(toExpert)) : r
      }),

    getActiveConsentVersion: () =>
      run(async () => {
        const r = await rows(client.from('consent_versions').select('version, approved_at').eq('active', true).order('approved_at', { ascending: false }).limit(1))
        return r.ok ? ok(r.data[0] ? str(r.data[0].version) : null) : r
      }),

    getMyProfile: () =>
      run(async () => {
        const id = await myId()
        if (!id) return fail('not_signed_in')
        return profileById(id)
      }),

    updateMyProfile: (p) =>
      run(async () => {
        const id = await myId()
        if (!id) return fail('not_signed_in')
        return changed(
          client
            .from('profiles')
            .update({
              full_name: p.fullName.trim(),
              phone: p.phone.trim() || null,
              date_of_birth: p.dateOfBirth || null,
              preferred_language: p.preferredLanguage.trim() || null,
            })
            .eq('id', id)
            .select('id'),
        )
      }),

    getPaymentSettings: () =>
      run(async () => {
        const r = await rows(client.from('app_settings').select('key, value'))
        if (!r.ok) return r
        const get = (k: SettingKey) => str(r.data.find((x) => x.key === k)?.value)
        const out: PaymentSettings = { upiId: get('upi_id'), payeeName: get('payee_name'), instructions: get('payment_instructions') }
        return ok(out)
      }),

    listMyRequests: () =>
      run(async () => {
        const id = await myId()
        if (!id) return fail('not_signed_in')
        const r = await rows(client.from('consultation_requests').select(REQUEST_WITH_PAYMENTS).eq('customer_id', id).order('created_at', { ascending: false }))
        return r.ok ? ok(r.data.map(toRequest)) : r
      }),

    getMyRequest: (requestId) =>
      run(async () => {
        const id = await myId()
        if (!id) return fail('not_signed_in')
        const r = await one(client.from('consultation_requests').select(REQUEST_WITH_PAYMENTS).eq('id', requestId).eq('customer_id', id).maybeSingle())
        return r.ok ? ok(r.data ? toRequest(r.data) : null) : r
      }),

    createRequest: (input: NewRequestInput) =>
      run(async () => {
        const r = await one(
          client
            .from('consultation_requests')
            .insert({
              service_slug: input.serviceSlug,
              mode: input.mode,
              concern: input.concern.trim(),
              date_of_birth: input.dateOfBirth || null,
              preferred_language: input.preferredLanguage.trim() || null,
              consent_version: input.consentVersion,
            })
            .select('id')
            .single(),
        )
        if (!r.ok) return r
        return r.data ? ok({ id: str(r.data.id) }) : fail('unknown')
      }),

    cancelMyRequest: (id) => rpc('cancel_my_request', { p_request_id: id }),

    submitPaymentReference: (i: PaymentClaimInput) =>
      rpc('submit_payment_reference', {
        p_request_id: i.requestId,
        p_upi_reference: i.upiReference.trim(),
        p_payer_name: i.payerName.trim(),
        p_paid_on: i.paidOn,
      }),

    getMyStaffRole: () =>
      run(async () => {
        const id = await myId()
        if (!id) return fail('not_signed_in')
        const r = await one(client.from('staff_members').select('role, active, expert_id').eq('user_id', id).maybeSingle())
        if (!r.ok) return r
        if (!r.data) return ok(null)
        const role: StaffRoleInfo = { role: r.data.role === 'admin' ? 'admin' : 'staff', active: r.data.active === true, expertId: strOrNull(r.data.expert_id) }
        return ok(role)
      }),

    listRequests: (filter: RequestFilter = {}) =>
      run(async () => {
        let q = client.from('consultation_requests').select(REQUEST_WITH_PAYMENTS).order('created_at', { ascending: false }).limit(500)
        if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status)
        const r = await rows(q)
        if (!r.ok) return r
        let list = r.data.map(toRequest)
        const s = (filter.search ?? '').trim().toLowerCase()
        if (s) list = list.filter((x) => x.customerName.toLowerCase().includes(s) || x.serviceSlug.includes(s) || x.id.toLowerCase().startsWith(s))
        return ok(list)
      }),

    getRequest: (id) =>
      run(async () => {
        const r = await one(client.from('consultation_requests').select(REQUEST_WITH_PAYMENTS).eq('id', id).maybeSingle())
        return r.ok ? ok(r.data ? toRequest(r.data) : null) : r
      }),

    getCustomerProfile: (customerId) => run(() => profileById(customerId)),

    listNotes: (requestId) =>
      run(async () => {
        const r = await rows(client.from('request_notes').select('id, request_id, body, kind, created_at').eq('request_id', requestId).order('created_at'))
        return r.ok
          ? ok(r.data.map((x): NoteInfo => ({ id: str(x.id), requestId: str(x.request_id), body: str(x.body), kind: str(x.kind) as NoteKind, createdAt: str(x.created_at) })))
          : r
      }),

    addNote: (requestId, body) =>
      run(async () => {
        const { error } = await client.from('request_notes').insert({ request_id: requestId, body: body.trim() })
        return error ? fail(mapDataError(error)) : ok(undefined)
      }),

    updateRequest: (id, patch: RequestPatch) =>
      run(async () => {
        const update: Row = {}
        if (patch.status !== undefined) update.status = patch.status
        if (patch.assignedExpertId !== undefined) update.assigned_expert_id = patch.assignedExpertId
        if (patch.scheduledAt !== undefined) update.scheduled_at = patch.scheduledAt
        if (patch.meetingLink !== undefined) update.meeting_link = patch.meetingLink
        if (Object.keys(update).length === 0) return ok(undefined)
        return changed(client.from('consultation_requests').update(update).eq('id', id).select('id'))
      }),

    verifyPayment: (paymentId, decision, received, note) =>
      rpc('verify_payment', { p_payment_id: paymentId, p_decision: decision, p_received_amount_minor: received, p_note: note.trim() || null }),

    refundPayment: (paymentId, note) => rpc('refund_payment', { p_payment_id: paymentId, p_note: note.trim() || null }),

    listAllServices: () =>
      run(async () => {
        const r = await rows(client.from('services').select(SERVICE_COLUMNS).order('display_order'))
        return r.ok ? ok(r.data.map(toService)) : r
      }),

    updateService: (slug, p) =>
      run(() => changed(client.from('services').update({ name: p.name.trim(), active: p.active, display_order: p.displayOrder }).eq('slug', slug).select('slug'))),

    setPrice: (serviceSlug, mode, amountMinor) =>
      run(() => changed(client.from('service_prices').update({ amount_minor: amountMinor }).eq('service_slug', serviceSlug).eq('mode', mode).select('service_slug'))),

    listAllExperts: () =>
      run(async () => {
        const r = await rows(client.from('experts').select(EXPERT_COLUMNS).order('display_name'))
        return r.ok ? ok(r.data.map(toExpert)) : r
      }),

    saveExpert: (input: ExpertInput) =>
      run(async () => {
        const fields = {
          display_name: input.displayName.trim(),
          bio: input.bio.trim() || null,
          languages: input.languages,
          modes: input.modes,
          availability_note: input.availabilityNote.trim() || null,
          active: input.active,
        }
        let id = input.id
        if (id) {
          const done = await changed(client.from('experts').update(fields).eq('id', id).select('id'))
          if (!done.ok) return done
        } else {
          const created = await one(client.from('experts').insert(fields).select('id').single())
          if (!created.ok) return created
          id = created.data ? str(created.data.id) : undefined
          if (!id) return fail('unknown')
        }
        // Make the expert's service list match: remove the ones no longer wanted, add the new ones.
        const current = await rows(client.from('expert_services').select('service_slug').eq('expert_id', id))
        if (!current.ok) return current
        const have = new Set(current.data.map((x) => str(x.service_slug)))
        const want = new Set(input.serviceSlugs)
        const remove = [...have].filter((s) => !want.has(s))
        const add = [...want].filter((s) => !have.has(s))
        if (remove.length > 0) {
          const { error } = await client.from('expert_services').delete().eq('expert_id', id).in('service_slug', remove)
          if (error) return fail(mapDataError(error))
        }
        if (add.length > 0) {
          const { error } = await client.from('expert_services').insert(add.map((s) => ({ expert_id: id, service_slug: s })))
          if (error) return fail(mapDataError(error))
        }
        return ok({ id })
      }),

    saveSetting: (key, value) =>
      run(async () => {
        const v = value.trim()
        // update first (only "value" may be updated), insert when the setting does not exist yet
        const { data, error } = await client.from('app_settings').update({ value: v }).eq('key', key).select('key')
        if (error) return fail(mapDataError(error))
        if (Array.isArray(data) && data.length > 0) return ok(undefined)
        const inserted = await client.from('app_settings').insert({ key, value: v })
        return inserted.error ? fail(mapDataError(inserted.error)) : ok(undefined)
      }),

    listAudit: (limit = 100) =>
      run(async () => {
        const r = await rows(client.from('audit_log').select('id, at, actor_kind, action, entity, entity_id').order('id', { ascending: false }).limit(Math.min(limit, 500)))
        return r.ok
          ? ok(
              r.data.map((x): AuditInfo => ({
                id: String(x.id),
                at: str(x.at),
                actorKind: str(x.actor_kind) as AuditInfo['actorKind'],
                action: str(x.action),
                entity: str(x.entity),
                entityId: str(x.entity_id),
              })),
            )
          : r
      }),
  }

  async function profileById(id: string): Promise<DataResult<ProfileInfo | null>> {
    const r = await one(client.from('profiles').select('id, email, full_name, phone, date_of_birth, preferred_language').eq('id', id).maybeSingle())
    if (!r.ok) return r
    if (!r.data) return ok(null)
    return ok({
      id: str(r.data.id),
      email: str(r.data.email),
      fullName: str(r.data.full_name),
      phone: str(r.data.phone),
      dateOfBirth: str(r.data.date_of_birth),
      preferredLanguage: str(r.data.preferred_language),
    })
  }
}
