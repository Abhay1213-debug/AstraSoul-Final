-- =====================================================================================
-- 70  GO-LIVE SETTINGS   (run ONCE by the owner in the SQL Editor, when online accounts and requests are being switched on)
-- It only ADDS three kinds of reference data. It reads or changes no customer data, and it is safe to run again (it updates, never duplicates).
--   1. the approved consent version (the owner approved the consent wording on 2026-10-16; the wording is the checkbox text in
--      src/components/ConsultationRequestFlow.tsx). Until a version exists, online requests are refused - by design.
--   2. the UPI ID and payee name (the same as in src/config/site.ts, so the website and the database agree).
--   3. the extra payment instructions shown with the payment steps.
-- Expect: "Success. No rows returned." (the editor may say "destructive operations" because of ON CONFLICT ... DO UPDATE; it is only
-- replacing these three settings.) If the editor offers "Run and enable RLS", choose "Run without RLS".
-- =====================================================================================

insert into public.consent_versions (version)
values ('2026-10-v1')
on conflict (version) do nothing;

insert into public.app_settings (key, value) values
  ('upi_id',               'abhayprabhakar1213@okhdfcbank'),
  ('payee_name',           'Abhay Prabhakar'),
  ('payment_instructions', 'Pay only the amount our team has confirmed with you. Then send the UPI reference, the name shown in your payment app and the date here. Each session is about 20 minutes, usually on Google Meet. Refunds: 80% before an expert is confirmed, none after.')
on conflict (key) do update set value = excluded.value;
