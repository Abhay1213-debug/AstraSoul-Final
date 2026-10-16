-- =====================================================================================
-- 0200  TABLES, CONSTRAINTS, INDEXES  -  with Row Level Security switched on IMMEDIATELY after each table
-- Creates the 12 Phase 1 tables. Directly after each table is created, Row Level Security is enabled and every
-- default API privilege is revoked from anon/authenticated, so there is NO moment at which a new table is readable
-- through the Data API (the later migration 0500 adds the narrow grants and the policies). Run 0100 through 0600 as
-- one sequence; do not connect the website until all are applied.
--
-- SAFETY GUARDS (the file stops before changing anything if either fails):
--   1. a table with one of our names exists and is NOT marked as ours (comment 'astrasoul:phase1') - it would otherwise be
--      silently reused and re-labelled;
--   2. a relation with the name of one of our 11 indexes exists but is not the intended index (wrong kind, wrong table,
--      wrong uniqueness, wrong columns or wrong WHERE condition, or invalid). "create index if not exists" would SKIP it
--      silently, which could remove the payment-reference uniqueness or the one-pending-claim rule.
-- Safe to re-run: "if not exists" never alters or drops an existing table.
-- Ordering rule: for every table the statements are  create table -> enable RLS -> revoke API access -> marker comment ->
-- indexes, so nothing (not even an index statement) can fail between the table's creation and its lock-down.
--   (If you ever need to change a column on an existing table, write a new migration - do not edit this one.)
-- =====================================================================================

do $guard$
declare
  v_conflict text;
begin
  select string_agg(c.relname::text, ', ' order by c.relname) into v_conflict
    from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public'
     and c.relname in ('profiles', 'staff_members', 'services', 'service_prices', 'experts', 'expert_services',
                       'consent_versions', 'consultation_requests', 'request_notes', 'payments', 'app_settings', 'audit_log')
     and pg_catalog.obj_description(c.oid, 'pg_class') is distinct from 'astrasoul:phase1';
  if v_conflict is not null then
    raise exception 'MIGRATION STOPPED: these tables already exist in schema public and are not part of this project: %. Nothing was changed.', v_conflict;
  end if;
end
$guard$;

-- ---- guard 2: the 11 indexes (INDEX-SPEC: the same list is used by the preflight and the post-migration check) ---------
do $guard$
declare
  r        record;
  v_oid    oid;
  v_kind   "char";
  v_tbl    text;
  v_uniq   boolean;
  v_valid  boolean;
  v_def    text;
  v_pred   text;
  v_w      text;
  v_ok     boolean;
begin
  for r in
    select * from (values
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
    ) as v(iname, tname, uniq, cols_re, pred_has, pred_not)
  loop
    select c.oid, c.relkind into v_oid, v_kind
      from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relname = r.iname;
    if v_oid is null then
      continue;                       -- not there yet: it will be created below
    end if;
    v_ok := false;
    if v_kind = 'i' then
      select t.relname::text, ix.indisunique, (ix.indisvalid and ix.indisready), pg_catalog.pg_get_indexdef(ix.indexrelid),
             coalesce(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), '')
        into v_tbl, v_uniq, v_valid, v_def, v_pred
        from pg_catalog.pg_index ix join pg_catalog.pg_class t on t.oid = ix.indrelid
       where ix.indexrelid = v_oid;
      v_ok := v_tbl = r.tname and v_uniq = r.uniq and v_valid and v_def ~* r.cols_re;
      if v_ok then
        foreach v_w in array r.pred_has loop
          if position(v_w in v_pred) = 0 then v_ok := false; end if;
        end loop;
        foreach v_w in array r.pred_not loop
          if position(v_w in v_pred) > 0 then v_ok := false; end if;
        end loop;
        if r.pred_has = array[]::text[] and v_pred <> '' and not r.uniq then
          v_ok := false;              -- an index that must be plain (no WHERE) has a WHERE condition
        end if;
      end if;
    end if;
    if not v_ok then
      raise exception 'MIGRATION STOPPED: a relation named % already exists in schema public and is not the index this project creates (wrong kind, table, uniqueness, columns or condition, or invalid). Nothing was changed.', r.iname;
    end if;
  end loop;
end
$guard$;

-- ---- profiles: one row per customer account (created automatically at signup, see 0300) -------------------
-- No foreign key to auth.users on purpose: when an account is deleted the profile row stays as an ANONYMISED tombstone
-- so that financial and audit records remain intact (see 0300, private.anonymise_customer, and the README).
create table if not exists public.profiles (
  id                 uuid primary key,
  email              text not null default '',
  full_name          text not null,
  phone              text,
  date_of_birth      date,
  preferred_language text,
  anonymised_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint profiles_email_len      check (char_length(email) <= 320),
  constraint profiles_full_name_len  check (char_length(btrim(full_name)) between 2 and 80),
  constraint profiles_phone_format   check (phone is null or phone ~ '^\+?[0-9][0-9 -]{6,17}[0-9]$'),
  constraint profiles_dob_range      check (date_of_birth is null or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date)),
  constraint profiles_language_len   check (preferred_language is null or char_length(preferred_language) <= 40)
);
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
comment on table public.profiles is 'astrasoul:phase1';

-- ---- services: the four services (rows are inserted by migration 0600, not by the website) ----------------
create table if not exists public.services (
  slug            text primary key,
  name            text not null,
  dob_requirement public.dob_requirement not null,
  active          boolean not null default true,
  display_order   integer not null default 0,
  updated_at      timestamptz not null default now(),
  constraint services_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint services_name_len    check (char_length(btrim(name)) between 2 and 80)
);
alter table public.services enable row level security;
revoke all on table public.services from anon, authenticated;
comment on table public.services is 'astrasoul:phase1';

-- ---- service_prices: price per (service, mode). NULL = "price to be confirmed" ---------------------------
create table if not exists public.service_prices (
  service_slug text not null references public.services (slug) on update cascade on delete restrict,
  mode         public.consultation_mode not null,
  amount_minor integer,                         -- paise. NULL until you set a real price.
  currency     text not null default 'INR',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,   -- NOT readable through the API (see 0500)
  primary key (service_slug, mode),
  constraint service_prices_amount   check (amount_minor is null or (amount_minor > 0 and amount_minor <= 10000000)),
  constraint service_prices_currency check (currency = 'INR')
);
alter table public.service_prices enable row level security;
revoke all on table public.service_prices from anon, authenticated;
comment on table public.service_prices is 'astrasoul:phase1';

-- ---- experts (NO demo rows are inserted; add real experts only when you have real information) -----------
create table if not exists public.experts (
  id                uuid primary key default gen_random_uuid(),
  display_name      text not null,
  bio               text,
  languages         text[] not null default '{}',
  modes             public.consultation_mode[] not null default '{}',
  availability_note text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint experts_name_len         check (char_length(btrim(display_name)) between 2 and 80),
  constraint experts_bio_len          check (bio is null or char_length(bio) <= 600),
  constraint experts_availability_len check (availability_note is null or char_length(availability_note) <= 300),
  constraint experts_languages_count  check (cardinality(languages) <= 10)
);
alter table public.experts enable row level security;
revoke all on table public.experts from anon, authenticated;
comment on table public.experts is 'astrasoul:phase1';

create table if not exists public.expert_services (
  expert_id    uuid not null references public.experts (id) on delete cascade,
  service_slug text not null references public.services (slug) on update cascade on delete cascade,
  primary key (expert_id, service_slug)
);
alter table public.expert_services enable row level security;
revoke all on table public.expert_services from anon, authenticated;
comment on table public.expert_services is 'astrasoul:phase1';

-- ---- staff_members: who is staff/admin. Written ONLY from the SQL Editor (no API write path) -------------
-- A "staff" login represents ONE expert (expert_id) and can only ever see requests assigned to that expert.
create table if not exists public.staff_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.staff_role not null,
  active     boolean not null default true,
  expert_id  uuid references public.experts (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null    -- NOT readable through the API (see 0500)
);
alter table public.staff_members enable row level security;
revoke all on table public.staff_members from anon, authenticated;
comment on table public.staff_members is 'astrasoul:phase1';
create unique index if not exists staff_members_one_login_per_expert on public.staff_members (expert_id) where expert_id is not null;

-- ---- consent_versions: the approved consent texts a request may refer to (rows are added by the owner) ------
-- NO rows are inserted by any migration: the consent wording is the business's to approve. Until at least one
-- active version exists, no consultation request can be created (intended - see README).
create table if not exists public.consent_versions (
  version     text primary key,
  active      boolean not null default true,
  approved_at timestamptz not null default now(),
  constraint consent_versions_format check (version ~ '^[A-Za-z0-9._-]{1,20}$')
);
alter table public.consent_versions enable row level security;
revoke all on table public.consent_versions from anon, authenticated;
comment on table public.consent_versions is 'astrasoul:phase1';

-- ---- consultation_requests ------------------------------------------------------------------------------------
create table if not exists public.consultation_requests (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  customer_name      text not null default '',          -- copied from the profile by a trigger; the only customer detail staff need
  service_slug       text not null references public.services (slug) on update cascade on delete restrict,
  mode               public.consultation_mode not null,
  concern            text not null,
  date_of_birth      date,
  preferred_language text,
  consent_version    text not null references public.consent_versions (version) on update restrict on delete restrict,
  consent_at         timestamptz not null default now(),
  status             public.request_status not null default 'submitted',
  assigned_expert_id uuid references public.experts (id) on delete restrict,
  scheduled_at       timestamptz,
  meeting_link       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint requests_customer_name   check (char_length(customer_name) <= 80),
  constraint requests_concern_len     check (char_length(btrim(concern)) between 10 and 1000),
  constraint requests_dob_range       check (date_of_birth is null or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date)),
  constraint requests_language_len    check (preferred_language is null or char_length(preferred_language) <= 40),
  constraint requests_confirmed_needs check (status <> 'confirmed' or (assigned_expert_id is not null and scheduled_at is not null)),
  constraint requests_link_status     check (meeting_link is null or status in ('confirmed', 'completed')),
  constraint requests_link_format     check (meeting_link is null or (char_length(meeting_link) <= 500 and meeting_link ~ '^https://[^[:space:]]+$'))
);
alter table public.consultation_requests enable row level security;
revoke all on table public.consultation_requests from anon, authenticated;
comment on table public.consultation_requests is 'astrasoul:phase1';
create index if not exists requests_customer_created_idx on public.consultation_requests (customer_id, created_at desc);
create index if not exists requests_status_created_idx   on public.consultation_requests (status, created_at);
create index if not exists requests_expert_idx           on public.consultation_requests (assigned_expert_id);
create index if not exists requests_service_idx          on public.consultation_requests (service_slug);

-- ---- request_notes: INTERNAL notes, append-only (kind 'payment' notes are written only by the payment functions) --
create table if not exists public.request_notes (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.consultation_requests (id) on delete cascade,
  author_id  uuid default auth.uid() references auth.users (id) on delete set null,
  body       text not null,
  kind       text not null default 'general',
  created_at timestamptz not null default now(),
  constraint request_notes_body_len check (char_length(btrim(body)) between 1 and 2000),
  constraint request_notes_kind     check (kind in ('general', 'payment', 'system'))   -- 'system' = fixed "needs attention" flags written by triggers
);
alter table public.request_notes enable row level security;
revoke all on table public.request_notes from anon, authenticated;
comment on table public.request_notes is 'astrasoul:phase1';
create index if not exists request_notes_request_idx on public.request_notes (request_id, created_at);

-- ---- payments: manual UPI. Status is SEPARATE from consultation status ---------------------------------------
-- Collected for the admin's manual check, and nothing more: the reference, the payer's NAME as shown in the UPI app
-- and the payment DATE. No UPI handle, phone number, bank or card detail is requested - and the website must NEVER ask
-- for a UPI PIN, an OTP, a banking password or any card/bank credential (see PRODUCTION_READINESS.md).
create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  request_id            uuid not null references public.consultation_requests (id) on delete restrict,
  status                public.payment_status not null default 'pending',
  method                text not null default 'manual_upi',
  amount_minor          integer not null,       -- snapshot of the price at the moment the customer submitted the claim
  currency              text not null default 'INR',
  upi_reference         text not null,          -- normalised: upper-case letters and digits only
  payer_name            text not null,          -- as the customer says it appears in their UPI app / bank statement
  paid_on               date not null,          -- the date the customer says they paid
  submitted_by          uuid not null default auth.uid(),   -- no foreign key: survives deletion of the login (see README); NOT readable through the API
  submitted_at          timestamptz not null default now(),
  received_amount_minor integer,                -- what the admin saw in the bank statement when verifying
  verified_by           uuid references auth.users (id) on delete set null,   -- NOT readable through the API
  verified_at           timestamptz,
  refunded_by           uuid references auth.users (id) on delete set null,   -- NOT readable through the API
  refunded_at           timestamptz,
  constraint payments_method        check (method = 'manual_upi'),
  constraint payments_currency      check (currency = 'INR'),
  constraint payments_amount        check (amount_minor > 0 and amount_minor <= 10000000),
  constraint payments_received      check (received_amount_minor is null or received_amount_minor >= 0),
  constraint payments_reference     check (upi_reference ~ '^[A-Z0-9]{8,35}$'),
  constraint payments_payer_name    check (char_length(btrim(payer_name)) between 2 and 80),
  -- a name never contains a run of 4+ digits; this keeps PIN/OTP-like numbers out of the field if someone types one by mistake
  constraint payments_payer_nodigits check (payer_name !~ '[0-9]{4,}'),
  constraint payments_paid_on       check (paid_on >= date '2020-01-01' and paid_on <= current_date + 1),
  constraint payments_verified_flag check ((status = 'pending') = (verified_at is null)),
  constraint payments_refunded_flag check ((status = 'refunded') = (refunded_at is not null)),
  constraint payments_paid_amount   check (status not in ('succeeded', 'refunded') or received_amount_minor = amount_minor)
);
alter table public.payments enable row level security;
revoke all on table public.payments from anon, authenticated;
comment on table public.payments is 'astrasoul:phase1';
create index if not exists payments_request_idx on public.payments (request_id);
-- at most ONE open (pending) claim per request
create unique index if not exists payments_one_pending_per_request on public.payments (request_id) where status = 'pending';
-- A reference that is pending, accepted or REFUNDED is spent: it can never be claimed again by anyone. A reference
-- that was marked FAILED is released only for the customer who submitted it (the correction path); that cross-customer
-- rule is enforced in the payment guard trigger and in submit_payment_reference (0300 / 0400).
-- (Both unique indexes are security-critical: the guard at the top of this file refuses to continue if an index with one
--  of these names already exists with a different definition, because "create index if not exists" would silently skip it.)
create unique index if not exists payments_reference_active on public.payments (upi_reference) where status in ('pending', 'succeeded', 'refunded');

-- ---- app_settings: payment instructions etc., edited by an admin (nothing is hard-coded in the website) ------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,   -- NOT readable through the API
  constraint app_settings_key_allowed check (key in ('upi_id', 'payee_name', 'payment_instructions')),
  constraint app_settings_value_len   check (char_length(btrim(value)) between 1 and 500),
  constraint app_settings_payee_len   check (key <> 'payee_name' or char_length(btrim(value)) <= 80),
  constraint app_settings_upi_format  check (key <> 'upi_id' or value ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$')
);
alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
comment on table public.app_settings is 'astrasoul:phase1';

-- ---- audit_log: append-only record of who changed what. NEVER holds customer personal data (see 0300) ---------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,                  -- NULL = SQL Editor / system
  actor_kind text not null,         -- 'admin' | 'staff' | 'customer' | 'system'
  action     text not null,         -- 'insert' | 'update' | 'delete'
  entity     text not null,         -- table name
  entity_id  text not null,
  changes    jsonb not null default '{}'::jsonb,
  constraint audit_actor_kind check (actor_kind in ('admin', 'staff', 'customer', 'system'))
);
alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;

do $$
declare s text := pg_get_serial_sequence('public.audit_log', 'id');
begin
  if s is not null then
    execute format('revoke all on sequence %s from anon, authenticated', s);
  end if;
end $$;

comment on table public.audit_log is 'astrasoul:phase1';
create index if not exists audit_log_at_idx     on public.audit_log (at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
