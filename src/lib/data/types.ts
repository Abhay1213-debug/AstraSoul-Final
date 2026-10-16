/**
 * The ONLY shape the screens know about the database. Pages talk to a `DataService`; they never touch Supabase directly.
 * The real backend lives in one adapter (supabaseData.ts). The database (Row Level Security + triggers + functions) decides who may
 * do what; nothing in the browser is a security boundary - these types and screens only decide what to SHOW.
 */

export type Mode = 'chat' | 'voice' | 'video'
export type RequestStatus = 'submitted' | 'awaiting_confirmation' | 'confirmed' | 'completed' | 'cancelled'
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type DobRequirement = 'required' | 'optional' | 'none'

export interface ServiceInfo {
  slug: string
  name: string
  dobRequirement: DobRequirement
  active: boolean
  displayOrder: number
}

/** `amountMinor` is in paise; null = no price has been set. */
export interface PriceInfo {
  serviceSlug: string
  mode: Mode
  amountMinor: number | null
}

export interface ExpertInfo {
  id: string
  displayName: string
  bio: string
  languages: string[]
  modes: Mode[]
  availabilityNote: string
  active: boolean
  serviceSlugs: string[]
}

export interface ProfileInfo {
  id: string
  email: string
  fullName: string
  phone: string
  dateOfBirth: string
  preferredLanguage: string
}

export interface PaymentInfo {
  id: string
  requestId: string
  status: PaymentStatus
  amountMinor: number
  upiReference: string
  payerName: string
  paidOn: string
  submittedAt: string
  receivedAmountMinor: number | null
  verifiedAt: string | null
  refundedAt: string | null
}

export interface RequestInfo {
  id: string
  customerId: string
  customerName: string
  serviceSlug: string
  mode: Mode
  concern: string
  dateOfBirth: string
  preferredLanguage: string
  status: RequestStatus
  assignedExpertId: string | null
  scheduledAt: string | null
  meetingLink: string | null
  createdAt: string
  updatedAt: string
  payments: PaymentInfo[]
}

export type NoteKind = 'general' | 'payment' | 'system'
export interface NoteInfo {
  id: string
  requestId: string
  body: string
  kind: NoteKind
  createdAt: string
}

export interface AuditInfo {
  id: string
  at: string
  actorKind: 'admin' | 'staff' | 'customer' | 'system'
  action: string
  entity: string
  entityId: string
}

export interface PaymentSettings {
  upiId: string
  payeeName: string
  instructions: string
}
export type SettingKey = 'upi_id' | 'payee_name' | 'payment_instructions'

export interface StaffRoleInfo {
  role: 'admin' | 'staff'
  active: boolean
  expertId: string | null
}

/** Short fixed reasons. Raw server messages are never passed to a screen. */
export type DataErrorCode =
  | 'not_signed_in'
  | 'forbidden'
  | 'not_found'
  | 'network'
  | 'rate_limited'
  | 'unknown'
  // consultation requests
  | 'too_many_open_requests'
  | 'too_many_requests_24h'
  | 'consent_unavailable'
  | 'date_of_birth_required'
  | 'service_unavailable'
  | 'profile_missing'
  | 'account_closed'
  | 'invalid_input'
  | 'cannot_cancel'
  | 'payment_received'
  | 'invalid_status_transition'
  | 'request_is_closed'
  | 'expert_and_schedule_required'
  | 'schedule_in_past'
  | 'expert_unavailable'
  | 'expert_service_mismatch'
  | 'expert_mode_mismatch'
  // payments
  | 'invalid_reference'
  | 'invalid_payer_name'
  | 'invalid_payment_date'
  | 'invalid_payment_details'
  | 'request_not_payable'
  | 'price_not_set'
  | 'already_paid'
  | 'claim_already_pending'
  | 'too_many_payment_attempts'
  | 'reference_unavailable'
  | 'self_verification_forbidden'
  | 'amount_mismatch'
  | 'payment_not_pending'
  | 'payment_not_refundable'

export type DataResult<T = void> = { ok: true; data: T } | { ok: false; code: DataErrorCode }

export interface NewRequestInput {
  serviceSlug: string
  mode: Mode
  concern: string
  dateOfBirth: string // '' = none
  preferredLanguage: string // '' = none
  consentVersion: string
}

export interface PaymentClaimInput {
  requestId: string
  upiReference: string
  payerName: string
  paidOn: string // yyyy-mm-dd
}

export interface RequestFilter {
  status?: RequestStatus | 'all'
  search?: string
}

export interface RequestPatch {
  status?: RequestStatus
  assignedExpertId?: string | null
  scheduledAt?: string | null
  meetingLink?: string | null
}

export interface ExpertInput {
  id?: string
  displayName: string
  bio: string
  languages: string[]
  modes: Mode[]
  availabilityNote: string
  active: boolean
  serviceSlugs: string[]
}

export interface DataService {
  // ---- reference data (readable by everyone the database allows) ----
  listServices(): Promise<DataResult<ServiceInfo[]>>
  listPrices(): Promise<DataResult<PriceInfo[]>>
  listExperts(): Promise<DataResult<ExpertInfo[]>>
  /** The newest ACTIVE consent version, or null when none has been approved (then requests cannot be submitted). */
  getActiveConsentVersion(): Promise<DataResult<string | null>>

  // ---- the signed-in customer ----
  getMyProfile(): Promise<DataResult<ProfileInfo | null>>
  updateMyProfile(p: { fullName: string; phone: string; dateOfBirth: string; preferredLanguage: string }): Promise<DataResult>
  getPaymentSettings(): Promise<DataResult<PaymentSettings>>
  listMyRequests(): Promise<DataResult<RequestInfo[]>>
  getMyRequest(id: string): Promise<DataResult<RequestInfo | null>>
  createRequest(input: NewRequestInput): Promise<DataResult<{ id: string }>>
  cancelMyRequest(id: string): Promise<DataResult>
  submitPaymentReference(input: PaymentClaimInput): Promise<DataResult>

  // ---- staff / administrators (the database refuses anyone else, and administrators without a verified authenticator) ----
  getMyStaffRole(): Promise<DataResult<StaffRoleInfo | null>>
  listRequests(filter?: RequestFilter): Promise<DataResult<RequestInfo[]>>
  getRequest(id: string): Promise<DataResult<RequestInfo | null>>
  getCustomerProfile(customerId: string): Promise<DataResult<ProfileInfo | null>>
  listNotes(requestId: string): Promise<DataResult<NoteInfo[]>>
  addNote(requestId: string, body: string): Promise<DataResult>
  updateRequest(id: string, patch: RequestPatch): Promise<DataResult>
  verifyPayment(paymentId: string, decision: 'succeeded' | 'failed', receivedAmountMinor: number | null, note: string): Promise<DataResult>
  refundPayment(paymentId: string, note: string): Promise<DataResult>

  // ---- administrators only ----
  listAllServices(): Promise<DataResult<ServiceInfo[]>>
  updateService(slug: string, patch: { name: string; active: boolean; displayOrder: number }): Promise<DataResult>
  setPrice(serviceSlug: string, mode: Mode, amountMinor: number | null): Promise<DataResult>
  listAllExperts(): Promise<DataResult<ExpertInfo[]>>
  saveExpert(input: ExpertInput): Promise<DataResult<{ id: string }>>
  saveSetting(key: SettingKey, value: string): Promise<DataResult>
  listAudit(limit?: number): Promise<DataResult<AuditInfo[]>>
}
