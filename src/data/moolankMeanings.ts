import type { MoolankNumber } from '../lib/moolank'

/**
 * Traditional numerology themes associated with each Moolank. These are general, reflective
 * ideas offered for self-reflection — not predictions, and not personalised advice.
 * (Other numerology traditions describe the numbers differently.)
 */
export interface MoolankMeaning {
  themes: [string, string, string]
}

export const moolankMeanings: Record<MoolankNumber, MoolankMeaning> = {
  1: { themes: ['Leadership', 'Independence', 'Confidence'] },
  2: { themes: ['Sensitivity', 'Cooperation', 'Intuition'] },
  3: { themes: ['Creativity', 'Optimism', 'Self-expression'] },
  4: { themes: ['Practicality', 'Discipline', 'Unconventional thinking'] },
  5: { themes: ['Adaptability', 'Curiosity', 'Communication'] },
  6: { themes: ['Harmony', 'Care for others', 'Appreciation of beauty'] },
  7: { themes: ['Introspection', 'Analysis', 'Search for depth'] },
  8: { themes: ['Perseverance', 'Responsibility', 'Resilience'] },
  9: { themes: ['Energy', 'Courage', 'Compassion'] },
}
