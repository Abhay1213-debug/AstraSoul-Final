-- =====================================================================================================================
-- DATABASE ISOLATION TESTS  -  run AFTER migrations 0100-0600 (and the post-migration checks).
--
-- SAFE BY DESIGN: the whole script is ONE statement (a DO block) that creates fake users and data, runs the checks,
-- and then ALWAYS ends with an intentional error. An error rolls everything back, so NOTHING is saved: no fake users,
-- no requests, no payments, no audit rows. It touches no real data. It makes no network calls and creates no real
-- login accounts. THE ERROR AT THE END IS EXPECTED: read its text, it is the test report.
--
--   "ISOLATION TESTS FINISHED ... MODE: FULL ... FAILED: 0"   -> every check passed (see the limits below)
--   "... FAILED: <n>"                                          -> some checks failed; the report lists them (copy it to me)
--   "... MODE: REDUCED ..."                                    -> the managed auth tables refused the fake users; only the sections
--                                                                 that need no auth fixtures ran. The report says exactly which
--                                                                 sections were NOT tested. Use tests/REAL_SESSION_VALIDATION.md.
--   "SETUP FAILED: ..."                                        -> the script could not build its fake data (copy the message to me);
--                                                                 this means NOTHING was tested, not that something is insecure
--
-- THREE KINDS OF EVIDENCE - this file is only the middle one:
--   1. STATIC checks      (vitest, src/test/sqlMigrations.test.ts): read the SQL text. They prove conventions, never behaviour.
--   2. SIMULATED SQL tests (THIS FILE): set the same session values Supabase's API sets (the user id and the MFA level "aal"
--      inside the token claims) and switch to the "authenticated" / "anon" database roles. They test the DATABASE layer:
--      grants, Row Level Security, triggers, constraints, functions, audit logging.
--   3. REAL-SESSION tests (supabase/tests/REAL_SESSION_VALIDATION.md, done by a person): real logins through the live API,
--      real tokens, real MFA, two simultaneous connections. NOT done yet - nothing below claims them.
--
-- LIMITS OF THIS FILE (it cannot prove): that Supabase signs tokens and rejects forged ones, that real aal2 tokens carry
-- the claim we read, real signup/confirmation/reset/MFA flows, that the Data API exposes only "public", the error shapes
-- the website sees, Auth rate limits, and CONCURRENCY (it runs in one transaction, so it cannot race itself).
--
-- ABOUT THE FIXTURES: to make fake customers/staff it inserts rows directly into Supabase's managed tables auth.users and
-- auth.mfa_factors. Supabase does not promise that this works on every Auth version. If it fails the script does not
-- give up: it falls back to REDUCED mode (fake profiles only) and says clearly what was not tested.
--
-- Error checks look at the INTENDED LAYER, not just "some permission error":
--   "permission denied ..."                        -> a missing GRANT (table, column or function)
--   "new row violates row-level security ..."      -> a Row Level Security policy
--   AS401/AS403/AS409/AS422/AS429 + a code         -> one of our triggers/functions
-- =====================================================================================================================
do $test$
declare
  uA  uuid := gen_random_uuid();   -- customer A
  uB  uuid := gen_random_uuid();   -- customer B
  uC  uuid := gen_random_uuid();   -- customer C (rate-limit tests; blank display name)
  uD  uuid := gen_random_uuid();   -- customer D (explicit anonymisation test)
  uE  uuid := gen_random_uuid();   -- customer E (anonymisation by deleting the login)
  uS  uuid := gen_random_uuid();   -- staff login of expert X
  uS2 uuid := gen_random_uuid();   -- staff login of expert W
  uAD uuid := gen_random_uuid();   -- admin
  uM  uuid := gen_random_uuid();   -- second admin used for the MFA / last-admin / separation-of-duties tests
  eX uuid; eY uuid; eW uuid; eZ uuid;       -- experts: X active, Y inactive, W active (other service/mode), Z created by the admin test
  rA1 uuid; rA2 uuid; rA3 uuid; rA4 uuid; rB1 uuid; rB2 uuid; rC uuid; rD1 uuid; rE1 uuid; rAD uuid;
  pA uuid; pB uuid; pD uuid; pE uuid; pAD uuid; pP uuid;
  r text; v_cnt bigint; i int; j int; k int; v_loop_ok boolean;
  v_pass int; v_fail int; v_report text; v_mode text;
  v_auth_ok boolean := true;
  v_auth_err text := '';
  c_ref  constant text := 'UTRSENTINEL123456';
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_perm constant text := '^ERR:42501:permission denied';
  c_rls  constant text := '^ERR:42501:new row violates row-level security';
begin
  -- ---------------------------------------------------------------------------------------------------------------
  -- 0. Guard: the migrations must already be applied
  -- ---------------------------------------------------------------------------------------------------------------
  if to_regclass('public.consultation_requests') is null
     or to_regclass('public.consent_versions') is null
     or to_regprocedure('public.verify_payment(uuid,text,integer,text)') is null
     or to_regprocedure('public.submit_payment_reference(uuid,text,text,date)') is null
     or to_regprocedure('private.staff_role()') is null then
    raise exception 'SETUP FAILED: the migrations (0100-0600) have not been applied yet. Nothing was tested.';
  end if;

  -- ---------------------------------------------------------------------------------------------------------------
  -- 1. Helpers (temporary objects, discarded by the final rollback)
  -- ---------------------------------------------------------------------------------------------------------------
  execute $fn$ create temp table t_results (n serial, label text, passed boolean, detail text) $fn$;

  -- run one statement as: anon (p_uid null) or a logged-in user with the given MFA level; returns the first value
  -- of the statement as text, or 'ERR:<sqlstate>:<message>' if it failed. Always restores the owner role.
  execute $fn$
    create function pg_temp.run_as(p_uid uuid, p_aal text, p_stmt text, p_extra jsonb default '{}'::jsonb)
    returns text language plpgsql as $body$
    declare v text;
    begin
      perform set_config('request.jwt.claims',
        case when p_uid is null then ''
             else (jsonb_build_object('sub', p_uid::text, 'role', 'authenticated', 'aal', p_aal) || p_extra)::text end, true);
      perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
      if p_uid is null then set local role anon; else set local role authenticated; end if;
      begin
        -- statements that return a value use INTO; plain INSERT/UPDATE/DELETE (no RETURNING) must not
        if p_stmt ~* '^\s*(select|with)\M' or p_stmt ~* '\mreturning\M' then
          execute p_stmt into v;
          v := coalesce(v, 'OK');
        else
          execute p_stmt;
          v := 'OK';
        end if;
      exception when others then
        v := 'ERR:' || sqlstate || ':' || sqlerrm;
      end;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      return v;
    end $body$
  $fn$;

  -- same, but as the database owner (the SQL Editor), for setup and for owner-level rules
  execute $fn$
    create function pg_temp.run_pg(p_stmt text) returns text language plpgsql as $body$
    declare v text;
    begin
      begin
        if p_stmt ~* '^\s*(select|with)\M' or p_stmt ~* '\mreturning\M' then
          execute p_stmt into v;
          v := coalesce(v, 'OK');
        else
          execute p_stmt;
          v := 'OK';
        end if;
      exception when others then
        v := 'ERR:' || sqlstate || ':' || sqlerrm;
      end;
      return v;
    end $body$
  $fn$;

  -- record one check: passes when the actual text matches the expected regular expression
  execute $fn$
    create function pg_temp.ck(p_label text, p_actual text, p_expect text) returns void language plpgsql as $body$
    begin
      insert into pg_temp.t_results (label, passed, detail)
      values (p_label, coalesce(p_actual ~ p_expect, false),
              case when coalesce(p_actual ~ p_expect, false) then null
                   else 'got [' || left(coalesce(p_actual, '<null>'), 150) || '] expected ~ ' || p_expect end);
    end $body$
  $fn$;

  execute $fn$
    create function pg_temp.uid_of(p text) returns uuid language sql immutable as $body$
      select case when p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
    $body$
  $fn$;

  -- Compares the EXACT set of "table.column:privilege" pairs a role holds with the expected list. 'exact' = identical.
  execute $fn$
    create function pg_temp.priv_diff(p_role text, p_privs text[], p_expected text[]) returns text language plpgsql as $body$
    declare v_actual text[]; v_extra text; v_missing text;
    begin
      select coalesce(array_agg(x.item), '{}'::text[]) into v_actual from (
        select t.tb || '.' || a.attname::text || ':' || p.pr as item
          from unnest(array['profiles','staff_members','services','service_prices','experts','expert_services','consent_versions',
                            'consultation_requests','request_notes','payments','app_settings','audit_log']) as t(tb)
          join pg_catalog.pg_attribute a on a.attrelid = ('public.' || t.tb)::regclass and a.attnum > 0 and not a.attisdropped
          cross join unnest(p_privs) as p(pr)
         where has_column_privilege(p_role::name, 'public.' || t.tb, a.attname::text, p.pr)
      ) x;
      select string_agg(i, ', ' order by i) into v_extra   from unnest(v_actual)   as i where i <> all (p_expected);
      select string_agg(i, ', ' order by i) into v_missing from unnest(p_expected) as i where i <> all (v_actual);
      return case when v_extra is null and v_missing is null then 'exact'
                  else 'EXTRA: ' || coalesce(v_extra, '-') || ' | MISSING: ' || coalesce(v_missing, '-') end;
    end $body$
  $fn$;

  -- ---------------------------------------------------------------------------------------------------------------
  -- 2. Fixtures: fake users, MFA factors, staff roles, experts (all rolled back at the end)
  -- ---------------------------------------------------------------------------------------------------------------
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data) values
      (uA,  'authenticated', 'authenticated', 'test-a-'  || uA  || '@example.invalid', '{"full_name":"Customer A"}'),
      (uB,  'authenticated', 'authenticated', 'test-b-'  || uB  || '@example.invalid', '{"full_name":"Customer B"}'),
      (uC,  'authenticated', 'authenticated', 'test-c-'  || uC  || '@example.invalid', '{"full_name":"  "}'),
      (uD,  'authenticated', 'authenticated', 'test-d-'  || uD  || '@example.invalid', '{"full_name":"Customer D"}'),
      (uE,  'authenticated', 'authenticated', 'test-e-'  || uE  || '@example.invalid', '{"full_name":"Customer E"}'),
      (uS,  'authenticated', 'authenticated', 'test-s-'  || uS  || '@example.invalid', '{"full_name":"Staff S"}'),
      (uS2, 'authenticated', 'authenticated', 'test-s2-' || uS2 || '@example.invalid', '{"full_name":"Staff S2"}'),
      (uAD, 'authenticated', 'authenticated', 'test-ad-' || uAD || '@example.invalid', '{"full_name":"Admin AD"}'),
      (uM,  'authenticated', 'authenticated', 'test-m-'  || uM  || '@example.invalid', '{"full_name":"Admin M"}');

    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
      (gen_random_uuid(), uS,  'test', 'totp', 'verified', now(), now()),
      (gen_random_uuid(), uS2, 'test', 'totp', 'verified', now(), now()),
      (gen_random_uuid(), uAD, 'test', 'totp', 'verified', now(), now());
  exception when others then
    v_auth_ok := false;
    v_auth_err := sqlstate || ': ' || sqlerrm;    -- fake data only, never customer data
  end;

  begin
    if not v_auth_ok then
      -- REDUCED mode: no rows in the managed auth tables; the profiles are created directly (profiles has no foreign key to auth.users)
      insert into public.profiles (id, email, full_name) values
        (uA, 'test-a@example.invalid', 'Customer A'),
        (uB, 'test-b@example.invalid', 'Customer B'),
        (uC, 'test-c@example.invalid', 'Customer C');
    end if;

    insert into public.consent_versions (version) values ('v1');

    insert into public.experts (display_name, bio, modes, active) values ('Test Expert X', 'fixture', array['chat','voice']::public.consultation_mode[], true)  returning id into eX;
    insert into public.experts (display_name, bio, modes, active) values ('Test Expert Y', 'fixture', array['chat','voice','video']::public.consultation_mode[], false) returning id into eY;
    insert into public.experts (display_name, bio, modes, active) values ('Test Expert W', 'fixture', array['chat']::public.consultation_mode[], true)  returning id into eW;
    insert into public.expert_services (expert_id, service_slug) values
      (eX, 'numerology'), (eX, 'gemstone-guidance'), (eY, 'numerology'), (eW, 'palmistry');

    if v_auth_ok then
      insert into public.staff_members (user_id, role, expert_id) values (uS, 'staff', eX), (uS2, 'staff', eW), (uAD, 'admin', null);
    end if;
  exception when others then
    raise exception 'SETUP FAILED while building fake test data: [%] %  (nothing was tested; copy this message to me)', sqlstate, sqlerrm;
  end;

  -- ---------------------------------------------------------------------------------------------------------------
  -- G. Structure checks (as the owner): grants, RLS flags, function hardening.   [runs in both modes]
  -- ---------------------------------------------------------------------------------------------------------------
  perform pg_temp.ck('G1  RLS enabled on all 12 tables',
    (select count(*)::text from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        and c.relname in ('profiles','staff_members','services','service_prices','experts','expert_services','consent_versions','consultation_requests','request_notes','payments','app_settings','audit_log')), '^0$');
  perform pg_temp.ck('G2  anon has NO privilege at all (table OR column level) on the sensitive tables',
    (select count(*)::text from unnest(array['profiles','staff_members','consent_versions','consultation_requests','request_notes','payments','app_settings','audit_log']) t(tb)
       cross join unnest(array['select','insert','update','references']) p(pr)
      where has_any_column_privilege('anon', 'public.' || tb, pr))
    || '/' ||
    (select count(*)::text from unnest(array['profiles','staff_members','consent_versions','consultation_requests','request_notes','payments','app_settings','audit_log']) t(tb)
       cross join unnest(array['delete','truncate','trigger']) p(pr)
      where has_table_privilege('anon', 'public.' || tb, pr)), '^0/0$');
  perform pg_temp.ck('G3  anon cannot write the public reference tables',
    (select count(*)::text from unnest(array['services','service_prices','experts','expert_services']) t(tb)
       cross join unnest(array['insert','update']) p(pr)
      where has_any_column_privilege('anon', 'public.' || tb, pr))
    || '/' ||
    (select count(*)::text from unnest(array['services','service_prices','experts','expert_services']) t(tb)
       cross join unnest(array['delete','truncate']) p(pr)
      where has_table_privilege('anon', 'public.' || tb, pr)), '^0/0$');
  perform pg_temp.ck('G4  authenticated has no DELETE/TRUNCATE anywhere except DELETE on expert_services',
    (select count(*)::text from unnest(array['profiles','staff_members','services','service_prices','experts','consent_versions','consultation_requests','request_notes','payments','app_settings','audit_log']) t(tb)
       cross join unnest(array['delete','truncate']) p(pr)
      where has_table_privilege('authenticated', 'public.' || tb, pr)), '^0$');
  perform pg_temp.ck('G5  authenticated has no table-level INSERT on sensitive tables (only listed columns where intended)',
    (select count(*)::text from unnest(array['payments','staff_members','audit_log','profiles','services','service_prices','consent_versions','consultation_requests','request_notes','app_settings']) t(tb)
      where has_table_privilege('authenticated', 'public.' || tb, 'insert')), '^0$');
  perform pg_temp.ck('G6  authenticated has no UPDATE (any column) on payments, staff_members, audit_log, request_notes, consent_versions',
    (select count(*)::text from unnest(array['payments','staff_members','audit_log','request_notes','consent_versions']) t(tb)
      where has_any_column_privilege('authenticated', 'public.' || tb, 'update')), '^0$');
  perform pg_temp.ck('G7  the EXACT set of columns authenticated may INSERT/UPDATE (anything extra or missing is listed)',
    pg_temp.priv_diff('authenticated', array['insert','update'], array[
      'experts.display_name:insert','experts.bio:insert','experts.languages:insert','experts.modes:insert','experts.availability_note:insert','experts.active:insert',
      'expert_services.expert_id:insert','expert_services.service_slug:insert',
      'consultation_requests.service_slug:insert','consultation_requests.mode:insert','consultation_requests.concern:insert',
      'consultation_requests.date_of_birth:insert','consultation_requests.preferred_language:insert','consultation_requests.consent_version:insert',
      'request_notes.request_id:insert','request_notes.body:insert',
      'app_settings.key:insert','app_settings.value:insert',
      'services.name:update','services.active:update','services.display_order:update',
      'service_prices.amount_minor:update',
      'experts.display_name:update','experts.bio:update','experts.languages:update','experts.modes:update','experts.availability_note:update','experts.active:update',
      'profiles.full_name:update','profiles.phone:update','profiles.date_of_birth:update','profiles.preferred_language:update',
      'consultation_requests.status:update','consultation_requests.assigned_expert_id:update','consultation_requests.scheduled_at:update','consultation_requests.meeting_link:update',
      'app_settings.value:update']), '^exact$');
  perform pg_temp.ck('G8  the EXACT set of columns anon may read (and nothing it may write)',
    pg_temp.priv_diff('anon', array['select','insert','update'], array[
      'services.slug:select','services.name:select','services.dob_requirement:select','services.active:select','services.display_order:select','services.updated_at:select',
      'service_prices.service_slug:select','service_prices.mode:select','service_prices.amount_minor:select','service_prices.currency:select','service_prices.updated_at:select',
      'experts.id:select','experts.display_name:select','experts.bio:select','experts.languages:select','experts.modes:select','experts.availability_note:select','experts.active:select','experts.created_at:select','experts.updated_at:select',
      'expert_services.expert_id:select','expert_services.service_slug:select']), '^exact$');
  perform pg_temp.ck('G9  staff/admin identifier columns are not readable by any API role',
    (select count(*)::text from (values ('payments','submitted_by'),('payments','verified_by'),('payments','refunded_by'),
                                         ('service_prices','updated_by'),('app_settings','updated_by'),('staff_members','created_by'),('request_notes','author_id')) v(tb, col)
      where has_column_privilege('authenticated', 'public.' || tb, col, 'select') or has_column_privilege('anon', 'public.' || tb, col, 'select')), '^0$');
  perform pg_temp.ck('G10 every SECURITY DEFINER function of ours pins search_path',
    (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where p.prosecdef
        and (s.nspname = 'private' or (s.nspname = 'public' and p.proname in ('cancel_my_request','submit_payment_reference','verify_payment','refund_payment')))
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), '^0$');
  perform pg_temp.ck('G11 anon cannot execute any public RPC function',
    (select count(*)::text from unnest(array['public.cancel_my_request(uuid)','public.submit_payment_reference(uuid,text,text,date)','public.verify_payment(uuid,text,integer,text)','public.refund_payment(uuid,text)']) f
      where has_function_privilege('anon', f, 'execute')), '^0$');
  perform pg_temp.ck('G12 authenticated can execute the four RPC functions',
    (select count(*)::text from unnest(array['public.cancel_my_request(uuid)','public.submit_payment_reference(uuid,text,text,date)','public.verify_payment(uuid,text,integer,text)','public.refund_payment(uuid,text)']) f
      where has_function_privilege('authenticated', f, 'execute')), '^4$');
  perform pg_temp.ck('G13 private schema is not usable by anon',
    has_schema_privilege('anon', 'private', 'usage')::text, '^false$');
  perform pg_temp.ck('G14 no write policy is "true" (open to everyone)',
    (select count(*)::text from pg_policies where schemaname = 'public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
        and (btrim(coalesce(qual, ''), '() ') = 'true' or btrim(coalesce(with_check, ''), '() ') = 'true')), '^0$');
  perform pg_temp.ck('G15 audit_log has no policy that allows writes',
    (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd <> 'SELECT'), '^0$');
  perform pg_temp.ck('G16 of the functions in schema private, API roles may execute ONLY the five policy helpers',
    (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'private' and p.proname not in ('staff_role','is_admin','is_staff_account','staff_expert_id','confirmation_problem')
        and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))), '^0$');
  perform pg_temp.ck('G17 nobody but the owner can execute the anonymisation function',
    (has_function_privilege('authenticated', 'private.anonymise_customer(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'private.anonymise_customer(uuid,boolean)', 'execute'))::text, '^false$');
  perform pg_temp.ck('G18 "refunded" does not exist as a consultation status',
    (select count(*)::text from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'request_status' and e.enumlabel = 'refunded'), '^0$');

  perform pg_temp.ck('G19 audit_log is protected by an UPDATE/DELETE trigger and a TRUNCATE trigger',
    (select count(*)::text from pg_trigger t where t.tgrelid = 'public.audit_log'::regclass and not t.tgisinternal
        and t.tgname in ('audit_log_no_change', 'audit_log_no_truncate') and t.tgenabled = 'O'), '^2$');
  perform pg_temp.ck('G20 the cancellation flag trigger is installed and enabled',
    (select count(*)::text from pg_trigger t where t.tgrelid = 'public.consultation_requests'::regclass and not t.tgisinternal
        and t.tgname = 'requests_cancel_flag' and t.tgenabled = 'O'), '^1$');

  perform pg_temp.ck('G21 the payment-reference index is UNIQUE, valid, and spends pending, succeeded AND refunded references (not failed)',
    (select count(*)::text from pg_index ix join pg_class i on i.oid = ix.indexrelid
      where i.relname = 'payments_reference_active' and ix.indrelid = 'public.payments'::regclass and ix.indisunique and ix.indisvalid
        and pg_get_expr(ix.indpred, ix.indrelid) ~ 'pending' and pg_get_expr(ix.indpred, ix.indrelid) ~ 'succeeded'
        and pg_get_expr(ix.indpred, ix.indrelid) ~ 'refunded' and pg_get_expr(ix.indpred, ix.indrelid) !~ 'failed'), '^1$');
  perform pg_temp.ck('G22 the one-pending-claim-per-request index is UNIQUE, valid, and covers only pending claims',
    (select count(*)::text from pg_index ix join pg_class i on i.oid = ix.indexrelid
      where i.relname = 'payments_one_pending_per_request' and ix.indrelid = 'public.payments'::regclass and ix.indisunique and ix.indisvalid
        and pg_get_expr(ix.indpred, ix.indrelid) ~ 'pending' and pg_get_expr(ix.indpred, ix.indrelid) !~ 'succeeded|failed|refunded'), '^1$');

  -- ---------------------------------------------------------------------------------------------------------------
  -- P. Profiles and the signup trigger
  -- ---------------------------------------------------------------------------------------------------------------
  if v_auth_ok then
    perform pg_temp.ck('P1  a profile row was created automatically for each new account',
      (select count(*)::text from public.profiles where id in (uA, uB, uC, uD, uE, uS, uS2, uAD, uM)), '^9$');
    perform pg_temp.ck('P2  a blank display name falls back to the email name (signup can never fail on a bad name)',
      (select full_name from public.profiles where id = uC), '^test-c-');
  end if;
  perform pg_temp.ck('P3  customer A sees exactly one profile: their own',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.profiles'), '^1$');
  perform pg_temp.ck('P4  customer A cannot read customer B''s profile',
    pg_temp.run_as(uA, 'aal1', format($q$ select count(*)::text from public.profiles where id = %L $q$, uB)), '^0$');
  perform pg_temp.ck('P5  customer A can update their own phone',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.profiles set phone = '+91 90000 11111' where id = %L returning 1) select count(*)::text from u $q$, uA)), '^1$');
  perform pg_temp.ck('P6  customer A cannot change their own email (missing column grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.profiles set email = 'x@example.invalid' where id = %L returning 1) select count(*)::text from u $q$, uA)), c_perm);
  perform pg_temp.ck('P7  customer A cannot update customer B''s profile (policy hides the row)',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.profiles set full_name = 'Hacked Name' where id = %L returning 1) select count(*)::text from u $q$, uB)), '^0$');
  perform pg_temp.ck('P7b ...and B''s name really is unchanged',
    (select full_name from public.profiles where id = uB), '^Customer B$');
  perform pg_temp.ck('P8  customer A cannot insert a profile (missing grant)',
    pg_temp.run_as(uA, 'aal1', $q$ with i as (insert into public.profiles (id, full_name) values (gen_random_uuid(), 'Fake Person') returning 1) select count(*)::text from i $q$), c_perm);
  perform pg_temp.ck('P9  customer A cannot delete their profile (missing grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ with d as (delete from public.profiles where id = %L returning 1) select count(*)::text from d $q$, uA)), c_perm);
  perform pg_temp.ck('P10 anonymous visitors cannot read profiles (missing grant)',
    pg_temp.run_as(null, null, 'select count(*)::text from public.profiles'), c_perm);
  perform pg_temp.ck('P11 an invalid phone number is rejected with a generic code',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.profiles set phone = 'abc' where id = %L returning 1) select count(*)::text from u $q$, uA)), '^ERR:AS422:invalid_phone$');
  perform pg_temp.ck('P12 a one-character name is rejected with a generic code',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.profiles set full_name = 'A' where id = %L returning 1) select count(*)::text from u $q$, uA)), '^ERR:AS422:invalid_name$');
  perform pg_temp.ck('P13 a future date of birth is rejected with a generic code',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.profiles set date_of_birth = current_date + 1 where id = %L returning 1) select count(*)::text from u $q$, uA)), '^ERR:AS422:invalid_date_of_birth$');
  perform pg_temp.ck('P14 a customer cannot change anonymised_at (missing column grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.profiles set anonymised_at = now() where id = %L returning 1) select count(*)::text from u $q$, uA)), c_perm);
  perform pg_temp.ck('P15 a customer claiming MFA (aal2) is still just a customer (sees only themselves)',
    pg_temp.run_as(uA, 'aal2', 'select count(*)::text from public.profiles'), '^1$');
  perform pg_temp.ck('P16 fake "admin" values in user_metadata / app_metadata grant nothing',
    pg_temp.run_as(uA, 'aal2', 'select count(*)::text from public.profiles',
      '{"user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"},"role":"authenticated"}'::jsonb), '^1$');
  if v_auth_ok then
    perform pg_temp.ck('P17 staff WITH MFA (aal2) cannot read customer profiles at all (staff have no profile access)',
      pg_temp.run_as(uS, 'aal2', format($q$ select count(*)::text from public.profiles where id = %L $q$, uA)), '^0$');
    perform pg_temp.ck('P18 an admin WITH MFA can read another person''s profile',
      pg_temp.run_as(uAD, 'aal2', format($q$ select count(*)::text from public.profiles where id = %L $q$, uA)), '^1$');
    perform pg_temp.ck('P19 the same admin WITHOUT MFA (aal1) can read nothing',
      pg_temp.run_as(uAD, 'aal1', format($q$ select count(*)::text from public.profiles where id = %L $q$, uA)), '^0$');
  end if;

  -- ---------------------------------------------------------------------------------------------------------------
  -- R. Consultation requests: ownership, forced state, validation, consent versions, anti-spam
  -- ---------------------------------------------------------------------------------------------------------------
  r := pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology', 'chat', 'TEST-CONCERN-SENTINEL-7Q2 I would like guidance on my direction', date '1990-03-29', 'v1') returning id::text $q$);
  perform pg_temp.ck('R1  customer A can create a request', r, c_uuid);
  rA1 := pg_temp.uid_of(r);
  perform pg_temp.ck('R2  it starts as "submitted", owned by A, with A''s name copied from the profile',
    (select status::text || '/' || (customer_id = uA)::text || '/' || customer_name from public.consultation_requests where id = rA1), '^submitted/true/Customer A$');
  perform pg_temp.ck('R3  a customer cannot set the status on insert (missing column grant)',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version, status)
        values ('numerology','chat','a perfectly valid concern text', date '1990-03-29','v1','confirmed') returning id::text $q$), c_perm);
  perform pg_temp.ck('R4  a customer cannot create a request for someone else (missing column grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ insert into public.consultation_requests (customer_id, service_slug, mode, concern, date_of_birth, consent_version)
        values (%L,'numerology','chat','a perfectly valid concern text', date '1990-03-29','v1') returning id::text $q$, uB)), c_perm);
  perform pg_temp.ck('R5  a customer cannot pre-assign an expert (missing column grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version, assigned_expert_id)
        values ('numerology','chat','a perfectly valid concern text', date '1990-03-29','v1', %L) returning id::text $q$, eX)), c_perm);
  perform pg_temp.ck('R5b a customer cannot choose the stored customer name (missing column grant)',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version, customer_name)
        values ('numerology','chat','a perfectly valid concern text', date '1990-03-29','v1', 'Somebody Else') returning id::text $q$), c_perm);
  perform pg_temp.ck('R6  numerology without a date of birth is refused',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, consent_version)
        values ('numerology','chat','a perfectly valid concern text','v1') returning id::text $q$), '^ERR:AS422:date_of_birth_required$');
  perform pg_temp.ck('R7  a too-short concern is refused with a generic code (no row echo)',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','short', date '1990-03-29','v1') returning id::text $q$), '^ERR:AS422:invalid_concern$');
  perform pg_temp.ck('R7b a future date of birth on a request is refused with a generic code',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','a perfectly valid concern text', current_date + 5,'v1') returning id::text $q$), '^ERR:AS422:invalid_date_of_birth$');
  perform pg_temp.ck('R8  an unknown service is refused',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('astrology','chat','a perfectly valid concern text', date '1990-03-29','v1') returning id::text $q$), '^ERR:AS422:service_unavailable$');
  perform pg_temp.ck('R8b a consent version that was never approved is refused',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','a perfectly valid concern text', date '1990-03-29','v999') returning id::text $q$), '^ERR:AS422:consent_version_invalid$');
  perform pg_temp.ck('R8c a blank consent version is refused',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','a perfectly valid concern text', date '1990-03-29','   ') returning id::text $q$), '^ERR:AS422:consent_version_invalid$');
  perform pg_temp.ck('R9  anonymous visitors cannot create requests (missing grant)',
    pg_temp.run_as(null, null, $q$ insert into public.consultation_requests (service_slug, mode, concern, consent_version)
        values ('palmistry','chat','a perfectly valid concern text','v1') returning id::text $q$), c_perm);
  perform pg_temp.ck('R9b an "anonymous sign-in" session (is_anonymous) cannot create requests even though it is authenticated',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','a perfectly valid concern text', date '1990-03-29','v1') returning id::text $q$,
      '{"is_anonymous": true}'::jsonb), '^ERR:AS403:forbidden$');

  -- inactive service
  perform pg_temp.run_pg($q$ update public.services set active = false where slug = 'color-therapy' $q$);
  perform pg_temp.ck('R10 an inactive service cannot be requested',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, consent_version)
        values ('color-therapy','chat','a perfectly valid concern text','v1') returning id::text $q$), '^ERR:AS422:service_unavailable$');
  perform pg_temp.ck('R11 anonymous visitors do not see the inactive service',
    pg_temp.run_as(null, null, $q$ select count(*)::text from public.services where slug = 'color-therapy' $q$), '^0$');
  if v_auth_ok then
    perform pg_temp.ck('R12 an admin (MFA) does see the inactive service',
      pg_temp.run_as(uAD, 'aal2', $q$ select count(*)::text from public.services where slug = 'color-therapy' $q$), '^1$');
  end if;
  perform pg_temp.run_pg($q$ update public.services set active = true where slug = 'color-therapy' $q$);

  -- B creates requests (palmistry: date of birth optional)
  r := pg_temp.run_as(uB, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','B concern text about career direction', date '1985-07-12','v1') returning id::text $q$);
  perform pg_temp.ck('R13 customer B can create a request', r, c_uuid);   rB1 := pg_temp.uid_of(r);
  r := pg_temp.run_as(uB, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, consent_version)
        values ('palmistry','video','B palmistry concern without a birth date','v1') returning id::text $q$);
  perform pg_temp.ck('R14 palmistry works without a date of birth (it is optional)', r, c_uuid);   rB2 := pg_temp.uid_of(r);

  perform pg_temp.ck('R15 customer A sees only their own request',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.consultation_requests'), '^1$');
  perform pg_temp.ck('R16 customer B sees only their own two requests',
    pg_temp.run_as(uB, 'aal1', 'select count(*)::text from public.consultation_requests'), '^2$');
  perform pg_temp.ck('R17 customer A cannot read B''s request by id',
    pg_temp.run_as(uA, 'aal1', format($q$ select count(*)::text from public.consultation_requests where id = %L $q$, rB1)), '^0$');
  perform pg_temp.ck('R18 anonymous visitors cannot read requests (missing grant)',
    pg_temp.run_as(null, null, 'select count(*)::text from public.consultation_requests'), c_perm);
  perform pg_temp.ck('R19 customer A cannot change their own request status directly (no update policy: 0 rows)',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.consultation_requests set status = 'confirmed' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^0$');
  perform pg_temp.ck('R20 ...and the status really is unchanged',
    (select status::text from public.consultation_requests where id = rA1), '^submitted$');
  perform pg_temp.ck('R21 customer A cannot change B''s request (0 rows)',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.consultation_requests set status = 'cancelled' where id = %L returning 1) select count(*)::text from u $q$, rB1)), '^0$');
  perform pg_temp.ck('R21b ...and B''s request really is unchanged',
    (select status::text from public.consultation_requests where id = rB1), '^submitted$');
  perform pg_temp.ck('R21c customer A cannot set B''s expert or meeting link either (0 rows)',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.consultation_requests set assigned_expert_id = %L, meeting_link = 'https://x.example.invalid/a' where id = %L returning 1) select count(*)::text from u $q$, eX, rB1)), '^0$');
  perform pg_temp.ck('R22 customer A cannot edit what they submitted (missing column grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ with u as (update public.consultation_requests set concern = 'rewritten concern text' where id = %L returning 1) select count(*)::text from u $q$, rA1)), c_perm);
  perform pg_temp.ck('R23 customer A cannot delete requests (missing grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ with d as (delete from public.consultation_requests where id = %L returning 1) select count(*)::text from d $q$, rA1)), c_perm);

  -- anti-spam: at most 3 OPEN requests
  r := pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('gemstone-guidance','voice','A second concern about gemstones', date '1990-03-29','v1') returning id::text $q$);
  perform pg_temp.ck('R24 A''s 2nd open request is accepted', r, c_uuid);   rA2 := pg_temp.uid_of(r);
  r := pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','voice','A third concern about direction', date '1990-03-29','v1') returning id::text $q$);
  perform pg_temp.ck('R25 A''s 3rd open request is accepted', r, c_uuid);   rA3 := pg_temp.uid_of(r);
  perform pg_temp.ck('R26 A''s 4th open request is REFUSED by the database (limit 3 open)',
    pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','A fourth concern that must be refused', date '1990-03-29','v1') returning id::text $q$), '^ERR:AS429:too_many_open_requests$');
  perform pg_temp.ck('R27 B is not affected by A''s limit',
    (select count(*)::text from public.consultation_requests where customer_id = uB), '^2$');
  perform pg_temp.ck('R27b a MULTI-ROW insert cannot slip past the open limit (B has 2 open; inserting 2 more in one statement must fail as a whole)',
    pg_temp.run_as(uB, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','multi row insert number one', date '1985-07-12','v1'),
               ('numerology','voice','multi row insert number two', date '1985-07-12','v1') returning id::text $q$), '^ERR:AS429:too_many_open_requests$');
  perform pg_temp.ck('R27c ...and none of the rows was stored',
    (select count(*)::text from public.consultation_requests where customer_id = uB), '^2$');

  -- cancel through the function
  perform pg_temp.ck('C1  B cannot cancel A''s request (generic answer)',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, rA3)), '^ERR:AS409:cannot_cancel$');
  perform pg_temp.ck('C2  anonymous visitors cannot call cancel_my_request (missing function grant)',
    pg_temp.run_as(null, null, format($q$ select public.cancel_my_request(%L)::text $q$, rA3)), c_perm);
  perform pg_temp.ck('C3  A can cancel their own submitted request',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, rA3)), '^(OK|)$');
  perform pg_temp.ck('C4  ...it is now cancelled',
    (select status::text from public.consultation_requests where id = rA3), '^cancelled$');
  perform pg_temp.ck('C5  cancelling twice is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, rA3)), '^ERR:AS409:cannot_cancel$');
  r := pg_temp.run_as(uA, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','video','Replacement concern after cancelling', date '1990-03-29','v1') returning id::text $q$);
  perform pg_temp.ck('C6  after cancelling, A may open a new request (open count dropped to 2)', r, c_uuid);   rA4 := pg_temp.uid_of(r);

  -- anti-spam: at most 10 requests per rolling 24 hours (cancelled ones still count; customers cannot delete rows)
  r := pg_temp.run_as(uC, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','C first request for rate limit test', date '1992-01-01','v1') returning id::text $q$);
  perform pg_temp.ck('RL1 customer C can create a request', r, c_uuid);   rC := pg_temp.uid_of(r);
  perform pg_temp.run_as(uC, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, rC));
  k := 1;
  for j in 1..9 loop
    r := pg_temp.run_as(uC, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
          values ('numerology','chat','C repeated request for rate limit test', date '1992-01-01','v1') returning id::text $q$);
    if pg_temp.uid_of(r) is null then exit; end if;
    k := k + 1;
    perform pg_temp.run_as(uC, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, pg_temp.uid_of(r)));
  end loop;
  perform pg_temp.ck('RL2 C was allowed exactly 10 requests in 24 hours (cancelling in between)', k::text, '^10$');
  perform pg_temp.ck('RL3 the 11th request is REFUSED even though none is open (limit 10 per 24h)',
    pg_temp.run_as(uC, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','C eleventh request must be refused', date '1992-01-01','v1') returning id::text $q$), '^ERR:AS429:too_many_requests_24h$');

  -- ================================================================================================================
  -- Everything below needs staff/admin fixtures in the managed auth tables (FULL mode only)
  -- ================================================================================================================
  if v_auth_ok then

  -- ---------------------------------------------------------------------------------------------------------------
  -- S. Admin and staff: who sees what, who may change what
  -- ---------------------------------------------------------------------------------------------------------------
  select count(*) into v_cnt from public.consultation_requests;
  perform pg_temp.ck('S1  an admin with MFA sees every request',
    pg_temp.run_as(uAD, 'aal2', 'select count(*)::text from public.consultation_requests'), '^' || v_cnt || '$');
  perform pg_temp.ck('S2  the same admin without MFA sees none',
    pg_temp.run_as(uAD, 'aal1', 'select count(*)::text from public.consultation_requests'), '^0$');
  perform pg_temp.ck('S3  staff S (expert X) sees NO request before one is assigned to X',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.consultation_requests'), '^0$');
  perform pg_temp.ck('S4  staff cannot move an unassigned request (0 rows: the policy hides it)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'awaiting_confirmation' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^0$');
  perform pg_temp.ck('S5  an admin cannot move a request submitted -> completed (invalid jump)',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'completed' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^ERR:AS409:invalid_status_transition$');
  perform pg_temp.ck('S6  an admin can move submitted -> awaiting_confirmation',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'awaiting_confirmation' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^1$');
  perform pg_temp.ck('S7  confirming without an expert and a time is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'confirmed' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^ERR:AS422:expert_and_schedule_required$');
  perform pg_temp.ck('S8  confirming with an INACTIVE expert is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'confirmed', assigned_expert_id = %L, scheduled_at = now() + interval '2 days' where id = %L returning 1) select count(*)::text from u $q$, eY, rA1)), '^ERR:AS409:expert_unavailable$');
  perform pg_temp.ck('S9  confirming with an expert who does NOT offer the service is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'confirmed', assigned_expert_id = %L, scheduled_at = now() + interval '2 days' where id = %L returning 1) select count(*)::text from u $q$, eW, rA1)), '^ERR:AS409:expert_service_mismatch$');
  perform pg_temp.ck('S10 confirming with a time in the past is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'confirmed', assigned_expert_id = %L, scheduled_at = now() - interval '2 days' where id = %L returning 1) select count(*)::text from u $q$, eX, rA1)), '^ERR:AS422:schedule_in_past$');
  perform pg_temp.ck('S11 confirming with an active expert who offers the service and mode, at a future time, works (payment is NOT required)',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'confirmed', assigned_expert_id = %L, scheduled_at = now() + interval '2 days' where id = %L returning 1) select count(*)::text from u $q$, eX, rA1)), '^1$');
  perform pg_temp.ck('S12 staff S now sees that request (it is assigned to expert X)',
    pg_temp.run_as(uS, 'aal2', format($q$ select count(*)::text from public.consultation_requests where id = %L $q$, rA1)), '^1$');
  perform pg_temp.ck('S13 ...and ONLY that one (staff see nothing that is not assigned to them)',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.consultation_requests'), '^1$');
  perform pg_temp.ck('S14 staff S2 (expert W) cannot see it',
    pg_temp.run_as(uS2, 'aal2', format($q$ select count(*)::text from public.consultation_requests where id = %L $q$, rA1)), '^0$');
  perform pg_temp.ck('S15 staff S can add the meeting link to their confirmed request',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set meeting_link = 'https://meet.example.invalid/sentinel-xyz' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^1$');
  perform pg_temp.ck('S16 a non-https meeting link is refused (table constraint)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set meeting_link = 'http://insecure.example.invalid/x' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^ERR:23514');
  perform pg_temp.ck('S17 staff S2 cannot touch it (0 rows)',
    pg_temp.run_as(uS2, 'aal2', format($q$ with u as (update public.consultation_requests set meeting_link = 'https://meet.example.invalid/other' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^0$');
  perform pg_temp.ck('S18 staff cannot reassign the expert (trigger)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set assigned_expert_id = %L where id = %L returning 1) select count(*)::text from u $q$, eW, rA1)), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('S19 staff cannot reschedule (trigger)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set scheduled_at = now() + interval '9 days' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('S20 staff cannot cancel a request (trigger)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'cancelled' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('S21 staff cannot edit what the customer submitted (missing column grant)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set concern = 'edited by staff text' where id = %L returning 1) select count(*)::text from u $q$, rA1)), c_perm);
  perform pg_temp.ck('S22 staff cannot reassign a request to another customer (missing column grant)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set customer_id = %L where id = %L returning 1) select count(*)::text from u $q$, uB, rA1)), c_perm);
  perform pg_temp.ck('S23 staff cannot change the stored customer name (missing column grant)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set customer_name = 'Renamed' where id = %L returning 1) select count(*)::text from u $q$, rA1)), c_perm);
  perform pg_temp.ck('S24 customer A cannot cancel once the request is confirmed',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, rA1)), '^ERR:AS409:cannot_cancel$');

  perform pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'awaiting_confirmation' where id = %L returning 1) select count(*)::text from u $q$, rA4));
  perform pg_temp.ck('S25 confirming with an expert who does not offer the requested MODE is refused (X offers chat/voice, not video)',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'confirmed', assigned_expert_id = %L, scheduled_at = now() + interval '2 days' where id = %L returning 1) select count(*)::text from u $q$, eX, rA4)), '^ERR:AS409:expert_mode_mismatch$');
  perform pg_temp.ck('S26 a meeting link set on a not-yet-confirmed request is silently cleared (update succeeds)',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set meeting_link = 'https://meet.example.invalid/early' where id = %L returning 1) select count(*)::text from u $q$, rA4)), '^1$');
  perform pg_temp.ck('S27 ...and the stored link is null',
    (select coalesce(meeting_link, 'NULL') from public.consultation_requests where id = rA4), '^NULL$');
  perform pg_temp.ck('S28 a second request can be confirmed with NO payment at all (statuses are independent)',
    coalesce(pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'awaiting_confirmation' where id = %L returning 1) select count(*)::text from u $q$, rA2)), '') || '/' ||
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'confirmed', assigned_expert_id = %L, scheduled_at = now() + interval '3 days' where id = %L returning 1) select count(*)::text from u $q$, eX, rA2)), '^1/1$');
  perform pg_temp.ck('S29 staff S can mark their confirmed request completed',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'completed' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^1$');
  perform pg_temp.ck('S30 a completed request is final: even an admin cannot cancel it',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'cancelled' where id = %L returning 1) select count(*)::text from u $q$, rA1)), '^ERR:AS409:invalid_status_transition$');
  perform pg_temp.ck('S31 a completed request is final: the expert cannot change',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set assigned_expert_id = %L where id = %L returning 1) select count(*)::text from u $q$, eW, rA1)), '^ERR:AS409:request_is_closed$');

  -- what staff can NOT do (admin-only actions)
  perform pg_temp.ck('S32 staff cannot change a price (policy: 0 rows)',
    pg_temp.run_as(uS, 'aal2', $q$ with u as (update public.service_prices set amount_minor = 100 where service_slug = 'numerology' and mode = 'chat' returning 1) select count(*)::text from u $q$), '^0$');
  perform pg_temp.ck('S33 staff cannot edit services (policy: 0 rows)',
    pg_temp.run_as(uS, 'aal2', $q$ with u as (update public.services set name = 'Hacked' where slug = 'numerology' returning 1) select count(*)::text from u $q$), '^0$');
  perform pg_temp.ck('S34 staff cannot create experts (blocked by the POLICY, not a missing grant)',
    pg_temp.run_as(uS, 'aal2', $q$ with i as (insert into public.experts (display_name) values ('Staff Created Expert') returning 1) select count(*)::text from i $q$), c_rls);
  perform pg_temp.ck('S35 staff cannot edit experts (policy: 0 rows)',
    pg_temp.run_as(uS, 'aal2', format($q$ with u as (update public.experts set display_name = 'Renamed By Staff' where id = %L returning 1) select count(*)::text from u $q$, eX)), '^0$');
  perform pg_temp.ck('S36 staff cannot write payment settings (blocked by the POLICY)',
    pg_temp.run_as(uS, 'aal2', $q$ with i as (insert into public.app_settings (key, value) values ('upi_id', 'test@okbank') returning 1) select count(*)::text from i $q$), c_rls);
  perform pg_temp.ck('S37 staff cannot read the audit log (policy: 0 rows)',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.audit_log'), '^0$');
  perform pg_temp.ck('S38 staff cannot grant roles (missing grant)',
    pg_temp.run_as(uS, 'aal2', format($q$ with i as (insert into public.staff_members (user_id, role) values (%L, 'admin') returning 1) select count(*)::text from i $q$, uA)), c_perm);
  perform pg_temp.ck('S39 staff cannot verify payments',
    pg_temp.run_as(uS, 'aal2', format($q$ select public.verify_payment(%L, 'succeeded', 100, null)::text $q$, gen_random_uuid())), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('S40 staff cannot refund payments',
    pg_temp.run_as(uS, 'aal2', format($q$ select public.refund_payment(%L, null)::text $q$, gen_random_uuid())), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('S41 staff see only their own staff_members row',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.staff_members'), '^1$');
  perform pg_temp.ck('S42 a customer sees no staff_members rows',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.staff_members'), '^0$');

  -- internal notes
  perform pg_temp.ck('N1  staff can add an internal note to a request assigned to them',
    pg_temp.run_as(uS, 'aal2', format($q$ with i as (insert into public.request_notes (request_id, body) values (%L, 'INTERNAL-NOTE-SENTINEL-1') returning 1) select count(*)::text from i $q$, rA1)), '^1$');
  perform pg_temp.ck('N2  staff of ANOTHER expert cannot add a note to it (blocked by the POLICY)',
    pg_temp.run_as(uS2, 'aal2', format($q$ with i as (insert into public.request_notes (request_id, body) values (%L, 'other staff note') returning 1) select count(*)::text from i $q$, rA1)), c_rls);
  perform pg_temp.ck('N3  the customer cannot read internal notes',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.request_notes'), '^0$');
  perform pg_temp.ck('N4  the customer cannot write internal notes (blocked by the POLICY)',
    pg_temp.run_as(uA, 'aal1', format($q$ with i as (insert into public.request_notes (request_id, body) values (%L, 'customer note') returning 1) select count(*)::text from i $q$, rA1)), c_rls);
  perform pg_temp.ck('N5  staff without MFA cannot add notes (blocked by the POLICY)',
    pg_temp.run_as(uS, 'aal1', format($q$ with i as (insert into public.request_notes (request_id, body) values (%L, 'no mfa note') returning 1) select count(*)::text from i $q$, rA1)), c_rls);
  perform pg_temp.ck('N6  an admin can add a note to any request',
    pg_temp.run_as(uAD, 'aal2', format($q$ with i as (insert into public.request_notes (request_id, body) values (%L, 'admin note') returning 1) select count(*)::text from i $q$, rB1)), '^1$');
  perform pg_temp.ck('N7  staff read the notes of their own request',
    pg_temp.run_as(uS, 'aal2', format($q$ select count(*)::text from public.request_notes where request_id = %L $q$, rA1)), '^[1-9]');
  perform pg_temp.ck('N7b staff cannot see who wrote a note (staff identifiers are hidden; missing column grant)',
    pg_temp.run_as(uS, 'aal2', format($q$ select author_id::text from public.request_notes where request_id = %L limit 1 $q$, rA1)), c_perm);
  perform pg_temp.ck('N7c ...and neither can an admin through the API (they use the audit log)',
    pg_temp.run_as(uAD, 'aal2', format($q$ select author_id::text from public.request_notes where request_id = %L limit 1 $q$, rA1)), c_perm);
  perform pg_temp.ck('N8  staff of another expert read none of them',
    pg_temp.run_as(uS2, 'aal2', format($q$ select count(*)::text from public.request_notes where request_id = %L $q$, rA1)), '^0$');
  perform pg_temp.ck('N9  nobody can EDIT a note: customer (missing grant)',
    pg_temp.run_as(uA, 'aal1', $q$ with u as (update public.request_notes set body = 'tampered' returning 1) select count(*)::text from u $q$), c_perm);
  perform pg_temp.ck('N10 nobody can EDIT a note: staff (missing grant)',
    pg_temp.run_as(uS, 'aal2', $q$ with u as (update public.request_notes set body = 'tampered' returning 1) select count(*)::text from u $q$), c_perm);
  perform pg_temp.ck('N11 nobody can EDIT a note: not even an admin (missing grant)',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.request_notes set body = 'tampered' returning 1) select count(*)::text from u $q$), c_perm);
  perform pg_temp.ck('N12 nobody can DELETE a note: customer (missing grant)',
    pg_temp.run_as(uA, 'aal1', $q$ with d as (delete from public.request_notes returning 1) select count(*)::text from d $q$), c_perm);
  perform pg_temp.ck('N13 nobody can DELETE a note: staff (missing grant)',
    pg_temp.run_as(uS, 'aal2', $q$ with d as (delete from public.request_notes returning 1) select count(*)::text from d $q$), c_perm);
  perform pg_temp.ck('N14 nobody can DELETE a note: not even an admin (missing grant)',
    pg_temp.run_as(uAD, 'aal2', $q$ with d as (delete from public.request_notes returning 1) select count(*)::text from d $q$), c_perm);
  perform pg_temp.ck('N15 ...and the notes are all still there (3 written above)',
    (select count(*)::text from public.request_notes where body in ('INTERNAL-NOTE-SENTINEL-1', 'admin note')), '^2$');

  -- deactivated staff lose access immediately
  perform pg_temp.run_pg(format($q$ update public.staff_members set active = false where user_id = %L $q$, uS));
  perform pg_temp.ck('S43 a DEACTIVATED staff user (even with MFA) sees nothing',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.consultation_requests'), '^0$');
  perform pg_temp.run_pg(format($q$ update public.staff_members set active = true where user_id = %L $q$, uS));
  perform pg_temp.ck('S44 re-activated, access returns (the two requests assigned to expert X)',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.consultation_requests'), '^2$');

  -- ---------------------------------------------------------------------------------------------------------------
  -- M. Role assignment, MFA requirement, lock-out protection
  -- ---------------------------------------------------------------------------------------------------------------
  perform pg_temp.ck('M1  a customer cannot grant themselves a role (missing grant)',
    pg_temp.run_as(uA, 'aal2', format($q$ with i as (insert into public.staff_members (user_id, role) values (%L, 'admin') returning 1) select count(*)::text from i $q$, uA)), c_perm);
  perform pg_temp.ck('M2  a customer cannot edit staff_members (missing grant)',
    pg_temp.run_as(uA, 'aal2', format($q$ with u as (update public.staff_members set role = 'admin' where user_id = %L returning 1) select count(*)::text from u $q$, uS)), c_perm);
  perform pg_temp.ck('M3  even a full admin (MFA) cannot write staff_members through the API (missing grant)',
    pg_temp.run_as(uAD, 'aal2', format($q$ with i as (insert into public.staff_members (user_id, role) values (%L, 'staff') returning 1) select count(*)::text from i $q$, uA)), c_perm);
  perform pg_temp.ck('M4  granting a role to an account with NO MFA factor is refused',
    pg_temp.run_pg(format($q$ with i as (insert into public.staff_members (user_id, role) values (%L, 'admin') returning 1) select count(*)::text from i $q$, uM)), '^ERR:AS403:mfa_factor_required$');
  perform pg_temp.run_pg(format($q$ insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), %L, 'unverified', 'totp', 'unverified', now(), now()) $q$, uM));
  perform pg_temp.ck('M5  an UNVERIFIED MFA factor is not enough',
    pg_temp.run_pg(format($q$ with i as (insert into public.staff_members (user_id, role) values (%L, 'admin') returning 1) select count(*)::text from i $q$, uM)), '^ERR:AS403:mfa_factor_required$');
  perform pg_temp.run_pg(format($q$ insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), %L, 'verified', 'totp', 'verified', now(), now()) $q$, uM));
  perform pg_temp.ck('M6  with a VERIFIED authenticator factor the role can be granted',
    pg_temp.run_pg(format($q$ with i as (insert into public.staff_members (user_id, role) values (%L, 'admin') returning 1) select count(*)::text from i $q$, uM)), '^1$');
  perform pg_temp.ck('M7  with two active admins, one can be deactivated',
    pg_temp.run_pg(format($q$ with u as (update public.staff_members set active = false where user_id = %L returning 1) select count(*)::text from u $q$, uM)), '^1$');
  perform pg_temp.ck('M8  the LAST active admin cannot be deactivated (lock-out protection)',
    pg_temp.run_pg(format($q$ with u as (update public.staff_members set active = false where user_id = %L returning 1) select count(*)::text from u $q$, uAD)), '^ERR:AS409:last_admin$');
  perform pg_temp.ck('M9  the LAST active admin cannot be demoted',
    pg_temp.run_pg(format($q$ with u as (update public.staff_members set role = 'staff' where user_id = %L returning 1) select count(*)::text from u $q$, uAD)), '^ERR:AS409:last_admin$');
  perform pg_temp.ck('M10 the LAST active admin cannot be deleted',
    pg_temp.run_pg(format($q$ with d as (delete from public.staff_members where user_id = %L returning 1) select count(*)::text from d $q$, uAD)), '^ERR:AS409:last_admin$');
  perform pg_temp.ck('M11 an admin WITHOUT MFA (aal1) cannot change a price (policy: 0 rows)',
    pg_temp.run_as(uAD, 'aal1', $q$ with u as (update public.service_prices set amount_minor = 150000 where service_slug = 'numerology' and mode = 'chat' returning 1) select count(*)::text from u $q$), '^0$');
  perform pg_temp.ck('M12 an admin WITHOUT MFA (aal1) cannot verify payments',
    pg_temp.run_as(uAD, 'aal1', format($q$ select public.verify_payment(%L, 'failed', null, null)::text $q$, gen_random_uuid())), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('M13 an admin WITHOUT MFA (aal1) cannot read the audit log',
    pg_temp.run_as(uAD, 'aal1', 'select count(*)::text from public.audit_log'), '^0$');
  perform pg_temp.ck('M14 a staff row alone is not enough: no staff access when the token says aal1 even for an active staff member',
    pg_temp.run_as(uS, 'aal1', 'select count(*)::text from public.consultation_requests'), '^0$');
  -- a valid-looking aal2 token is not enough once the account has no verified authenticator factor (e.g. a lost device was removed)
  perform pg_temp.run_pg(format($q$ delete from auth.mfa_factors where user_id = %L $q$, uAD));
  perform pg_temp.ck('M15 with the authenticator factor REMOVED, an aal2 token no longer gives admin access',
    pg_temp.run_as(uAD, 'aal2', 'select count(*)::text from public.audit_log'), '^0$');
  perform pg_temp.run_pg(format($q$ insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), %L, 'test', 'totp', 'verified', now(), now()) $q$, uAD));
  perform pg_temp.ck('M16 ...and re-enrolling a verified factor restores it',
    pg_temp.run_as(uAD, 'aal2', 'select (count(*) > 0)::text from public.audit_log'), '^true$');

  -- ---------------------------------------------------------------------------------------------------------------
  -- V. Services, prices, experts, settings, consent versions (admin-only writes)
  -- ---------------------------------------------------------------------------------------------------------------
  select count(*) into v_cnt from public.services where active;
  perform pg_temp.ck('V1  anonymous visitors can read the active services',
    pg_temp.run_as(null, null, 'select count(*)::text from public.services'), '^' || v_cnt || '$');
  select count(*) into v_cnt from public.service_prices;
  perform pg_temp.ck('V2  anonymous visitors can read prices',
    pg_temp.run_as(null, null, 'select count(*)::text from public.service_prices'), '^' || v_cnt || '$');
  select count(*) into v_cnt from public.experts where active;
  perform pg_temp.ck('V3  anonymous visitors see only ACTIVE experts',
    pg_temp.run_as(null, null, 'select count(*)::text from public.experts'), '^' || v_cnt || '$');
  perform pg_temp.ck('V3b anonymous visitors cannot read who last changed a price (missing column grant)',
    pg_temp.run_as(null, null, 'select updated_by::text from public.service_prices limit 1'), c_perm);
  perform pg_temp.ck('V4  anonymous visitors cannot change anything (services; missing grant)',
    pg_temp.run_as(null, null, $q$ with u as (update public.services set name = 'x' returning 1) select count(*)::text from u $q$), c_perm);
  perform pg_temp.ck('V5  customers cannot change prices (policy: 0 rows)',
    pg_temp.run_as(uA, 'aal1', $q$ with u as (update public.service_prices set amount_minor = 1 returning 1) select count(*)::text from u $q$), '^0$');
  perform pg_temp.ck('V6  customers cannot edit services (policy: 0 rows)',
    pg_temp.run_as(uA, 'aal1', $q$ with u as (update public.services set name = 'x' returning 1) select count(*)::text from u $q$), '^0$');

  perform pg_temp.ck('V7  an admin (MFA) can set a price',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.service_prices set amount_minor = 150000 where service_slug = 'numerology' and mode = 'chat' returning 1) select count(*)::text from u $q$), '^1$');
  perform pg_temp.ck('V8  a zero price is refused by the database',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.service_prices set amount_minor = 0 where service_slug = 'numerology' and mode = 'chat' returning 1) select count(*)::text from u $q$), '^ERR:23514');
  perform pg_temp.ck('V9  a negative price is refused by the database',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.service_prices set amount_minor = -5 where service_slug = 'numerology' and mode = 'chat' returning 1) select count(*)::text from u $q$), '^ERR:23514');
  perform pg_temp.ck('V10 the price change recorded who made it (internally; not readable through the API)',
    (select (updated_by = uAD)::text from public.service_prices where service_slug = 'numerology' and mode = 'chat'), '^true$');

  r := pg_temp.run_as(uAD, 'aal2', $q$ insert into public.experts (display_name, bio, languages, modes, active) values ('Admin Created Expert', 'fixture', array['English'], array['chat','video']::public.consultation_mode[], true) returning id::text $q$);
  perform pg_temp.ck('V11 an admin can create an expert', r, c_uuid);   eZ := pg_temp.uid_of(r);
  perform pg_temp.ck('V12 an admin can link an expert to a service',
    pg_temp.run_as(uAD, 'aal2', format($q$ with i as (insert into public.expert_services (expert_id, service_slug) values (%L, 'numerology') returning 1) select count(*)::text from i $q$, eZ)), '^1$');
  perform pg_temp.ck('V13 a customer cannot create experts (blocked by the POLICY)',
    pg_temp.run_as(uA, 'aal1', $q$ with i as (insert into public.experts (display_name) values ('Customer Created Expert') returning 1) select count(*)::text from i $q$), c_rls);
  perform pg_temp.ck('V14 a customer cannot unlink expert services (policy: 0 rows)',
    pg_temp.run_as(uA, 'aal1', $q$ with d as (delete from public.expert_services returning 1) select count(*)::text from d $q$), '^0$');

  -- an assigned expert stays visible to the customer even if later deactivated
  perform pg_temp.run_pg(format($q$ update public.experts set active = false where id = %L $q$, eX));
  perform pg_temp.ck('V15 customer A still sees the (now inactive) expert assigned to their request',
    pg_temp.run_as(uA, 'aal1', format($q$ select count(*)::text from public.experts where id = %L $q$, eX)), '^1$');
  perform pg_temp.ck('V16 customer B (no request with that expert) does not',
    pg_temp.run_as(uB, 'aal1', format($q$ select count(*)::text from public.experts where id = %L $q$, eX)), '^0$');
  perform pg_temp.run_pg(format($q$ update public.experts set active = true where id = %L $q$, eX));

  -- payment settings
  perform pg_temp.ck('V17 an admin can set the UPI id',
    pg_temp.run_as(uAD, 'aal2', $q$ with i as (insert into public.app_settings (key, value) values ('upi_id', 'pilot.test@okbank') returning 1) select count(*)::text from i $q$), '^1$');
  perform pg_temp.ck('V17b an admin can change the UPI id',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.app_settings set value = 'pilot.new@okbank' where key = 'upi_id' returning 1) select count(*)::text from u $q$), '^1$');
  perform pg_temp.ck('V17c an admin can set the payee name',
    pg_temp.run_as(uAD, 'aal2', $q$ with i as (insert into public.app_settings (key, value) values ('payee_name', 'Pilot Payee Name') returning 1) select count(*)::text from i $q$), '^1$');
  perform pg_temp.ck('V17d an admin can set free-text payment instructions',
    pg_temp.run_as(uAD, 'aal2', $q$ with i as (insert into public.app_settings (key, value) values ('payment_instructions', 'INSTRUCTIONS-SENTINEL-77 pay and then enter the reference') returning 1) select count(*)::text from i $q$), '^1$');
  perform pg_temp.ck('V18 a malformed UPI id is refused',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.app_settings set value = 'not a upi id' where key = 'upi_id' returning 1) select count(*)::text from u $q$), '^ERR:23514');
  perform pg_temp.ck('V19 an unknown setting key is refused',
    pg_temp.run_as(uAD, 'aal2', $q$ with i as (insert into public.app_settings (key, value) values ('anything_else', 'x') returning 1) select count(*)::text from i $q$), '^ERR:23514');
  perform pg_temp.ck('V19b an over-long payee name is refused',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.app_settings set value = repeat('x', 81) where key = 'payee_name' returning 1) select count(*)::text from u $q$), '^ERR:23514');
  select count(*) into v_cnt from public.app_settings;
  perform pg_temp.ck('V20 a logged-in customer can read the payment settings',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.app_settings'), '^' || v_cnt || '$');
  perform pg_temp.ck('V20b staff (even with MFA) cannot read the payment settings (policy: 0 rows)',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.app_settings'), '^0$');
  perform pg_temp.ck('V20c ...nor without MFA: a staff ACCOUNT is excluded whatever its session level',
    pg_temp.run_as(uS, 'aal1', 'select count(*)::text from public.app_settings'), '^0$');
  perform pg_temp.ck('V20d an admin can read the payment settings',
    pg_temp.run_as(uAD, 'aal2', 'select count(*)::text from public.app_settings'), '^' || v_cnt || '$');
  perform pg_temp.ck('V21 a customer cannot write payment settings (policy: 0 rows)',
    pg_temp.run_as(uA, 'aal1', $q$ with u as (update public.app_settings set value = 'attacker@evil' returning 1) select count(*)::text from u $q$), '^0$');
  perform pg_temp.ck('V22 anonymous visitors cannot read payment settings (missing grant)',
    pg_temp.run_as(null, null, 'select count(*)::text from public.app_settings'), c_perm);
  perform pg_temp.ck('V22b a customer cannot read who last changed a setting (missing column grant)',
    pg_temp.run_as(uA, 'aal1', 'select updated_by::text from public.app_settings limit 1'), c_perm);

  perform pg_temp.ck('V23 a logged-in customer can see the active consent version',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.consent_versions'), '^1$');
  perform pg_temp.ck('V24 a customer cannot add a consent version (missing grant)',
    pg_temp.run_as(uA, 'aal1', $q$ with i as (insert into public.consent_versions (version) values ('v2') returning 1) select count(*)::text from i $q$), c_perm);
  perform pg_temp.ck('V25 not even an admin can add a consent version through the API (missing grant)',
    pg_temp.run_as(uAD, 'aal2', $q$ with i as (insert into public.consent_versions (version) values ('v2') returning 1) select count(*)::text from i $q$), c_perm);
  perform pg_temp.ck('V26 anonymous visitors cannot read consent versions (missing grant)',
    pg_temp.run_as(null, null, 'select count(*)::text from public.consent_versions'), c_perm);

  -- ---------------------------------------------------------------------------------------------------------------
  -- Y. Payments (manual UPI)
  -- ---------------------------------------------------------------------------------------------------------------
  perform pg_temp.ck('Y1  a payment claim is refused while the price is not set (gemstone/voice has no price)',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer SENTINEL A', current_date)::text $q$, rA2)), '^ERR:AS409:price_not_set$');
  perform pg_temp.ck('Y2  customers cannot insert payments directly (missing grant)',
    pg_temp.run_as(uA, 'aal1', format($q$ with i as (insert into public.payments (request_id, amount_minor, upi_reference, payer_name, paid_on) values (%L, 100, 'ABCD12345678', 'Payer', current_date) returning 1) select count(*)::text from i $q$, rA1)), c_perm);
  perform pg_temp.ck('Y3  customers cannot update payments directly (missing grant)',
    pg_temp.run_as(uA, 'aal1', $q$ with u as (update public.payments set status = 'succeeded' returning 1) select count(*)::text from u $q$), c_perm);
  perform pg_temp.ck('Y4  staff cannot insert payments directly (missing grant)',
    pg_temp.run_as(uS, 'aal2', format($q$ with i as (insert into public.payments (request_id, amount_minor, upi_reference, payer_name, paid_on) values (%L, 100, 'ABCD12345678', 'Payer', current_date) returning 1) select count(*)::text from i $q$, rA1)), c_perm);
  perform pg_temp.ck('Y5  not even an admin can update payments directly (missing grant; only the verify function can)',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.payments set status = 'succeeded' returning 1) select count(*)::text from u $q$), c_perm);
  perform pg_temp.ck('Y6  B cannot submit a payment for A''s request (generic answer)',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer SENTINEL B', current_date)::text $q$, rA1)), '^ERR:AS409:request_not_payable$');
  perform pg_temp.ck('Y6b an anonymous-sign-in session cannot submit payment claims',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer SENTINEL A', current_date)::text $q$, rA1), '{"is_anonymous": true}'::jsonb), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('Y7  a malformed reference is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'abc', 'Payer SENTINEL A', current_date)::text $q$, rA1)), '^ERR:AS422:invalid_reference$');
  perform pg_temp.ck('Y7b a missing/short payer name is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'x', current_date)::text $q$, rA1)), '^ERR:AS422:invalid_payer_name$');
  perform pg_temp.ck('Y7f a payer "name" containing a long digit run (PIN/OTP-like) is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer 482913', current_date)::text $q$, rA1)), '^ERR:AS422:invalid_payer_name$');
  perform pg_temp.ck('Y7c a payment date in the future is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer SENTINEL A', current_date + 5)::text $q$, rA1)), '^ERR:AS422:invalid_payment_date$');
  perform pg_temp.ck('Y7d a payment date older than 30 days is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer SENTINEL A', current_date - 45)::text $q$, rA1)), '^ERR:AS422:invalid_payment_date$');
  perform pg_temp.ck('Y7e a missing payment date is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer SENTINEL A', null)::text $q$, rA1)), '^ERR:AS422:invalid_payment_date$');
  perform pg_temp.ck('Y8  a CANCELLED request cannot be paid for',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ABCD12345678', 'Payer SENTINEL A', current_date)::text $q$, rA3)), '^ERR:AS409:request_not_payable$');

  r := pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, '  utrsentinel123456 ', '  Payer   SENTINEL A ', current_date)::text $q$, rA1));
  perform pg_temp.ck('Y9  A can submit a UPI reference, payer name and date (lower-case / spaces accepted)', r, c_uuid);   pA := pg_temp.uid_of(r);
  perform pg_temp.ck('Y10 it is stored PENDING, normalised, with the price snapshot, the payer name and the date',
    (select status::text || '/' || upi_reference || '/' || amount_minor::text || '/' || payer_name || '/' || (paid_on = current_date)::text from public.payments where id = pA),
    '^pending/UTRSENTINEL123456/150000/Payer SENTINEL A/true$');
  perform pg_temp.ck('Y11 the consultation status is untouched by a payment claim',
    (select status::text from public.consultation_requests where id = rA1), '^completed$');
  perform pg_temp.ck('Y12 A can see their own payment',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.payments'), '^1$');
  perform pg_temp.ck('Y13 B cannot see A''s payment',
    pg_temp.run_as(uB, 'aal1', 'select count(*)::text from public.payments'), '^0$');
  perform pg_temp.ck('Y14 anonymous visitors cannot read payments (missing grant)',
    pg_temp.run_as(null, null, 'select count(*)::text from public.payments'), c_perm);
  select count(*) into v_cnt from public.payments;
  perform pg_temp.ck('Y15 an admin can see all payments (read-only)',
    pg_temp.run_as(uAD, 'aal2', 'select count(*)::text from public.payments'), '^' || v_cnt || '$');
  perform pg_temp.ck('Y15b staff cannot see any payment (policy: 0 rows)',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.payments'), '^0$');
  perform pg_temp.ck('Y15c a customer cannot read who verified a payment (missing column grant)',
    pg_temp.run_as(uA, 'aal1', 'select verified_by::text from public.payments limit 1'), c_perm);
  perform pg_temp.ck('Y15d ...nor who submitted it (missing column grant)',
    pg_temp.run_as(uA, 'aal1', 'select submitted_by::text from public.payments limit 1'), c_perm);
  perform pg_temp.ck('Y16 a second claim while one is pending is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ZZZZ12345678', 'Payer SENTINEL A', current_date)::text $q$, rA1)), '^ERR:AS409:claim_already_pending$');
  perform pg_temp.ck('Y17 B cannot claim the same reference (and is told nothing about why)',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.submit_payment_reference(%L, %L, 'Payer SENTINEL B', current_date)::text $q$, rB1, c_ref)), '^ERR:AS409:reference_unavailable$');

  perform pg_temp.ck('Y18 customers cannot verify their own payment',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.verify_payment(%L, 'succeeded', 150000, null)::text $q$, pA)), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('Y19 anonymous visitors cannot call verify_payment (missing function grant)',
    pg_temp.run_as(null, null, format($q$ select public.verify_payment(%L, 'succeeded', 150000, null)::text $q$, pA)), c_perm);
  perform pg_temp.ck('Y20 "succeeded" with the wrong amount is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'succeeded', 100, null)::text $q$, pA)), '^ERR:AS422:amount_mismatch$');
  perform pg_temp.ck('Y21 "succeeded" with no amount is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'succeeded', null, null)::text $q$, pA)), '^ERR:AS422:amount_mismatch$');
  perform pg_temp.ck('Y22 an unknown decision is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'maybe', 150000, null)::text $q$, pA)), '^ERR:AS422:invalid_decision$');

  -- separation of duties: an admin is also a customer here
  r := pg_temp.run_as(uAD, 'aal2', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','Admin as a customer: own consultation', date '1980-05-05','v1') returning id::text $q$);
  perform pg_temp.ck('Y22a an admin can also be a customer and create their own request', r, c_uuid);   rAD := pg_temp.uid_of(r);
  r := pg_temp.run_as(uAD, 'aal2', format($q$ select public.submit_payment_reference(%L, 'ADMINSELF12345', 'Payer SENTINEL Admin', current_date)::text $q$, rAD));
  perform pg_temp.ck('Y22b ...and submit a payment claim for it', r, c_uuid);   pAD := pg_temp.uid_of(r);
  perform pg_temp.ck('Y22c an admin CANNOT verify their own payment',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'succeeded', 150000, null)::text $q$, pAD)), '^ERR:AS403:self_verification_forbidden$');
  perform pg_temp.ck('Y22d ...nor mark it failed',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'failed', null, null)::text $q$, pAD)), '^ERR:AS403:self_verification_forbidden$');
  perform pg_temp.ck('Y22e ...nor refund it',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.refund_payment(%L, null)::text $q$, pAD)), '^ERR:AS403:self_verification_forbidden$');
  perform pg_temp.run_pg(format($q$ update public.staff_members set active = true where user_id = %L $q$, uM));
  perform pg_temp.ck('Y22f a DIFFERENT admin (second admin, MFA) can verify it',
    pg_temp.run_as(uM, 'aal2', format($q$ select public.verify_payment(%L, 'succeeded', 150000, null)::text $q$, pAD)), '^(OK|)$');

  perform pg_temp.ck('Y23 the admin (MFA) verifies the payment with the correct amount',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'succeeded', 150000, 'NOTE-SENTINEL-55 matched in statement')::text $q$, pA)), '^(OK|)$');
  perform pg_temp.ck('Y24 it is now succeeded, verified by the admin (checked internally)',
    (select status::text || '/' || (verified_by = uAD)::text || '/' || (verified_at is not null)::text from public.payments where id = pA), '^succeeded/true/true$');
  perform pg_temp.ck('Y25 verifying twice is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'failed', null, null)::text $q$, pA)), '^ERR:AS409:payment_not_pending$');
  perform pg_temp.ck('Y26 the verification note went to the INTERNAL notes as a PAYMENT note that an admin can see',
    pg_temp.run_as(uAD, 'aal2', $q$ select count(*)::text from public.request_notes where body ~ 'NOTE-SENTINEL-55' and kind = 'payment' $q$), '^1$');
  perform pg_temp.ck('Y26b ...staff do NOT see payment notes, even on their own request',
    pg_temp.run_as(uS, 'aal2', $q$ select count(*)::text from public.request_notes where body ~ 'NOTE-SENTINEL-55' $q$), '^0$');
  perform pg_temp.ck('Y27 ...and the customer cannot see it',
    pg_temp.run_as(uA, 'aal1', $q$ select count(*)::text from public.request_notes where body ~ 'NOTE-SENTINEL-55' $q$), '^0$');
  perform pg_temp.ck('Y28 once paid, another claim is refused',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'NEWREF123456', 'Payer SENTINEL A', current_date)::text $q$, rA1)), '^ERR:AS409:already_paid$');
  perform pg_temp.ck('Y29 staff cannot refund',
    pg_temp.run_as(uS, 'aal2', format($q$ select public.refund_payment(%L, null)::text $q$, pA)), '^ERR:AS403:forbidden$');
  perform pg_temp.ck('Y30 the admin can refund a succeeded payment (of a request that is not theirs)',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.refund_payment(%L, 'customer request')::text $q$, pA)), '^(OK|)$');
  perform pg_temp.ck('Y31 it is now "refunded" (a PAYMENT status) and the consultation status is unchanged',
    (select pm.status::text || '/' || rq.status::text from public.payments pm join public.consultation_requests rq on rq.id = pm.request_id where pm.id = pA), '^refunded/completed$');
  perform pg_temp.ck('Y32 refunding twice is refused',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.refund_payment(%L, null)::text $q$, pA)), '^ERR:AS409:payment_not_refundable$');

  -- reference reuse rules
  perform pg_temp.ck('Y33 a REFUNDED reference is spent: the same customer cannot claim it again',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, %L, 'Payer SENTINEL A', current_date)::text $q$, rA1, c_ref)), '^ERR:AS409:reference_unavailable$');
  perform pg_temp.ck('Y33b ...and another customer cannot claim it either',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.submit_payment_reference(%L, %L, 'Payer SENTINEL B', current_date)::text $q$, rB1, c_ref)), '^ERR:AS409:reference_unavailable$');
  r := pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'UTRFAILED000001', 'Payer SENTINEL A', current_date)::text $q$, rA1));
  perform pg_temp.ck('Y34 A submits a different reference', r, c_uuid);
  perform pg_temp.ck('Y34b the admin marks it FAILED (for example a typing mistake)',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'failed', null, null)::text $q$, pg_temp.uid_of(r))), '^(OK|)$');
  perform pg_temp.ck('Y34c a FAILED reference is NOT available to another customer',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.submit_payment_reference(%L, 'UTRFAILED000001', 'Payer SENTINEL B', current_date)::text $q$, rB1)), '^ERR:AS409:reference_unavailable$');
  r := pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'UTRFAILED000001', 'Payer SENTINEL A', current_date)::text $q$, rA1));
  perform pg_temp.ck('Y34d ...but the SAME customer can correct and submit it again', r, c_uuid);
  perform pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'failed', null, null)::text $q$, pg_temp.uid_of(r)));

  -- payment attempt limit: 5 claims per request in total (so far on rA1: refunded one, failed, failed = 3)
  v_loop_ok := true;
  for i in 4..5 loop
    r := pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, %L, 'Payer SENTINEL A', current_date)::text $q$, rA1, 'UTRLOOP' || lpad(i::text, 8, '0')));
    if pg_temp.uid_of(r) is null then
      v_loop_ok := false;
    else
      perform pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'failed', null, null)::text $q$, pg_temp.uid_of(r)));
    end if;
  end loop;
  perform pg_temp.ck('Y35 attempts 4 and 5 on one request were accepted', v_loop_ok::text, '^true$');
  perform pg_temp.ck('Y36 the 6th claim on one request is refused (limit 5)',
    pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'LASTTRY12345', 'Payer SENTINEL A', current_date)::text $q$, rA1)), '^ERR:AS429:too_many_payment_attempts$');

  -- B pays; payment status and consultation status stay independent
  r := pg_temp.run_as(uB, 'aal1', format($q$ select public.submit_payment_reference(%L, 'UTRBBBB12345', 'Payer SENTINEL B', current_date)::text $q$, rB1));
  perform pg_temp.ck('Y37 B can submit a claim for their own request', r, c_uuid);   pB := pg_temp.uid_of(r);
  perform pg_temp.ck('Y38 A cannot see B''s payment',
    pg_temp.run_as(uA, 'aal1', format($q$ select count(*)::text from public.payments where id = %L $q$, pB)), '^0$');
  perform pg_temp.ck('Y39 admin verifies B''s payment as succeeded',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'succeeded', 150000, null)::text $q$, pB)), '^(OK|)$');
  perform pg_temp.ck('Y40 B''s consultation is still only "submitted" although payment succeeded (independent statuses)',
    (select status::text from public.consultation_requests where id = rB1), '^submitted$');

  -- cancellation versus payments
  perform pg_temp.ck('Y41 a customer cannot cancel a request whose payment already SUCCEEDED (an admin handles it)',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, rB1)), '^ERR:AS409:payment_received$');
  perform pg_temp.ck('Y41b ...and the request is still open',
    (select status::text from public.consultation_requests where id = rB1), '^submitted$');
  perform pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.service_prices set amount_minor = 120000 where service_slug = 'palmistry' and mode = 'video' returning 1) select count(*)::text from u $q$);
  r := pg_temp.run_as(uB, 'aal1', format($q$ select public.submit_payment_reference(%L, 'PENDCANCEL0001', 'Payer SENTINEL B', current_date)::text $q$, rB2));
  perform pg_temp.ck('Y42 B submits a claim for the second request', r, c_uuid);   pP := pg_temp.uid_of(r);
  perform pg_temp.ck('Y43 a customer MAY cancel while the claim is still pending',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.cancel_my_request(%L)::text $q$, rB2)), '^(OK|)$');
  perform pg_temp.ck('Y44 ...the claim stays PENDING for the admin to resolve (nothing is silently changed)',
    (select status::text from public.payments where id = pP), '^pending$');
  perform pg_temp.ck('Y44b ...and the cancellation raised an ATTENTION flag that the admin can see',
    pg_temp.run_as(uAD, 'aal2', format($q$ select count(*)::text from public.request_notes where request_id = %L and kind = 'system' and body ~ 'still PENDING' $q$, rB2)), '^1$');
  perform pg_temp.ck('Y44c ...which the customer and staff cannot see',
    pg_temp.run_as(uB, 'aal1', format($q$ select count(*)::text from public.request_notes where request_id = %L $q$, rB2))
    || '/' || pg_temp.run_as(uS, 'aal2', format($q$ select count(*)::text from public.request_notes where request_id = %L $q$, rB2)), '^0/0$');
  perform pg_temp.ck('Y45 ...and the admin can resolve it (no money arrived: failed)',
    pg_temp.run_as(uAD, 'aal2', format($q$ select public.verify_payment(%L, 'failed', null, null)::text $q$, pP)), '^(OK|)$');
  perform pg_temp.ck('Y46 an admin can still cancel a request whose payment succeeded (then refunds it)',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'cancelled' where id = %L returning 1) select count(*)::text from u $q$, rB1)), '^1$');

  perform pg_temp.ck('Y46b ...and that cancellation too raised an ATTENTION flag (refund due)',
    pg_temp.run_as(uAD, 'aal2', format($q$ select count(*)::text from public.request_notes where request_id = %L and kind = 'system' and body ~ 'had SUCCEEDED' $q$, rB1)), '^1$');
  perform pg_temp.ck('Y46c ...while the payment itself was NOT silently changed (statuses stay separate)',
    (select status::text from public.payments where id = pB), '^succeeded$');

  -- cancellation vs payment submission: the SEQUENTIAL invariants (a true interleaving needs two live sessions -
  -- see supabase/tests/REAL_SESSION_VALIDATION.md section 5b; this single transaction cannot race itself)
  perform pg_temp.ck('Y47 no claim can be submitted for a request an ADMIN cancelled (not only for customer cancellations)',
    pg_temp.run_as(uB, 'aal1', format($q$ select public.submit_payment_reference(%L, 'LATECLAIM0001', 'Payer SENTINEL B', current_date)::text $q$, rB1)), '^ERR:AS409:request_not_payable$');
  perform pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.service_prices set amount_minor = 90000 where service_slug = 'numerology' and mode = 'video' returning 1) select count(*)::text from u $q$);
  r := pg_temp.run_as(uA, 'aal1', format($q$ select public.submit_payment_reference(%L, 'ADMINCANCEL001', 'Payer SENTINEL A', current_date)::text $q$, rA4));
  perform pg_temp.ck('Y48 a claim is accepted for a request that is still open', r, c_uuid);
  perform pg_temp.ck('Y49 an admin cancels that request while the claim is pending',
    pg_temp.run_as(uAD, 'aal2', format($q$ with u as (update public.consultation_requests set status = 'cancelled' where id = %L returning 1) select count(*)::text from u $q$, rA4)), '^1$');
  perform pg_temp.ck('Y50 ...and the admin-cancel path raised the ATTENTION flag as well (never an unflagged pending claim on a cancelled request)',
    pg_temp.run_as(uAD, 'aal2', format($q$ select count(*)::text from public.request_notes where request_id = %L and kind = 'system' and body ~ 'still PENDING' $q$, rA4)), '^1$');

  -- ---------------------------------------------------------------------------------------------------------------
  -- D. Data lifecycle: anonymising a customer keeps financial and audit records, removes personal data
  -- ---------------------------------------------------------------------------------------------------------------
  r := pg_temp.run_as(uD, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','D private concern LIFECYCLE-SENTINEL text', date '1991-02-02','v1') returning id::text $q$);
  perform pg_temp.ck('D1  customer D creates a request', r, c_uuid);   rD1 := pg_temp.uid_of(r);
  r := pg_temp.run_as(uD, 'aal1', format($q$ select public.submit_payment_reference(%L, 'UTRDELETE00001', 'Lifecycle SENTINEL Payer D', current_date)::text $q$, rD1));
  perform pg_temp.ck('D2  ...and a payment claim', r, c_uuid);   pD := pg_temp.uid_of(r);
  perform pg_temp.run_as(uAD, 'aal2', format($q$ with i as (insert into public.request_notes (request_id, body) values (%L, 'note about D LIFECYCLE-SENTINEL-NOTE') returning 1) select count(*)::text from i $q$, rD1));
  perform pg_temp.ck('D3  the anonymisation function is NOT callable through the API roles',
    pg_temp.run_as(uAD, 'aal2', format($q$ select private.anonymise_customer(%L, true)::text $q$, uD)), c_perm);
  perform pg_temp.ck('D4  the owner is refused while the customer still has open requests',
    pg_temp.run_pg(format($q$ select private.anonymise_customer(%L, false)::text $q$, uD)), '^ERR:AS409:open_requests_exist$');
  perform pg_temp.ck('D5  the owner can anonymise, cancelling the open request',
    pg_temp.run_pg(format($q$ select private.anonymise_customer(%L, true)::text $q$, uD)), '"profile_found": true');
  perform pg_temp.ck('D6  the request keeps its id, service, mode and (cancelled) status but loses the personal text',
    (select status::text || '/' || service_slug || '/' || mode::text || '/' || concern || '/' || coalesce(date_of_birth::text, 'NULL') || '/' || customer_name
       from public.consultation_requests where id = rD1),
    '^cancelled/numerology/chat/\[removed at customer request\]/NULL/Deleted customer$');
  perform pg_temp.ck('D7  the payment keeps amount, reference, status and date but loses the payer name',
    (select status::text || '/' || upi_reference || '/' || amount_minor::text || '/' || payer_name from public.payments where id = pD),
    '^pending/UTRDELETE00001/150000/\[removed\]$');
  perform pg_temp.ck('D8  internal notes about the customer are blanked',
    (select body from public.request_notes where request_id = rD1 and kind = 'general' limit 1), '^\[removed\]$');
  perform pg_temp.ck('D8b ...but the fixed ATTENTION flag about the unresolved payment is kept (it holds no personal data)',
    (select count(*)::text from public.request_notes where request_id = rD1 and kind = 'system' and body ~ 'still PENDING'), '^1$');
  perform pg_temp.ck('D9  the profile is scrubbed and marked anonymised',
    (select full_name || '/' || email || '/' || coalesce(phone, 'NULL') || '/' || (anonymised_at is not null)::text from public.profiles where id = uD), '^Deleted customer//NULL/true$');
  perform pg_temp.ck('D10 the anonymisation itself is audited (counts only)',
    (select count(*)::text from public.audit_log where entity = 'profiles' and entity_id = uD::text and changes ->> 'anonymised' = 'true'), '^1$');
  perform pg_temp.ck('D11 an anonymised account can no longer create requests',
    pg_temp.run_as(uD, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','a perfectly valid concern text', date '1991-02-02','v1') returning id::text $q$), '^ERR:AS403:account_closed$');
  perform pg_temp.ck('D12 deleting the login afterwards works (the profile stays as an anonymous tombstone, the records stay)',
    pg_temp.run_pg(format($q$ with d as (delete from auth.users where id = %L returning 1) select count(*)::text from d $q$, uD)), '^1$');
  perform pg_temp.ck('D13 ...profile and request rows are still there',
    (select (select count(*) from public.profiles where id = uD)::text || '/' || (select count(*) from public.consultation_requests where customer_id = uD)::text), '^1/1$');

  r := pg_temp.run_as(uE, 'aal1', $q$ insert into public.consultation_requests (service_slug, mode, concern, date_of_birth, consent_version)
        values ('numerology','chat','E private concern LIFECYCLE-SENTINEL text', date '1993-03-03','v1') returning id::text $q$);
  perform pg_temp.ck('D14 customer E creates a request', r, c_uuid);   rE1 := pg_temp.uid_of(r);
  r := pg_temp.run_as(uE, 'aal1', format($q$ select public.submit_payment_reference(%L, 'UTRDELETE00002', 'Lifecycle SENTINEL Payer E', current_date)::text $q$, rE1));
  perform pg_temp.ck('D15 ...and a payment claim', r, c_uuid);   pE := pg_temp.uid_of(r);
  perform pg_temp.ck('D16 deleting E''s LOGIN directly (as the dashboard does) works...',
    pg_temp.run_pg(format($q$ with d as (delete from auth.users where id = %L returning 1) select count(*)::text from d $q$, uE)), '^1$');
  perform pg_temp.ck('D17 ...and the delete trigger scrubbed the personal data and cancelled the open request automatically',
    (select r2.status::text || '/' || r2.concern || '/' || p2.payer_name || '/' || pr.full_name
       from public.consultation_requests r2 join public.payments p2 on p2.request_id = r2.id join public.profiles pr on pr.id = r2.customer_id
      where r2.id = rE1 and p2.id = pE),
    '^cancelled/\[removed at customer request\]/\[removed\]/Deleted customer$');

  -- ---------------------------------------------------------------------------------------------------------------
  -- L. Audit log
  -- ---------------------------------------------------------------------------------------------------------------
  perform pg_temp.ck('L1  request creation was audited with the customer as actor',
    (select count(*)::text from public.audit_log where entity = 'consultation_requests' and action = 'insert' and actor_id = uA and actor_kind = 'customer'), '^[1-9][0-9]*$');
  perform pg_temp.ck('L2  a status change was audited with the admin as actor (from -> to)',
    (select count(*)::text from public.audit_log where entity = 'consultation_requests' and action = 'update'
        and actor_id = uAD and actor_kind = 'admin' and changes -> 'status' ->> 'to' = 'awaiting_confirmation'), '^[1-9][0-9]*$');
  perform pg_temp.ck('L2b a staff action was audited with staff as actor',
    (select count(*)::text from public.audit_log where entity = 'consultation_requests' and action = 'update'
        and actor_id = uS and actor_kind = 'staff' and changes -> 'status' ->> 'to' = 'completed'), '^[1-9][0-9]*$');
  perform pg_temp.ck('L3  payment verification was audited with the admin as actor',
    (select count(*)::text from public.audit_log where entity = 'payments' and action = 'update'
        and actor_id = uAD and actor_kind = 'admin' and changes -> 'status' ->> 'to' = 'succeeded'), '^[1-9][0-9]*$');
  perform pg_temp.ck('L4  the price change was audited',
    (select count(*)::text from public.audit_log where entity = 'service_prices' and actor_id = uAD and changes -> 'amount_minor' ->> 'to' = '150000'), '^[1-9][0-9]*$');
  perform pg_temp.ck('L5  granting a staff role was audited (actor "system" = SQL Editor)',
    (select count(*)::text from public.audit_log where entity = 'staff_members' and action = 'insert' and actor_kind = 'system'), '^[1-9][0-9]*$');
  perform pg_temp.ck('L6  the audit log holds NO customer personal data: concern, birth date, phone, email, names, UPI reference, payer name, meeting link or note text',
    (select count(*)::text from public.audit_log
      where changes::text ~* 'SENTINEL|example\.invalid|90000 11111|9000011111|1990-03-29|1985-07-12|1991-02-02|1993-03-03|Customer [A-Z]|Admin AD|UTRDELETE|UTRFAILED|ADMINSELF|https://'), '^0$');
  perform pg_temp.ck('L6b a change of the UPI id IS recorded with its old and new value (business data, so a diversion can be traced)',
    (select count(*)::text from public.audit_log where entity = 'app_settings' and entity_id = 'upi_id' and action = 'update'
        and changes -> 'value' ->> 'from' = 'pilot.test@okbank' and changes -> 'value' ->> 'to' = 'pilot.new@okbank'
        and actor_id = uAD and actor_kind = 'admin'), '^1$');
  perform pg_temp.ck('L6c the first setting of the UPI id and of the payee name are recorded by value as well',
    (select count(*)::text from public.audit_log where entity = 'app_settings' and action = 'insert'
        and ((entity_id = 'upi_id' and changes ->> 'value' = 'pilot.test@okbank') or (entity_id = 'payee_name' and changes ->> 'value' = 'Pilot Payee Name'))), '^2$');
  perform pg_temp.ck('L6d free-text payment instructions are NOT recorded by value (only the fact of the change)',
    (select count(*)::text from public.audit_log where entity = 'app_settings' and entity_id = 'payment_instructions' and changes ? 'value'), '^0$');
  perform pg_temp.ck('L7  an admin (MFA) can read the audit log',
    pg_temp.run_as(uAD, 'aal2', 'select (count(*) > 0)::text from public.audit_log'), '^true$');
  perform pg_temp.ck('L8  staff cannot (policy: 0 rows)',
    pg_temp.run_as(uS, 'aal2', 'select count(*)::text from public.audit_log'), '^0$');
  perform pg_temp.ck('L9  customers cannot (policy: 0 rows)',
    pg_temp.run_as(uA, 'aal1', 'select count(*)::text from public.audit_log'), '^0$');
  perform pg_temp.ck('L10 anonymous visitors cannot (missing grant)',
    pg_temp.run_as(null, null, 'select count(*)::text from public.audit_log'), c_perm);
  perform pg_temp.ck('L11 not even an admin can insert into the audit log (missing grant)',
    pg_temp.run_as(uAD, 'aal2', $q$ with i as (insert into public.audit_log (actor_kind, action, entity, entity_id) values ('admin','insert','x','y') returning 1) select count(*)::text from i $q$), c_perm);
  perform pg_temp.ck('L12 not even an admin can edit the audit log (missing grant)',
    pg_temp.run_as(uAD, 'aal2', $q$ with u as (update public.audit_log set action = 'tampered' returning 1) select count(*)::text from u $q$), c_perm);
  perform pg_temp.ck('L13 not even an admin can delete from the audit log (missing grant)',
    pg_temp.run_as(uAD, 'aal2', $q$ with d as (delete from public.audit_log returning 1) select count(*)::text from d $q$), c_perm);

  perform pg_temp.ck('L14 audit-log protection: even the OWNER cannot UPDATE a row (trigger)',
    pg_temp.run_pg($q$ with u as (update public.audit_log set action = 'tampered' returning 1) select count(*)::text from u $q$), '^ERR:AS403:audit_log_is_append_only$');
  perform pg_temp.ck('L15 ...nor DELETE a row (trigger)',
    pg_temp.run_pg($q$ with d as (delete from public.audit_log returning 1) select count(*)::text from d $q$), '^ERR:AS403:audit_log_is_append_only$');
  perform pg_temp.ck('L16 ...nor TRUNCATE the table (trigger)',
    pg_temp.run_pg($q$ truncate table public.audit_log $q$), '^ERR:AS403:audit_log_is_append_only$');
  perform pg_temp.ck('L17 ...and the rows are all still there',
    (select (count(*) > 0)::text from public.audit_log), '^true$');
  perform pg_temp.ck('L18 appending still works (a new audit row is written when data changes)',
    (select count(*)::text from public.audit_log where entity = 'consultation_requests' and action = 'update' and actor_kind = 'customer'), '^[1-9][0-9]*$');

  end if;   -- v_auth_ok

  -- ---------------------------------------------------------------------------------------------------------------
  -- Report: ALWAYS ends with an intentional error so that nothing above is ever saved
  -- ---------------------------------------------------------------------------------------------------------------
  select count(*) filter (where passed), count(*) filter (where not passed) into v_pass, v_fail from pg_temp.t_results;
  select string_agg('  #' || t.n || ' ' || t.label || '  -> ' || coalesce(t.detail, ''), E'\n' order by t.n)
    into v_report from (select * from pg_temp.t_results where not passed order by n limit 25) t;
  v_mode := case when v_auth_ok then 'FULL (every section ran)'
                 else 'REDUCED - NOT TESTED: staff/admin/MFA, services/prices/settings, payments, request confirmation, notes, audit log, data lifecycle. '
                      || 'The managed auth tables refused the fake users [' || v_auth_err || ']. See supabase/tests/REAL_SESSION_VALIDATION.md.' end;

  raise exception E'ISOLATION TESTS FINISHED (this error is intentional: it rolls back every fake record).\nMODE: %\nPASSED: %   FAILED: %\n%',
    v_mode, v_pass, v_fail,
    coalesce(v_report, E'(no failures)\nNOTE: these ran against SIMULATED sessions only; see supabase/README.md section 8 for what still needs real logins.');
end
$test$;
