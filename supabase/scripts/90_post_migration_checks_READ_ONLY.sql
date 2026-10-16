-- =====================================================================================
-- 90  POST-MIGRATION CHECKS  (READ-ONLY: changes nothing)
-- Run after migrations 0100-0600. Shows structure only: table names, counts, privileges. No customer data.
-- Safe to copy the whole result into a chat. The last row is the verdict:
--     STOP                 - a row says PROBLEM, a row is missing/blank/unrecognised, or the number of rows is wrong
--     MANUAL CHECK NEEDED  - no problem found, but a row says UNKNOWN (for example the Data API exposure of "private")
--     OK                   - everything checked passed
-- PRIVILEGES ARE CHECKED WITH THE EFFECTIVE-PRIVILEGE FUNCTIONS (has_table_privilege, has_column_privilege,
-- has_any_column_privilege, has_function_privilege, has_schema_privilege, has_sequence_privilege), which answer "what can
-- this role really do, whoever granted it, including rights inherited from PUBLIC". They do not rely on the
-- information_schema grant views, which only show grants made by roles the caller belongs to.
-- Roles checked: anon and authenticated. "Staff" and "admin" are NOT database roles (they are rows in staff_members, seen
-- through authenticated), so their access is checked by the isolation test, not here.
-- These are STRUCTURE checks of what the migrations created. They do not test behaviour - the isolation test does that
-- (with simulated sessions), and real sessions are needed for the rest (supabase/tests/REAL_SESSION_VALIDATION.md).
-- =====================================================================================
with
our_tables(t) as (
  values ('profiles'), ('staff_members'), ('services'), ('service_prices'), ('experts'), ('expert_services'),
         ('consent_versions'), ('consultation_requests'), ('request_notes'), ('payments'), ('app_settings'), ('audit_log')
),
tbl as (
  select c.oid as oid, c.relname::text as t
    from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and c.relname in (select t from our_tables)
),
cols as (
  select t.t, a.attname::text as col, t.oid as oid, a.attnum as attnum
    from tbl t join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
),
api_schemas as (
  select regexp_replace(c, '^pgrst\.db_schemas=', '') as val
    from pg_catalog.pg_roles r, lateral unnest(r.rolconfig) as c
   where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%'
),

-- ---- privileges: anon, table level and column level ------------------------------------------------------------------
anon_table_bad as (
  select t.t || ':' || p.pr as item
    from tbl t cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p(pr)
   where has_table_privilege('anon', t.oid, p.pr)
     and not (p.pr = 'select' and t.t in ('services', 'experts', 'expert_services'))
),
anon_column_bad as (
  select t.t || ':' || p.pr as item
    from tbl t cross join (values ('select'), ('insert'), ('update'), ('references')) p(pr)
   where has_any_column_privilege('anon', t.oid, p.pr)
     and not (p.pr = 'select' and t.t in ('services', 'experts', 'expert_services', 'service_prices'))
),
-- ---- privileges: authenticated, table level -----------------------------------------------------------------------------
auth_table_bad as (
  select t.t || ':' || p.pr as item
    from tbl t cross join (values ('insert'), ('delete'), ('truncate'), ('references'), ('trigger')) p(pr)
   where has_table_privilege('authenticated', t.oid, p.pr)
     and not (t.t = 'expert_services' and p.pr in ('insert', 'delete'))
),
-- ---- privileges: the EXACT writable columns of authenticated, and the EXACT readable columns of anon -----------------------
-- (the expected lists below are the same lists the isolation test compares against)
auth_write_expected(item) as (
  values
    ('experts.display_name:insert'), ('experts.bio:insert'), ('experts.languages:insert'), ('experts.modes:insert'),
    ('experts.availability_note:insert'), ('experts.active:insert'),
    ('expert_services.expert_id:insert'), ('expert_services.service_slug:insert'),
    ('consultation_requests.service_slug:insert'), ('consultation_requests.mode:insert'), ('consultation_requests.concern:insert'),
    ('consultation_requests.date_of_birth:insert'), ('consultation_requests.preferred_language:insert'), ('consultation_requests.consent_version:insert'),
    ('request_notes.request_id:insert'), ('request_notes.body:insert'),
    ('app_settings.key:insert'), ('app_settings.value:insert'),
    ('services.name:update'), ('services.active:update'), ('services.display_order:update'),
    ('service_prices.amount_minor:update'),
    ('experts.display_name:update'), ('experts.bio:update'), ('experts.languages:update'), ('experts.modes:update'),
    ('experts.availability_note:update'), ('experts.active:update'),
    ('profiles.full_name:update'), ('profiles.phone:update'), ('profiles.date_of_birth:update'), ('profiles.preferred_language:update'),
    ('consultation_requests.status:update'), ('consultation_requests.assigned_expert_id:update'),
    ('consultation_requests.scheduled_at:update'), ('consultation_requests.meeting_link:update'),
    ('app_settings.value:update')
),
auth_write_actual as (
  select c.t || '.' || c.col || ':' || p.pr as item
    from cols c cross join (values ('insert'), ('update')) p(pr)
   where has_column_privilege('authenticated', c.oid, c.attnum, p.pr)
),
anon_read_expected(item) as (
  values
    ('services.slug:select'), ('services.name:select'), ('services.dob_requirement:select'), ('services.active:select'),
    ('services.display_order:select'), ('services.updated_at:select'),
    ('service_prices.service_slug:select'), ('service_prices.mode:select'), ('service_prices.amount_minor:select'),
    ('service_prices.currency:select'), ('service_prices.updated_at:select'),
    ('experts.id:select'), ('experts.display_name:select'), ('experts.bio:select'), ('experts.languages:select'),
    ('experts.modes:select'), ('experts.availability_note:select'), ('experts.active:select'),
    ('experts.created_at:select'), ('experts.updated_at:select'),
    ('expert_services.expert_id:select'), ('expert_services.service_slug:select')
),
anon_actual as (
  select c.t || '.' || c.col || ':' || p.pr as item
    from cols c cross join (values ('select'), ('insert'), ('update')) p(pr)
   where has_column_privilege('anon', c.oid, c.attnum, p.pr)
),
-- ---- privileges: staff/admin identifier columns must not be readable by any API role ---------------------------------------
hidden(t, col) as (
  values ('payments', 'submitted_by'), ('payments', 'verified_by'), ('payments', 'refunded_by'),
         ('service_prices', 'updated_by'), ('app_settings', 'updated_by'), ('staff_members', 'created_by'),
         ('request_notes', 'author_id')
),
hidden_found as (
  select h.t, h.col, c.oid, c.attnum from hidden h join cols c on c.t = h.t and c.col = h.col
),
hidden_bad as (
  select f.t || '.' || f.col as item from hidden_found f
   where has_column_privilege('authenticated', f.oid, f.attnum, 'select') or has_column_privilege('anon', f.oid, f.attnum, 'select')
),
-- ---- privileges: function EXECUTE matrix (24 functions; the signatures are those in the migrations) --------------------------
fn_expected(sig, auth_ok) as (
  values
    ('public.cancel_my_request(uuid)', true),
    ('public.submit_payment_reference(uuid, text, text, date)', true),
    ('public.verify_payment(uuid, text, integer, text)', true),
    ('public.refund_payment(uuid, text)', true),
    ('private.staff_role()', true),
    ('private.is_admin()', true),
    ('private.is_staff_account()', true),
    ('private.staff_expert_id()', true),
    ('private.confirmation_problem(uuid, text, public.consultation_mode)', true),
    ('private.mfa_session_ok(uuid)', false),
    ('private.handle_new_user()', false),
    ('private.sync_profile_email()', false),
    ('private.handle_user_deleted()', false),
    ('private.anonymise_customer(uuid, boolean)', false),
    ('private.tg_set_updated_at()', false),
    ('private.tg_set_updated_by()', false),
    ('private.tg_profiles_validate()', false),
    ('private.tg_staff_members_guard()', false),
    ('private.tg_requests_before_insert()', false),
    ('private.tg_requests_before_update()', false),
    ('private.tg_requests_cancel_flag()', false),
    ('private.tg_payments_guard()', false),
    ('private.tg_audit()', false),
    ('private.tg_audit_log_guard()', false)
),
fn as (
  select e.sig, e.auth_ok, to_regprocedure(e.sig)::oid as oid from fn_expected e
),
fn_bad as (
  select f.sig || case when f.oid is null then ' [MISSING]'
                       when has_function_privilege('anon', f.oid, 'execute') then ' [anon can execute]'
                       when has_function_privilege('authenticated', f.oid, 'execute') is distinct from f.auth_ok then
                            case when f.auth_ok then ' [authenticated cannot execute]' else ' [authenticated can execute]' end
                       else '' end as item
    from fn f
   where f.oid is null
      or has_function_privilege('anon', f.oid, 'execute')
      or has_function_privilege('authenticated', f.oid, 'execute') is distinct from f.auth_ok
),
fn_unexpected as (
  select p.oid::regprocedure::text as item
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'private' and p.oid not in (select oid from fn where oid is not null)
),
-- ---- indexes: existence AND definition (INDEX-SPEC: identical to migration 0200 and the preflight) ---------------------------
idx_spec(iname, tname, uniq, cols_re, pred_has, pred_not) as (
  values
    -- INDEX-SPEC-BEGIN
    ('staff_members_one_login_per_expert', 'staff_members',        true,  '\(expert_id\)',                 array['expert_id'],                           array[]::text[]),
    ('requests_customer_created_idx',      'consultation_requests', false, '\(customer_id, created_at DESC\)', array[]::text[],                          array[]::text[]),
    ('requests_status_created_idx',        'consultation_requests', false, '\(status, created_at\)',        array[]::text[],                           array[]::text[]),
    ('requests_expert_idx',                'consultation_requests', false, '\(assigned_expert_id\)',        array[]::text[],                           array[]::text[]),
    ('requests_service_idx',               'consultation_requests', false, '\(service_slug\)',              array[]::text[],                           array[]::text[]),
    ('request_notes_request_idx',          'request_notes',         false, '\(request_id, created_at\)',     array[]::text[],                           array[]::text[]),
    ('payments_request_idx',               'payments',              false, '\(request_id\)',                 array[]::text[],                           array[]::text[]),
    ('payments_one_pending_per_request',   'payments',              true,  '\(request_id\)',                 array['pending'],                          array['succeeded', 'failed', 'refunded']),
    ('payments_reference_active',          'payments',              true,  '\(upi_reference\)',              array['pending', 'succeeded', 'refunded'], array['failed']),
    ('audit_log_at_idx',                   'audit_log',             false, '\(at DESC\)',                    array[]::text[],                           array[]::text[]),
    ('audit_log_entity_idx',               'audit_log',             false, '\(entity, entity_id\)',          array[]::text[],                           array[]::text[])
    -- INDEX-SPEC-END
),
idx_ok as (
  select s.iname
    from idx_spec s
    join pg_catalog.pg_class c on c.relname = s.iname and c.relkind = 'i'
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_catalog.pg_index ix on ix.indexrelid = c.oid
    join pg_catalog.pg_class t on t.oid = ix.indrelid
   where t.relname::text = s.tname and ix.indisunique = s.uniq and ix.indisvalid and ix.indisready
     and pg_catalog.pg_get_indexdef(ix.indexrelid) ~* s.cols_re
     and not exists (select 1 from unnest(s.pred_has) w where position(w in coalesce(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), '')) = 0)
     and not exists (select 1 from unnest(s.pred_not) w where position(w in coalesce(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), '')) > 0)
     and (cardinality(s.pred_has) > 0 or s.uniq or ix.indpred is null)
),
-- ---- constraints: the payment-state and request-state rules must exist, be validated, and say what they should --------------
con_expected(tname, cname, token) as (
  values
    ('payments', 'payments_method', 'manual_upi'), ('payments', 'payments_currency', 'INR'), ('payments', 'payments_amount', 'amount_minor'),
    ('payments', 'payments_received', 'received_amount_minor'), ('payments', 'payments_reference', 'upi_reference'),
    ('payments', 'payments_payer_name', 'payer_name'), ('payments', 'payments_payer_nodigits', '[0-9]{4,}'),
    ('payments', 'payments_paid_on', 'paid_on'), ('payments', 'payments_verified_flag', 'verified_at'),
    ('payments', 'payments_refunded_flag', 'refunded_at'), ('payments', 'payments_paid_amount', 'received_amount_minor'),
    ('consultation_requests', 'requests_customer_name', 'customer_name'), ('consultation_requests', 'requests_concern_len', 'concern'),
    ('consultation_requests', 'requests_dob_range', 'date_of_birth'), ('consultation_requests', 'requests_language_len', 'preferred_language'),
    ('consultation_requests', 'requests_confirmed_needs', 'assigned_expert_id'), ('consultation_requests', 'requests_link_status', 'meeting_link'),
    ('consultation_requests', 'requests_link_format', 'https')
),
con_bad as (
  select e.tname || '.' || e.cname as item
    from con_expected e
   where not exists (
     select 1 from pg_catalog.pg_constraint k
       join pg_catalog.pg_class c on c.oid = k.conrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relname::text = e.tname and k.conname::text = e.cname and k.contype = 'c' and k.convalidated
        and position(e.token in pg_catalog.pg_get_constraintdef(k.oid)) > 0)
),
trig_expected(tname) as (
  values ('on_auth_user_created'), ('on_auth_user_email_changed'), ('on_auth_user_deleted'), ('staff_members_guard'),
         ('requests_before_insert'), ('requests_before_update'), ('payments_guard'), ('profiles_validate'),
         ('requests_cancel_flag'), ('audit_log_no_change'), ('audit_log_no_truncate')
),
trig_ok as (
  select e.tname
    from trig_expected e
   where exists (
     select 1 from pg_catalog.pg_trigger t
       join pg_catalog.pg_class c on c.oid = t.tgrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and t.tgname::text = e.tname and t.tgenabled = 'O'
        and ((n.nspname = 'public') or (n.nspname = 'auth' and c.relname = 'users')))
),
checks(n, check_name, result, detail) as (
  values
    (1, 'RLS enabled on all 12 tables',
        case when (select count(*) from tbl) = 12 and (select count(*) from pg_catalog.pg_class c where c.oid in (select oid from tbl) and c.relrowsecurity) = 12
             then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(t.t, ', ' order by t.t) from tbl t join pg_catalog.pg_class c on c.oid = t.oid where not c.relrowsecurity), 'none missing')
          || ' (' || (select count(*)::text from tbl) || ' of 12 tables found)'),

    (2, 'the 12 Phase 1 tables exist and carry the project marker',
        case when (select count(*) from tbl t where pg_catalog.obj_description(t.oid, 'pg_class') = 'astrasoul:phase1') = 12 then 'OK' else 'PROBLEM' end, ''),

    (3, 'every table has at least one policy (a table with none is deny-all, which would break the website)',
        case when (select count(*) from our_tables o where not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = o.t)) = 0
             then 'OK' else 'PROBLEM' end,
        (select string_agg(t.t || '=' || (select count(*)::text from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = t.t), ', ' order by t.t) from our_tables t)),

    (4, 'all 24 of our functions exist and every SECURITY DEFINER one pins search_path',
        case when (select count(*) from fn where oid is not null) = 24
              and (select count(*) from fn f join pg_catalog.pg_proc p on p.oid = f.oid
                    where p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) = 0
             then 'OK' else 'PROBLEM' end,
        (select count(*)::text from fn where oid is not null) || ' of 24 functions found'),

    (5, 'anon: no table-level privilege except SELECT on services, experts, expert_services',
        case when (select count(*) from anon_table_bad) = 0 and (select count(*) from tbl) = 12 then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(item, ', ' order by item) from anon_table_bad), 'none')),
    (6, 'anon: no column-level privilege except SELECT on the four public reference tables',
        case when (select count(*) from anon_column_bad) = 0 and (select count(*) from tbl) = 12 then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(item, ', ' order by item) from anon_column_bad), 'none')),
    (7, 'authenticated: no table-level INSERT/DELETE/TRUNCATE/REFERENCES/TRIGGER (except INSERT and DELETE on expert_services)',
        case when (select count(*) from auth_table_bad) = 0 and (select count(*) from tbl) = 12 then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(item, ', ' order by item) from auth_table_bad), 'none')),
    (8, 'authenticated: the EXACT set of insertable/updatable columns (nothing extra, nothing missing)',
        case when (select count(*) from tbl) = 12
              and not exists (select item from auth_write_actual except select item from auth_write_expected)
              and not exists (select item from auth_write_expected except select item from auth_write_actual) then 'OK' else 'PROBLEM' end,
        'EXTRA: ' || coalesce((select string_agg(item, ', ' order by item) from (select item from auth_write_actual except select item from auth_write_expected) x), '-')
          || ' | MISSING: ' || coalesce((select string_agg(item, ', ' order by item) from (select item from auth_write_expected except select item from auth_write_actual) x), '-')),
    (9, 'anon: the EXACT set of readable columns, and nothing writable',
        case when (select count(*) from tbl) = 12
              and not exists (select item from anon_actual except select item from anon_read_expected)
              and not exists (select item from anon_read_expected except select item from anon_actual) then 'OK' else 'PROBLEM' end,
        'EXTRA: ' || coalesce((select string_agg(item, ', ' order by item) from (select item from anon_actual except select item from anon_read_expected) x), '-')
          || ' | MISSING: ' || coalesce((select string_agg(item, ', ' order by item) from (select item from anon_read_expected except select item from anon_actual) x), '-')),
    (10, 'staff/admin identifier columns (7) are NOT readable by anon or authenticated',
        case when (select count(*) from hidden_found) = 7 and (select count(*) from hidden_bad) = 0 then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(item, ', ' order by item) from hidden_bad), 'none readable') || ' (' || (select count(*)::text from hidden_found) || ' of 7 columns found)'),
    (11, 'function EXECUTE matrix: anon none; authenticated only the 4 RPCs and the 5 policy helpers; all 24 present',
        case when (select count(*) from fn_bad) = 0 and (select count(*) from fn where oid is not null) = 24 then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(item, '; ' order by item) from fn_bad), 'matrix as expected')),
    (12, 'schema "private" holds no function outside the expected 20',
        case when (select count(*) from fn_unexpected) = 0 then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(item, ', ' order by item) from fn_unexpected), 'none')),
    (13, 'schema privileges: private usable by authenticated, not by anon; audit_log sequence unusable by both',
        case when (select count(*) from tbl) < 12 or to_regnamespace('private') is null or pg_get_serial_sequence('public.audit_log', 'id') is null then 'PROBLEM'
             when has_schema_privilege('anon', 'private', 'usage') or not has_schema_privilege('authenticated', 'private', 'usage') then 'PROBLEM'
             when has_sequence_privilege('anon', pg_get_serial_sequence('public.audit_log', 'id'), 'usage')
               or has_sequence_privilege('authenticated', pg_get_serial_sequence('public.audit_log', 'id'), 'usage')
               or has_sequence_privilege('anon', pg_get_serial_sequence('public.audit_log', 'id'), 'select')
               or has_sequence_privilege('authenticated', pg_get_serial_sequence('public.audit_log', 'id'), 'select') then 'PROBLEM'
             else 'OK' end, ''),
    (14, 'private is NOT among the Data API exposed schemas',
        case when not exists (select 1 from api_schemas) then 'UNKNOWN'
             when exists (select 1 from api_schemas a where 'private' = any (string_to_array(replace(a.val, ' ', ''), ','))) then 'PROBLEM'
             else 'OK' end,
        coalesce((select val from api_schemas limit 1), 'could not be read from the database: check Dashboard > Project Settings > API yourself')),

    (15, 'seed: 4 services, 12 price slots, all prices still NULL',
        case when (select count(*) from public.services) = 4
              and (select count(*) from public.service_prices) = 12
              and (select count(*) from public.service_prices where amount_minor is not null) = 0 then 'OK' else 'PROBLEM' end,
        (select count(*)::text from public.services) || ' services, ' || (select count(*)::text from public.service_prices) || ' price slots'),
    (16, 'nobody has a staff/admin role yet (expected until you run script 50)',
        case when (select count(*) from public.staff_members) = 0 then 'OK' else 'INFO' end,
        (select count(*)::text from public.staff_members) || ' staff rows'),
    (17, 'consent versions: requests stay impossible until you add an approved one', 'INFO',
        (select count(*)::text from public.consent_versions where active) || ' active consent version(s). 0 is expected right after setup (README: Consent versions).'),

    (18, 'all 11 expected triggers exist and are enabled (3 on auth.users, 8 on our tables)',
        case when (select count(*) from trig_ok) = 11 then 'OK' else 'PROBLEM' end,
        'missing or disabled: ' || coalesce((select string_agg(e.tname, ', ' order by e.tname) from trig_expected e where e.tname not in (select tname from trig_ok)), 'none')),
    (19, 'all 11 indexes exist with the intended definition (columns, uniqueness, WHERE condition, valid) - including the two security-critical payment indexes',
        case when (select count(*) from idx_ok) = 11 then 'OK' else 'PROBLEM' end,
        'missing or different: ' || coalesce((select string_agg(s.iname, ', ' order by s.iname) from idx_spec s where s.iname not in (select iname from idx_ok)), 'none')),
    (20, 'the 18 payment-state and request-state CHECK constraints exist, are validated and contain the expected rule',
        case when (select count(*) from con_bad) = 0 then 'OK' else 'PROBLEM' end,
        coalesce((select string_agg(item, ', ' order by item) from con_bad), 'none missing'))
)
select check_name, result, detail
from (
  select n, check_name, result, detail from checks
  union all
  select 99, 'VERDICT',
         case
           when exists (select 1 from checks where result is null or result not in ('OK', 'INFO', 'UNKNOWN'))
                or (select count(*) from checks) <> 20 then 'STOP'
           when exists (select 1 from checks where result = 'UNKNOWN') then 'MANUAL CHECK NEEDED'
           else 'OK' end,
         case
           when exists (select 1 from checks where result is null or result not in ('OK', 'INFO', 'UNKNOWN'))
                or (select count(*) from checks) <> 20
              then 'Send me the PROBLEM rows (or tell me if fewer than 20 check rows appeared). Do not connect the website.'
           when exists (select 1 from checks where result = 'UNKNOWN')
              then 'No problem found, but an item could not be checked from inside the database: check it in the dashboard before going on.'
           else 'Structure and effective privileges look as intended. This is NOT proof of behaviour: run the isolation test next.' end
) x
order by n;
