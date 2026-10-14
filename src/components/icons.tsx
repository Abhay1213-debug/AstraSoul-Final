import {
  Hash, Hand, Gem, Palette, MessageCircle, Phone, Video, type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { ConsultationMode, Service } from '../types/domain'

export const serviceIcons: Record<Service['icon'], ComponentType<LucideProps>> = {
  numerology: Hash,
  palmistry: Hand,
  gemstone: Gem,
  color: Palette,
}

export const modeIcons: Record<ConsultationMode['icon'], ComponentType<LucideProps>> = {
  chat: MessageCircle,
  voice: Phone,
  video: Video,
}

export function ServiceIcon({ icon, size = 24 }: { icon: Service['icon']; size?: number }) {
  const Icon = serviceIcons[icon]
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />
}

export function ModeIcon({ icon, size = 24 }: { icon: ConsultationMode['icon']; size?: number }) {
  const Icon = modeIcons[icon]
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />
}
