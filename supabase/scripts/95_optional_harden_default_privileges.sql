-- =====================================================================================
-- 95  OPTIONAL: stop FUTURE tables being exposed by default
-- Supabase gives the API roles broad rights on every new table you create in "public" afterwards; only Row Level
-- Security then protects it. This makes new tables start with NO API access, so forgetting RLS on a future table
-- cannot leak data. Effect: any table you create later (including via the dashboard's table editor) needs explicit
-- GRANTs before the website can use it. It does NOT change any existing table. Reversible (see bottom).
-- Not required for Phase 1. Run only if you want it.
-- =====================================================================================
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- To undo:
--   alter default privileges in schema public grant all on tables    to anon, authenticated;
--   alter default privileges in schema public grant all on sequences to anon, authenticated;
--   alter default privileges in schema public grant all on functions to anon, authenticated;
