# What we actually know about the live Supabase project (as of 2026-10-16)

Source of truth for each line is stated. Nothing here comes from the existence of a file in this repository.

| Question | Answer | Evidence (class) |
|---|---|---|
| Were all six migrations applied? | **Yes** | The owner ran 0100–0600 in the SQL Editor; each returned "Success". The post-check then found, in the live database: 12 tables with RLS on, 24 functions, 11 triggers (3 on `auth.users`), 11 indexes, 18 CHECK constraints, 4 services and 12 empty price slots. **LIVE (owner-run, read-only post-check)** |
| Does the live schema match the application? | **Yes on paper, not yet from the website's side** | `src/test/schemaAgreement.test.ts` checks every column/function the website uses against the migration files **(STATIC)**; the live post-check confirms those files are what is installed **(LIVE)**. A live read through the website's own requests has not been done. |
| Are the security policies and permissions present? | **Yes (database layer)** | Post-check: exact column grants for `anon` and `authenticated`, function EXECUTE matrix, no foreign objects in `private`; isolation test `MODE: FULL`, 314 passed, 0 failed, rolled back. **LIVE but SIMULATED sessions** (not real tokens/MFA, not concurrency). |
| `private` not exposed through the Data API? | **Yes, per owner** | The owner confirmed `private` is not in the exposed schemas (dashboard). The database cannot report this itself (post-check row stays UNKNOWN). |
| Is authentication configured? | **Partly known** (read-only check, 2026-10-16, **LIVE**): email + password sign-in on, new sign-ups allowed, **email confirmation required**, **anonymous sign-ins off**. **Still unknown:** Site URL and allowed redirect addresses, email sending, authenticator (TOTP) availability. | `tools/check-live-setup` (**LIVE**, read-only) |
| Is the website configured for this project? | **Partly** | `.env.local` now holds the project address and the publishable key (git-ignored, never printed). `VITE_ACCOUNTS_ENABLED` is still **off**, so the website does not yet use them. |
| Has any website behaviour been run against live Supabase? | **No** | Only mock/stand-in and static evidence exists (see `docs/BUG_REGISTER.md`). |

## How the remaining unknowns get settled (nothing is changed in the live project by steps 1–2)
1. **Read-only check** with the public key: `node tools/check-live-setup/check.mjs`. GET requests only; checks that the four services exist, that private tables refuse the public key, that `private` is not served, and what sign-up/confirmation settings the project reports. Never prints the key. Needs the owner's approval to run once.
2. **Dashboard settings** (owner): see `docs/LIVE_SETUP_GUIDE.md`.
3. **Real-session test** with fake data (needs approval for the specific test account creation).

## Read-only live check — result (2026-10-16, run once, GET requests with the public key only)
All **OK** except one row the check could not decide:
- project reachable; email + password sign-in on; sign-ups allowed; **email confirmation required**; **anonymous sign-ins off**
- the four services exist; 12 price slots exist; **0 prices set** (as intended); experts and expert-services readable and empty
- **profiles, staff_members, consent_versions, consultation_requests, request_notes, payments, app_settings, audit_log all refuse the public key**
- UNKNOWN: "schema `private` is not exposed through the API" returned HTTP 401 instead of the "invalid schema" answer, because the API's root page is not available to the public key. The check's method was wrong for this; it is not evidence either way. The owner has confirmed in the dashboard that `private` is not exposed. A better method (asking the API for a function in `private` and expecting an "invalid schema" refusal) is a small change but sends a different request, so it needs the owner's OK before a second run.
