-- =====================================================================================================================
-- Ankiro bookings (time slots and payments). Run ONCE in the Supabase SQL Editor.
-- If the editor asks about RLS, click "Run without RLS": this file switches RLS on itself, in the right order.
--
-- What it creates: one table, public.bookings. Only the website's server (with the secret key) can read or write it;
-- visitors and logged-in customers have no access at all. A held or paid booking blocks its time, from starts_at to
-- ends_at: the database itself refuses any other held or paid booking that overlaps it, so two sessions can never clash,
-- even when a longer one (the 25-minute Diamond package) runs into the next slot.
-- Test bookings (test = true) only ever block other test bookings.
-- =====================================================================================================================

do $guard$
begin
  if to_regclass('public.bookings') is not null then
    raise exception 'MIGRATION STOPPED: public.bookings already exists. Nothing was changed.';
  end if;
end
$guard$;

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  status           text not null check (status in ('held', 'paid', 'cancelled', 'expired', 'conflict')),
  hold_expires_at  timestamptz not null,
  slot_date        date not null,
  slot_time        text not null check (slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  session_minutes  integer not null check (session_minutes between 5 and 120),
  starts_at        timestamp not null,          -- Indian wall-clock time
  ends_at          timestamp not null check (ends_at > starts_at),
  mode             text not null default 'voice' check (mode = 'voice'),   -- every consultation is a voice call
  services         text[] not null check (cardinality(services) between 1 and 4
                     and services <@ array['numerology', 'palmistry', 'gemstone-guidance', 'color-therapy']::text[]),
  extension        boolean not null default false,
  amount_paise     integer not null check (amount_paise > 0),
  currency         text not null default 'INR' check (currency = 'INR'),
  test             boolean not null default false,
  name             text not null check (char_length(name) between 2 and 80),
  email            text not null check (char_length(email) between 3 and 254),
  phone            text not null check (char_length(phone) between 7 and 20),
  date_of_birth    date not null,
  language         text not null default '' check (char_length(language) <= 40),
  concern          text not null check (char_length(concern) between 10 and 1000),
  dodo_session_id  text,
  dodo_payment_id  text unique,
  paid_at          timestamptz
);
alter table public.bookings enable row level security;
revoke all on table public.bookings from anon, authenticated;
comment on table public.bookings is 'ankiro:bookings';

-- no two live bookings (held while paying, or paid) may overlap in time; test and real bookings are kept apart
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (tsrange(starts_at, ends_at) with &&) where (status in ('held', 'paid') and not test);
alter table public.bookings add constraint bookings_no_overlap_test
  exclude using gist (tsrange(starts_at, ends_at) with &&) where (status in ('held', 'paid') and test);
create index bookings_by_date on public.bookings (slot_date);
create index bookings_held_by_email on public.bookings (email) where status = 'held';

-- the team's view: upcoming paid sessions, soonest first (Table Editor > bookings, or run: select * from public.upcoming_sessions;)
create view public.upcoming_sessions with (security_invoker = true) as
  select slot_date, slot_time, session_minutes, mode, services, extension, name, phone, email, language, concern, date_of_birth,
         amount_paise / 100 as amount_rupees, test, id as booking_id, paid_at
  from public.bookings
  where status in ('paid', 'conflict') and slot_date >= (now() at time zone 'Asia/Kolkata')::date
  order by slot_date, slot_time;
revoke all on table public.upcoming_sessions from anon, authenticated;
