-- =====================================================================================
-- 60  RECOVERY: IF SIGNUP OR ACCOUNT DELETION STARTS FAILING  (MANUAL - every statement is commented out)
-- Nothing in this file runs by itself, and no migration ever runs it. Use it only if, AFTER the migrations were applied,
-- new people cannot register ("Database error saving new user") or deleting a login fails.
-- Run ONE recipe at a time. Keep this file unedited in the project; copy statements into the SQL Editor instead.
--
-- Background: the migrations install three triggers on auth.users, all calling functions in schema "private":
--   on_auth_user_created        -> private.handle_new_user      (creates the profile; it never blocks signup, see 0300)
--   on_auth_user_email_changed  -> private.sync_profile_email
--   on_auth_user_deleted        -> private.handle_user_deleted  (anonymises the customer; if it fails the deletion is refused)
-- =====================================================================================

-- ---- Step 1. Find out which trigger is involved (read-only) ---------------------------------------------------------------
-- select t.tgname, t.tgenabled
--   from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace s on s.oid = c.relnamespace
--  where s.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
--   tgenabled 'O' = enabled, 'D' = disabled.
-- Also look at Dashboard > Logs > Auth / Postgres for the error text and send it to me (error text only, never data).

-- ---- Step 2a. Signup is failing: switch OFF the profile trigger (reversible) ---------------------------------------------
-- alter table auth.users disable trigger on_auth_user_created;
-- Consequence: people can register, but get no profile and therefore cannot submit consultation requests.
-- If the editor says "must be owner of table users", use the dashboard's Database > Triggers page to disable the trigger there,
-- or tell me - do NOT work around it by changing roles or permissions.

-- ---- Step 2b. Deleting a login is failing: switch OFF the deletion trigger (reversible) ---------------------------------
-- alter table auth.users disable trigger on_auth_user_deleted;
-- WARNING: while it is off, deleting a login leaves that person's personal data in public.profiles and their requests.
-- Anonymise first by hand (recipe 5 in 51_account_lifecycle_MANUAL.sql) and switch the trigger back on afterwards.

-- ---- Step 3. Check that registration now works -----------------------------------------------------------------------------
-- Register a test account with a throw-away address through your normal signup page (once it exists), or use the
-- dashboard's "Add user". Then delete the test account again.

-- ---- Step 4. Create the profiles that were missed while the trigger was off (safe to run repeatedly) ------------------------
-- insert into public.profiles (id, email, full_name)
-- select u.id,
--        left(coalesce(u.email, ''), 320),
--        case
--          when char_length(left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 80)) >= 2
--            then left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 80)
--          when char_length(left(btrim(split_part(coalesce(u.email, ''), '@', 1)), 80)) >= 2
--            then left(btrim(split_part(coalesce(u.email, ''), '@', 1)), 80)
--          else 'Customer'
--        end
--   from auth.users u
-- on conflict (id) do nothing;

-- ---- Step 5. When the cause is fixed, switch the trigger(s) back ON ---------------------------------------------------------
-- alter table auth.users enable trigger on_auth_user_created;
-- alter table auth.users enable trigger on_auth_user_deleted;

-- ---- LAST RESORT (needs my review first): removing a trigger entirely --------------------------------------------------------
-- Prefer "disable" above. Removing is only for a trigger that must be rebuilt, and re-running migration 0300 recreates it.
