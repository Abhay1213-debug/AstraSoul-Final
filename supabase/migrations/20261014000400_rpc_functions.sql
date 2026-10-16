-- =====================================================================================
-- 0400  RPC FUNCTIONS  (the ONLY way to cancel a request, submit a payment claim, verify or refund a payment)
-- Needs 0100-0300. Safe to re-run ("create or replace").
--
-- These run as the database owner (SECURITY DEFINER) so they can write tables that the API cannot write directly,
-- which is exactly why each one re-checks who is calling and what they may do. Each is revoked from everyone and
-- then granted to logged-in users only; the admin-only ones then verify an active, MFA-verified admin inside.
-- Errors use the machine codes described in 0300 and never echo user-supplied values.
--
-- SAFETY GUARD: if a function with one of these names already exists in schema public and is NOT marked as ours
-- (comment 'astrasoul:phase1'), this file stops before changing anything.
--
-- ORDER WITHIN THIS FILE: every function is followed IMMEDIATELY by its revoke, grant and marker comment, so no function
-- ever exists with the default (broad) execute rights for longer than one statement.
--
-- LOCKING STRATEGY (request cancellation vs payment submission) - the row of the REQUEST is the single point of agreement:
--   cancel_my_request          1. SELECT ... FOR NO KEY UPDATE the request row      (the same lock any UPDATE of it takes)
--                              2. check for a succeeded payment, UPDATE the request; the AFTER trigger then flags a pending claim
--   submit_payment_reference   1. SELECT ... FOR SHARE the request row, re-checking "not cancelled" AFTER any wait
--                              2. advisory lock per request (serialises claims of one request)
--                              3. checks and INSERT of the claim
--   verify_payment/refund      1. SELECT ... FOR UPDATE the PAYMENT row  (then reads the request WITHOUT locking it)
--   Consequences: FOR SHARE and FOR NO KEY UPDATE conflict, so the two operations cannot interleave on one request.
--   If the cancellation commits first, the submission waits, re-reads the row, sees "cancelled" and is refused.
--   If the submission gets the lock first, the cancellation waits until the claim is committed; its AFTER trigger then
--   sees the pending claim and writes the ATTENTION flag. So an unflagged pending claim on a cancelled request cannot arise.
--   Deadlock check: every path takes the request lock BEFORE anything else it needs; verify/refund take only the payment
--   row, and need nothing that cancel or submit hold while waiting (their note INSERT needs only a KEY SHARE on the request
--   row, which does not conflict with NO KEY UPDATE or SHARE). The only advisory lock is taken after the request lock
--   and by no other function. This is reasoned, NOT tested: a true concurrent test needs two live sessions
--   (supabase/tests/REAL_SESSION_VALIDATION.md section 5b).
-- =====================================================================================

do $guard$
declare
  v_conflict text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname) into v_conflict
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public'
     and p.proname in ('cancel_my_request', 'submit_payment_reference', 'verify_payment', 'refund_payment')
     and pg_catalog.obj_description(p.oid, 'pg_proc') is distinct from 'astrasoul:phase1';
  if v_conflict is not null then
    raise exception 'MIGRATION STOPPED: functions with these names already exist in schema public and are not part of this project: %. Nothing was changed.', v_conflict;
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------------------------------------
-- cancel_my_request: a customer cancels THEIR OWN request, only before it is confirmed.
-- Payment rules (decided here, see README "Cancellation and payments"):
--   * a payment already SUCCEEDED for the request  -> the customer cannot cancel by themselves ("payment_received");
--     an admin handles it (cancel, then refund) so that money is never silently left against a cancelled request;
--   * a payment claim still PENDING -> cancelling is allowed; the claim stays pending for the admin to resolve
--     (mark it failed if no money arrived, or accept it and refund it).
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.cancel_my_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_status public.request_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'AS401';
  end if;

  select r.status into v_status
    from public.consultation_requests r
   where r.id = p_request_id and r.customer_id = v_uid
     for no key update;      -- conflicts with the FOR SHARE taken by submit_payment_reference (see the locking strategy above)

  -- one generic error for "not found", "not yours" and "too late", so nothing is revealed about other people's requests
  if not found or v_status not in ('submitted', 'awaiting_confirmation') then
    raise exception 'cannot_cancel' using errcode = 'AS409';
  end if;

  if exists (select 1 from public.payments p where p.request_id = p_request_id and p.status = 'succeeded') then
    raise exception 'payment_received' using errcode = 'AS409';
  end if;

  update public.consultation_requests r set status = 'cancelled' where r.id = p_request_id;
end;
$$;
revoke all on function public.cancel_my_request(uuid) from public, anon, authenticated;
grant execute on function public.cancel_my_request(uuid) to authenticated;
comment on function public.cancel_my_request(uuid) is 'astrasoul:phase1';

-- ---------------------------------------------------------------------------------------------------------
-- submit_payment_reference: the customer reports "I paid, here is my UPI reference, the name on the payment and the date".
-- This only ever creates a PENDING claim. Nothing becomes "paid" until an admin verifies it.
-- Reference rules: a reference that is pending, accepted or refunded is spent for everyone; a reference marked FAILED
-- can be submitted again only by the customer who submitted it (typo / correction), never by anyone else.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.submit_payment_reference(
  p_request_id    uuid,
  p_upi_reference text,
  p_payer_name    text,
  p_paid_on       date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_claims constant integer := 5;     -- total claims per request (any outcome), against guessing/spam
  v_uid     uuid := auth.uid();
  v_ref     text;
  v_name    text;
  v_service text;
  v_mode    public.consultation_mode;
  v_amount  integer;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'AS401';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'forbidden' using errcode = 'AS403';   -- anonymous sessions are never customers
  end if;

  v_ref := upper(btrim(coalesce(p_upi_reference, '')));
  if v_ref !~ '^[A-Z0-9]{8,35}$' then
    raise exception 'invalid_reference' using errcode = 'AS422';
  end if;
  v_name := regexp_replace(btrim(coalesce(p_payer_name, '')), '\s+', ' ', 'g');
  -- a name has no run of 4+ digits (keeps PIN/OTP-like numbers out of the field); the website must never ask for them anyway
  if char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]' or v_name ~ '[0-9]{4,}' then
    raise exception 'invalid_payer_name' using errcode = 'AS422';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 or p_paid_on < current_date - 30 then
    raise exception 'invalid_payment_date' using errcode = 'AS422';
  end if;

  -- only the owner, and not for a cancelled request. FOR SHARE locks the request row until this transaction ends: a
  -- concurrent cancellation (customer, admin or anonymisation) must wait for it, and if the cancellation committed first,
  -- the row is re-read after the wait and no longer matches "not cancelled" (so no claim is created).
  select r.service_slug, r.mode into v_service, v_mode
    from public.consultation_requests r
   where r.id = p_request_id and r.customer_id = v_uid and r.status <> 'cancelled'
     for share;
  if not found then
    raise exception 'request_not_payable' using errcode = 'AS409';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payments:' || p_request_id::text, 0));

  select p.amount_minor into v_amount
    from public.service_prices p
   where p.service_slug = v_service and p.mode = v_mode;
  if v_amount is null then
    raise exception 'price_not_set' using errcode = 'AS409';
  end if;

  if exists (select 1 from public.payments p where p.request_id = p_request_id and p.status = 'succeeded') then
    raise exception 'already_paid' using errcode = 'AS409';
  end if;
  if exists (select 1 from public.payments p where p.request_id = p_request_id and p.status = 'pending') then
    raise exception 'claim_already_pending' using errcode = 'AS409';
  end if;
  if (select count(*) from public.payments p where p.request_id = p_request_id) >= c_max_claims then
    raise exception 'too_many_payment_attempts' using errcode = 'AS429';
  end if;
  -- deliberately vague (does not say by whom or in what state): a reference already used by another customer
  if exists (select 1 from public.payments p where p.upi_reference = v_ref and p.submitted_by <> v_uid) then
    raise exception 'reference_unavailable' using errcode = 'AS409';
  end if;

  begin
    insert into public.payments (request_id, amount_minor, upi_reference, payer_name, paid_on, submitted_by)
    values (p_request_id, v_amount, v_ref, v_name, p_paid_on, v_uid)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'reference_unavailable' using errcode = 'AS409';
    when check_violation then
      -- a native check error would echo the row (including the payer name); return a generic code instead
      raise exception 'invalid_payment_details' using errcode = 'AS422';
  end;

  return v_id;
end;
$$;
revoke all on function public.submit_payment_reference(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.submit_payment_reference(uuid, text, text, date) to authenticated;
comment on function public.submit_payment_reference(uuid, text, text, date) is 'astrasoul:phase1';

-- ---------------------------------------------------------------------------------------------------------
-- verify_payment: ADMIN ONLY. Marks a pending claim succeeded or failed.
-- "succeeded" is only possible when the amount the admin saw in the bank statement equals the expected amount.
-- An admin can never verify a payment for a request of their own (separation of duties): another admin must do it.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.verify_payment(
  p_payment_id uuid,
  p_decision text,
  p_received_amount_minor integer default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_pay     public.payments%rowtype;
  v_cust    uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null or not private.is_admin() then
    raise exception 'forbidden' using errcode = 'AS403';
  end if;
  if p_decision is null or p_decision not in ('succeeded', 'failed') then
    raise exception 'invalid_decision' using errcode = 'AS422';
  end if;

  select * into v_pay from public.payments p where p.id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_pending' using errcode = 'AS409';
  end if;
  select r.customer_id into v_cust from public.consultation_requests r where r.id = v_pay.request_id;
  if v_pay.submitted_by = v_uid or v_cust = v_uid then
    raise exception 'self_verification_forbidden' using errcode = 'AS403';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'payment_not_pending' using errcode = 'AS409';
  end if;

  if p_decision = 'succeeded' and p_received_amount_minor is distinct from v_pay.amount_minor then
    raise exception 'amount_mismatch' using errcode = 'AS422';
  end if;

  update public.payments p
     set status = p_decision::public.payment_status,
         received_amount_minor = p_received_amount_minor,
         verified_by = v_uid,
         verified_at = now()
   where p.id = p_payment_id;

  -- never leave "paid" and "cancelled" silently side by side: flag it for the admin (fixed text, no customer data)
  if p_decision = 'succeeded'
     and exists (select 1 from public.consultation_requests r where r.id = v_pay.request_id and r.status = 'cancelled') then
    insert into public.request_notes (request_id, author_id, body, kind)
    values (v_pay.request_id, v_uid, 'ATTENTION: a payment was verified as SUCCEEDED on a request that is already cancelled. Refund the payment.', 'system');
  end if;

  -- the free-text note stays INTERNAL (admin-only kind of note), never on the customer-visible payment row
  if v_note is not null then
    insert into public.request_notes (request_id, author_id, body, kind)
    values (v_pay.request_id, v_uid, left('Payment ' || p_decision || ': ' || v_note, 2000), 'payment');
  end if;
end;
$$;
revoke all on function public.verify_payment(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.verify_payment(uuid, text, integer, text) to authenticated;
comment on function public.verify_payment(uuid, text, integer, text) is 'astrasoul:phase1';

-- ---------------------------------------------------------------------------------------------------------
-- refund_payment: ADMIN ONLY. A succeeded payment becomes refunded. (The actual money movement is manual.)
-- Same separation of duties as verify_payment.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.refund_payment(p_payment_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_pay  public.payments%rowtype;
  v_cust uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null or not private.is_admin() then
    raise exception 'forbidden' using errcode = 'AS403';
  end if;

  select * into v_pay from public.payments p where p.id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_refundable' using errcode = 'AS409';
  end if;
  select r.customer_id into v_cust from public.consultation_requests r where r.id = v_pay.request_id;
  if v_pay.submitted_by = v_uid or v_cust = v_uid then
    raise exception 'self_verification_forbidden' using errcode = 'AS403';
  end if;
  if v_pay.status <> 'succeeded' then
    raise exception 'payment_not_refundable' using errcode = 'AS409';
  end if;

  update public.payments p
     set status = 'refunded', refunded_by = v_uid, refunded_at = now()
   where p.id = p_payment_id;

  if v_note is not null then
    insert into public.request_notes (request_id, author_id, body, kind)
    values (v_pay.request_id, v_uid, left('Payment refunded: ' || v_note, 2000), 'payment');
  end if;
end;
$$;
revoke all on function public.refund_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_payment(uuid, text) to authenticated;
comment on function public.refund_payment(uuid, text) is 'astrasoul:phase1';
