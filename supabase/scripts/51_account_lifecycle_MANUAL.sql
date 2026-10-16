-- =====================================================================================
-- 51  ACCOUNT LIFECYCLE  (MANUAL RECIPES - every statement below is commented out, so running this file does NOTHING)
-- Copy ONE recipe at a time, remove the leading "-- ", edit the placeholder, run it, and read the result.
-- Never run a recipe you do not understand; ask first. None of these recipes sends data anywhere.
-- =====================================================================================

-- ---- 1. DEACTIVATE a staff or admin login (effect: immediate, on their very next request) ---------------------------------
-- The last active admin cannot be deactivated (error "last_admin"): add or reactivate another admin first.
-- update public.staff_members set active = false
--  where user_id = (select id from auth.users where lower(email) = lower('PUT-THE-EXACT-EMAIL-HERE@example.com'));

-- ---- 2. REACTIVATE ---------------------------------------------------------------------------------------------------------
-- Needs a verified authenticator-app factor on that account (otherwise "mfa_factor_required").
-- update public.staff_members set active = true
--  where user_id = (select id from auth.users where lower(email) = lower('PUT-THE-EXACT-EMAIL-HERE@example.com'));

-- ---- 3. Point a staff login at a different expert ---------------------------------------------------------------------------
-- update public.staff_members set expert_id = '00000000-0000-0000-0000-000000000000'::uuid
--  where user_id = (select id from auth.users where lower(email) = lower('PUT-THE-EXACT-EMAIL-HERE@example.com'));

-- ---- 4. LOST OR REPLACED AUTHENTICATOR DEVICE -------------------------------------------------------------------------------
-- Access is cut off the moment the account has no verified authenticator factor, even if its login token has not expired,
-- so removing the old factor IS the revocation. Procedure (README "Lost authenticator"):
--   a) another admin deactivates the person (recipe 1) if there is any doubt the device or password was taken;
--   b) remove the old factor in the Supabase dashboard (Authentication > Users > the user > remove MFA factor, if your
--      dashboard offers it) or, if it does not, tell me and we will agree a safe SQL alternative;
--   c) the person signs in with their password, enrols a NEW authenticator and verifies it;
--   d) reactivate them (recipe 2).
-- Read-only check: which staff accounts currently have NO verified authenticator factor (they have no access until fixed)?
-- select s.user_id, s.role, s.active
--   from public.staff_members s
--  where not exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified' and f.factor_type = 'totp');

-- ---- 5. DELETE / ANONYMISE A CUSTOMER (privacy request) -----------------------------------------------------------------
-- Removes the personal data, keeps the financial and audit records (amounts, statuses, dates, UPI references).
-- Which records may be kept, and for how long, is a business/legal decision (README "Customer deletion").
-- Step A - look first (counts only):
-- select (select count(*) from public.consultation_requests where customer_id = '00000000-0000-0000-0000-000000000000'::uuid) as requests,
--        (select count(*) from public.consultation_requests where customer_id = '00000000-0000-0000-0000-000000000000'::uuid
--                                                              and status in ('submitted','awaiting_confirmation','confirmed')) as open_requests;
-- Step B - anonymise (false = refuse while requests are still open; true = cancel the open ones first):
-- select private.anonymise_customer('00000000-0000-0000-0000-000000000000'::uuid, false);
-- Step C - then delete the login in the dashboard (Authentication > Users > Delete user). Deleting a login ALSO runs the
-- anonymisation automatically (true), so this order cannot leave personal data behind.

-- ---- 5b. SOFT-DELETED LOGINS (Supabase Auth can mark a user deleted WITHOUT removing the row) -----------------------------
-- A real DELETE fires the automatic anonymisation. A soft delete does NOT. So after any deletion that might have been soft,
-- look for logins marked deleted whose profile has not been anonymised yet (read-only; counts and ids only, no personal data):
-- select u.id, u.deleted_at
--   from auth.users u join public.profiles p on p.id = u.id
--  where u.deleted_at is not null and p.anonymised_at is null;
--   (If the column deleted_at does not exist in your Auth version, this query errors - tell me; do not guess.)
-- For each id found, anonymise it deliberately (recipe 5, step B, with true to cancel any open requests).
-- Make this check part of every deletion request until you have confirmed what your dashboard's "Delete user" does.

-- ---- 6. READ-ONLY: payments needing attention (nothing here changes data) ---------------------------------------------
-- A payment still pending on a request that was cancelled, or a payment that succeeded on a cancelled request (refund due?):
-- select p.id as payment_id, p.status as payment_status, r.status as request_status, p.amount_minor, p.submitted_at
--   from public.payments p join public.consultation_requests r on r.id = p.request_id
--  where (p.status = 'pending' and r.status = 'cancelled') or (p.status = 'succeeded' and r.status = 'cancelled')
--  order by p.submitted_at;
