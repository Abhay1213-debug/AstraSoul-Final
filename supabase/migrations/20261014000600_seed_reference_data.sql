-- =====================================================================================
-- 0600  SEED REFERENCE DATA  (the four services and EMPTY price slots)
-- Needs 0100-0500. Safe to re-run: existing rows are left untouched ("on conflict do nothing").
--
--  * NO prices are invented: every price slot is NULL ("to be confirmed") until an admin sets one.
--  * NO expert profiles are inserted (the demonstration profiles in the website are not real people).
--  * NO payment details are inserted: the UPI ID and payee name are entered later by an admin.
--  * NO consent version is inserted: the wording of the consent is the business's to approve. Until you add one
--    (README, "Consent versions") no consultation request can be created - this is intended.
-- The marketing text for each service stays in the website code; only operational data lives here.
-- =====================================================================================

insert into public.services (slug, name, dob_requirement, display_order) values
  ('numerology',        'Numerology',        'required', 1),
  ('palmistry',         'Palmistry',         'optional', 2),
  ('gemstone-guidance', 'Gemstone Guidance', 'required', 3),
  ('color-therapy',     'Color Therapy',     'optional', 4)
on conflict (slug) do nothing;

insert into public.service_prices (service_slug, mode)
select s.slug, m
  from public.services s
 cross join unnest(enum_range(null::public.consultation_mode)) as m
on conflict (service_slug, mode) do nothing;

-- Accounts that already existed BEFORE the signup trigger was installed have no profile yet, and could never submit
-- a request. Create the missing ones (same name sanitising as the trigger). Idempotent: existing profiles are untouched.
insert into public.profiles (id, email, full_name)
select u.id,
       left(coalesce(u.email, ''), 320),
       case
         when char_length(left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 80)) >= 2
           then left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 80)
         when char_length(left(btrim(split_part(coalesce(u.email, ''), '@', 1)), 80)) >= 2
           then left(btrim(split_part(coalesce(u.email, ''), '@', 1)), 80)
         else 'Customer'
       end
  from auth.users u
on conflict (id) do nothing;
