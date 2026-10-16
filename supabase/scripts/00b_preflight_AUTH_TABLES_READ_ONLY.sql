-- =====================================================================================
-- 00b  PREFLIGHT, PART 2: the Supabase-managed tables auth.users and auth.mfa_factors  (READ-ONLY: changes nothing, creates nothing)
-- Run this AFTER 00_preflight_READ_ONLY.sql. It only ASKS the database "what is this role allowed to do?" (privilege inquiry functions) and
-- reads catalog metadata. It does not read any account, it does not touch any row of auth.users or auth.mfa_factors, it changes no setting
-- and needs no ownership of any table. It shows no customer data and no secrets (names and counts only). Safe to copy the whole result.
--
-- WHY THIS IS A SEPARATE SCRIPT: the first version of the preflight had these checks inside the main script, and a run in a real Supabase
-- project stopped with "ERROR 42501: must be owner of table users". Keeping the checks about the managed auth tables apart means a refusal
-- here can no longer hide the rest of the report.
--
-- HOW TO READ IT (same words as the main preflight)
--   * The LAST row is the verdict: STOP (a PROBLEM, a blank or unrecognised row, or the wrong number of rows) / OK to continue.
--   * PROBLEM = do not run any migration; send me the row(s).   INFO = for your information.
--   * The preflight is complete only when BOTH scripts are done: 00 ends in "OK to continue" or "MANUAL CHECK NEEDED" caused only by rows
--     9-12 and 26 (26 is checked in the dashboard), AND this script ends in "OK to continue".
-- =====================================================================================
with
checks(n, check_name, result, detail) as (
  values
    (9,  'auth.users exists and is readable by this role',
         case when to_regclass('auth.users') is null then 'PROBLEM'
              when has_table_privilege(current_user, 'auth.users', 'select') then 'OK' else 'PROBLEM' end, ''),
    (10, 'this role can create triggers on auth.users (TRIGGER privilege)',
         case when to_regclass('auth.users') is null then 'PROBLEM'
              when has_table_privilege(current_user, 'auth.users', 'trigger') then 'OK' else 'PROBLEM' end, 'needed for the profile and deletion triggers'),
    (11, 'this role can reference auth.users in foreign keys (REFERENCES privilege)',
         case when to_regclass('auth.users') is null then 'PROBLEM'
              when has_table_privilege(current_user, 'auth.users', 'references') then 'OK' else 'PROBLEM' end,
         'needed by migration 0200 (staff_members, notes, payment and price history columns)'),
    (12, 'auth.mfa_factors exists, is readable, and has the columns the MFA checks use',
         case when to_regclass('auth.mfa_factors') is null then 'PROBLEM'
              when not has_table_privilege(current_user, 'auth.mfa_factors', 'select') then 'PROBLEM'
              when (select count(*) from pg_catalog.pg_attribute a
                     where a.attrelid = to_regclass('auth.mfa_factors') and not a.attisdropped
                       and a.attname in ('id', 'user_id', 'status', 'factor_type')) = 4 then 'OK'
              else 'PROBLEM' end, 'user_id, status, factor_type'),
    (13, 'this role may INSERT into auth.users and auth.mfa_factors (only the isolation test needs this)',
         case when to_regclass('auth.users') is not null and to_regclass('auth.mfa_factors') is not null
                   and has_table_privilege(current_user, 'auth.users', 'insert')
                   and has_table_privilege(current_user, 'auth.mfa_factors', 'insert')
              then 'OK' else 'INFO' end,
         'if INFO: the isolation test runs in REDUCED mode and says clearly which sections it could not test'),
    (28, 'approximate number of accounts in auth.users (planner statistics; auth.users itself is not read)', 'INFO',
         coalesce((select n_live_tup::text from pg_catalog.pg_stat_all_tables where schemaname = 'auth' and relname = 'users'), 'unknown'))
)
select check_name, result, detail
from (
  select n, check_name, result, detail from checks
  union all
  select 99, 'VERDICT',
         case
           -- anything other than OK / INFO / UNKNOWN (a PROBLEM, a blank, a NULL) or a wrong number of rows means STOP
           when exists (select 1 from checks where result is null or result not in ('OK', 'INFO', 'UNKNOWN'))
                or (select count(*) from checks) <> 6 then 'STOP'
           when exists (select 1 from checks where result = 'UNKNOWN') then 'MANUAL CHECK NEEDED'
           else 'OK to continue' end,
         case
           when exists (select 1 from checks where result is null or result not in ('OK', 'INFO', 'UNKNOWN'))
                or (select count(*) from checks) <> 6
              then 'Do not run any migration. Send me the PROBLEM rows above (or tell me if fewer than 6 check rows appeared).'
           when exists (select 1 from checks where result = 'UNKNOWN')
              then 'No problem found, but at least one item could not be checked from inside the database: check it in the dashboard first (README section 2).'
           else 'No conflicts found in the auth-table checks. This does NOT prove the migrations will succeed or that anything is secure. Continue with the next step in supabase/README.md.' end
) x
order by n;
