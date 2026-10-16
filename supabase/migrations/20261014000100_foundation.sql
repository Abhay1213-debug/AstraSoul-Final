-- =====================================================================================
-- 0100  FOUNDATION
-- Creates: the non-API "private" schema, the enum types, and one shared trigger helper.
-- Creates NO tables and touches NO existing data. Safe to re-run.
--
-- SAFETY GUARDS (run first; if any fails the whole file stops and NOTHING is changed):
--   * the "private" schema may already exist ONLY if it holds nothing but this project's own functions;
--   * an enum type with one of our names may already exist ONLY if it is ours (marker comment) and unchanged.
-- A failure here means your project already contains something that looks like ours but is not. Do not "fix" it by
-- editing this file: send me the message (it lists object NAMES only, never data).
--
-- Why a "private" schema: SECURITY DEFINER helper functions live there so they can never be
-- called through the Data API (only the "public" schema is exposed). Keep it that way - see
-- supabase/README.md, "Dashboard settings".
-- =====================================================================================

-- ---- guard 1: the private schema must not already contain foreign objects ---------------------------------------
do $guard$
declare
  v_known   text[] := array[
    'tg_set_updated_at', 'mfa_session_ok', 'staff_role', 'is_admin', 'staff_expert_id', 'confirmation_problem',
    'handle_new_user', 'sync_profile_email', 'handle_user_deleted', 'tg_staff_members_guard', 'tg_requests_before_insert',
    'tg_requests_before_update', 'tg_payments_guard', 'tg_set_updated_by', 'tg_audit', 'tg_profiles_validate',
    'anonymise_customer', 'is_staff_account', 'tg_audit_log_guard', 'tg_requests_cancel_flag'];
  v_foreign text;
begin
  if exists (select 1 from pg_catalog.pg_namespace n where n.nspname = 'private') then
    select string_agg(x.name, ', ' order by x.name) into v_foreign
      from (
        select p.proname::text as name
          from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'private' and p.proname <> all (v_known)
        union all
        select c.relname::text
          from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
         where s.nspname = 'private' and c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
      ) x;
    if v_foreign is not null then
      raise exception 'MIGRATION STOPPED: the schema "private" already contains objects that are not part of this project: %. Nothing was changed.', v_foreign;
    end if;
  end if;
end
$guard$;

-- ---- guard 2: enum types with our names must be ours and unchanged ---------------------------------------------
do $guard$
declare
  r        record;
  v_oid    oid;
  v_labels text[];
begin
  for r in
    select * from (values
      ('consultation_mode', array['chat', 'voice', 'video']),
      ('request_status',    array['submitted', 'awaiting_confirmation', 'confirmed', 'completed', 'cancelled']),
      ('payment_status',    array['pending', 'succeeded', 'failed', 'refunded']),
      ('staff_role',        array['admin', 'staff']),
      ('dob_requirement',   array['required', 'optional', 'none'])
    ) as v(tname, labels)
  loop
    select t.oid into v_oid
      from pg_catalog.pg_type t join pg_catalog.pg_namespace s on s.oid = t.typnamespace
     where s.nspname = 'public' and t.typname = r.tname;
    if v_oid is not null then
      select array_agg(e.enumlabel::text order by e.enumsortorder) into v_labels from pg_catalog.pg_enum e where e.enumtypid = v_oid;
      if pg_catalog.obj_description(v_oid, 'pg_type') is distinct from 'astrasoul:phase1' or v_labels is distinct from r.labels then
        raise exception 'MIGRATION STOPPED: a type named public.% already exists and is not the one this project creates. Nothing was changed.', r.tname;
      end if;
    end if;
  end loop;
end
$guard$;

create schema if not exists private;

-- Nobody but the database owner may use the private schema, except logged-in users, who need USAGE
-- so that Row Level Security policies can call the helper functions that policies rely on.
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

comment on schema private is
  'Internal helpers (SECURITY DEFINER functions, trigger functions). Must NOT be listed under Data API exposed schemas.';

-- ---- enum types (re-run safe: an existing type was verified above and is left exactly as it is) --------------

do $$ begin
  create type public.consultation_mode as enum ('chat', 'voice', 'video');
  comment on type public.consultation_mode is 'astrasoul:phase1';
exception when duplicate_object then null; end $$;

do $$ begin
  -- NOTE: "refunded" is deliberately NOT a request status. Refunds belong to payments only.
  create type public.request_status as enum ('submitted', 'awaiting_confirmation', 'confirmed', 'completed', 'cancelled');
  comment on type public.request_status is 'astrasoul:phase1';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
  comment on type public.payment_status is 'astrasoul:phase1';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_role as enum ('admin', 'staff');
  comment on type public.staff_role is 'astrasoul:phase1';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dob_requirement as enum ('required', 'optional', 'none');
  comment on type public.dob_requirement is 'astrasoul:phase1';
exception when duplicate_object then null; end $$;

-- ---- shared trigger helper ------------------------------------------------------------------------------------

create or replace function private.tg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- a trigger function needs no EXECUTE right at run time (it is only checked when a trigger is created)
revoke all on function private.tg_set_updated_at() from public, anon, authenticated;
