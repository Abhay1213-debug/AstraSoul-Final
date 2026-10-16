-- =====================================================================================
-- 00  PREFLIGHT  (READ-ONLY: changes nothing, creates nothing)
-- Run this FIRST. It checks that your project looks the way the migrations expect and looks for ANYTHING THAT
-- COULD BE REPLACED OR CONFLICT. It shows no customer data and no secrets (object names and counts only).
-- Safe to copy the whole result into a chat.
--
-- HOW TO READ IT
--   * The LAST row is the verdict:
--       STOP                 - at least one row says PROBLEM (or any row is missing/blank/unrecognised): run NOTHING else.
--       MANUAL CHECK NEEDED  - no problem found, but a row says UNKNOWN (something the database cannot tell us, for
--                              example whether the Data API exposes schema "private"): do that check in the dashboard first.
--       OK to continue       - every required check passed and no row is UNKNOWN.
--   * PROBLEM = do not run any migration; send me the row(s). A missing privilege is always a PROBLEM.
--   * UNKNOWN = could not be determined from inside the database; you must check it yourself.
--   * INFO    = for your information, no action needed.
--   * THIS SCRIPT NEVER OPENS THE SUPABASE-MANAGED TABLES auth.users / auth.mfa_factors BY NAME. Those checks (rows 9-13, 28) live in the
--     separate script 00b_preflight_AUTH_TABLES_READ_ONLY.sql. Expect rows 9-12 to say UNKNOWN here, so this script alone ends in
--     MANUAL CHECK NEEDED; the preflight is complete only when 00b ALSO ends in OK to continue.
--   * The migrations themselves repeat the most important of these checks and refuse to change anything if they fail.
--   * A previous run of THESE migrations is recognised by a marker comment on its objects and is reported as INFO,
--     not PROBLEM; anything that has our names but not our marker is a PROBLEM.
-- =====================================================================================
with
known_private_fns(fn) as (
  values ('tg_set_updated_at'), ('mfa_session_ok'), ('staff_role'), ('is_admin'), ('staff_expert_id'), ('confirmation_problem'),
         ('handle_new_user'), ('sync_profile_email'), ('handle_user_deleted'), ('tg_staff_members_guard'),
         ('tg_requests_before_insert'), ('tg_requests_before_update'), ('tg_payments_guard'), ('tg_set_updated_by'),
         ('tg_audit'), ('tg_profiles_validate'), ('anonymise_customer'), ('is_staff_account'), ('tg_audit_log_guard'),
         ('tg_requests_cancel_flag')
),
our_tables(t) as (
  values ('profiles'), ('staff_members'), ('services'), ('service_prices'), ('experts'), ('expert_services'),
         ('consent_versions'), ('consultation_requests'), ('request_notes'), ('payments'), ('app_settings'), ('audit_log')
),
our_types(t) as (
  values ('consultation_mode'), ('request_status'), ('payment_status'), ('staff_role'), ('dob_requirement')
),
our_rpcs(f) as (
  values ('cancel_my_request'), ('submit_payment_reference'), ('verify_payment'), ('refund_payment')
),
our_triggers(tg, fn) as (
  values ('on_auth_user_created', 'handle_new_user'), ('on_auth_user_email_changed', 'sync_profile_email'),
         ('on_auth_user_deleted', 'handle_user_deleted')
),
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
idx_found as (
  select s.iname, c.oid as oid, c.relkind
    from idx_spec s
    join pg_catalog.pg_class c on c.relname = s.iname
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
),
idx_conflicts as (
  select f.iname
    from idx_found f join idx_spec s on s.iname = f.iname
   where not exists (
     select 1
       from pg_catalog.pg_index ix join pg_catalog.pg_class t on t.oid = ix.indrelid
      where ix.indexrelid = f.oid and f.relkind = 'i'
        and t.relname::text = s.tname and ix.indisunique = s.uniq and ix.indisvalid and ix.indisready
        and pg_catalog.pg_get_indexdef(ix.indexrelid) ~* s.cols_re
        and not exists (select 1 from unnest(s.pred_has) w where position(w in coalesce(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), '')) = 0)
        and not exists (select 1 from unnest(s.pred_not) w where position(w in coalesce(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), '')) > 0)
        and (cardinality(s.pred_has) > 0 or s.uniq or ix.indpred is null)
   )
),
auth_triggers as (
  select t.tgname::text as tg, p.proname::text as fn, ps.nspname::text as fn_schema, p.prosrc as src
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c      on c.oid = t.tgrelid
    join pg_catalog.pg_namespace cs on cs.oid = c.relnamespace
    join pg_catalog.pg_proc p       on p.oid = t.tgfoid
    join pg_catalog.pg_namespace ps on ps.oid = p.pronamespace
   where cs.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
),
private_foreign as (
  select p.proname::text as name
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'private' and p.proname not in (select fn from known_private_fns)
  union all
  select c.relname::text
    from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'private' and c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
),
table_conflicts as (
  select c.relname::text as name
    from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relname in (select t from our_tables)
     and pg_catalog.obj_description(c.oid, 'pg_class') is distinct from 'astrasoul:phase1'
),
our_existing_tables as (
  select c.relname::text as name
    from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relname in (select t from our_tables)
     and pg_catalog.obj_description(c.oid, 'pg_class') = 'astrasoul:phase1'
),
type_conflicts as (
  select t.typname::text as name
    from pg_catalog.pg_type t join pg_catalog.pg_namespace s on s.oid = t.typnamespace
   where s.nspname = 'public' and t.typname in (select t from our_types)
     and pg_catalog.obj_description(t.oid, 'pg_type') is distinct from 'astrasoul:phase1'
),
rpc_conflicts as (
  select p.oid::regprocedure::text as name
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in (select f from our_rpcs)
     and pg_catalog.obj_description(p.oid, 'pg_proc') is distinct from 'astrasoul:phase1'
),
trigger_conflicts as (
  select a.tg as name
    from auth_triggers a
   where a.tg in (select tg from our_triggers)
     and not exists (select 1 from our_triggers o where o.tg = a.tg and o.fn = a.fn and a.fn_schema = 'private')
),
profile_trigger_suspects as (
  select a.tg as name
    from auth_triggers a
   where a.fn_schema <> 'private' and a.src ilike '%profiles%'
),
api_schemas as (
  select regexp_replace(c, '^pgrst\.db_schemas=', '') as val
    from pg_catalog.pg_roles r, lateral unnest(r.rolconfig) as c
   where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%'
),
checks(n, check_name, result, detail) as (
  values
    (1,  'Postgres version', 'INFO', version()),
    (2,  'running as database role', 'INFO', current_user::text || ' (the SQL Editor normally uses "postgres"; the migrations create objects owned by this role)'),
    (3,  'this role can create objects in schema public',
         case when has_schema_privilege(current_user, 'public', 'create') then 'OK' else 'PROBLEM' end, 'needed for the tables, types and functions'),
    (4,  'this role can create schemas in this database (schema "private")',
         case when has_database_privilege(current_user, current_database(), 'create') then 'OK' else 'PROBLEM' end,
         'needed by "create schema private" in migration 0100, even when the schema already exists'),

    (5,  'auth.uid() exists',  case when to_regprocedure('auth.uid()') is not null then 'OK' else 'PROBLEM' end, 'needed by every policy'),
    (6,  'auth.jwt() exists',  case when to_regprocedure('auth.jwt()') is not null then 'OK' else 'PROBLEM' end, 'needed for the MFA (aal2) check'),
    (7,  'roles anon and authenticated exist',
         case when (select count(*) from pg_catalog.pg_roles where rolname in ('anon', 'authenticated')) = 2 then 'OK' else 'PROBLEM' end, ''),
    (8,  'gen_random_uuid() available', case when to_regprocedure('gen_random_uuid()') is not null then 'OK' else 'PROBLEM' end, 'built in since Postgres 13'),

    -- Rows 9-13 and 28 inspect the Supabase-managed tables auth.users and auth.mfa_factors BY NAME. Those are checked by the separate
    -- script 00b_preflight_AUTH_TABLES_READ_ONLY.sql, so a refusal on those managed tables can never hide this whole report.
    -- Until 00b has been run and says OK, these rows are UNKNOWN on purpose: this script can never print "OK to continue" on its own.
    (9,  'auth.users exists and is readable by this role',
         'UNKNOWN', 'NOT checked by this script: run 00b_preflight_AUTH_TABLES_READ_ONLY.sql'),
    (10, 'this role can create triggers on auth.users (TRIGGER privilege)',
         'UNKNOWN', 'NOT checked by this script: run 00b_preflight_AUTH_TABLES_READ_ONLY.sql'),
    (11, 'this role can reference auth.users in foreign keys (REFERENCES privilege)',
         'UNKNOWN', 'NOT checked by this script: run 00b_preflight_AUTH_TABLES_READ_ONLY.sql'),
    (12, 'auth.mfa_factors exists, is readable, and has the columns the MFA checks use',
         'UNKNOWN', 'NOT checked by this script: run 00b_preflight_AUTH_TABLES_READ_ONLY.sql'),
    (13, 'this role may INSERT into auth.users and auth.mfa_factors (only the isolation test needs this)',
         'INFO', 'see 00b_preflight_AUTH_TABLES_READ_ONLY.sql'),

    (14, 'schema "private": no foreign objects',
         case when exists (select 1 from private_foreign) then 'PROBLEM' else 'OK' end,
         coalesce((select string_agg(name, ', ' order by name) from private_foreign), 'none')
           || case when exists (select 1 from pg_catalog.pg_namespace where nspname = 'private') then ' (schema exists)' else ' (schema does not exist yet)' end),
    (15, 'tables in public with OUR names but not ours',
         case when exists (select 1 from table_conflicts) then 'PROBLEM' else 'OK' end,
         coalesce((select string_agg(name, ', ' order by name) from table_conflicts), 'none')),
    (16, 'relations in public with the names of OUR 11 indexes that are not the intended index (a conflicting index could silently weaken payment-reference uniqueness)',
         case when exists (select 1 from idx_conflicts) then 'PROBLEM' else 'OK' end,
         coalesce((select string_agg(iname, ', ' order by iname) from idx_conflicts), 'none')),
    (17, 'types in public with OUR names but not ours',
         case when exists (select 1 from type_conflicts) then 'PROBLEM' else 'OK' end,
         coalesce((select string_agg(name, ', ' order by name) from type_conflicts), 'none')),
    (18, 'functions in public with OUR names but not ours',
         case when exists (select 1 from rpc_conflicts) then 'PROBLEM' else 'OK' end,
         coalesce((select string_agg(name, ', ' order by name) from rpc_conflicts), 'none')),
    (19, 'a function public.handle_new_user already exists (typical of a Supabase starter template)',
         case when exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
                            where s.nspname = 'public' and p.proname = 'handle_new_user') then 'PROBLEM' else 'OK' end, ''),
    (20, 'triggers on auth.users with OUR names that would be REPLACED',
         case when exists (select 1 from trigger_conflicts) then 'PROBLEM' else 'OK' end,
         coalesce((select string_agg(name, ', ' order by name) from trigger_conflicts), 'none')),
    (21, 'other triggers on auth.users whose function mentions "profiles" (possible second profile-creator; heuristic)',
         case when exists (select 1 from profile_trigger_suspects) then 'PROBLEM' else 'OK' end,
         coalesce((select string_agg(name, ', ' order by name) from profile_trigger_suspects), 'none')),
    (22, 'all triggers currently on auth.users (names only)', 'INFO',
         coalesce((select string_agg(tg, ', ' order by tg) from auth_triggers), 'none')),

    (23, 'previous run of these migrations?', 'INFO',
         case when (select count(*) from our_existing_tables) = 0 then 'no - fresh install'
              else (select count(*)::text from our_existing_tables) || ' of 12 tables already exist and are ours (a re-run: see README "Re-running and partial execution" - re-running 0300 may need ownership of auth.users)' end),
    (24, 'event triggers in this database (names only)', 'INFO',
         coalesce((select string_agg(evtname::text, ', ' order by evtname) from pg_catalog.pg_event_trigger), 'none')),
    (25, 'default privileges for new tables in public (does Supabase auto-grant API roles?)', 'INFO',
         case when exists (select 1 from pg_catalog.pg_default_acl d join pg_catalog.pg_namespace s on s.oid = d.defaclnamespace
                            where s.nspname = 'public' and d.defaclobjtype = 'r')
              then 'yes - new tables get broad API rights by default; the migrations revoke them straight after creating each table'
              else 'no default grants found' end),
    (26, 'private is NOT among the Data API exposed schemas',
         case when not exists (select 1 from api_schemas) then 'UNKNOWN'
              when exists (select 1 from api_schemas a where 'private' = any (string_to_array(replace(a.val, ' ', ''), ','))) then 'PROBLEM'
              else 'OK' end,
         coalesce((select val from api_schemas limit 1), 'could not be read from the database: check Dashboard > Project Settings > API > exposed schemas yourself (private must not be listed)')),
    (27, 'other tables already in public with Row Level Security OFF (not ours; names only)', 'INFO',
         coalesce((select string_agg(c.relname::text, ', ' order by c.relname)
                     from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
                      and c.relname not in (select t from our_tables)), 'none')),
    (28, 'approximate number of accounts in auth.users', 'INFO', 'see 00b_preflight_AUTH_TABLES_READ_ONLY.sql'),
    (29, 'tables currently in public (names only)', 'INFO',
         coalesce((select string_agg(tablename::text, ', ' order by tablename) from pg_catalog.pg_tables where schemaname = 'public'), 'none'))
)
select check_name, result, detail
from (
  select n, check_name, result, detail from checks
  union all
  select 99, 'VERDICT',
         case
           -- anything other than OK / INFO / UNKNOWN (a PROBLEM, a blank, a NULL) or a wrong number of rows means STOP
           when exists (select 1 from checks where result is null or result not in ('OK', 'INFO', 'UNKNOWN'))
                or (select count(*) from checks) <> 29 then 'STOP'
           when exists (select 1 from checks where result = 'UNKNOWN') then 'MANUAL CHECK NEEDED'
           else 'OK to continue' end,
         case
           when exists (select 1 from checks where result is null or result not in ('OK', 'INFO', 'UNKNOWN'))
                or (select count(*) from checks) <> 29
              then 'Do not run any migration. Send me the PROBLEM rows above (or tell me if fewer than 29 check rows appeared).'
           when exists (select 1 from checks where result = 'UNKNOWN')
              then 'No problem found, but at least one item is UNKNOWN. Rows 9-12 are normal here: they are checked by the separate script 00b_preflight_AUTH_TABLES_READ_ONLY.sql, which you must also run and which must say OK to continue. Any other UNKNOWN row (for example row 26) must be checked in the dashboard first (README section 2).'
           else 'No conflicts found. This does NOT prove the migrations will succeed or that anything is secure. Continue with the next step in supabase/README.md.' end
) x
order by n;
