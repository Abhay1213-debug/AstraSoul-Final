# Implementation status

Legend — **Live**: works for real today · **Manual**: process is handled by people, not software · **Demo**: clearly labelled placeholder · **Planned**: not built.
Last updated: Phase 1 + visual redesign.

## Phase 1 — what exists

| Area | Status | Details |
| --- | --- | --- |
| Public site (Home, About, Services, 4 service pages, How it works, Experts, Consultation, Contact, legal pages) | **Live** | Responsive; horizontal overflow measured on every route at 320 px, and on key routes at 768, 1100 and 1440 px (none found); layouts also viewed at 375 and 1280 px. No broken internal links (enforced by a test). |
| Moolank calculator (`/free-insight`, also on Home) | **Live** | Deterministic: reduce the *day of birth* to 1–9 (11 → 2, 22 → 4; no master numbers). Day/month/year controls feed the same validated logic (leap years, impossible dates like 31 April, no future dates, year ≥ 1900). Working is shown to the user. Runs in the browser; nothing stored or sent. Instant, so there is deliberately no fake loading state. Shows traditional numerology themes only. |
| Consultation request flow (`/consultation/request`) | **Live, but does not submit** | 4-step validated form (service → details → mode → review). There is no backend, so it ends with a *prepared summary* the customer sends themselves via **Open in email app** (needs `VITE_CONTACT_EMAIL`) or **Copy summary**. It states plainly that nothing was submitted, booked or paid. Data is held in memory only (not even localStorage). |
| Contact form | **Live (mailto)** | Opens the user's email app. Hidden behind an honest "not set up" notice until `VITE_CONTACT_EMAIL` is set. |
| Chat / voice / video selection | **Live as a preference** | Customer states a preference. Voice/video are expected to be coordinated manually (e.g. Google Meet); chat has no system yet. Pages say "no instant connection". |
| Expert directory (`/experts`) | **Demo** | Three placeholder profiles, each badged as a demonstration. No qualifications, experience, ratings or reviews invented. Filter by service works. |
| Pricing | **Placeholder** | Every price is unset → "Price to be confirmed". Edit `src/config/pricing.ts`. |
| Legal pages | **Template** | Marked "not legal advice – needs professional review"; bracketed placeholders highlight what the business must supply. |
| Login / Sign up / Dashboard | **Planned** | Pages exist so nothing in the navigation is broken, but state plainly that accounts are not available. They contain **no** credential form, because nothing could be saved or secured. |
| Data model | **Defined** | `src/types/domain.ts`: customers, experts, bookings, payments (status kept separate from booking status), audit log, reports. Not persisted anywhere yet. |

## Scope change: astrology removed

The business offers four services only (numerology, palmistry, gemstone guidance, color therapy) and has **no astrology service**. At the owner's explicit instruction, all astrology material was removed: the Weekly Horoscope page and its provider interface (`src/lib/horoscope.ts`), the footer link, the How-it-works row, the horoscope feature flag, and the planet names (Sun, Moon, Rahu, Ketu…) that were shown beside the Moolank. `/weekly-horoscope` now redirects to `/free-insight` so old links don't break. A test fails if any page mentions horoscope, zodiac, astrology, Kundli or planets.
**Note:** `PROJECT_BRIEF.md` still lists a weekly horoscope as an approved secondary feature. It has not been edited; it should be updated to match this decision.

## Visual redesign

Direction is set by the supplied hero photograph (woman in profile, golden cinematic light, deep chocolate brown). It is used as-is — not approximated with illustration:

- **Home hero**: split layout. Headline and calls to action on the left; the photograph large on the right, feathered into a background whose colours were sampled from the image's own edges. Tablet and mobile: photograph first, directly under the transparent header, text below. The original file is `public/images/hero-reference.webp` (unmodified; guarded by a test). The hero shows it cropped only on its left edge (removing four faint decorative words that would collide with the headline); face, halo, moon and the tagline are intact.
- **Reuse**: a face crop in the closing "Ready to ask your question?" section; the complete, uncropped image on the About page.
- **Palette/type/shape**: espresso and cocoa tuned to the photo, a muted-bronze band under the hero, plum undertones; Fraunces + Manrope; small radii and fine rules instead of large rounded cards; dark/light sections ordered deliberately (hero, approach, Moolank, consultation options and footer are dark).
- **Services**: unchanged distinct per-service illustrations and colour themes, now with restrained 10px corners.
- Earlier passes (still in place): interactive concern explorer, day/month/year Moolank input with a polished result, process narratives, themed service pages, request-page aside, restructured footer.

Bugs found and fixed while testing: the mobile menu collapsed to ~96px (header `backdrop-filter`) — regression test; invisible secondary buttons on dark surfaces; contrast shortfalls; light cards on dark sections inheriting ivory text (consultation-option titles, Moolank notice). A programmatic text-contrast audit now passes on 16 pages.
Please confirm you hold the rights to publish the photograph; the site only uses the file you supplied.

## Not built (and therefore not claimed anywhere in the UI)

- Authentication, customer profiles, persistent storage → **Phase 2** (needs a backend; Supabase is the suggested option but **not chosen or created**).
- Real booking submission, expert assignment, scheduling → **Phase 3**.
- Payments → **Phase 4**. Gateway (PhonePe vs Razorpay) is undecided; no provider is referenced in code. Needs a server-side verification path / webhook handler and an admin manual-verification path with an audit trail.
- Palm photograph upload, PDF generation/storage/download → **Phase 5** (needs private storage + authorization).
- Admin area with real authorization → **Phase 6**.
- Real expert profiles, real prices, company details, final brand name, real hero imagery → **need input from the business**.

## Decisions & caveats worth knowing

- **Brand name** defaults to "AstraSoul" purely as a working name taken from the reference site; it is configurable (see README). Not finalised.
- **Reference site**: inspected (https://astrasoul.lovable.app/). Palette and fonts match it. Its hero photograph was **not** copied; the hero uses an original SVG illustration. Its claims ("1M+ Seekers", "2000+ People Guided", "Trusted Experts") were **deliberately not reproduced**, since the brief forbids unsupported numbers/credentials.
- **Moolank convention**: day-of-birth reduction (Indian numerology). The traditional themes in `src/data/moolankMeanings.ts` are general and labelled as such; other numerology traditions differ.
- **Email as a stop-gap** puts the request text (including any DOB the user entered) into a `mailto:` link the user themself sends. It is not a secure channel and is a Phase 1 stop-gap only.
- Hosting, domain and deployment: nothing deployed; no accounts or paid services created.

## Verification performed (Phase 1)

- `npm run build` (type-check + production build): passes.
- `npm test`: 119 tests pass — Moolank maths and date validation (valid/invalid/leap/future/pre-1900), request validation, summary/mailto building, calculator and request-flow UI, every route renders with one `h1`, every internal link resolves, honesty guardrails (no invented counts/credentials/"guaranteed" claims; demo profiles labelled; login has no password field).
- Manual browser checks: Moolank form (empty, valid, future, pre-1900, leap day), the full request flow including validation errors, focus management and mailto output with a contact email configured, contact form in both states, mobile menu open/close/Escape, console clean, overflow measurements at 4 widths (320/768/1100/1440), WCAG contrast computed for the palette pairs used (all ≥ 4.5:1 for text).
- **Not done**: automated cross-browser testing (only the in-app Chromium pane was used); screen-reader testing; real device testing; Lighthouse.
