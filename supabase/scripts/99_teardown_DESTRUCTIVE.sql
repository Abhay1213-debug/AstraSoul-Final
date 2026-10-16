-- =====================================================================================
-- 99  TEARDOWN  *** DESTRUCTIVE AND IRREVERSIBLE ***
--
--   >>>  NEVER RUN THIS DURING NORMAL SETUP, UPGRADES OR TROUBLESHOOTING.  <<<
--   >>>  It is for ONE situation only: starting over on a project that holds NO real data,   <<<
--   >>>  or deliberately erasing pilot data. There is NO UNDO (the Free plan has no point-in-time restore).   <<<
--
-- What it removes: the 12 Phase 1 tables and everything in them, this project's functions and triggers, its 5 types,
-- and the "private" schema IF AND ONLY IF it is then empty.
-- What it never touches: login accounts in auth.users, anything it did not create, and any object that does not carry
-- this project's marker comment. There is NO "cascade" anywhere in this file: if anything else depends on one of our
-- objects, the statement FAILS and everything is rolled back (the whole script is one statement).
--
-- THREE SAFEGUARDS, all of which must be satisfied (edit the two marked lines, nothing else):
--   1. v_confirm  must be exactly   DELETE ALL PHASE 1 DATA <today's date as YYYY-MM-DD, as the DATABASE sees it>
--      (find the date with:  select current_date;  ). Because the date is part of the phrase, a copy you edited
--      yesterday no longer works today.
--   2. If ANY of the tables holds rows, v_data_flag must ALSO be exactly   I UNDERSTAND THAT DATA WILL BE PERMANENTLY LOST
--      With empty tables it is not needed. The script reports only the number of rows, never their content.
--   3. Every table/type/function it would drop must carry this project's marker ('astrasoul:phase1').
-- After use, put both lines back to 'NO' before saving the file anywhere.
-- =====================================================================================
do $$
declare
  v_confirm   text := 'NO';    -- <-- EDIT 1: the confirmation phrase described above
  v_data_flag text := 'NO';    -- <-- EDIT 2: only needed when the tables contain rows
  c_marker    constant text := 'astrasoul:phase1';
  v_tables    text[] := array['audit_log', 'payments', 'request_notes', 'consultation_requests', 'consent_versions',
                              'staff_members', 'expert_services', 'experts', 'service_prices', 'services', 'app_settings', 'profiles'];
  v_t         text;
  v_n         bigint;
  v_rows      bigint := 0;
  v_tg        text;
begin
  if v_confirm <> 'DELETE ALL PHASE 1 DATA ' || to_char(current_date, 'YYYY-MM-DD') then
    raise exception 'Teardown refused: the confirmation phrase is missing or out of date. Nothing was deleted.';
  end if;

  -- safeguard 3: everything must be ours
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null
       and pg_catalog.obj_description(to_regclass('public.' || v_t), 'pg_class') is distinct from c_marker then
      raise exception 'Teardown refused: table public.% is not marked as part of this project. Nothing was deleted.', v_t;
    end if;
  end loop;

  -- safeguard 2: refuse while there is data
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('select count(*) from public.%I', v_t) into v_n;
      v_rows := v_rows + v_n;
    end if;
  end loop;
  if v_rows > 0 and v_data_flag <> 'I UNDERSTAND THAT DATA WILL BE PERMANENTLY LOST' then
    raise exception 'Teardown refused: the tables contain % rows in total. Nothing was deleted. (See the header of this file.)', v_rows;
  end if;

  -- triggers on auth.users, only if they call OUR functions
  foreach v_tg in array array['on_auth_user_created', 'on_auth_user_email_changed', 'on_auth_user_deleted'] loop
    if exists (select 1
                 from pg_catalog.pg_trigger t
                 join pg_catalog.pg_class c      on c.oid = t.tgrelid
                 join pg_catalog.pg_namespace cs on cs.oid = c.relnamespace
                 join pg_catalog.pg_proc p       on p.oid = t.tgfoid
                 join pg_catalog.pg_namespace ps on ps.oid = p.pronamespace
                where cs.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
                  and t.tgname = v_tg and ps.nspname = 'private') then
      execute format('drop trigger %I on auth.users', v_tg);
    end if;
  end loop;

  -- tables, children first (no cascade: a foreign dependent makes this fail safely)
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('drop table public.%I', v_t);
    end if;
  end loop;

  -- the four API functions (explicit signatures; only if marked as ours)
  if to_regprocedure('public.cancel_my_request(uuid)') is not null
     and pg_catalog.obj_description(to_regprocedure('public.cancel_my_request(uuid)'), 'pg_proc') = c_marker then
    drop function public.cancel_my_request(uuid);
  end if;
  if to_regprocedure('public.submit_payment_reference(uuid, text, text, date)') is not null
     and pg_catalog.obj_description(to_regprocedure('public.submit_payment_reference(uuid, text, text, date)'), 'pg_proc') = c_marker then
    drop function public.submit_payment_reference(uuid, text, text, date);
  end if;
  if to_regprocedure('public.verify_payment(uuid, text, integer, text)') is not null
     and pg_catalog.obj_description(to_regprocedure('public.verify_payment(uuid, text, integer, text)'), 'pg_proc') = c_marker then
    drop function public.verify_payment(uuid, text, integer, text);
  end if;
  if to_regprocedure('public.refund_payment(uuid, text)') is not null
     and pg_catalog.obj_description(to_regprocedure('public.refund_payment(uuid, text)'), 'pg_proc') = c_marker then
    drop function public.refund_payment(uuid, text);
  end if;

  -- this project's functions in schema private (explicit list)
  drop function if exists private.tg_audit();
  drop function if exists private.tg_audit_log_guard();
  drop function if exists private.tg_requests_cancel_flag();
  drop function if exists private.tg_payments_guard();
  drop function if exists private.tg_requests_before_insert();
  drop function if exists private.tg_requests_before_update();
  drop function if exists private.tg_staff_members_guard();
  drop function if exists private.tg_profiles_validate();
  drop function if exists private.tg_set_updated_by();
  drop function if exists private.tg_set_updated_at();
  drop function if exists private.handle_new_user();
  drop function if exists private.sync_profile_email();
  drop function if exists private.handle_user_deleted();
  drop function if exists private.anonymise_customer(uuid, boolean);
  drop function if exists private.confirmation_problem(uuid, text, public.consultation_mode);
  drop function if exists private.staff_expert_id();
  drop function if exists private.is_staff_account();
  drop function if exists private.is_admin();
  drop function if exists private.staff_role();
  drop function if exists private.mfa_session_ok(uuid);

  -- the schema only if nothing else lives in it (no cascade: if it is not empty this fails and nothing is removed)
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'private') then
    drop schema private;
  end if;

  -- types (no cascade; only ours)
  foreach v_t in array array['consultation_mode', 'request_status', 'payment_status', 'staff_role', 'dob_requirement'] loop
    if to_regtype('public.' || v_t) is not null
       and pg_catalog.obj_description(to_regtype('public.' || v_t)::oid, 'pg_type') = c_marker then
      execute format('drop type public.%I', v_t);
    end if;
  end loop;
end $$;
