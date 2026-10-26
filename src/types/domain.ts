/**
 * Domain model shared by the UI now and the backend in later phases.
 * Nothing here is persisted yet (Phase 1 has no backend) — these are the contracts
 * the Phase 2+ database schema and API should implement.
 *
 * Design rule from the brief: payment status is SEPARATE from booking status.
 */

export type ServiceSlug = 'numerology' | 'palmistry' | 'gemstone-guidance' | 'color-therapy'
export type ConsultationModeId = 'chat' | 'voice' | 'video'

export type DobRequirement = 'required' | 'optional' | 'none'

export interface Service {
  slug: ServiceSlug
  name: string
  icon: 'numerology' | 'palmistry' | 'gemstone' | 'color'
  tagline: string
  summary: string
  whatItIs: string
  whoItSuits: string[]
  whatYouNeed: string[]
  whatTheExpertDoes: string[]
  whatItIsNot: string
  dob: DobRequirement
  /** Palm photographs are needed, but cannot be collected until secure storage exists (Phase 3/5). */
  needsPalmPhotos: boolean
}

export interface ConsultationMode {
  id: ConsultationModeId
  name: string
  icon: 'chat' | 'voice' | 'video'
  summary: string
  howItWorks: string
  note: string
}

// ---- Customers ----------------------------------------------------------------------------

export interface CustomerProfile {
  id: string
  fullName: string
  email: string
  phone?: string
  dateOfBirth?: string // ISO yyyy-mm-dd
  preferredLanguage?: string
  createdAt: string
}

// ---- Experts ------------------------------------------------------------------------------

export interface Expert {
  id: string
  displayName: string
  services: ServiceSlug[]
  bio: string
  languages: string[] // empty = not yet known
  modes: ConsultationModeId[]
  availability: string
}

// ---- Bookings & payments (kept separate on purpose) ---------------------------------------

export type BookingStatus =
  | 'draft' // being filled in; not sent
  | 'submitted' // request received
  | 'awaiting_confirmation' // team reviewing / assigning expert / scheduling
  | 'confirmed' // expert and time confirmed
  | 'completed'
  | 'cancelled'
  | 'refunded'

export type PaymentStatus = 'not_required_yet' | 'pending' | 'succeeded' | 'failed' | 'refunded'

export interface Booking {
  id: string
  customerId: string
  service: ServiceSlug
  mode: ConsultationModeId
  expertId?: string
  concern: string
  status: BookingStatus
  scheduledAt?: string
  meetingLink?: string // manually supplied Google Meet link
  createdAt: string
  updatedAt: string
}

export interface Payment {
  id: string
  bookingId: string
  status: PaymentStatus
  amountMinor: number
  currency: 'INR'
  /** Gateway not chosen. Provider + external reference recorded only once verified server-side. */
  provider?: string
  providerReference?: string
  verifiedBy?: 'webhook' | 'admin_manual'
  verifiedAt?: string
}

export interface AuditLogEntry {
  id: string
  actorId: string
  action: string
  entity: 'booking' | 'payment' | 'report'
  entityId: string
  at: string
  note?: string
}

// ---- Reports ------------------------------------------------------------------------------

export type ReportStatus = 'pending' | 'ready' | 'delivered'

export interface Report {
  id: string
  bookingId: string
  customerId: string
  status: ReportStatus
  /** Private storage path; never a public URL. Downloads are authorized per customer. */
  storagePath?: string
  deliveredAt?: string
}

// ---- Consultation request draft (Phase 1: client-side only) -------------------------------

export interface ConsultationRequestDraft {
  service: ServiceSlug | ''
  mode: ConsultationModeId | ''
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  preferredLanguage: string
  concern: string
  consent: boolean
}
