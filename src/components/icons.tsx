import {
  Hash, Hand, Gem, Palette, type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { Service } from '../types/domain'

export const serviceIcons: Record<Service['icon'], ComponentType<LucideProps>> = {
  numerology: Hash,
  palmistry: Hand,
  gemstone: Gem,
  color: Palette,
}

export function ServiceIcon({ icon, size = 24 }: { icon: Service['icon']; size?: number }) {
  const Icon = serviceIcons[icon]
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />
}
