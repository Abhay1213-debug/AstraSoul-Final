-- =====================================================================================
-- 0500  LEAST-PRIVILEGE GRANTS + ROW LEVEL SECURITY POLICIES
-- Needs 0100-0400. Safe to re-run (re-asserts RLS, revokes, then re-grants; drops and recreates each policy).
-- (Row Level Security was already switched on, and default API access revoked, in 0200 right after each table was
--  created. The statements below repeat that on purpose, so this file alone always leaves the same state.)
--
-- Two independent layers protect every table:
--   1. GRANTS      - which roles may touch which tables/COLUMNS at all (everything is revoked first).
--   2. RLS POLICIES - which ROWS a permitted role may see or change.
-- Plus the triggers from 0300 (state machines, limits). A weakness in one layer does not open the data.
--
-- Roles: anon = not logged in. authenticated = any logged-in user. "Staff"/"admin" are NOT database roles:
-- they are rows in staff_members, recognised by private.is_admin() / private.staff_expert_id(), which also demand a
-- completed MFA login (aal2) and a verified authenticator factor. Those checks happen here, inside the database.
--
--   ADMIN  : sees and manages everything the website needs (all requests, profiles, payments, notes, audit log).
--   STAFF  : an expert's login. Sees ONLY requests assigned to its expert (with the customer's name, concern, birth date
--            and language - what a consultation needs - but never contact details or payments), may add internal notes
--            to those requests, set the meeting link and mark them completed.
--   CUSTOMER: sees and creates only their own rows.
--
-- COLUMN-LEVEL SELECT: some columns are deliberately not readable by any API role: staff/admin user ids
-- (payments.submitted_by/verified_by/refunded_by, request_notes.author_id, *.updated_by, staff_members.created_by). Consequence for the website:
-- NEVER use select('*') on those tables - list the columns. Admins find "who did it" in the audit log.
-- =====================================================================================

-- ---- 1. switch RLS on for every table -----------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.staff_members         enable row level security;
alter table public.services              enable row level security;
alter table public.service_prices        enable row level security;
alter table public.experts               enable row level security;
alter table public.expert_services       enable row level security;
alter table public.consent_versions      enable row level security;
alter table public.consultation_requests enable row level security;
alter table public.request_notes         enable row level security;
alter table public.payments              enable row level security;
alter table public.app_settings          enable row level security;
alter table public.audit_log             enable row level security;

-- ---- 2. start from NOTHING for the two API roles (Supabase's defaults grant far too much) -------------------
revoke all on table
  public.profiles, public.staff_members, public.services, public.service_prices, public.experts,
  public.expert_services, public.consent_versions, public.consultation_requests, public.request_notes,
  public.payments, public.app_settings, public.audit_log
from anon, authenticated;

do $$
declare s text := pg_get_serial_sequence('public.audit_log', 'id');
begin
  if s is not null then
    execute format('revoke all on sequence %s from anon, authenticated', s);
  end if;
end $$;

-- ---- 3. grants (column lists are deliberate: a column not listed cannot be read/written through the API) ------

-- public reference data: anyone may read; only admin (via policy) may change selected columns
grant select on public.services, public.experts, public.expert_services to anon, authenticated;
grant select (service_slug, mode, amount_minor, currency, updated_at) on public.service_prices to anon, authenticated;   -- NOT updated_by
grant update (name, active, display_order)                            on public.services       to authenticated;
grant update (amount_minor)                                           on public.service_prices to authenticated;
grant insert (display_name, bio, languages, modes, availability_note, active),
      update (display_name, bio, languages, modes, availability_note, active)
                                                                      on public.experts        to authenticated;
grant insert, delete                                                  on public.expert_services to authenticated;

-- consent versions: logged-in users may see which versions are active; the owner manages them from the SQL Editor
grant select                                                          on public.consent_versions to authenticated;

-- customers' own data
grant select                                                          on public.profiles to authenticated;
grant update (full_name, phone, date_of_birth, preferred_language)    on public.profiles to authenticated;   -- NOT email, NOT id, NOT anonymised_at

grant select                                                          on public.consultation_requests to authenticated;
grant insert (service_slug, mode, concern, date_of_birth, preferred_language, consent_version)
                                                                      on public.consultation_requests to authenticated;  -- NOT customer_id/customer_name/status/expert/schedule/link
grant update (status, assigned_expert_id, scheduled_at, meeting_link) on public.consultation_requests to authenticated;  -- policy + trigger: admin, or the assigned staff login (very limited)

grant select (id, request_id, status, method, amount_minor, currency, upi_reference, payer_name, paid_on, submitted_at,
              received_amount_minor, verified_at, refunded_at)
                                                                      on public.payments to authenticated;   -- NOT submitted_by/verified_by/refunded_by; writes only via functions in 0400

-- staff/admin tooling
grant select (user_id, role, active, expert_id, created_at)           on public.staff_members to authenticated;  -- policy: own row only; NOT created_by; NO write access via API
grant select (id, request_id, body, kind, created_at),
      insert (request_id, body)                                       on public.request_notes to authenticated;  -- NOT author_id (a staff id; admins read it in the audit log); append-only; 'payment'/'system' notes are written only by functions/triggers
grant select                                                          on public.audit_log     to authenticated;  -- policy: admin only; NO write access via API
grant select (key, value, updated_at),
      insert (key, value),
      update (value)                                                  on public.app_settings  to authenticated;  -- NOT updated_by; read: any logged-in user; write: admin only

-- ---- 4. policies -----------------------------------------------------------------------------------------------
-- "(select ...)" is written as a sub-select so Postgres evaluates it once per query, not once per row.
-- A staff login's expert id is NULL for everyone else, so "assigned_expert_id = (select private.staff_expert_id())" is
-- never true for a customer or an admin.

-- profiles: own row, or admin. Staff have NO access to profiles. -----------------------------------------------------
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_staff on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;
create policy profiles_select_own   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles for select to authenticated using ((select private.is_admin()));
create policy profiles_update_own   on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- (no insert policy: profiles are created only by the signup trigger; no delete policy: customers cannot delete rows)

-- staff_members: a person may see ONLY their own row (the website needs it to know whether to offer MFA setup) ------
drop policy if exists staff_members_select_own on public.staff_members;
create policy staff_members_select_own on public.staff_members for select to authenticated using (user_id = (select auth.uid()));
-- (no write policies at all: roles are granted only from the SQL Editor, see supabase/scripts/50_grant_staff_role_TEMPLATE.sql)

-- consent_versions -------------------------------------------------------------------------------------------------
drop policy if exists consent_versions_select_active on public.consent_versions;
drop policy if exists consent_versions_select_admin  on public.consent_versions;
create policy consent_versions_select_active on public.consent_versions for select to authenticated using (active);
create policy consent_versions_select_admin  on public.consent_versions for select to authenticated using ((select private.is_admin()));

-- services / service_prices -----------------------------------------------------------------------------------------
drop policy if exists services_select_public on public.services;
drop policy if exists services_select_staff  on public.services;
drop policy if exists services_select_admin  on public.services;
drop policy if exists services_update_admin  on public.services;
create policy services_select_public on public.services for select to anon, authenticated using (active);
create policy services_select_admin  on public.services for select to authenticated using ((select private.is_admin()));
create policy services_update_admin  on public.services for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists service_prices_select_public on public.service_prices;
drop policy if exists service_prices_update_admin  on public.service_prices;
create policy service_prices_select_public on public.service_prices for select to anon, authenticated using (true);
create policy service_prices_update_admin  on public.service_prices for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- experts / expert_services -------------------------------------------------------------------------------------------
drop policy if exists experts_select_active   on public.experts;
drop policy if exists experts_select_assigned on public.experts;
drop policy if exists experts_select_staff    on public.experts;
drop policy if exists experts_select_admin    on public.experts;
drop policy if exists experts_insert_admin    on public.experts;
drop policy if exists experts_update_admin    on public.experts;
create policy experts_select_active   on public.experts for select to anon, authenticated using (active);
-- a customer can always see the expert assigned to their own request, even if that expert is later deactivated
create policy experts_select_assigned on public.experts for select to authenticated using (
  exists (select 1 from public.consultation_requests r
           where r.assigned_expert_id = experts.id and r.customer_id = (select auth.uid())));
create policy experts_select_admin    on public.experts for select to authenticated using ((select private.is_admin()));
create policy experts_insert_admin    on public.experts for insert to authenticated with check ((select private.is_admin()));
create policy experts_update_admin    on public.experts for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists expert_services_select_public on public.expert_services;
drop policy if exists expert_services_select_staff  on public.expert_services;
drop policy if exists expert_services_select_admin  on public.expert_services;
drop policy if exists expert_services_insert_admin  on public.expert_services;
drop policy if exists expert_services_delete_admin  on public.expert_services;
create policy expert_services_select_public on public.expert_services for select to anon, authenticated using (
  exists (select 1 from public.experts e where e.id = expert_services.expert_id and e.active));
create policy expert_services_select_admin  on public.expert_services for select to authenticated using ((select private.is_admin()));
create policy expert_services_insert_admin  on public.expert_services for insert to authenticated with check ((select private.is_admin()));
create policy expert_services_delete_admin  on public.expert_services for delete to authenticated using ((select private.is_admin()));

-- consultation_requests ---------------------------------------------------------------------------------------------
drop policy if exists requests_select_own            on public.consultation_requests;
drop policy if exists requests_select_staff          on public.consultation_requests;
drop policy if exists requests_select_admin          on public.consultation_requests;
drop policy if exists requests_select_staff_assigned on public.consultation_requests;
drop policy if exists requests_insert_own            on public.consultation_requests;
drop policy if exists requests_update_staff          on public.consultation_requests;
drop policy if exists requests_update_admin          on public.consultation_requests;
drop policy if exists requests_update_staff_assigned on public.consultation_requests;
create policy requests_select_own   on public.consultation_requests for select to authenticated using (customer_id = (select auth.uid()));
create policy requests_select_admin on public.consultation_requests for select to authenticated using ((select private.is_admin()));
create policy requests_select_staff_assigned on public.consultation_requests for select to authenticated using (
  assigned_expert_id is not null and assigned_expert_id = (select private.staff_expert_id()));
create policy requests_insert_own   on public.consultation_requests for insert to authenticated with check (customer_id = (select auth.uid()));
create policy requests_update_admin on public.consultation_requests for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
-- the trigger in 0300 further limits a staff login to: set the meeting link, and mark a confirmed request completed
create policy requests_update_staff_assigned on public.consultation_requests for update to authenticated
  using (assigned_expert_id is not null and assigned_expert_id = (select private.staff_expert_id()))
  with check (assigned_expert_id is not null and assigned_expert_id = (select private.staff_expert_id()));
-- (customers have NO update and NO delete policy: they cancel only through public.cancel_my_request)

-- request_notes: internal, append-only (no update/delete policy and no such grant). Admin: all notes. Staff: only the
-- 'general' notes of requests assigned to them (payment notes are never shown to staff). Customers: none. ---------------
drop policy if exists request_notes_select_staff          on public.request_notes;
drop policy if exists request_notes_insert_staff          on public.request_notes;
drop policy if exists request_notes_select_admin          on public.request_notes;
drop policy if exists request_notes_select_staff_assigned on public.request_notes;
drop policy if exists request_notes_insert_admin          on public.request_notes;
drop policy if exists request_notes_insert_staff_assigned on public.request_notes;
create policy request_notes_select_admin on public.request_notes for select to authenticated using ((select private.is_admin()));
create policy request_notes_select_staff_assigned on public.request_notes for select to authenticated using (
  kind = 'general'
  and exists (select 1 from public.consultation_requests r
               where r.id = request_notes.request_id and r.assigned_expert_id = (select private.staff_expert_id())));
-- (author_id and kind are not insertable through the API: author_id always takes its default auth.uid(), kind its default
--  'general'; so the policies do not need to - and deliberately do not - read the hidden author_id column)
create policy request_notes_insert_admin on public.request_notes for insert to authenticated
  with check ((select private.is_admin()));
create policy request_notes_insert_staff_assigned on public.request_notes for insert to authenticated
  with check (exists (select 1 from public.consultation_requests r
                       where r.id = request_notes.request_id and r.assigned_expert_id = (select private.staff_expert_id())));

-- payments: read-only through the API; every write goes through the functions in 0400. Customer: own; admin: all; staff: NONE.
drop policy if exists payments_select_own   on public.payments;
drop policy if exists payments_select_staff on public.payments;
drop policy if exists payments_select_admin on public.payments;
create policy payments_select_own on public.payments for select to authenticated using (
  exists (select 1 from public.consultation_requests r
           where r.id = payments.request_id and r.customer_id = (select auth.uid())));
create policy payments_select_admin on public.payments for select to authenticated using ((select private.is_admin()));

-- app_settings: any logged-in CUSTOMER may read (they need the UPI details to pay); STAFF accounts may not (with or
-- without MFA); only an admin may write ---------------------------------------------------------------------------------
drop policy if exists app_settings_select_auth      on public.app_settings;
drop policy if exists app_settings_select_non_staff on public.app_settings;
drop policy if exists app_settings_insert_admin     on public.app_settings;
drop policy if exists app_settings_update_admin     on public.app_settings;
create policy app_settings_select_non_staff on public.app_settings for select to authenticated using (not (select private.is_staff_account()));
create policy app_settings_insert_admin on public.app_settings for insert to authenticated with check ((select private.is_admin()));
create policy app_settings_update_admin on public.app_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- audit_log: admin read-only. No insert/update/delete policy and no such grant: only our triggers write it ----------------
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log for select to authenticated using ((select private.is_admin()));
