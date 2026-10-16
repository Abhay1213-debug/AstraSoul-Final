# Supabase database — Phase 1 (PREPARED, NOT YET RUN)

> **Status: nothing in this folder has been executed.** No SQL has been run against any database, the website does not
> connect to Supabase, and none of this has been verified against a real project. The files were checked only with the
> real PostgreSQL *parser* (syntax) and with *static* tests of the security conventions. **Whether they behave correctly
> on your project is unknown until you run them and report the results** (sections 3 and 7). Passing the SQL isolation
> test would still only prove the database layer under *simulated* sessions (section 8).

**Revision note.** This version incorporates the independent security audit of the first draft (closed exposure window,
conflict guards, safer teardown, payment-integrity rules, staff privacy, MFA hardening, data lifecycle, stronger tests).
The migrations have never been run, so they were corrected in place; once you have run them, **never edit a migration — ask for a new numbered one.**

## 1. What each file is, and the order to run them

Run everything in the **Supabase dashboard → SQL Editor**, as the default `postgres` role, **one file per step, in this order**.
Paste the *entire* file, press **Run**, wait for the result, then go to the next step. **Stop at the first problem.**

| Step | File | Purpose | Re-run safe? | Destructive? |
|---|---|---|---|---|
| 0 | `scripts/00_preflight_READ_ONLY.sql` | Read-only health check **and conflict detection** (foreign objects in `private`, triggers on `auth.users` that would be replaced, a `public.handle_new_user`, tables/types/functions with our names that are not ours…). Ends with a **VERDICT** row: `STOP` or `OK to continue`. | yes | no |
| 0b | `scripts/00b_preflight_AUTH_TABLES_READ_ONLY.sql` | Part 2 of the preflight: privilege questions about the Supabase-managed `auth.users` / `auth.mfa_factors` tables (6 checks + verdict = 7 rows). Run after step 0. | yes | no |
| 1 | `migrations/20261014000100_foundation.sql` | Guards, `private` schema, 5 enum types, shared trigger helper. | yes | no |
| 2 | `migrations/20261014000200_tables.sql` | Two guards (tables, and the 11 indexes) + the 12 tables. **For every table the order is: create → Row Level Security on → API access revoked → marker → indexes**, so there is no exposure window. | yes (`if not exists`) | no |
| 3 | `migrations/20261014000300_functions_and_triggers.sql` | Guard; MFA-aware role helpers; signup/delete triggers; request, payment and staff guards; anti-spam limits; audit; customer anonymisation. | yes | replaces *our own* triggers only |
| 4 | `migrations/20261014000400_rpc_functions.sql` | Guard; the only ways to cancel a request, submit a payment reference, verify or refund a payment. | yes | no |
| 5 | `migrations/20261014000500_rls_and_grants.sql` | Column-level grants and all Row Level Security policies. | yes | replaces *our own* policies only |
| 6 | `migrations/20261014000600_seed_reference_data.sql` | The 4 services, 12 empty (NULL) price slots, profile backfill. **No consent version, prices, experts or payment details.** | yes | no |
| 7 | `scripts/90_post_migration_checks_READ_ONLY.sql` | Read-only structure check, including column-level exposure and function permissions. Ends with a **VERDICT** row. | yes | no |
| 8 | `tests/isolation_tests.sql` | Isolation test with fake users. **Ends with an intentional error and saves nothing.** | yes | no (rolls back) |

Not part of the sequence — **never run these as part of normal setup**:

| File | Purpose |
|---|---|
| `scripts/50_grant_staff_role_TEMPLATE.sql` | How an admin/staff role is granted. Only after login and MFA enrolment exist (later stage). Ships with a placeholder email, so it grants nothing as-is. |
| `scripts/51_account_lifecycle_MANUAL.sql` | Recipes (all commented out): deactivate/reactivate staff, lost authenticator, anonymise a customer, read-only "payments needing attention" query. |
| `scripts/60_recovery_signup_trigger_MANUAL.sql` | Recovery recipes (all commented out) if signup or account deletion starts failing. |
| `scripts/95_optional_harden_default_privileges.sql` | Optional: new tables you create later start with no API access. |
| `scripts/99_teardown_DESTRUCTIVE.sql` | **Deletes everything. Do not run it unless you are starting over on a project with no real data.** Three safeguards (section 5). |
| `tests/REAL_SESSION_VALIDATION.md` | The manual checks that need real logins (section 8). |
| `PRODUCTION_READINESS.md` | Gate checklist before real customers, the manual **administrator setup** procedure for later, the retention decision record (undecided), soft-deletion handling, UPI safety rules, assumptions that cannot be verified offline. |
| `CONSENT_AND_PRIVACY_PREREQUISITES.md` | A clearly marked **DRAFT, NOT APPROVED** consent text for your review, version-label guidance and the privacy-policy checklist. **Not seeded anywhere.** |

## 2. Dashboard settings to check BEFORE running anything

I cannot see or change your Supabase settings; please check these yourself. (Menu names can change; if you cannot find one, tell me what you see.)

1. **Project Settings → API → exposed schemas (Data API)**: only `public` (and `graphql_public`) may be listed. **`private` must NOT be listed.** The preflight and post-check scripts try to read this setting and report it, but confirm it in the dashboard too.
2. **Authentication → Sign In / Providers → "Allow anonymous sign-ins": OFF.** (The database also rejects anonymous sessions, but keep this off.)
3. **Authentication → Sign In / Providers → Email enabled, "Confirm email" ON.** The database does *not* check that an email is confirmed; this setting does. Switch off providers you do not use.
4. **Authentication → multi-factor authentication: TOTP (authenticator app) enabled.** To my knowledge TOTP MFA is included on the Free plan; please verify in your dashboard. (Phone/SMS MFA is a paid add-on and is **not** used; the database accepts only TOTP factors.)
5. **Your own supabase.com login: turn on two-factor authentication.** Anyone who controls the project owner account can bypass every protection in this folder.
6. Nothing here requires any **extension**, paid add-on or plan upgrade. Everything used is core PostgreSQL that the Free plan includes.
7. Free-plan facts to be aware of (check current terms): free projects can be paused after a period of inactivity, and there is no point-in-time restore. Not a blocker for the pilot, but it means **there is no undo** for destructive SQL (section 5).

URL configuration, SMTP, redirect URLs and CAPTCHA are needed later, when the login screens are built — not for these SQL steps.

## 3. Steps and what you should see

Open **SQL Editor → New query**. Check the role selector (if shown) says `postgres`.

**Step 0 — preflight (two read-only scripts, run in this order).**
*Why two:* a first run of a single script in a real project stopped with `ERROR 42501: must be owner of table users`. I could not find which statement caused it by reading the script (it only reads catalogs and asks privilege questions; I cannot run it against a database to find out), so everything that names the Supabase-managed `auth.users` / `auth.mfa_factors` tables was moved into a second script. The main script no longer names them at all. If either script errors, send me the exact error: the split shows which half it came from.
**0a.** Paste `scripts/00_preflight_READ_ONLY.sql`, Run. Expect 30 rows (29 checks + the verdict). Rows 9–12 will say **UNKNOWN** ("run 00b") on purpose, so this script alone ends in `MANUAL CHECK NEEDED`. **Read the last row (`VERDICT`)**:
- **`MANUAL CHECK NEEDED`** — normal here. Fine as long as the only UNKNOWN rows are 9–12 (done by 0b) and 26 (whether the Data API exposes schema `private`, which the database may not be able to tell: check it in the dashboard, section 2).
- **`STOP`** — a row says **PROBLEM** (a conflicting object, a conflicting *index*…), a row came back blank/unrecognised, or fewer than 29 check rows appeared. Run nothing else; send me the PROBLEM rows (section 7).
- `OK to continue` cannot appear from this script alone.
**0b.** Paste `scripts/00b_preflight_AUTH_TABLES_READ_ONLY.sql`, Run. Expect 7 rows (6 checks + the verdict). The verdict must be **`OK to continue`**; `STOP` means a privilege the migrations need is missing (send me the rows).
Rows 3, 4, 10, 11 are privileges the migrations need (create in `public`, create the schema `private`, triggers and foreign keys on `auth.users`); a missing one is a PROBLEM.
Row 13 may say INFO if your role cannot insert into the managed auth tables: the isolation test will then run in REDUCED mode (section 8).
Rows marked INFO are for information (for example "event triggers", "default privileges", the other tables with RLS off that are *not ours*).
**Continue only when 0a has no PROBLEM and 0b says `OK to continue`.**

**Steps 1–6 — migrations.** For each file: paste the whole file, Run.
Expected each time: **"Success. No rows returned."** (Step 6 may report rows affected.)
Steps 1–4 begin with a **guard**: if it finds an object with our name that is not ours, it stops with a message beginning `MIGRATION STOPPED` and **changes nothing**. Send me that message.
The editor may warn about *"destructive operations"* because the files contain `drop trigger/policy if exists` (they only replace our own objects, which are recreated in the same file; no data is touched). Confirm to proceed.
If a step errors: **stop. Do not skip it and do not run the next one.** Send me the error text (section 7). Because every file is re-run safe, running the failed file again after I fix it is fine.

**Step 7 — post-migration checks.** Paste `scripts/90_post_migration_checks_READ_ONLY.sql`, Run.
Expect 21 rows (20 checks + the verdict). The **VERDICT** row must say **OK**; `MANUAL CHECK NEEDED` means a row says UNKNOWN (row 14: Data API exposure of `private`) — check it in the dashboard; `STOP` means a PROBLEM, a blank/unrecognised row or a wrong number of rows. Privileges are checked with the **effective-privilege functions** for the roles `anon` and `authenticated` (exact writable/readable column sets, the hidden staff-id columns, a 24-function EXECUTE matrix, schema and sequence rights), and the 11 indexes and 18 payment/request CHECK constraints are checked by **definition**, not by name. (Row 16 "nobody has a staff role" may say OK or INFO; row 17 shows 0 consent versions — expected.)

**Step 8 — isolation test.** Paste `tests/isolation_tests.sql`, Run.
**An error is the expected outcome.** The error text is the report. It should look like:
```
ERROR: ISOLATION TESTS FINISHED (this error is intentional: it rolls back every fake record).
MODE: FULL (every section ran)
PASSED: 314   FAILED: 0
(no failures) ...
```
- `MODE: FULL` + `PASSED: 314   FAILED: 0` → all 314 simulated checks passed (the number is the count of checks in the file; this is stated by a repo test).
- `FAILED: n` → the report lists up to 25 failing checks with what was expected and what was received. Send me the whole text.
- `MODE: REDUCED …` → the managed auth tables refused the fake users, so only the sections that need no auth fixtures ran (81 checks). The report lists what was **not tested**; use the manual path in `tests/REAL_SESSION_VALIDATION.md`. This is a limitation of the fixtures, not evidence of a problem.
- `SETUP FAILED: …` → the script could not build its fake data. This means **nothing was tested**; it does not mean something is insecure. Send me the message.
The script creates fake users and fake rows *inside one transaction that always aborts*, so nothing persists. You can confirm afterwards by re-running Step 7 or by counting `auth.users`: it will be unchanged.

### Consent versions (after Step 6, before the website can create requests)
No migration invents your consent wording. A consultation request can only reference a consent version that you have approved, so **until you add one, requests are refused (`consent_version_invalid`) — intended.**
When you have approved the consent text (kept in the website), register its version label once, in the SQL Editor:
```sql
insert into public.consent_versions (version) values ('PUT-YOUR-VERSION-LABEL-HERE');   -- e.g. a date such as 2026-11-01 (1-20 letters, digits, . _ -)
```
To retire a version later: `update public.consent_versions set active = false where version = '…';` (existing requests keep their record). Do not add it to a migration.

## 4. Optional but recommended after Step 8

**Dashboard → Advisors → Security.** Run the security advisor and send me any warnings about these tables/functions. It is an independent check of RLS and function settings.

## 5. Irreversible or potentially destructive operations — watch for these

| Operation | Where | Effect | Your protection |
|---|---|---|---|
| `drop trigger / drop policy if exists` | migrations 3 and 5 | Replaces our own triggers/policies (re-created in the same file). No data touched. | Safe. The editor's "destructive" warning is about these. 0300 refuses to run if a same-named trigger on `auth.users` is not ours. |
| `revoke all ... from anon, authenticated` | migrations 2 and 5 | Removes default API access on the 12 *new* tables (intended). | Only affects our tables. |
| `scripts/99_teardown_DESTRUCTIVE.sql` | manual only | **Deletes every Phase 1 table and all its data, irreversibly.** **Never run during normal setup, upgrades or troubleshooting.** | (1) a confirmation phrase that includes **today's date**, so an edited copy expires; (2) a second phrase is required **if any table holds rows**, and only the number of rows is reported; (3) it drops only objects carrying our marker, **with no `cascade` anywhere** (anything unexpected makes it fail and roll back). It never touches `auth.users`. There is no undo on the Free plan. |
| `scripts/50_grant_staff_role_TEMPLATE.sql` | later | Grants an admin/staff role. | Placeholder email ships; the database refuses unless the person has a verified authenticator factor. |
| `scripts/51…`, `scripts/60…` | manual | Every statement is commented out; nothing runs unless you remove the comment marks. | Read each recipe first. |
| `scripts/95_optional_harden_default_privileges.sql` | optional | Changes default privileges for *future* tables. | Optional and reversible (undo statements included). |
| Disabling the audit-log protection triggers | owner only, deliberate | Would allow rows of `audit_log` to be changed or removed. | Nothing in the project does it; section 18 explains the limits of the protection. |
| Deleting a login in the dashboard | manual | **Anonymises that customer automatically** (name, contact, birth date, concern, payer name, note text are replaced) and cancels their open requests. Financial and audit records stay. | Intended (section 11). If the anonymisation fails, the deletion is refused. |

The migrations never `drop table`, `truncate`, `delete`, create roles, install extensions, or change Auth settings (a test enforces this).

## 6. Dashboard-visible changes the migrations make to the `auth` schema
Three triggers on `auth.users` (`on_auth_user_created`, `on_auth_user_email_changed`, `on_auth_user_deleted`). They are the only change to a managed schema. Section 9 explains how to switch them off safely if they ever misbehave.

## 7. How to report results and errors safely

**Send me:** the result table text from Steps 0 and 7; the full error text of any failing step (with the file/step number); and the full text of the Step 8 report.
**These contain no secrets.** They show structure, counts, object names and test labels only; the tests use fake data (`@example.invalid`).
**Never send me:** your database password, the project's secret / service-role key, JWT secret, any database connection string, access/refresh tokens, real customers' personal data, or screenshots showing the API-keys page. The publishable key and project URL are public by design but still belong in your `.env.local`, not in chat.
If an error message contains something that looks like personal data, replace it with `[redacted]` before sending.

## 8. What counts as evidence — and what is NOT verified

| Kind | Where | Proves | Does not prove |
|---|---|---|---|
| **Static checks** | `npm test` (`src/test/sqlMigrations.test.ts`) | The SQL *text* follows the conventions (per-statement checks: RLS on every table straight after creation, pinned `search_path`, exact grants, no wide access, policies use the MFA-aware helpers, …). | Behaviour. Never treat a passing static test as proof of security. |
| **Parser check** | an offline PostgreSQL parser, run outside the project | The syntax of every file and function body. | Names, types, privileges, runtime behaviour. |
| **Simulated SQL test** | `tests/isolation_tests.sql` (Step 8) | Under *simulated* sessions: grants (exact column sets), RLS, triggers, constraints, functions, audit. Error checks name the intended layer (missing grant vs. policy vs. our trigger). | Real tokens, the Data API, Auth flows, concurrency, error shapes, logs. |
| **Real-session test** | `tests/REAL_SESSION_VALIDATION.md` | Real behaviour with real logins and two connections. | — **NOT DONE.** |

**Assumptions about Supabase that have NOT been verified and that the design depends on** (all are covered by the real-session checklist):
1. Real login tokens carry `aal` (`aal1`/`aal2`) and `is_anonymous` exactly as the policies read them, and Supabase rejects forged tokens.
2. `auth.mfa_factors` has `user_id`, `status = 'verified'`, `factor_type = 'totp'` as used (the preflight checks the columns exist).
3. The Data API exposes only `public`; `private` functions are unreachable through it.
4. New tables in `public` may receive broad default API rights; the migrations revoke them immediately (the preflight reports whether default privileges exist).
5. The `postgres` role of the SQL Editor owns the objects it creates and may create triggers on `auth.users` (the preflight checks the privilege; ownership-requiring statements such as `alter table auth.users disable trigger` may need the dashboard instead).
6. The SQL Editor runs each file as one atomic statement list (the migrations are re-run safe either way).
7. Direct inserts into `auth.users` / `auth.mfa_factors` work for the isolation-test fixtures (if not, the test falls back to REDUCED mode).
8. The Postgres **server log** may contain the text of a failing row when a native constraint error occurs; I have not verified either way. The database raises generic codes first for the common mistakes (below), but do not assume logs are free of personal data.
9. Concurrent requests respect the limits, and a cancellation cannot interleave with a payment submission (the row-lock strategy in `0400` is reasoned and its lock ordering reviewed for deadlocks, but **neither is tested under real concurrency**; the live two-session procedure is in `REAL_SESSION_VALIDATION.md` §5b).
10. Whether the SQL Editor role may drop triggers on `auth.users` (only needed for re-running `0300`; see section 21).

## 9. If signup (or account deletion) starts failing

*Nothing here runs automatically.* Use `scripts/60_recovery_signup_trigger_MANUAL.sql`:
1. Identify the trigger involved (read-only query in the script) and read the error text in Dashboard → Logs.
2. **Signup failing:** switch the profile trigger **off** (reversible) — people can then register but cannot submit requests until profiles exist. The trigger function is also written so that an internal failure logs a warning and does **not** block signup in the first place.
3. **Deleting a login failing:** switch the deletion trigger off, **anonymise the customer by hand first** (so no personal data is left behind), then delete the login.
4. Create missing profiles with the backfill statement in the script, then switch the trigger back on once the cause is fixed.
5. Send me the error text (no data).
If the editor refuses `alter table auth.users …` with an ownership error, use the dashboard's Database → Triggers page or tell me; do not change roles or permissions to work around it.

## 10. Staff, admin, lost authenticator and recovery

- **Who can be staff/admin:** only rows in `staff_members`, created from the SQL Editor (script 50). No API call, no `user_metadata`/`app_metadata` value, and no customer action can create or change one (static and simulated tests check this). A role requires a **verified authenticator-app (TOTP) factor** at the moment it is granted or re-activated.
- **What a session needs for staff/admin powers** (re-read on every request): an *active* `staff_members` row, a token whose `aal` claim is `aal2`, **and** a verified TOTP factor that currently exists for that account. So **deactivating** someone, or **removing their authenticator factor**, ends their access on the very next request — a still-valid token does not help. *(Whether real tokens carry `aal2` exactly as read is unverified until section 8, item 1 is done.)*
- **Roles:** an **admin** manages everything and verifies/refunds payments (never ones for their own requests). A **staff** login represents **one expert** (`staff_members.expert_id`) and sees **only requests assigned to that expert** — with the customer's name, concern, date of birth and language, and never email, phone, payments or profiles. Staff may add internal notes, set the meeting link and mark a confirmed request completed; they cannot assign, schedule, cancel or confirm. An admin assigns the expert and confirms.
- **Deactivate:** `scripts/51…` recipe 1 (the last active admin cannot be deactivated: add another first). **Keep at least two active admins before launch.**
- **Lost or replaced authenticator device:** recipe 4 in `scripts/51…`. In short: another admin deactivates the person if anything is suspicious → the old authenticator factor is removed (dashboard) → the person signs in with their password, enrols a **new** authenticator and verifies it → reactivate. Rehearse once with a test admin (`REAL_SESSION_VALIDATION.md` §8).
- **Sole admin loses the device:** the database will not let the last active admin be deactivated, so there is no lock-out from the SQL side, but there is also no second admin to supervise the change. This is why two admins are required. With the project-owner login you can always repair data in the SQL Editor; protect that login with two-factor authentication (section 2, item 5).
- **Staff boundaries (tested in the isolation test):** a staff login cannot read other customers' profiles, any payment, the audit log or the **payment settings** (a staff *account* is excluded from them whatever its session level); it cannot see who wrote a note; it cannot verify, assign, reschedule or cancel. Admin and staff identifiers are hidden from customers and anonymous visitors.
- **Where to see who did what:** staff/admin user ids are deliberately **not** readable through the API on `payments`, `service_prices`, `app_settings`, `request_notes.author_id` and `staff_members.created_by`; the admin finds them in the audit log (actor id on every change).
- **Website consequence (Stage 3+):** because some columns are not readable by API roles, the website must **list columns** in its queries (never `select('*')` on `payments`, `service_prices`, `app_settings`, `staff_members`, `request_notes`).

## 11. Customer deletion and anonymisation

- **Design:** deleting a login (dashboard) triggers `private.anonymise_customer`, which replaces the customer's name, email, phone, date of birth, language, concern text, payer name and internal note text with neutral placeholders, cancels open requests, marks the profile `anonymised_at`, and writes a counts-only audit entry. The profile row stays as an anonymous tombstone (no foreign key to `auth.users` on purpose) so requests, payments and the audit trail remain consistent. Afterwards the account can no longer create requests.
- **Kept on purpose:** request ids, service, mode, statuses and times; payments (amounts, statuses, dates, **UPI references**); the audit log (which holds no personal data). *Which records you must or may keep, and for how long, is a business and legal decision that this project does not make* — please decide it (with an accountant or legal adviser) before launch; the UPI reference and amount could be scrubbed too if that is the decision.
- **How to run it deliberately:** `scripts/51…` recipe 5 (look → anonymise → delete the login). Only the database owner can call the function; it is not reachable through the API.
- **Soft deletion (limit):** the automatic anonymisation fires when the login row is really deleted. If a login is only *soft-deleted* (an option in Supabase's Auth admin API; I have not verified what the dashboard button does in your version), the row stays and the trigger does not fire — run recipe 5 yourself in that case. Also, anyone who controls the project owner login or a secret key can read or change any data; the controls here protect against API users, not against the project owner.
- **Not built:** a self-service "delete my account" button. It would need a deliberate design (re-authentication, notice about records that stay).
- **Soft deletion — what to do:** until you have confirmed on a *test* account what the dashboard's "Delete user" does, run the read-only check in `scripts/51…` recipe 5b after every deletion (it lists logins marked deleted whose profile is not anonymised yet) and anonymise those by hand. Details: `PRODUCTION_READINESS.md` §5.
- **Retention periods are a decision still to be made** (`PRODUCTION_READINESS.md` §4): this project states none and claims none is required. Retained records are readable only by administrators; staff cannot read payments or profiles.
- Do not run any anonymisation or deletion on real data until the production gate checklist is complete.
- Unverified until the real-session check in `REAL_SESSION_VALIDATION.md` §6.

## 12. Cancellation and payments (rules encoded in the database)

- A customer can cancel their own request while it is `submitted` or `awaiting_confirmation`.
- **If a payment already `succeeded`** for the request, the customer cannot cancel by themselves (`payment_received`): an admin cancels it and refunds the payment, so money is never left silently against a cancelled request.
- **If a claim is still `pending`**, cancelling is allowed; the claim stays pending and shows up for the admin (query in `scripts/51…` recipe 6). The admin marks it `failed` (no money arrived) or accepts it and refunds it.
- **No race between cancelling and paying:** `submit_payment_reference` locks the request row (`FOR SHARE`) and re-checks "not cancelled" after any wait; `cancel_my_request` and every other update of that row take a conflicting lock. So a claim cannot slip in after a cancellation, and a cancellation that follows a claim sees it and raises the flag below. (Reasoned and checked in the sequential tests; true interleaving is a live test — section 8, item 9.)
- **Never silent:** whoever cancels a request (customer, admin or the anonymisation), if a payment is still pending or has succeeded, a fixed **ATTENTION** note (kind `system`, admin-only, no customer data) is written automatically; verifying a payment as succeeded on an already-cancelled request writes one too. The payment itself is never changed automatically.
- An admin may cancel any open request, including one with a succeeded payment; the refund is a separate, manual step. Request status and payment status stay separate; `refunded` is a payment status only.
- **UPI references:** a reference that is pending, accepted or **refunded** can never be claimed again by anyone. A reference marked **failed** can be submitted again **only by the customer who submitted it** (typo correction); other customers can never use it. Maximum 5 claims per request.
- **What the admin sees for each claim:** the reference, the amount (snapshotted from the configured price at claim time), the payer name as the customer typed it, and the payment date (within 30 days). An admin can accept as `succeeded` only if the amount they saw in the bank statement equals the expected amount. Nothing else (no UPI handle, phone, bank or card detail) is collected; the website must **never** ask for a UPI PIN, OTP, banking password or card/bank credential (the payer-name field rejects long digit runs as a safety net).
- **An admin cannot verify, fail or refund a payment on their own request or that they submitted.** Another admin must do it.

## 13. Error handling and what is (not) claimed

- Application-facing rules return short machine codes (for example `invalid_concern`, `reference_unavailable`, `consent_version_invalid`) that never contain customer text. The request and profile triggers validate **before** the table constraints, so the common mistakes never reach a native constraint error (which can echo the offending row).
- **Not claimed:** that PostgreSQL's own logs or every native error are free of personal data. They may not be (section 8, item 8). The website must validate input before sending it and show only generic messages.

## 14. Security model in one page

- **Two independent layers on every table:** (1) *grants* decide which roles may touch which tables **and columns** at all (everything is revoked first, right after each table is created); (2) *Row Level Security policies* decide which rows. Plus *triggers* (state machines, limits) that apply however a row arrives. The isolation test compares the **exact** set of writable columns with the expected list.
- **Trusted callers are an allow-list:** a write guard trusts a change only when the database user is the **table owner** (our own SECURITY DEFINER functions, or the SQL Editor). Every other database role must pass the MFA-aware staff checks; a future role is refused by default.
- **Roles:** `anon` = not logged in; `authenticated` = any logged-in user. "Staff" and "admin" are rows in `staff_members` (section 10).
- **Customers** see and create only their own rows; cannot set status, expert, schedule, link or the stored name; cannot edit what they submitted; cannot read internal notes or the audit log; cancel only via `cancel_my_request`.
- **Payments:** a customer can only create a *pending* claim; only an admin (not the customer or submitter) can verify; "succeeded" requires the received amount to equal the expected amount. All payment writes go through `submit_payment_reference`, `verify_payment`, `refund_payment`.
- **Anti-spam (database trigger):** at most 3 open requests and 10 requests per rolling 24 hours per customer, for single and multi-row inserts; cancelling does not reset the 24-hour count; customers cannot delete rows.
- **Consent:** a request must reference an active, approved consent version.
- **Confirmation:** needs an active expert who offers the requested service and consultation mode, and a time that is not in the past. Payment is *not* required (statuses are independent; the website must show an unpaid warning).
- **Audit log:** append-only for API users (written only by triggers); admin-readable. Records ids, status changes, amounts and times; **never** date of birth, concern text, names, phone, email, UPI reference, payer name, meeting link or note text. The one deliberate exception is the **value of the UPI ID and payee name settings** (business data), recorded old → new so a changed payment destination can be traced. Owners and the service-role key can still alter the table (no database can prevent its owner).
- **Secrets:** none appear in any file; the website will only ever use the public project URL and publishable key.
- **Pilot decisions encoded:** voice/video and PDF reports are manual (no tables for them); no palm photos; no payment gateway; UPI ID/payee name are entered later by an admin; no prices, experts or consent wording are invented.

## 15. Owner decisions: approved, and still open
**Approved and implemented:** staff scope (assigned requests only; no profiles, payments or settings; cannot verify/assign/cancel); cancel-after-payment goes through an admin; anonymisation instead of blanket deletion, with records able to outlive a deleted login; consent stays blocked until an approved version exists; collect only payer name and payment date; two administrators before launch; an audit-log protection trigger.
**Still open before real customers** (see `PRODUCTION_READINESS.md`): the **retention periods** (undecided on purpose); the **consent wording, its version label and the privacy policy** (`CONSENT_AND_PRIVACY_PREREQUISITES.md` holds a non-approved draft); what the dashboard's "Delete user" does (soft vs hard); the real-session tests.

## 16. Undo options

- Before Step 5 (before grants and policies exist) the new tables are empty, locked down and unused; nothing depends on them.
- To start over on a project with **no real data**: edit and run `scripts/99_teardown_DESTRUCTIVE.sql` (read its header first), then re-run Steps 1–6.
- On a project with real data there is no automatic undo (Free plan). Take a manual export first if you ever re-run anything destructive.

## 17. Permission matrix (effective access, from the grants plus the policies)
"Customer" = any logged-in user acting on their own data. "Staff" = an expert's login with an MFA session. "Admin" = an administrator with an MFA session. Staff and admin are rows in `staff_members`, not database roles. R=read, C=create, U=update. The isolation test checks these; the static tests check the written grants and policies.

| Object | anon | Customer | Staff (own expert's requests only) | Admin |
|---|---|---|---|---|
| `services`, `service_prices`, `experts`, `expert_services` | R public columns (active only); never `updated_by` | R (plus their assigned expert) | R | R all; U/C as listed in the grants; prices and experts admin-only |
| `profiles` | — | R/U own (4 columns) | own only (as any user) — **not others** | R all |
| `consultation_requests` | — | R own; C own (6 columns) | R assigned; U only `meeting_link` and confirmed → completed | R all; U status/expert/schedule/link through the state machine |
| `request_notes` | — | — | R `general` notes of assigned; C on assigned; **no author** | R all (no author column); C |
| `payments` | — | R own (no staff ids) | **—** | R all; **writes only through the functions** |
| `app_settings` (UPI id, payee, instructions) | — | R | **— (staff accounts excluded)** | R; C/U |
| `consent_versions` | — | R active | R active | R all; **writes only by the owner (SQL Editor)** |
| `staff_members` | — | — | own row | own row; **no API writes** |
| `audit_log` | — | — | — | R; **no API writes; update/delete/truncate refused by triggers** |
| `cancel_my_request`, `submit_payment_reference` | — | own requests only | (as a customer, own only) | (as a customer, own only) |
| `verify_payment`, `refund_payment` | — | — | — | yes, **never on their own request** |
| `private.*` functions | — | only the five policy helpers are executable; no direct data | same | same; `anonymise_customer` is owner-only |

## 18. Audit-log protection (what it is, and what it is not)
Triggers refuse **UPDATE, DELETE and TRUNCATE** on `audit_log` for every database user, including the owner and the SQL Editor, with the code `audit_log_is_append_only`. API users are refused even earlier (no write grant, no write policy). Nothing in the project updates or deletes audit rows, so no legitimate operation is blocked (the anonymisation and the cancellation flags only *append*).
**This does not make the log absolutely immutable.** A database owner, or any role with enough privilege, can disable or drop the triggers, a superuser can bypass triggers altogether, and the project owner's credentials (or a secret key) can do anything. Treat the log as tamper-*resistant* against mistakes and against API users, not as tamper-proof evidence. If you ever decide to purge old rows, do it deliberately as the owner with the trigger disabled for that one statement, and record why.

## 19. Offline validation vs runtime validation
**Offline validation** (done in this repository, no database involved): an offline PostgreSQL parser over every SQL file (syntax only), the per-statement static tests (conventions only, mutation-tested), the type-check and the production build. **None of this proves the live database is secure.**
**Runtime validation** (NOT done): running the preflight, the migrations, the post-check and the isolation test in your Supabase project (simulated sessions), then the manual real-session checks in `tests/REAL_SESSION_VALIDATION.md` (real tokens, MFA, the Data API, two connections, logs). Until those are reported PASS the database must not be described as verified.

## 20. Safe execution order (documentation only — nothing here has been run)
1. Read this file and `PRODUCTION_READINESS.md`; check the dashboard settings (section 2).
2. Step 0 preflight → stop on `STOP`.
3. Steps 1–6 migrations, one at a time, stop at the first error.
4. Step 7 post-check → verdict `OK`.
5. Step 8 isolation test → report the whole text (honestly note `MODE: REDUCED` if it appears).
6. Manual real-session checks on a **test** project/accounts.
7. Only then: administrators (script 50), consent label (after approval), and Stage 3.

## 21. Re-running and partial execution
**What "atomic" means here, and the assumption.** Each file should run as one all-or-nothing batch. I could not verify that the SQL Editor runs a pasted file in a single transaction. The files are written so that the *worst case if it does not* is still safe, and so that a failed file can simply be run again after the cause is fixed.

| File | Re-run safe? | Where a re-run can FAIL | If it stops half-way (non-atomic worst case) |
|---|---|---|---|
| `0100` | yes | never for ownership reasons (the objects are ours; the guard refuses foreign ones) | schema/types partly created; re-run finishes them |
| `0200` | yes | the guards refuse a foreign table or index; **an unmarked table left by a failed earlier attempt is reported as foreign** (the marker comment comes right after the lock-down) — if that happens, send me the message; do not drop anything | each table is locked down (RLS + revoke) as the statement right after its creation, **before its indexes**, so a failure in an index statement can no longer leave an open table |
| `0300` | yes, **except section Z** | **Section Z (the last one) drops and recreates our three triggers on `auth.users`. DROP TRIGGER needs OWNERSHIP of that managed table, which the SQL Editor role may not have.** The file then stops with `MIGRATION STOPPED: … not allowed to replace it`; the existing triggers stay as they were. A *first* run needs only the TRIGGER privilege (the preflight checks it) | the triggers on `auth.users` are created last, after every function they call exists, so no trigger can point at a missing function |
| `0400` | yes | never for ownership reasons | each function is followed at once by its revoke/grant, so none is left with the default execute rights |
| `0500` | yes | never for ownership reasons | revoke-then-grant: a stop in between leaves tables **locked** (safe) until it is re-run |
| `0600` | yes (inserts are `on conflict do nothing`) | — | seeds partly applied; re-run finishes them |
| `scripts/60` recipe `alter table auth.users disable trigger` | — | ownership of `auth.users` again | use the dashboard's Database → Triggers page, or ask me |

**Rules when a re-run fails on ownership:** do **not** change roles, grants or ownership, do not run anything as another role, and do not drop objects by hand to force it. The triggers installed by the first run keep working. Send me the message; the safe options are (a) leave the triggers as they are (nothing in `0300` section Z needs to change unless the function bodies did, and the functions *are* replaced), or (b) let me prepare a new numbered migration that avoids the drop. Never "fix" a stop by editing a migration that has already run.
**If a file reports `MIGRATION STOPPED`:** nothing was changed by that statement; read the named object, tell me, and do not continue to the next file.

