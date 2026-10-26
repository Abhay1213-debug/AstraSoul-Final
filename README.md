# Personalized Spiritual Guidance Platform

Phase 1 of the roadmap in [PROJECT_BRIEF.md](PROJECT_BRIEF.md): project foundation and public website.
**Read [docs/STATUS.md](docs/STATUS.md) for exactly what is real, manual, demonstration-only, or not built yet.**

Stack: Vite · React 19 · TypeScript · React Router · plain CSS with design tokens · Vitest + Testing Library.
Visual design: see **Design system** below.
There is no backend yet.

## Run it

Requires Node 20+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only |
| `npm test` | Run all unit/component tests once |
| `npm run test:watch` | Tests in watch mode |

## Configuration (all optional)

Copy `.env.example` to `.env.local`. Only `VITE_*` variables reach the browser, so **never put secrets there**.

| Variable | Effect |
| --- | --- |
| `VITE_BRAND_NAME` | Overrides the brand name (default `Ankiro`) |
| `VITE_BRAND_TAGLINE` | Overrides the tagline |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | **Public values for the backend.** Sign-up/log-in use them only when `VITE_ACCOUNTS_ENABLED` is also set (below). The two *public* values for the future backend. The client in `src/lib/supabase.ts` refuses to start if given a secret/service-role key. Never put a secret key, database password or `postgres://` URL anywhere in this project |
| `VITE_ACCOUNTS_ENABLED` | **Off unless exactly `true`.** Switches on customer sign-up and log-in. Keep it empty until the database has been installed and checked; adding the two Supabase values alone does not switch anything on (on purpose). While it is off, the Log in / Sign up / Dashboard pages say plainly that accounts are not available yet. Also switches on, for logged-in customers, online consultation requests, payment-reference submission and (for administrators/experts) the `/admin` and `/staff` areas. |
| `VITE_CONTACT_EMAIL` | Enables the contact form and the "Open in email app" action. Unset → the site says contact isn't set up yet |

Prices live in `src/config/pricing.ts` (all unset placeholders). Feature availability labels live in `src/config/site.ts`.

## Project layout

```
src/
  config/      site.ts (brand, contact, feature status flags), pricing.ts (placeholder prices)
  types/       domain.ts — data model for later phases (bookings, payments, reports, audit log…)
  data/        services, consultation modes + status vocab, demo experts, Moolank meanings
  lib/         moolank.ts (calculation + date validation), requestValidation.ts, requestSummary.ts
  components/  art.tsx (all illustrations), Header, Footer, Layout, ConsultationRequestFlow, MoolankCalculator, ui primitives…
  pages/       one file per route (Legal.tsx holds Privacy/Terms/Refund templates)
  styles/      tokens.css (palette, type scale, per-service themes), base.css, layout.css (header/footer/heroes), components.css (buttons, forms, notices), sections.css (page compositions)
  test/        route, link and honesty-guardrail tests
docs/STATUS.md  implemented vs mocked vs required
```

## Design system

- **Palette** (`src/styles/tokens.css`; dark browns sampled from the hero photo, plus muted bronze): warm ivory `#F9F4E6`, pale champagne `#F1E4C6`, champagne gold `#D8B56D`, antique gold `#B88A4C`, deep espresso `#302219`, earthy brown `#5A4526`, muted plum `#604651`, soft sage `#A7AC91`, muted terracotta `#C17D61`. Text-safe "ink" variants (`--gold-ink`, `--terracotta-ink`, `--sage-ink`, `--champagne-light`) keep body and small text ≥ 4.5:1 on their surfaces.
- **Type**: Fraunces (variable, optical sizing; display + italic accent words) with Manrope (body, UI, forms). Both self-hosted via Fontsource — no third-party font requests. Scale tokens: `--fs-hero`, `--fs-h1…h4`, `--fs-lede`, `--fs-body`, `--fs-caption`.
- **Per-service identity**: `.theme-numerology / -palmistry / -gemstone-guidance / -color-therapy` set `--t-bg`, `--t-ink`, `--t-muted`, `--t-accent`, `--t-soft`. Tiles, arches, suggestion cards and service heroes read these, so a new theme is one CSS block.
- **Photography**: the hero uses the supplied photograph, saved unmodified at `public/images/hero-reference.webp` (1504×632, 45 KB; a test pins its size and SHA-1). `src/components/photo.tsx` is the only place that references it and offers three views of the same file: `hero` (CSS crop from 22% across to the right edge, which drops four faint decorative words on the original's left but keeps the face, halo, moon and the "Same sky. A brighter you." line), `portrait` (face crop for the closing section) and `full` (the complete image, on About). Replace the file (and `HERO_ALT`) to change the picture. The hero background colours are sampled from the photo's own edges so it blends without a seam.
- **Illustration**: the four service illustrations in `src/components/art.tsx` remain original SVG (nonagram dial, palm line-art, faceted gem, translucent colour discs).
- **Header**: transparent over the photographic home hero, solid ivory elsewhere and after scrolling (`useScrolled`). The mobile menu is rendered outside `<header>` on purpose (header `backdrop-filter` would shrink a fixed child).
- **Surfaces**: ivory, paper, champagne-pale, sage tint, plum, espresso, plus a plum "stage" for the closing call to action; film grain on dark surfaces.
- **Motion**: staged hero entrance, scroll-reveals, drawing connector lines, hover transitions. No parallax, particles or looping animation. Everything is disabled under `prefers-reduced-motion`.
- The brand name is never baked into artwork: the logo mark is lettering-free and the name comes from `VITE_BRAND_NAME`.
