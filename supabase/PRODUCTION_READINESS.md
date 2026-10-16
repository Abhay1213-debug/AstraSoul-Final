# Production readiness — what must be true before real customers (NOTHING here is done yet)

> **Status: a checklist and procedures, not a record of completed work.** Nothing in this project has been executed against a database. The offline work
> (parser, static tests, type-check, build) proves **syntax and written conventions only** — it does **not** prove live database security.

## 1. Offline validation vs runtime validation

| | Offline (done in this repository) | Runtime (NOT done — needs you) |
|---|---|---|
| What | Parser on every SQL file; static per-statement tests (mutation-tested); type-check; build. | Run the migrations; run the isolation test (simulated sessions); follow `tests/REAL_SESSION_VALIDATION.md` (real logins, tokens, MFA, two connections). |
| Proves | The SQL is syntactically valid and follows the written conventions. | The behaviour of *your* Supabase project. |
| Does not prove | Any behaviour. | The simulated test cannot prove real tokens, the Data API, Auth flows, concurrency or logs. |

## 2. Gate checklist (all unchecked; tick only when really done and verified)
- [x] Preflight (00 + 00b) clean; migrations 1–6 applied; post-check no problem (verdict `MANUAL CHECK NEEDED` only for the Data API exposure row, confirmed by the owner in the dashboard); isolation test `MODE: FULL`, `PASSED: 314 FAILED: 0` — all done 2026-10-15 (simulated sessions only).
- [ ] Every item of `tests/REAL_SESSION_VALIDATION.md` performed and reported PASS.
- [ ] Dashboard settings confirmed (README §2). Owner confirmed `private` is not an exposed schema (2026-10-15); the rest of §2 was reported done earlier but is not independently verified here.
- [ ] Two independently authenticated administrators set up (§3), each with a verified authenticator.
- [ ] Consent wording, version label and privacy policy approved (`CONSENT_AND_PRIVACY_PREREQUISITES.md`) and the version registered.
- [ ] **RETENTION** decisions recorded (§4).
- [ ] Customer-rights and deletion procedure agreed (§5) and rehearsed once on test data.
- [ ] Lost-authenticator drill rehearsed once on test accounts (README §10).
- [ ] UPI rules (§6) built into the payment screens.
- [ ] Prices and payment details entered by an admin through the admin screen (never hard-coded).
- [ ] Security advisor (Dashboard → Advisors → Security) reviewed.

## 3. Administrator accounts (manual procedure for LATER — do not do this now)
**Do not create real administrator accounts, assign production roles, or weaken the MFA checks while preparing or testing the SQL.** The isolation test uses only fake, rolled-back users.

Requirement before production: **two independently authenticated administrator** accounts — two different people, two different email addresses, two different devices — each with a **verified authenticator** (TOTP). One administrator cannot verify or refund a payment that belongs to their own account, so a second is needed for real operation, and it is the only protection against a lost-device lock-out.

Procedure (when the login and MFA-setup screens exist, with a test project first):
1. Person signs up with their own email and confirms it.
2. Person enrols an authenticator app and **verifies** it (the database refuses a role without a verified TOTP factor).
3. The owner runs `scripts/50_grant_staff_role_TEMPLATE.sql` in the SQL Editor after replacing the placeholder email — nothing else can grant a role. Expect `INSERT 0 1`.
4. Repeat for the second administrator, from a different device and email.
5. Each administrator signs in with password **and** authenticator and confirms they can see the admin screens; signing in with the password alone must show nothing privileged.
6. Record who the two administrators are and how a lost device is handled (README §10). Never share one authenticator between people.
Staff (expert) logins follow the same steps with the staff statement, tied to exactly one expert.

## 4. Data retention — RETENTION DECISION RECORD (TO BE DECIDED)
This project **does not state or assume any retention period** and does not claim any is legally required. Decide, with whatever advice you choose, **before real customers are onboarded**, and write the answers here:

| Record | Kept after account deletion? | For how long | Reason | Decided by / date |
|---|---|---|---|---|
| Payments (amount, status, dates, UPI reference) | currently yes (design) | **TO BE DECIDED** | **TO BE DECIDED** | |
| Requests (service, mode, status, times — personal text removed) | currently yes (design) | **TO BE DECIDED** | **TO BE DECIDED** | |
| Audit log (no personal data) | currently yes (design) | **TO BE DECIDED** | **TO BE DECIDED** | |
| Anonymous profile tombstone | currently yes (design) | **TO BE DECIDED** | **TO BE DECIDED** | |
| Internal notes | text removed on anonymisation | n/a | | |

What the anonymisation already does: removes name, email, phone, date of birth, language, the concern text, the payer name and free-text note text; keeps the fixed system flags; keeps amounts, statuses, dates, UPI references and ids. Retained records are readable **only by administrators** (staff cannot read payments or profiles; the customer's login no longer exists). Purging retained records later is a separate, deliberate decision (the audit-log protection trigger would have to be disabled for that one statement by the owner — see README).

## 5. Account deletion, anonymisation and Supabase Auth soft deletion
- A **real** deletion of a login row fires `on_auth_user_deleted`, which anonymises that customer automatically (README §11).
- A **soft** deletion (Supabase Auth can mark a user deleted — `deleted_at` — without removing the row) does **not** fire the DELETE trigger, so the customer's data would remain. **I have not verified which kind the dashboard's "Delete user" performs in your project.** Until you have confirmed it:
  1. After every deletion, run the read-only check in `scripts/51_account_lifecycle_MANUAL.sql` (recipe 5b) to find logins marked deleted whose profile is not yet anonymised.
  2. Anonymise each one deliberately (recipe 5, with `true` so open requests are cancelled), then confirm with the same check.
  3. Tell me which behaviour you observed on a **test** account, and I will add an automatic path for it in a new numbered migration.
- Implications of the design (profiles and payments intentionally have **no foreign key to the login**): records can outlive a deleted login, which is what lets financial and audit records survive; the cost is that an **orphan** profile could exist if a login were removed while the deletion trigger was disabled — hence the recovery script's instruction to anonymise by hand first.
- **Safe anonymisation procedure** (owner only, test data first): recipe 5 — look (counts) → anonymise (`false` refuses while requests are open; `true` cancels them first) → delete the login → run the soft-deletion check.
- Never run any anonymisation or deletion against real data until §2 is complete and §4 is decided.

## 6. Manual UPI verification — rules the payment screens must follow
- Collect **only**: the UPI transaction reference, the payer name (as shown in the customer's UPI app) and the payment date. Nothing else.
- **Never** ask for, accept, store or display a **UPI PIN**, an **OTP**, a banking password, a card number, a CVV or any other credential — not in a field, a note or a message. The payer-name field rejects long digit runs as a safety net, but the screens must make clear what to enter and what never to enter.
- There is **no payment gateway** and none is to be added: the customer pays in their own UPI app, the admin checks the bank statement and verifies manually.
- The reference cannot be reused across customers (pending, accepted or refunded references are spent; a failed one is reusable only by the same customer), and an administrator cannot verify, fail or refund a payment on their own request.
- The admin screen must show the expected amount, payer name, date and reference, and the unpaid warning before confirming a consultation without verified payment.

## 7. Supabase assumptions that cannot be verified offline
These are **unverified** and each needs a runtime or dashboard check (the list is repeated, with the reasons, in README §8):
1. Real tokens contain `aal` (`aal1` → `aal2` after the authenticator step) and `is_anonymous` exactly as the policies read them; forged tokens are rejected.
2. `auth.mfa_factors` has the columns used; TOTP is the factor type that the project enables.
3. The Data API exposes only `public` — **the `private` schema not being exposed cannot be verified offline** (the scripts try to read the setting; confirm it in the dashboard).
4. Default grants on new `public` tables exist (hence the immediate revocation) and the SQL Editor role owns what it creates and may create triggers on `auth.users`.
5. Each SQL Editor run is atomic; direct inserts into the managed auth tables work for the test fixtures (otherwise the test reports REDUCED mode honestly).
6. Whether Postgres logs contain failing-row text; what the dashboard's "Delete user" does (soft vs hard).
7. Behaviour under real concurrent requests (the advisory lock is argued sound, not tested).
8. Whether a Row Level Security policy may read a column the caller has no SELECT privilege on — **the design avoids relying on this** (policies never reference the hidden columns).

## 8. Rollout order (reference only — nothing is executed by this file)
Preflight → migrations 1–6 → post-check → isolation test → real-session checks on a test project → admins and consent/retention decisions → Stage 3 (login screens) → Stage 4 (requests) → Stage 5 (admin area) → final security review → production.

## 10. Launch blockers for the whole website (as of the local build; none of these is done)
1. **Real-session testing** of everything the website does against the live project (REAL_SESSION_VALIDATION.md): sign-up email, log-in, password reset, a request, a payment reference, verification by a second admin, refund, cancellation, an expert login, authenticator codes, two people acting at once.
2. **Dashboard settings** (owner): Site URL and the two allowed return addresses (`/dashboard`, `/reset-password`); how confirmation/reset emails are sent and whether the free sending limit is enough.
3. **Business facts only the owner can supply**: an approved consent wording and its version registered (README, "Consent versions"); the UPI ID and payee name (entered in the admin screen); real prices (admin screen); real experts (admin screen); Privacy, Terms and Refund pages reviewed and completed; retention decisions (§4).
4. **Two administrators**, each with a verified authenticator (§3), granted by the owner with `scripts/50_grant_staff_role_TEMPLATE.sql`. Order: the person signs up, confirms email, opens *Account security* (`/dashboard/security`) and verifies an authenticator, then the owner runs the script, then the person opens `/admin`.
5. Consultation length, email notifications and any real-time chat/voice/video are **not built** (consultations are arranged manually).
6. Deployment, domain and hosting have not been chosen or done.

## 9. Switching on customer sign-up and log-in (website Stage 3)
The screens are built and tested on this computer with a stand-in backend, and are **off by default** (`VITE_ACCOUNTS_ENABLED` must be exactly `true`). They have **never** talked to a real Supabase project. Before switching them on, all of these must be true:
- [ ] The database is installed and the post-check verdict is `OK` (§2).
- [ ] The dashboard's URL configuration is set (the site address as the Site URL, and the sign-up return address as an allowed redirect). **This is not set up yet and cannot be checked offline**; without it the confirmation link in the email would point to the wrong place.
- [ ] A test sign-up received a confirmation email, the link brought the test customer back to the site signed in, and a profile row exists (`tests/REAL_SESSION_VALIDATION.md` §1 and §6).
- [ ] How confirmation emails are sent has been chosen and tested. Whether the free default sending limit is enough for the pilot has **not** been verified.
- [ ] Password reset works for real: it is built and tested on this computer only (`/forgot-password`, `/reset-password`). In a test project, confirm the reset email arrives, the link opens `/reset-password` signed in temporarily, the new password works, and the old one no longer does. The dashboard's allowed redirect addresses must include the `/reset-password` address as well as `/dashboard`. Not verified: the reset email's wording and how long its link lasts (dashboard defaults, not set by us).
- [ ] The Privacy Policy and Terms linked from the sign-up page have been reviewed (`CONSENT_AND_PRIVACY_PREREQUISITES.md`).

