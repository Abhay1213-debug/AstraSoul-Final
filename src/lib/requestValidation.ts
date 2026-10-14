import type { ConsultationRequestDraft, Service } from '../types/domain'
import { parseIsoDate } from './moolank'

export type RequestErrors = Partial<Record<keyof ConsultationRequestDraft, string>>

export const emptyDraft: ConsultationRequestDraft = {
  service: '',
  mode: '',
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  preferredLanguage: '',
  concern: '',
  consent: false,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,17}[0-9]$/

export const CONCERN_MIN = 10
export const CONCERN_MAX = 1000

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** Step 1: service chosen. */
export function validateServiceStep(draft: ConsultationRequestDraft): RequestErrors {
  return draft.service ? {} : { service: 'Please choose a service.' }
}

/** Step 2: personal details and concern. Needs the chosen service for the DOB rule. */
export function validateDetailsStep(draft: ConsultationRequestDraft, service: Service, today = new Date()): RequestErrors {
  const errors: RequestErrors = {}
  const name = draft.fullName.trim()
  if (name.length < 2) errors.fullName = 'Please enter your full name.'
  else if (name.length > 80) errors.fullName = 'Name is too long (80 characters maximum).'

  if (!draft.email.trim()) errors.email = 'Please enter your email address.'
  else if (!isValidEmail(draft.email)) errors.email = 'That email address does not look right.'

  if (draft.phone.trim() && !PHONE_RE.test(draft.phone.trim())) {
    errors.phone = 'Enter a valid phone number, or leave this blank.'
  }

  if (service.dob === 'required' || (service.dob === 'optional' && draft.dateOfBirth)) {
    const parsed = parseIsoDate(draft.dateOfBirth, today)
    if (!parsed.ok) errors.dateOfBirth = parsed.error
  }

  const concern = draft.concern.trim()
  if (concern.length < CONCERN_MIN) errors.concern = `Please describe what you would like guidance on (at least ${CONCERN_MIN} characters).`
  else if (concern.length > CONCERN_MAX) errors.concern = `Please keep this under ${CONCERN_MAX} characters.`

  if (draft.preferredLanguage.length > 40) errors.preferredLanguage = 'Language is too long.'
  return errors
}

/** Step 3: mode chosen. */
export function validateModeStep(draft: ConsultationRequestDraft): RequestErrors {
  return draft.mode ? {} : { mode: 'Please choose how you would like to consult.' }
}

/** Step 4: consent to review before use. */
export function validateReviewStep(draft: ConsultationRequestDraft): RequestErrors {
  return draft.consent ? {} : { consent: 'Please confirm you understand how your details will be used.' }
}

export const hasErrors = (e: RequestErrors): boolean => Object.keys(e).length > 0
