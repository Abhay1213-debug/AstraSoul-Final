-- =====================================================================================
-- 50  GRANT AN ADMIN OR STAFF ROLE   (TEMPLATE - DO NOT RUN YET)
-- Run only AFTER: the migrations are applied, the website has working signup/login and an MFA setup page (later
-- stage), the person has signed up, confirmed their email and ENROLLED an authenticator app (TOTP).
--
-- The database refuses this unless that account already has a VERIFIED authenticator-app factor (error
-- "mfa_factor_required"), so an account can never be elevated before its owner has enrolled MFA.
--
-- This is the ONLY way roles are granted; there is no screen and no API call that can do it, and nothing in
-- user_metadata / app_metadata is ever consulted, so no customer can promote themselves.
--
--   ADMIN  (statement 1): sees and manages everything; verifies and refunds payments (never their own).
--   STAFF  (statement 2, commented out): an EXPERT's login. It is tied to exactly ONE expert profile and sees only the
--          requests assigned to that expert. Create the expert (admin screen, later) and note its id first.
--
-- Keep at least TWO active admins before launch (see README, "Lost authenticator / admin recovery").
-- =====================================================================================

-- Statement 1: an admin. Edit the email (and nothing else). As shipped it matches no account, so it grants nothing.
insert into public.staff_members (user_id, role)
select u.id, 'admin'::public.staff_role
  from auth.users u
 where lower(u.email) = lower('PUT-THE-EXACT-EMAIL-HERE@example.com')   -- <-- the person's login email
on conflict (user_id) do update set role = excluded.role, active = true;

-- Expect: "INSERT 0 1". If it says "INSERT 0 0", no account has that email (check the spelling / that they signed up).

-- Statement 2: a staff login for one expert. Remove the leading "-- " from each line, then edit the email and the expert id.
-- insert into public.staff_members (user_id, role, expert_id)
-- select u.id, 'staff'::public.staff_role, e.id
--   from auth.users u
--   join public.experts e on e.id = '00000000-0000-0000-0000-000000000000'::uuid   -- <-- the expert's id
--  where lower(u.email) = lower('PUT-THE-EXACT-EMAIL-HERE@example.com')
-- on conflict (user_id) do update set role = excluded.role, expert_id = excluded.expert_id, active = true;
