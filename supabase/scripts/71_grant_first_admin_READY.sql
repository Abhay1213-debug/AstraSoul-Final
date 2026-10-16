-- =====================================================================================
-- 71  GRANT THE FIRST ADMINISTRATOR   (READY TO RUN - but only AFTER the steps below)
-- Order: (1) the owner signs up on the website with abhayprabhakar1213@gmail.com and confirms the email,
--        (2) opens "Account security" (/dashboard/security) and sets up + verifies an authenticator app,
--        (3) THEN runs this statement once. The database refuses it unless that account already has a verified authenticator,
--            so it cannot grant anything early. Before the account exists it matches nobody and grants nothing ("INSERT 0 0").
-- This is the only way an administrator is ever created: no screen or API call can do it.
-- Only ONE administrator exists at launch (owner's decision). If the owner's phone with the authenticator is lost, getting back in
-- needs the recovery procedure in supabase/README.md ("Lost authenticator / admin recovery"). A second administrator is recommended
-- later, from a different person and device.
-- =====================================================================================
insert into public.staff_members (user_id, role)
select u.id, 'admin'::public.staff_role
  from auth.users u
 where lower(u.email) = lower('abhayprabhakar1213@gmail.com')
on conflict (user_id) do update set role = excluded.role, active = true;
-- Expect "INSERT 0 1". "INSERT 0 0" means no account with that email exists yet.
