import type { BookingStatus, ConsultationMode, ConsultationModeId, PaymentStatus } from '../types/domain'

export const consultationModes: ConsultationMode[] = [
  {
    id: 'chat',
    name: 'Chat consultation',
    icon: 'chat',
    summary: 'Write to your expert at your own pace.',
    howItWorks:
      'Comfortable if you prefer to think before you reply. You exchange written messages with your expert.',
    pilotNote:
      'There is no live chat system yet. During the pilot the team will arrange the written conversation with you after confirming your request.',
  },
  {
    id: 'voice',
    name: 'Voice consultation',
    icon: 'voice',
    summary: 'Speak directly with your expert.',
    howItWorks: 'A voice call with your expert at a time agreed with you.',
    pilotNote:
      'During the pilot, voice calls are coordinated manually (for example via Google Meet). A time is agreed with you after your request is reviewed; instant connection is not offered.',
  },
  {
    id: 'video',
    name: 'Video consultation',
    icon: 'video',
    summary: 'Meet face to face with your expert.',
    howItWorks: 'A video call with your expert at a time agreed with you.',
    pilotNote:
      'During the pilot, video calls are coordinated manually (for example via Google Meet). A time is agreed with you after your request is reviewed; availability is not guaranteed.',
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
