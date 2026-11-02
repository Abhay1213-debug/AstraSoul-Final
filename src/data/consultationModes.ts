import type { BookingStatus, ConsultationMode, ConsultationModeId, PaymentStatus } from '../types/domain'

/**
 * Staff screens only: requests made before consultations became voice-only may still say chat or video, and these
 * names label them. The public site offers voice calls only (see src/shared/booking.ts).
 */

export const consultationModes: ConsultationMode[] = [
  {
    id: 'chat',
    name: 'Chat consultation',
    icon: 'chat',
    summary: 'Write to your expert at your own pace.',
    howItWorks: 'Written messages, for when you prefer to think before you reply.',
    note: 'At the time you book.',
  },
  {
    id: 'voice',
    name: 'Voice consultation',
    icon: 'voice',
    summary: 'Speak directly with your expert.',
    howItWorks: 'A call at the time you book.',
    note: 'Usually on Google Meet.',
  },
  {
    id: 'video',
    name: 'Video consultation',
    icon: 'video',
    summary: 'Meet face to face with your expert.',
    howItWorks: 'A video call at the time you book.',
    note: 'Usually on Google Meet.',
  },
]

export const modeById = (id: string): ConsultationMode | undefined => consultationModes.find((m) => m.id === id)
export const isModeId = (value: string): value is ConsultationModeId => consultationModes.some((m) => m.id === value)

export const bookingStatusInfo: Record<BookingStatus, { label: string; meaning: string }> = {
  draft: { label: 'Draft', meaning: 'You are still filling in the request. Nothing has been sent.' },
  submitted: { label: 'Submitted', meaning: 'Your request has been received. It has not been confirmed yet.' },
  awaiting_confirmation: {
    label: 'Awaiting confirmation',
    meaning: 'The team is reviewing your request, choosing an expert and finding a time.',
  },
  confirmed: { label: 'Confirmed', meaning: 'An expert and a time have been agreed with you.' },
  completed: { label: 'Completed', meaning: 'The consultation has taken place.' },
  cancelled: { label: 'Cancelled', meaning: 'The request or booking was cancelled.' },
  refunded: { label: 'Refunded', meaning: 'A refund has been issued for this booking.' },
}

export const paymentStatusInfo: Record<PaymentStatus, { label: string; meaning: string }> = {
  not_required_yet: { label: 'No payment yet', meaning: 'No payment is requested at this stage.' },
  pending: { label: 'Payment pending', meaning: 'Payment has been requested but not yet verified.' },
  succeeded: { label: 'Payment verified', meaning: 'The payment has been verified.' },
  failed: { label: 'Payment failed', meaning: 'The payment did not go through.' },
  refunded: { label: 'Payment refunded', meaning: 'The payment has been refunded.' },
}
