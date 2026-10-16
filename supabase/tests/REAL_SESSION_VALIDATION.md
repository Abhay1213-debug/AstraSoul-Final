# Real-session validation (manual) — what the SQL tests cannot prove

> **Status: NOT DONE.** Nothing in this file has been performed. Until it is, the database must not be described as
> verified end-to-end. Do these steps with a **test project or throw-away test accounts**, never with real customers.

The three kinds of evidence in this folder:

| Kind | Where | What it proves | What it cannot prove |
|---|---|---|---|
| **1. Static checks** | `src/test/sqlMigrations.test.ts` (vitest) | The SQL *text* follows the security conventions (RLS on every table, pinned `search_path`, no wide grants…). | Anything about behaviour. A static check can pass while the SQL is wrong. |
| **2. Simulated SQL tests** | `supabase/tests/isolation_tests.sql` | With *simulated* sessions (session values set by hand, database role switched), the grants, policies, triggers, constraints and functions behave as intended. | That real tokens look like the simulated ones; the Data API; Auth flows; concurrency; error shapes. |
| **3. Real-session tests** | this file | Behaviour through the real API with real logins. | — |

## 0. Rules for these tests
- **Never paste a real access token, refresh token, password or key into this chat or into any website** (including online JWT decoders).
  Decode the *payload* locally, in your own browser console (see 1.2). Send me only the claim *names and values* listed there.
- Use accounts you created for testing (addresses you control). Delete them afterwards (dashboard → Authentication → Users → Delete user). Deleting runs the anonymisation automatically.
- The publishable key and project URL are public by design, but keep them in `.env.local`, not in chat.

## 1. Token claims (the whole MFA design rests on this)
1. Sign in with a test account that has an enrolled and verified authenticator. *(Needs the Stage 3 login screens, or the dashboard's Auth tools.)*
2. In the browser console of the signed-in page run (this prints ONLY the claim names/values, never the token):
   ```js
   const s = (await supabase.auth.getSession()).data.session
   const p = JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
   console.log({ aal: p.aal, role: p.role, is_anonymous: p.is_anonymous, hasSub: !!p.sub, amr: p.amr })
   ```
3. Expected: right after the **password** step `aal` is `"aal1"`; after the **authenticator code** step it is `"aal2"`; `role` is `"authenticated"`; `is_anonymous` is `false` (or absent).
4. **If `aal` is missing or named differently, STOP**: every staff/admin policy depends on it. Tell me the exact claim names you see.

## 2. Two-browser customer isolation
1. Browser 1 = test customer A, Browser 2 = test customer B (two different browsers or private windows).
2. Each creates a request (needs an approved consent version, see README "Consent versions"). Each submits a payment reference.
3. Expected: A sees only A's requests and payments; B only B's. Neither can open the other's request by id (`select … where id = <the other's id>` returns no rows).
4. A tries to call `cancel_my_request` with B's request id → error code `cannot_cancel`.

## 3. Admin and staff with real MFA
1. Grant an admin role only through `scripts/50_grant_staff_role_TEMPLATE.sql`, *after* the account enrolled and verified an authenticator.
2. Signed in with **password only** (aal1): the admin sees no other customers' requests, cannot read the audit log, cannot verify a payment.
3. After the **authenticator step** (aal2): all of the above work.
4. Staff (expert) login: sees only requests assigned to its expert; cannot reassign, reschedule, cancel; sees no payments and no profiles.
5. Deactivate the staff member (script 51, recipe 1) and reload: access is gone on the very next request, without waiting for the token to expire.
6. Remove the authenticator factor of a test admin in the dashboard and reload: access is gone although the old token is still valid.

## 4. Data API exposure
Replace the two placeholders with your **public** project URL and **publishable** key (never a secret key):
```bash
# The private schema must NOT be reachable. Expected: an error saying the schema is invalid / not exposed (HTTP 406), NOT a result.
curl -s -i -H "apikey: $PUBLISHABLE_KEY" -H "Accept-Profile: private" "$SUPABASE_URL/rest/v1/rpc/staff_role"

# Not logged in: sensitive tables must refuse. Expected: "permission denied" (HTTP 401/403), no rows.
curl -s -i -H "apikey: $PUBLISHABLE_KEY" "$SUPABASE_URL/rest/v1/profiles?select=id&limit=1"
curl -s -i -H "apikey: $PUBLISHABLE_KEY" "$SUPABASE_URL/rest/v1/consultation_requests?select=id&limit=1"

# Not logged in: public reference data is readable. Expected: the four services.
curl -s -H "apikey: $PUBLISHABLE_KEY" "$SUPABASE_URL/rest/v1/services?select=slug,name"

# Not logged in: staff identifiers must not be readable. Expected: permission denied.
curl -s -i -H "apikey: $PUBLISHABLE_KEY" "$SUPABASE_URL/rest/v1/service_prices?select=updated_by&limit=1"
```
Also check Dashboard → Project Settings → API → *exposed schemas*: `private` must not be listed (the post-migration script reports what it can read).
Run Dashboard → **Advisors → Security** and send me every warning that names one of our tables or functions.

## 5. Concurrency (the anti-spam limit under simultaneous requests)
The isolation test runs in one transaction and cannot race itself. After the website can create requests, with one test customer who has **0 open requests**,
fire several inserts at the same moment, for example from the browser console of the signed-in page:
```js
const row = { service_slug: 'palmistry', mode: 'chat', concern: 'concurrency test concern text', consent_version: '<your approved version>' }
const results = await Promise.all(Array.from({ length: 8 }, () => supabase.from('consultation_requests').insert(row).select('id')))
console.log(results.map(r => r.error?.message ?? 'created'))
```
Expected: exactly **3** `created` and 5 `too_many_open_requests` (never 4 or more). Repeat once for the 24-hour limit if you wish (it needs the account to have made 10 requests, then it should refuse all).
Cancel/clean up the test requests afterwards.

## 5b. Cancellation versus payment submission (the row-lock strategy)
The isolation test proves the sequential rules; it cannot interleave two sessions. On a **test** project with a test customer, one open request with a price set, and a second SQL Editor tab, do this twice (once in each order). In each tab, set the simulated session first (use the helper statements of `isolation_tests.sql`, or your own test login through the website once it exists).
1. **Cancel first.** Tab 1 runs one statement that cancels the request and then waits: `select public.cancel_my_request('<request id>'); select pg_sleep(20);` as that customer (inside a `do` block with `set local role authenticated` and the claims set, so that the transaction stays open during the sleep). Within those 20 seconds Tab 2 submits a payment claim for the same request. **Expected:** Tab 2 waits, then returns `request_not_payable`; no payment row exists afterwards.
2. **Claim first.** Tab 1 submits the claim and then `pg_sleep(20)`; within that time Tab 2 cancels the request. **Expected:** Tab 2 waits, then succeeds; the payment is `pending` and the request has an admin-only `system` note "cancelled while a payment claim is still PENDING".
3. **Never expected:** a pending payment on a cancelled request **without** that note; any deadlock error (`40P01`). Report PASS/FAIL and the exact error text.
Also repeat with an **admin** cancelling (instead of the customer) in step 2.

## 6. Signup, deletion and the triggers on `auth.users` (real Auth role)
1. Sign up a new test account through the real signup flow (or Dashboard → Authentication → Add user). Expected: a row appears in `profiles` with the sanitised name and email.
2. Change the account's email (confirmation flow): `profiles.email` follows.
3. Create a request and a payment claim as that account, then **delete the account in the dashboard**. Expected: it succeeds; `profiles` row remains as `Deleted customer`; the request is cancelled and its text replaced by `[removed at customer request]`; the payment keeps amount/reference/status but its payer name is `[removed]`.
4. If any of these fails, use `scripts/60_recovery_signup_trigger_MANUAL.sql` (do not improvise) and send me the error text.

## 7. Error shapes and what they reveal
1. Provoke each error class from the website/console (too-short concern, invalid phone, bad reference, repeated reference, over the limit, someone else's request id).
2. Record the JSON error you get. For application-level rules it should contain only a short code (`invalid_concern`, `reference_unavailable`, …).
3. Check Dashboard → Logs → Postgres for the same events and tell me whether a failing row (concern, date of birth, payer name, reference) appears in the log text. **Do not assume it does not.** If it does, the website must validate before sending and we will discuss log retention/redaction.

## 8. Lost authenticator / admin recovery drill (before launch)
Run the procedure in `supabase/README.md` ("Lost authenticator and admin recovery") once with a test admin, so the first time is not a real emergency.

## 9. How to report
Send, for each numbered item: **PASS / FAIL**, the exact error text for failures, and the claim names (never tokens). Never send: tokens, passwords, keys, connection strings, real customer data.
