import type { Service, ServiceSlug } from '../types/domain'

export const services: Service[] = [
  {
    slug: 'numerology',
    name: 'Numerology',
    icon: 'numerology',
    tagline: 'Personal insight through the numbers of your birth date and name.',
    summary: 'Explore the numbers connected to your date of birth and what they traditionally suggest.',
    whatItIs:
      'Numerology is a traditional system that assigns meaning to numbers derived from your date of birth and name. In a consultation, an expert walks you through the numbers relevant to your question and what they are traditionally taken to indicate.',
    whoItSuits: [
      'You want a structured way to reflect on your personality and tendencies',
      'You are weighing a decision and would like another perspective',
      'You are curious about your Moolank and what sits behind it',
    ],
    whatYouNeed: ['Your full name', 'Your date of birth', 'A short description of what you would like guidance on'],
    whatTheExpertDoes: [
      'Works out the relevant numbers from your details',
      'Explains what they traditionally indicate in the context of your question',
      'Gives you personalised guidance and suggestions for reflection',
    ],
    whatItIsNot:
      'Numerology is offered for reflection and exploration. It does not predict specific outcomes and is not a substitute for medical, legal or financial advice.',
    dob: 'required',
    needsPalmPhotos: false,
  },
  {
    slug: 'palmistry',
    name: 'Palmistry',
    icon: 'palmistry',
    tagline: 'A personal interpretation based on the lines and features of your palms.',
    summary: 'A human expert interprets your palm photographs and discusses what they traditionally signify.',
    whatItIs:
      'Palmistry interprets the lines, mounts and shape of the hands. Every palmistry conclusion on this platform is made by a human expert — never by software.',
    whoItSuits: [
      'You prefer a reading grounded in your own hands rather than a birth date',
      'You would like to talk through themes such as direction, strengths and patterns',
    ],
    whatYouNeed: [
      'Your full name and a short description of your question',
      'Clear photographs of both palms. Online photo upload is not available yet — the team will tell you how to share them securely once your request is confirmed',
    ],
    whatTheExpertDoes: [
      'Studies your palm photographs',
      'Shares their interpretation and answers your questions',
      'Explains their conclusions and what they mean for you',
    ],
    whatItIsNot:
      'A palm reading is an interpretive tradition, not a diagnosis or a forecast. It does not promise specific outcomes.',
    dob: 'optional',
    needsPalmPhotos: true,
  },
  {
    slug: 'gemstone-guidance',
    name: 'Gemstone Guidance',
    icon: 'gemstone',
    tagline: 'Understand which stones are traditionally associated with you, and why.',
    summary: 'A human expert explains which gemstones are traditionally associated with your details.',
    whatItIs:
      'Gemstone guidance draws on traditional associations between stones and personal details. Any gemstone recommendation is made by a human expert after discussing your situation with you — not generated automatically.',
    whoItSuits: [
      'You have heard about gemstones and want to understand them before buying anything',
      'You want an expert opinion explained clearly, with reasons',
    ],
    whatYouNeed: ['Your full name', 'Your date of birth', 'What you would like guidance on'],
    whatTheExpertDoes: [
      'Reviews your details and your question',
      'Explains which stones are traditionally associated with you and the reasoning',
      'May ask for additional birth details if their method requires it',
    ],
    whatItIsNot:
      'Gemstones are not a medical treatment and no outcome is guaranteed. We do not sell gemstones through this website.',
    dob: 'required',
    needsPalmPhotos: false,
  },
  {
    slug: 'color-therapy',
    name: 'Color Therapy',
    icon: 'color',
    tagline: 'Personal guidance around colours and what they traditionally signify.',
    summary: 'Explore how colours are traditionally associated with mood and everyday choices.',
    whatItIs:
      'Colour therapy in this context is a reflective practice: an expert discusses colours traditionally associated with different qualities and helps you think about their place in your surroundings, clothing and routine.',
    whoItSuits: [
      'You want a gentle, practical form of guidance for everyday life',
      'You would like help choosing colours for your space or wardrobe with intention',
    ],
    whatYouNeed: [
      'Your full name',
      'A short description of what you would like to explore',
      'Your date of birth, if you would like it taken into account (optional)',
    ],
    whatTheExpertDoes: [
      'Talks through your situation and preferences',
      'Suggests colours and practical ways to work with them',
      'Sums up their suggestions so you know what to try next',
    ],
    whatItIsNot:
      'Colour therapy here is a wellbeing-oriented practice, not a medical or psychological treatment.',
    dob: 'optional',
    needsPalmPhotos: false,
  },
]

export const serviceBySlug = (slug: string): Service | undefined => services.find((s) => s.slug === slug)

export const isServiceSlug = (value: string): value is ServiceSlug => services.some((s) => s.slug === value)
