-- =====================================================================================
-- 0300  FUNCTIONS AND TRIGGERS  (the database-side rules that the website cannot bypass)
-- Needs 0100 and 0200. Re-run: all functions and the triggers on OUR tables are replaced safely. The ONE ownership-sensitive
-- step on a re-run is the last section (Z): dropping our own triggers on the managed table auth.users needs ownership of
-- that table, which the SQL Editor role may not have; if so the file stops with a clear message (README, "Re-running and
-- partial execution"). A FIRST run only needs the TRIGGER privilege (checked by the preflight).
--
-- Error codes raised on purpose (custom SQLSTATEs, so tests and the app can tell them apart):
--   AS401 not authenticated      AS403 forbidden          AS409 not allowed in the current state
--   AS422 invalid input          AS429 too many requests
-- Messages are short machine codes and NEVER include row data. (Native PostgreSQL constraint errors can include the
-- offending row; the triggers below validate first with these generic codes so the common cases never reach a
-- native constraint error. Whether the server LOGS still contain such text is not verified - see README.)
--
-- Conventions: every function pins  set search_path = ''  and uses schema-qualified names (only built-in
-- pg_catalog functions are unqualified; pg_catalog is always searched first and cannot be shadowed);
-- every function is revoked from PUBLIC/anon/authenticated and then granted only to what needs it.
--
-- "Trusted internal caller" is decided by an ALLOW-LIST, not a list of names to refuse: a guard trusts a write only
-- when the current database user IS THE OWNER of the table (our own SECURITY DEFINER functions, or the SQL Editor).
-- Any other database user - authenticated, anon, or any role added in future - must pass the staff checks.
-- =====================================================================================

-- ---------------------------------------------------------------------------------------------------------
-- SAFETY GUARD: refuse to replace an auth.users trigger/function that is not ours
-- ---------------------------------------------------------------------------------------------------------
do $guard$
declare
  r record;
begin
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
              where s.nspname = 'public' and p.proname = 'handle_new_user') then
    raise exception 'MIGRATION STOPPED: a function public.handle_new_user already exists (probably from a Supabase starter template). Nothing was changed.';
  end if;

  for r in
    select * from (values
      ('on_auth_user_created',       'handle_new_user'),
      ('on_auth_user_email_changed', 'sync_profile_email'),
      ('on_auth_user_deleted',       'handle_user_deleted')
    ) as v(tg, fn)
  loop
    if exists (
      select 1
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c      on c.oid = t.tgrelid
        join pg_catalog.pg_namespace cs on cs.oid = c.relnamespace
        join pg_catalog.pg_proc p       on p.oid = t.tgfoid
        join pg_catalog.pg_namespace ps on ps.oid = p.pronamespace
       where cs.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal and t.tgname = r.tg
         and not (ps.nspname = 'private' and p.proname = r.fn)) then
      raise exception 'MIGRATION STOPPED: a trigger named % already exists on auth.users and is not part of this project. Nothing was changed.', r.tg;
    end if;
  end loop;
end
$guard$;

-- ---------------------------------------------------------------------------------------------------------
-- A. Who is calling?  (trusted: derived from the signed login token and the staff_members table)
-- ---------------------------------------------------------------------------------------------------------

-- True only for a login whose token says MFA was completed (aal2 - the claim Supabase documents for this purpose)
-- AND whose account CURRENTLY has a verified authenticator-app (TOTP) factor. The second condition is re-read on every
-- call, so removing a lost device's factor ends that account's staff access at once, even if its token has not expired.
-- Internal helper: executed only inside the functions below (never granted to API roles).
create or replace function private.mfa_session_ok(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_uid is null then
    return false;
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return false;
  end if;
  return exists (
    select 1 from auth.mfa_factors f
     where f.user_id = p_uid and f.status = 'verified' and f.factor_type = 'totp');
end;
$$;

-- The caller's role, or NULL. NULL unless ALL of these hold: logged in, an ACTIVE staff_members row, and an MFA session
-- (see above). The staff row is read on every call, so deactivating a person takes effect immediately. The MFA part is
-- only evaluated for people who have a staff row, so ordinary customers never touch the auth schema through this.
create or replace function private.staff_role()
returns public.staff_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.staff_role;
begin
  if v_uid is null then
    return null;
  end if;
  select s.role into v_role from public.staff_members s where s.user_id = v_uid and s.active;
  if v_role is null then
    return null;
  end if;
  if not private.mfa_session_ok(v_uid) then
    return null;
  end if;
  return v_role;
end;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.staff_role() = 'admin'::public.staff_role, false)   -- never NULL: callers use "if not is_admin()"
$$;

-- True when the logged-in account IS a staff (expert) login - active staff row, role 'staff' - REGARDLESS of its MFA level.
-- Used only to keep such accounts away from customer-facing data they have no business reading (the payment settings),
-- also while they happen to be signed in without MFA. It grants nothing; it only removes.
create or replace function private.is_staff_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_members s where s.user_id = (select auth.uid()) and s.active and s.role = 'staff')
$$;

-- For a STAFF login (not an admin): the one expert profile this login represents; NULL for everyone else. Staff can
-- only ever see and work on requests assigned to this expert.
create or replace function private.staff_expert_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_exp uuid;
begin
  if v_uid is null then
    return null;
  end if;
  select s.expert_id into v_exp from public.staff_members s where s.user_id = v_uid and s.active and s.role = 'staff';
  if v_exp is null then
    return null;
  end if;
  if not private.mfa_session_ok(v_uid) then
    return null;
  end if;
  return v_exp;
end;
$$;

-- Why a request cannot be confirmed with this expert, or NULL if it can: the expert must exist, be active, be linked to
-- the requested service and offer the requested consultation mode. (Runs as the owner so the guard, which runs as the
-- caller, does not need read access to the experts table.)
create or replace function private.confirmation_problem(p_expert_id uuid, p_service text, p_mode public.consultation_mode)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active boolean;
  v_modes  public.consultation_mode[];
begin
  select e.active, e.modes into v_active, v_modes from public.experts e where e.id = p_expert_id;
  if not found or not v_active then
    return 'expert_unavailable';
  end if;
  if not exists (select 1 from public.expert_services x where x.expert_id = p_expert_id and x.service_slug = p_service) then
    return 'expert_service_mismatch';
  end if;
  if not (p_mode = any (v_modes)) then
    return 'expert_mode_mismatch';
  end if;
  return null;
end;
$$;

revoke all on function private.mfa_session_ok(uuid)                                       from public, anon, authenticated;
revoke all on function private.staff_role()                                               from public, anon, authenticated;
revoke all on function private.is_admin()                                                 from public, anon, authenticated;
revoke all on function private.staff_expert_id()                                          from public, anon, authenticated;
revoke all on function private.is_staff_account()                                         from public, anon, authenticated;
revoke all on function private.confirmation_problem(uuid, text, public.consultation_mode) from public, anon, authenticated;
-- These five are called from policy expressions and from the request guard, which run AS THE LOGGED-IN USER.
-- (mfa_session_ok is not listed: it is only ever called from inside the definer functions above.)
grant execute on function private.staff_role()                                               to authenticated;
grant execute on function private.is_admin()                                                 to authenticated;
grant execute on function private.is_staff_account()                                         to authenticated;
grant execute on function private.staff_expert_id()                                          to authenticated;
grant execute on function private.confirmation_problem(uuid, text, public.consultation_mode) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- B. Accounts: create a profile at signup, keep its email copy in sync, anonymise on deletion
-- ---------------------------------------------------------------------------------------------------------

-- Authorisation NEVER reads user_metadata or app_metadata (users can edit user_metadata). Only the display name is read
-- from it, and it is sanitised so that a malformed value can never make signup fail. If creating the profile fails for any
-- other reason, signup is NOT blocked (a WARNING without data is logged); the missing profile can be created afterwards
-- (README, "If signup breaks") and the customer simply cannot submit requests until then.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  begin
    v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80);
    if char_length(v_name) < 2 then
      v_name := left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 80);
    end if;
    if char_length(v_name) < 2 then
      v_name := 'Customer';
    end if;

    insert into public.profiles (id, email, full_name)
    values (new.id, left(coalesce(new.email, ''), 320), v_name)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'profile_create_failed (sqlstate %)', sqlstate;
  end;
  return new;
end;
$$;

create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = left(coalesce(new.email, ''), 320) where id = new.id;
  return new;
end;
$$;

-- Deleting a login (for example from the dashboard) scrubs that customer's personal data at once and cancels any open
-- requests; financial and audit records remain (see section H). If the scrub fails, the deletion is refused.
create or replace function private.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.anonymise_customer(old.id, true);
  return old;
end;
$$;

revoke all on function private.handle_new_user()     from public, anon, authenticated;
revoke all on function private.sync_profile_email()  from public, anon, authenticated;
revoke all on function private.handle_user_deleted() from public, anon, authenticated;

-- (The three triggers on auth.users that call the functions above are created at the VERY END of this file, section Z,
--  so that a trigger can never exist while the function it calls - for example private.anonymise_customer - does not.)

-- Profile fields are validated with generic codes BEFORE the table's CHECK constraints (which remain as a backstop).
create or replace function private.tg_profiles_validate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.full_name is null or char_length(btrim(new.full_name)) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'AS422';
  end if;
  if new.phone is not null and new.phone !~ '^\+?[0-9][0-9 -]{6,17}[0-9]$' then
    raise exception 'invalid_phone' using errcode = 'AS422';
  end if;
  if new.date_of_birth is not null and (new.date_of_birth < date '1900-01-01' or new.date_of_birth > current_date) then
    raise exception 'invalid_date_of_birth' using errcode = 'AS422';
  end if;
  if new.preferred_language is not null and char_length(new.preferred_language) > 40 then
    raise exception 'invalid_language' using errcode = 'AS422';
  end if;
  if char_length(coalesce(new.email, '')) > 320 then
    raise exception 'invalid_email' using errcode = 'AS422';
  end if;
  return new;
end;
$$;
revoke all on function private.tg_profiles_validate() from public, anon, authenticated;

drop trigger if exists profiles_validate on public.profiles;
create trigger profiles_validate
  before insert or update on public.profiles
  for each row execute function private.tg_profiles_validate();

-- ---------------------------------------------------------------------------------------------------------
-- C. Role assignment: controlled, and impossible without a verified MFA factor
-- ---------------------------------------------------------------------------------------------------------
create or replace function private.tg_staff_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.active and not exists (
         select 1 from public.staff_members s where s.user_id <> old.user_id and s.role = 'admin' and s.active) then
      raise exception 'last_admin' using errcode = 'AS409';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'immutable_field' using errcode = 'AS403';
    end if;
    -- never leave the system without an active admin (lock-out protection)
    if old.role = 'admin' and old.active and (not new.active or new.role <> 'admin') and not exists (
         select 1 from public.staff_members s where s.user_id <> old.user_id and s.role = 'admin' and s.active) then
      raise exception 'last_admin' using errcode = 'AS409';
    end if;
  end if;

  -- An active staff/admin row requires a VERIFIED authenticator-app factor, so an account can never be elevated before its
  -- owner has enrolled one (closes the window in which a stolen password could enrol its own). Only TOTP is accepted,
  -- matching what the project enables.
  if new.active and not exists (
       select 1 from auth.mfa_factors f where f.user_id = new.user_id and f.status = 'verified' and f.factor_type = 'totp') then
    raise exception 'mfa_factor_required' using errcode = 'AS403';
  end if;

  return new;
end;
$$;
revoke all on function private.tg_staff_members_guard() from public, anon, authenticated;

drop trigger if exists staff_members_guard on public.staff_members;
create trigger staff_members_guard
  before insert or update or delete on public.staff_members
  for each row execute function private.tg_staff_members_guard();

-- ---------------------------------------------------------------------------------------------------------
-- D. Consultation requests
-- ---------------------------------------------------------------------------------------------------------

-- D1. On insert: ownership, forced initial state, validation (generic codes), consent version, service/DOB rules and
-- the ANTI-SPAM LIMITS. SECURITY DEFINER so the counts see every row regardless of Row Level Security; it is a trigger,
-- so it runs for every insert however the row arrives (website, REST API, anything), including each row of a multi-row
-- insert. A per-customer lock makes two simultaneous requests unable to slip past the limits. Cancelled requests still
-- count towards the 24-hour limit, and customers have no way to delete rows, so the limits cannot be reset.
create or replace function private.tg_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_open   constant integer := 3;    -- open = submitted, awaiting_confirmation or confirmed
  c_max_24h    constant integer := 10;   -- all requests created in the last 24 hours, including cancelled
  v_uid        uuid := auth.uid();
  v_dob        public.dob_requirement;
  v_active     boolean;
  v_open       integer;
  v_recent     integer;
  v_name       text;
  v_closed     timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'AS401';
  end if;
  if new.customer_id is distinct from v_uid then
    raise exception 'forbidden' using errcode = 'AS403';
  end if;
  -- Defence in depth: Supabase "anonymous sign-ins" (a dashboard feature that must stay OFF) would otherwise give
  -- every visitor an "authenticated" session. Real customers are registered accounts only.
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'forbidden' using errcode = 'AS403';
  end if;

  -- generic validation first, so the common mistakes never reach a native constraint error that echoes the row
  if new.mode is null then
    raise exception 'invalid_mode' using errcode = 'AS422';
  end if;
  new.concern := btrim(new.concern);
  if new.concern is null or char_length(new.concern) not between 10 and 1000 then
    raise exception 'invalid_concern' using errcode = 'AS422';
  end if;
  if new.date_of_birth is not null and (new.date_of_birth < date '1900-01-01' or new.date_of_birth > current_date) then
    raise exception 'invalid_date_of_birth' using errcode = 'AS422';
  end if;
  if new.preferred_language is not null and char_length(new.preferred_language) > 40 then
    raise exception 'invalid_language' using errcode = 'AS422';
  end if;
  new.consent_version := btrim(new.consent_version);
  if new.consent_version is null
     or not exists (select 1 from public.consent_versions c where c.version = new.consent_version and c.active) then
    raise exception 'consent_version_invalid' using errcode = 'AS422';
  end if;

  -- a customer can only ever create a plain "submitted" request
  new.status := 'submitted';
  new.assigned_expert_id := null;
  new.scheduled_at := null;
  new.meeting_link := null;

  -- the customer's name is copied from their own profile (never client-supplied)
  select p.full_name, p.anonymised_at into v_name, v_closed from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'profile_missing' using errcode = 'AS422';
  end if;
  if v_closed is not null then
    raise exception 'account_closed' using errcode = 'AS403';
  end if;
  new.customer_name := v_name;

  select s.dob_requirement, s.active into v_dob, v_active from public.services s where s.slug = new.service_slug;
  if not found or not v_active then
    raise exception 'service_unavailable' using errcode = 'AS422';
  end if;
  if v_dob = 'required' and new.date_of_birth is null then
    raise exception 'date_of_birth_required' using errcode = 'AS422';
  end if;
  if v_dob = 'none' then
    new.date_of_birth := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consultation_requests:' || v_uid::text, 0));

  select count(*) filter (where r.status in ('submitted', 'awaiting_confirmation', 'confirmed')),
         count(*) filter (where r.created_at > now() - interval '24 hours')
    into v_open, v_recent
    from public.consultation_requests r
   where r.customer_id = v_uid;

  if v_open >= c_max_open then
    raise exception 'too_many_open_requests' using errcode = 'AS429';
  end if;
  if v_recent >= c_max_24h then
    raise exception 'too_many_requests_24h' using errcode = 'AS429';
  end if;

  return new;
end;
$$;
revoke all on function private.tg_requests_before_insert() from public, anon, authenticated;

drop trigger if exists requests_before_insert on public.consultation_requests;
create trigger requests_before_insert
  before insert on public.consultation_requests
  for each row execute function private.tg_requests_before_insert();

-- D2. On update: who may change what, and which status changes are valid.
-- SECURITY INVOKER on purpose, so current_user tells us who is really writing:
--   * the TABLE OWNER (our own SECURITY DEFINER functions such as cancel_my_request, or the SQL Editor) is trusted;
--   * everyone else must be an active, MFA-verified admin or staff login (an allow-list: any other database role,
--     present or future, is refused). Admins may do everything the state machine allows. A STAFF login may only add a
--     meeting link and mark a request it is assigned to as completed (Row Level Security limits it to its own requests).
create or replace function private.tg_requests_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner       boolean;
  v_role        public.staff_role;
  v_anonymising boolean;
  v_problem     text;
begin
  v_owner := current_user::text = (select pg_catalog.pg_get_userbyid(c.relowner)::text from pg_catalog.pg_class c where c.oid = tg_relid);
  v_anonymising := v_owner and coalesce(current_setting('astrasoul.anonymising', true), '') = 'on';

  if not v_owner then
    v_role := private.staff_role();
    if v_role is null then
      raise exception 'forbidden' using errcode = 'AS403';
    end if;
  end if;

  -- what the customer submitted is never editable afterwards, by anyone (the only exception is the owner-run anonymisation)
  if new.id is distinct from old.id
     or new.customer_id is distinct from old.customer_id
     or new.service_slug is distinct from old.service_slug
     or new.mode is distinct from old.mode
     or new.consent_version is distinct from old.consent_version
     or new.consent_at is distinct from old.consent_at
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable_field' using errcode = 'AS403';
  end if;
  if not v_anonymising
     and (new.customer_name is distinct from old.customer_name
          or new.concern is distinct from old.concern
          or new.date_of_birth is distinct from old.date_of_birth
          or new.preferred_language is distinct from old.preferred_language) then
    raise exception 'immutable_field' using errcode = 'AS403';
  end if;

  -- a staff login (expert) may not triage: no reassigning, no rescheduling, only confirmed -> completed
  if v_role = 'staff' then
    if new.assigned_expert_id is distinct from old.assigned_expert_id
       or new.scheduled_at is distinct from old.scheduled_at then
      raise exception 'forbidden' using errcode = 'AS403';
    end if;
    if new.status is distinct from old.status and not (old.status = 'confirmed' and new.status = 'completed') then
      raise exception 'forbidden' using errcode = 'AS403';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (   (old.status = 'submitted'             and new.status in ('awaiting_confirmation', 'cancelled'))
            or (old.status = 'awaiting_confirmation' and new.status in ('confirmed', 'cancelled'))
            or (old.status = 'confirmed'             and new.status in ('completed', 'cancelled', 'awaiting_confirmation'))) then
      raise exception 'invalid_status_transition' using errcode = 'AS409';
    end if;
  elsif old.status in ('completed', 'cancelled')
        and (new.assigned_expert_id is distinct from old.assigned_expert_id
             or new.scheduled_at is distinct from old.scheduled_at
             or new.meeting_link is distinct from old.meeting_link) then
    raise exception 'request_is_closed' using errcode = 'AS409';
  end if;

  -- Confirming requires an active expert who offers this service AND this consultation mode, and a (not past) time.
  -- Payment is intentionally NOT required here: consultation status and payment status are independent.
  if new.status = 'confirmed'
     and (new.status is distinct from old.status
          or new.assigned_expert_id is distinct from old.assigned_expert_id
          or new.scheduled_at is distinct from old.scheduled_at) then
    if new.assigned_expert_id is null or new.scheduled_at is null then
      raise exception 'expert_and_schedule_required' using errcode = 'AS422';
    end if;
    v_problem := private.confirmation_problem(new.assigned_expert_id, new.service_slug, new.mode);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'AS409';
    end if;
    if new.scheduled_at < now() - interval '5 minutes' then
      raise exception 'schedule_in_past' using errcode = 'AS422';
    end if;
  end if;

  -- a meeting link only makes sense while the request is confirmed (or done)
  if new.status in ('submitted', 'awaiting_confirmation', 'cancelled') then
    new.meeting_link := null;
  end if;

  return new;
end;
$$;
revoke all on function private.tg_requests_before_update() from public, anon, authenticated;

drop trigger if exists requests_before_update on public.consultation_requests;
create trigger requests_before_update
  before update on public.consultation_requests
  for each row execute function private.tg_requests_before_update();

drop trigger if exists requests_set_updated_at on public.consultation_requests;
create trigger requests_set_updated_at
  before update on public.consultation_requests
  for each row execute function private.tg_set_updated_at();

-- D3. A request is never cancelled SILENTLY while money is involved. Whoever cancels it (the customer, an admin, or the
-- anonymisation), an internal "ATTENTION" note of kind 'system' (admin-only) is written if a payment claim is still pending
-- or has succeeded, so the admin sees it and resolves it (mark it failed, or refund it). The note text is fixed: it contains
-- no customer data. Request status and payment status stay separate - nothing here changes a payment.
create or replace function private.tg_requests_cancel_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
  v_ok      integer;
begin
  select count(*) filter (where p.status = 'pending'), count(*) filter (where p.status = 'succeeded')
    into v_pending, v_ok
    from public.payments p where p.request_id = new.id;

  if v_ok > 0 then
    insert into public.request_notes (request_id, author_id, body, kind)
    values (new.id, auth.uid(), 'ATTENTION: this request was cancelled while a payment had SUCCEEDED. Refund the payment.', 'system');
  elsif v_pending > 0 then
    insert into public.request_notes (request_id, author_id, body, kind)
    values (new.id, auth.uid(), 'ATTENTION: this request was cancelled while a payment claim is still PENDING. Mark it failed, or verify it and refund it.', 'system');
  end if;
  return null;
end;
$$;
revoke all on function private.tg_requests_cancel_flag() from public, anon, authenticated;

drop trigger if exists requests_cancel_flag on public.consultation_requests;
create trigger requests_cancel_flag
  after update on public.consultation_requests
  for each row when (new.status = 'cancelled' and old.status is distinct from new.status)
  execute function private.tg_requests_cancel_flag();

-- ---------------------------------------------------------------------------------------------------------
-- E. Payments: no direct writes by anyone except the table owner; every API change goes through 0400's functions
-- ---------------------------------------------------------------------------------------------------------
create or replace function private.tg_payments_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner       boolean;
  v_anonymising boolean;
begin
  v_owner := current_user::text = (select pg_catalog.pg_get_userbyid(c.relowner)::text from pg_catalog.pg_class c where c.oid = tg_relid);
  if not v_owner then
    raise exception 'forbidden' using errcode = 'AS403';
  end if;
  v_anonymising := coalesce(current_setting('astrasoul.anonymising', true), '') = 'on';

  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.verified_at is not null or new.refunded_at is not null then
      raise exception 'invalid_initial_state' using errcode = 'AS409';
    end if;
    -- a reference already used by ANOTHER customer (in any state, including failed) is never available
    if exists (select 1 from public.payments p where p.upi_reference = new.upi_reference and p.submitted_by <> new.submitted_by) then
      raise exception 'reference_unavailable' using errcode = 'AS409';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.request_id is distinct from old.request_id
     or new.method is distinct from old.method
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.upi_reference is distinct from old.upi_reference
     or new.paid_on is distinct from old.paid_on
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'immutable_field' using errcode = 'AS403';
  end if;
  if not v_anonymising and new.payer_name is distinct from old.payer_name then
    raise exception 'immutable_field' using errcode = 'AS403';
  end if;

  if new.status is distinct from old.status then
    if not (   (old.status = 'pending'   and new.status in ('succeeded', 'failed'))
            or (old.status = 'succeeded' and new.status = 'refunded')) then
      raise exception 'invalid_status_transition' using errcode = 'AS409';
    end if;
  elsif (new.received_amount_minor, new.verified_by, new.verified_at, new.refunded_by, new.refunded_at)
        is distinct from
        (old.received_amount_minor, old.verified_by, old.verified_at, old.refunded_by, old.refunded_at) then
    raise exception 'payment_is_final' using errcode = 'AS409';
  end if;

  return new;
end;
$$;
revoke all on function private.tg_payments_guard() from public, anon, authenticated;

drop trigger if exists payments_guard on public.payments;
create trigger payments_guard
  before insert or update on public.payments
  for each row execute function private.tg_payments_guard();

-- ---------------------------------------------------------------------------------------------------------
-- F. Housekeeping: updated_at / updated_by
-- ---------------------------------------------------------------------------------------------------------
create or replace function private.tg_set_updated_by()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function private.tg_set_updated_by() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.tg_set_updated_at();

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
  for each row execute function private.tg_set_updated_at();

drop trigger if exists experts_set_updated_at on public.experts;
create trigger experts_set_updated_at before update on public.experts
  for each row execute function private.tg_set_updated_at();

drop trigger if exists service_prices_set_updated_by on public.service_prices;
create trigger service_prices_set_updated_by before insert or update on public.service_prices
  for each row execute function private.tg_set_updated_by();

drop trigger if exists app_settings_set_updated_by on public.app_settings;
create trigger app_settings_set_updated_by before insert or update on public.app_settings
  for each row execute function private.tg_set_updated_by();

-- ---------------------------------------------------------------------------------------------------------
-- G. Audit log. PRIVACY RULE: only the columns on the allow-list below are ever recorded. Never recorded:
-- date of birth, concern text, name, phone, email, UPI reference, payer name, meeting link, note text.
-- For other columns only the FACT that something changed is stored ("other_fields_changed"), never the value.
-- ONE deliberate exception: the VALUE of the two business payment settings (upi_id, payee_name) is recorded, old and
-- new, so that a changed payment destination can always be traced. They are the business's own details, not customers'.
-- ---------------------------------------------------------------------------------------------------------
create or replace function private.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allow     text[];
  v_old       jsonb;
  v_new       jsonb;
  v_src       jsonb;
  v_changes   jsonb := '{}'::jsonb;
  v_key       text;
  v_entity_id text;
  v_other     boolean := false;
  v_uid       uuid := auth.uid();
  v_role      public.staff_role := private.staff_role();
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_src := coalesce(v_new, v_old);

  v_allow := case tg_table_name
    when 'consultation_requests' then array['service_slug', 'mode', 'status', 'assigned_expert_id', 'scheduled_at']
    when 'payments'              then array['request_id', 'status', 'amount_minor', 'received_amount_minor']
    when 'service_prices'        then array['amount_minor']
    when 'services'              then array['name', 'active', 'display_order', 'dob_requirement']
    when 'experts'               then array['active']
    when 'expert_services'       then array['expert_id', 'service_slug']
    when 'app_settings'          then array['key']
    when 'staff_members'         then array['user_id', 'role', 'active', 'expert_id']
    when 'request_notes'         then array['request_id', 'kind']
    when 'consent_versions'      then array['version', 'active']
    else array[]::text[]
  end;

  if tg_table_name = 'app_settings' and (v_src ->> 'key') in ('upi_id', 'payee_name') then
    v_allow := v_allow || array['value'];
  end if;

  v_entity_id := case tg_table_name
    when 'services'         then v_src ->> 'slug'
    when 'service_prices'   then (v_src ->> 'service_slug') || ':' || (v_src ->> 'mode')
    when 'expert_services'  then (v_src ->> 'expert_id') || ':' || (v_src ->> 'service_slug')
    when 'app_settings'     then v_src ->> 'key'
    when 'staff_members'    then v_src ->> 'user_id'
    when 'consent_versions' then v_src ->> 'version'
    else v_src ->> 'id'
  end;

  if tg_op = 'UPDATE' then
    foreach v_key in array v_allow loop
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    select exists (
      select 1 from jsonb_each(v_new) e
       where e.key <> all (v_allow)
         and e.key not in ('updated_at', 'updated_by')
         and (v_old -> e.key) is distinct from e.value
    ) into v_other;
    if v_other then
      v_changes := v_changes || jsonb_build_object('other_fields_changed', true);
    end if;
    if v_changes = '{}'::jsonb then
      return null;   -- nothing worth recording (e.g. only updated_at changed)
    end if;
  else
    foreach v_key in array v_allow loop
      if v_src ? v_key then
        v_changes := v_changes || jsonb_build_object(v_key, v_src -> v_key);
      end if;
    end loop;
  end if;

  insert into public.audit_log (actor_id, actor_kind, action, entity, entity_id, changes)
  values (v_uid,
          coalesce(v_role::text, case when v_uid is null then 'system' else 'customer' end),
          lower(tg_op), tg_table_name, coalesce(v_entity_id, '?'), v_changes);

  return null;
end;
$$;
revoke all on function private.tg_audit() from public, anon, authenticated;

drop trigger if exists audit_consultation_requests on public.consultation_requests;
create trigger audit_consultation_requests after insert or update or delete on public.consultation_requests
  for each row execute function private.tg_audit();

drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function private.tg_audit();

drop trigger if exists audit_service_prices on public.service_prices;
create trigger audit_service_prices after insert or update or delete on public.service_prices
  for each row execute function private.tg_audit();

drop trigger if exists audit_services on public.services;
create trigger audit_services after insert or update or delete on public.services
  for each row execute function private.tg_audit();

drop trigger if exists audit_experts on public.experts;
create trigger audit_experts after insert or update or delete on public.experts
  for each row execute function private.tg_audit();

drop trigger if exists audit_expert_services on public.expert_services;
create trigger audit_expert_services after insert or update or delete on public.expert_services
  for each row execute function private.tg_audit();

drop trigger if exists audit_app_settings on public.app_settings;
create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function private.tg_audit();

drop trigger if exists audit_staff_members on public.staff_members;
create trigger audit_staff_members after insert or update or delete on public.staff_members
  for each row execute function private.tg_audit();

drop trigger if exists audit_request_notes on public.request_notes;
create trigger audit_request_notes after insert or update or delete on public.request_notes
  for each row execute function private.tg_audit();

drop trigger if exists audit_consent_versions on public.consent_versions;
create trigger audit_consent_versions after insert or update or delete on public.consent_versions
  for each row execute function private.tg_audit();

-- G2. Audit-log PROTECTION. UPDATE, DELETE and TRUNCATE on audit_log are refused for EVERY database user, the owner
-- and the SQL Editor included, so a slip (or a careless statement) cannot rewrite or empty the history. API roles
-- are already refused earlier by the missing grants and the absence of write policies; this is a second layer.
-- HONEST LIMIT: this is NOT absolute immutability. A database owner or any role with sufficient privileges can disable or
-- drop these triggers (alter table ... disable trigger / drop trigger), and a superuser can bypass triggers entirely
-- (session_replication_role). Nothing legitimate needs to change or delete a row: no migration or function here does.
-- If you ever must purge old audit rows (a retention decision), do it deliberately, as the owner, with the trigger
-- disabled for that one statement, and record why.
create or replace function private.tg_audit_log_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit_log_is_append_only' using errcode = 'AS403';
end;
$$;
revoke all on function private.tg_audit_log_guard() from public, anon, authenticated;

drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function private.tg_audit_log_guard();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.tg_audit_log_guard();

-- ---------------------------------------------------------------------------------------------------------
-- H. Data lifecycle: anonymise a customer
-- Removes personal data and KEEPS the records the business may need to retain: amounts, payment statuses and dates, UPI
-- references, request ids/services/modes/statuses and the audit log (which holds no personal data). Run by the database
-- OWNER (the SQL Editor), or automatically when a login is deleted (section B). NOT callable through the API: no role
-- other than the owner has EXECUTE, and the write guards above only accept the exemption from the owner.
-- What stays and for how long is a business/legal decision that this file does not make - see README, "Customer deletion".
--   p_cancel_open = false: refuse while the customer has open requests (cancel them first)
--   p_cancel_open = true : cancel open requests, then anonymise
-- Idempotent. Returns counts only.
-- ---------------------------------------------------------------------------------------------------------
create or replace function private.anonymise_customer(p_user_id uuid, p_cancel_open boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_open  integer;
  v_req   integer := 0;
  v_pay   integer := 0;
  v_notes integer := 0;
begin
  if p_user_id is null then
    raise exception 'invalid_input' using errcode = 'AS422';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return jsonb_build_object('profile_found', false);
  end if;

  select count(*) into v_open from public.consultation_requests r
   where r.customer_id = p_user_id and r.status in ('submitted', 'awaiting_confirmation', 'confirmed');
  if v_open > 0 and not p_cancel_open then
    raise exception 'open_requests_exist' using errcode = 'AS409';
  end if;

  perform set_config('astrasoul.anonymising', 'on', true);

  if v_open > 0 then
    update public.consultation_requests r set status = 'cancelled'
     where r.customer_id = p_user_id and r.status in ('submitted', 'awaiting_confirmation', 'confirmed');
  end if;

  update public.consultation_requests r
     set concern = '[removed at customer request]', date_of_birth = null, preferred_language = null, customer_name = 'Deleted customer'
   where r.customer_id = p_user_id;
  get diagnostics v_req = row_count;

  update public.payments p set payer_name = '[removed]'
   where p.request_id in (select r.id from public.consultation_requests r where r.customer_id = p_user_id);
  get diagnostics v_pay = row_count;

  -- free-text notes may mention the customer, so they are blanked; the fixed 'system' ATTENTION flags hold no personal
  -- data and are kept, so an unresolved payment on a closed request is never lost
  update public.request_notes n set body = '[removed]'
   where n.kind <> 'system'
     and n.request_id in (select r.id from public.consultation_requests r where r.customer_id = p_user_id);
  get diagnostics v_notes = row_count;

  update public.profiles p
     set full_name = 'Deleted customer', email = '', phone = null, date_of_birth = null, preferred_language = null,
         anonymised_at = coalesce(p.anonymised_at, now())
   where p.id = p_user_id;

  insert into public.audit_log (actor_id, actor_kind, action, entity, entity_id, changes)
  values (null, 'system', 'update', 'profiles', p_user_id::text,
          jsonb_build_object('anonymised', true, 'cancelled_open', v_open, 'requests', v_req, 'payments', v_pay, 'notes', v_notes));

  perform set_config('astrasoul.anonymising', 'off', true);
  return jsonb_build_object('profile_found', true, 'cancelled_open', v_open, 'requests', v_req, 'payments', v_pay, 'notes', v_notes);
end;
$$;
revoke all on function private.anonymise_customer(uuid, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------------------------------------------
-- Z. Triggers on auth.users - created LAST, after every function they (indirectly) call exists.
-- First run: only "create trigger" runs (needs the TRIGGER privilege, which the preflight checks).
-- RE-RUN: our own triggers are dropped and recreated, and DROP TRIGGER needs OWNERSHIP of auth.users, which Supabase's
-- managed schema may not give to the SQL Editor role. If so this file stops with a clear message and changes nothing
-- more (the existing triggers stay as they were). Do NOT work around it by changing roles, grants or ownership: see the
-- README, "Re-running and partial execution".
-- ---------------------------------------------------------------------------------------------------------
do $$
declare
  v_tg text;
begin
  foreach v_tg in array array['on_auth_user_created', 'on_auth_user_email_changed', 'on_auth_user_deleted'] loop
    if exists (select 1
                 from pg_catalog.pg_trigger t
                 join pg_catalog.pg_class c      on c.oid = t.tgrelid
                 join pg_catalog.pg_namespace cs on cs.oid = c.relnamespace
                where cs.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal and t.tgname = v_tg) then
      begin
        execute format('drop trigger %I on auth.users', v_tg);
      exception when insufficient_privilege then
        raise exception 'MIGRATION STOPPED: the trigger % already exists on auth.users and this database role is not allowed to replace it (ownership of the managed table auth.users is required to replace a trigger). Nothing further was changed. Do not change roles or permissions; see the README section "Re-running and partial execution".', v_tg;
      end;
    end if;
  end loop;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_profile_email();

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function private.handle_user_deleted();
