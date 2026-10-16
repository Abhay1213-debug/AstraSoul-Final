import type { DataErrorCode } from './types'

/** What a person sees for each failure. Fixed wording: nothing from the server is ever shown, and nothing reveals other people’s data. */
export const dataErrorMessage: Record<DataErrorCode, string> = {
  not_signed_in: 'Your session has ended. Please log in again.',
  forbidden: 'You don’t have permission to do that.',
  not_found: 'We couldn’t find that. It may have been removed, or it may not be yours to see.',
  network: 'We couldn’t reach the server. Please check your connection and try again.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  unknown: 'Something went wrong. Please try again.',

  too_many_open_requests: 'You already have the maximum number of open requests. Please wait for one to finish, or cancel one, before sending another.',
  too_many_requests_24h: 'You’ve sent several requests today. Please try again tomorrow.',
  consent_unavailable: 'Online requests aren’t open yet: the consent wording hasn’t been approved. Nothing was sent.',
  date_of_birth_required: 'This service needs your date of birth.',
  service_unavailable: 'That service isn’t available right now.',
  profile_missing: 'Your profile isn’t ready yet. Please log out, log in again, and retry.',
  account_closed: 'This account has been closed.',
  invalid_input: 'Some details aren’t valid. Please check them and try again.',
  cannot_cancel: 'This request can’t be cancelled any more. If you need help, please contact us.',
  payment_received: 'A payment has already been received for this request, so it can only be cancelled by our team. Please contact us.',
  invalid_status_transition: 'That status change isn’t allowed from the current status.',
  request_is_closed: 'This request is closed and can’t be changed.',
  expert_and_schedule_required: 'To confirm a consultation, choose an expert and a date and time first.',
  schedule_in_past: 'The date and time must be in the future.',
  expert_unavailable: 'That expert isn’t active.',
  expert_service_mismatch: 'That expert doesn’t offer this service.',
  expert_mode_mismatch: 'That expert doesn’t offer this consultation mode.',

  invalid_reference: 'Please check the UPI reference: it should be 8–35 letters and numbers, copied from your payment app.',
  invalid_payer_name: 'Please enter the name shown in your payment app (letters only; no long numbers).',
  invalid_payment_date: 'Please enter the date you paid (it can’t be in the future).',
  invalid_payment_details: 'Those payment details aren’t valid. Please check them.',
  request_not_payable: 'This request can’t take a payment right now.',
  price_not_set: 'The price for this consultation hasn’t been set yet, so a payment can’t be recorded. Please check back soon.',
  already_paid: 'A payment for this request has already been verified.',
  claim_already_pending: 'A payment reference for this request is already waiting to be checked.',
  too_many_payment_attempts: 'Too many payment references have been submitted for this request. Please contact us.',
  reference_unavailable: 'That reference can’t be used. Please check it, or contact us if you believe it is correct.',
  self_verification_forbidden: 'For safety, a payment can’t be verified by the person it belongs to. Another administrator must do this.',
  amount_mismatch: 'The amount you received must match the expected amount exactly to mark the payment as received.',
  payment_not_pending: 'That payment has already been decided.',
  payment_not_refundable: 'Only a verified payment can be marked as refunded.',
}

export const statusLabel: Record<string, string> = {
  submitted: 'Submitted',
  awaiting_confirmation: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const statusMeaning: Record<string, string> = {
  submitted: 'We have your request.',
  awaiting_confirmation: 'Our team is working on your request.',
  confirmed: 'Your consultation is confirmed.',
  completed: 'This consultation is complete.',
  cancelled: 'This request was cancelled.',
}

export const paymentStatusLabel: Record<string, string> = {
  pending: 'Waiting to be checked',
  succeeded: 'Payment verified',
  failed: 'Could not be verified',
  refunded: 'Refunded',
}

export const paymentStatusMeaning: Record<string, string> = {
  pending: 'We have your payment reference. Our team checks it against the bank record; this is not a confirmation yet.',
  succeeded: 'Our team has matched your payment.',
  failed: 'We could not match this reference to a payment. You can submit a corrected reference.',
  refunded: 'This payment was refunded.',
}
