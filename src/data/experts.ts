import type { Expert } from '../types/domain'

/**
 * DEMONSTRATION PROFILES ONLY.
 * No genuine expert information has been supplied. These entries exist to show the
 * structure of the directory (name, services, bio, languages, modes, availability).
 * They deliberately contain NO qualifications, years of experience, ratings or reviews.
 * Replace this file (or load from the database in Phase 3) with real profiles.
 */
export const experts: Expert[] = [
  {
    id: 'demo-expert-1',
    displayName: 'Demonstration Profile A',
    services: ['numerology', 'gemstone-guidance'],
    bio: 'Placeholder biography. A real expert’s own short introduction will appear here.',
    languages: [],
    modes: ['chat', 'voice', 'video'],
    availability: 'Placeholder. Real availability or booking instructions will appear here.',
    isDemonstration: true,
  },
  {
    id: 'demo-expert-2',
    displayName: 'Demonstration Profile B',
    services: ['palmistry'],
    bio: 'Placeholder biography. A real expert’s own short introduction will appear here.',
    languages: [],
    modes: ['voice', 'video'],
    availability: 'Placeholder. Real availability or booking instructions will appear here.',
    isDemonstration: true,
  },
  {
    id: 'demo-expert-3',
    displayName: 'Demonstration Profile C',
    services: ['color-therapy', 'numerology'],
    bio: 'Placeholder biography. A real expert’s own short introduction will appear here.',
    languages: [],
    modes: ['chat', 'video'],
    availability: 'Placeholder. Real availability or booking instructions will appear here.',
    isDemonstration: true,
  },
]
