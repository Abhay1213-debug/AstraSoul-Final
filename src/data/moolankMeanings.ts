import type { MoolankNumber } from '../lib/moolank'

/**
 * What each Moolank stands for in Indian numerology: six keywords and three short points, written in our own words
 * from the qualities most numerology sources agree on. No planets or remedies (the site does not use astrology).
 */
export interface MoolankMeaning {
  keywords: [string, string, string, string, string, string]
  points: [string, string, string]
}

export const moolankMeanings: Record<MoolankNumber, MoolankMeaning> = {
  1: {
    keywords: ['Leadership', 'Independence', 'Confidence', 'Ambition', 'Originality', 'Willpower'],
    points: [
      'You like to lead and to decide for yourself, and people often look to you when a group needs direction.',
      'New beginnings suit you. You are at your best when you start something of your own and see it through.',
      'Your drive is your strength. Patience, and listening before you decide, help it land well with others.',
    ],
  },
  2: {
    keywords: ['Sensitivity', 'Intuition', 'Cooperation', 'Empathy', 'Imagination', 'Diplomacy'],
    points: [
      'You read moods quickly and sense what people need, often before they say it.',
      'You do your best work in partnership, as the one who keeps the peace and brings people together.',
      'Your feelings run deep. Calm surroundings and people you trust help you stay steady.',
    ],
  },
  3: {
    keywords: ['Creativity', 'Optimism', 'Wisdom', 'Self-expression', 'Learning', 'Generosity'],
    points: [
      'You love to learn and to share what you know, and people often come to you for advice.',
      'Words, ideas and creative work come naturally to you, and your optimism lifts the people around you.',
      'You grow through knowledge. Focusing on a few goals at a time turns your many ideas into results.',
    ],
  },
  4: {
    keywords: ['Practicality', 'Discipline', 'Hard work', 'Fresh thinking', 'Determination', 'Loyalty'],
    points: [
      'You see things from an angle others miss, and you are not afraid to question the usual way of doing things.',
      'You are a builder: steady, hardworking and reliable once you commit to something.',
      'Change rarely keeps you down for long. You adapt, rethink and build again, often stronger than before.',
    ],
  },
  5: {
    keywords: ['Adaptability', 'Curiosity', 'Communication', 'Quick thinking', 'Freedom', 'Versatility'],
    points: [
      'You think fast, talk easily and get along with all kinds of people.',
      'Variety keeps you alive: travel, new people and new ideas. Too much routine can feel like a cage.',
      'Business and communication come naturally to you. Finishing what you start makes your talents count.',
    ],
  },
  6: {
    keywords: ['Harmony', 'Love', 'Beauty', 'Responsibility', 'Charm', 'Comfort'],
    points: [
      'Home, family and close relationships sit at the centre of your life, and you look after the people you love.',
      'You have an eye for beauty, whether in art, style, design or the space around you.',
      'You bring peace wherever you go. Saying no now and then keeps you from carrying everyone else’s load.',
    ],
  },
  7: {
    keywords: ['Introspection', 'Intuition', 'Analysis', 'Research', 'Spirituality', 'Depth'],
    points: [
      'You think deeply and want to know the why behind things, not just the what.',
      'You need quiet time to recharge, and your best ideas often arrive in silence.',
      'Your intuition is strong. Sharing your thoughts with people you trust keeps you from feeling distant.',
    ],
  },
  8: {
    keywords: ['Perseverance', 'Discipline', 'Responsibility', 'Patience', 'Justice', 'Ambition'],
    points: [
      'You work hard, stay patient and build slowly but solidly, so what you build tends to last.',
      'You take responsibility seriously and have a strong sense of what is fair.',
      'People may find you serious at first. Those who know you well find you deeply loyal.',
    ],
  },
  9: {
    keywords: ['Courage', 'Energy', 'Compassion', 'Determination', 'Passion', 'Idealism'],
    points: [
      'You are brave and full of energy, and you rarely back down from a challenge.',
      'You care strongly about others and stand up for the people and causes you believe in.',
      'Your passion is your power. Pausing before you react helps it work for you, not against you.',
    ],
  },
}

/** The birth days that give each Moolank, e.g. 1 → [1, 10, 19, 28]. */
export const birthDaysFor = (n: MoolankNumber): number[] => Array.from({ length: 31 }, (_, i) => i + 1).filter((d) => ((d - 1) % 9) + 1 === n)
