# Booking and payments

## How it works

1. **Your details**: name, email, phone/WhatsApp, date of birth, language (optional), what the customer wants guidance on.
2. **Consultation**: Numerology, Palmistry, Gemstone Guidance, Color Therapy, or a custom combination of two or more.
3. **Time**: every consultation is a voice call. The customer picks a date (next 14 days) and a time.
   - Times run every evening from 5:30 to 8:30 pm IST, 20 minutes apart: 5:30, 5:50, 6:10 … 8:30 (10 slots).
   - Sessions are 10 minutes, so each gap leaves room to extend.
   - A slot closes 60 minutes before it starts.
   - Booked slots show as "Booked" to everyone else.
4. **Pay**: the customer agrees to the Terms, Refund and Privacy policies, then pays on Dodo Payments' checkout by UPI or card.
5. **Booked**: Dodo sends the customer back to `/booking/<id>`. It shows the confirmation, an "Add to Google Calendar" button and the booking reference. Dodo emails the receipt.

### How a slot is locked

- **Holding:** when the customer presses Pay, the server holds the slot for 30 minutes while they pay. The database refuses a second held or paid booking for the same date and time, so two people can never get the same slot.
- **Paid:** the booking turns **paid** only after the server asks Dodo directly and Dodo confirms the payment. This happens when the customer comes back, and again through Dodo's webhook in case they close the tab.
- **Failed payment:** the slot is released, and the customer can press "Try the payment again".
- **Late payment:** if the hold lapses and someone else takes the slot before a late payment arrives, the booking is marked **conflict**. The team then rebooks or refunds that customer.

### Where to see bookings

- **Supabase:** Table Editor → `upcoming_sessions` lists paid sessions from today, soonest first, with phone, email and the question.
- **Dodo dashboard:** under Payments, each payment carries the slot and consultation in its metadata.

### Settings in the code

`src/shared/booking.ts` holds everything the server and the website share:

- **`schedule`:** hours, gap, days ahead, lead time, hold time and closed weekdays.
- **`prices`:** the price for each consultation (one service or a combination), GST included.
- **`extension`:** the price of 10 extra minutes. While it is `null`, that option stays hidden.

Prices (owner's list, 2 November 2026) are before GST; Dodo adds the GST on its checkout (the product is set to "tax exclusive"):

| Consultation | Price |
|---|---|
| Numerology | ₹499 + GST |
| Palmistry | ₹899 + GST |
| Gemstone Guidance | ₹699 + GST |
| Color Therapy | ₹299 + GST |
| Palmistry + Numerology (highly recommended) | ₹1,299 + GST |
| Numerology + Gemstone Guidance | ₹1,099 + GST |
| Palmistry + Gemstone Guidance | ₹1,499 + GST |
| Gemstone Guidance + Color Therapy | ₹899 + GST |
| Diamond package (all four services, a 25-minute call) | ₹2,099 + GST |

Any other combination is a customised plan: the site sends the customer to WhatsApp instead of booking it online.

Every consultation is a 10-minute voice call on Google Meet; the team sends the link on WhatsApp. The Diamond package is 25 minutes, so it also takes the next slot: booked at 5:30 pm, it blocks 5:50 pm too, and it can only start where the next slot is free. The database enforces this (no two held or paid bookings may overlap in time).

No price can be below ₹50: Dodo refuses payments under US$0.50, and a test fails if a price is set lower.

Dodo's checkout asks the customer only for their PIN code (country preset to India). After paying, the customer is sent straight back to the booking page. Dodo's back arrow also returns there, with a "Try the payment again" button.

## On this computer

`npm run dev` runs the booking server too:

- **Payments:** with no Dodo key, payments are simulated on a test page ("Pay (test)" / "Payment fails").
- **Bookings:** kept in `.data/dev-bookings.json`, because the Supabase secret key never goes in this folder.

To use Dodo's real **test** checkout (no real money moves):

1. Dodo dashboard → **Test mode** → Developer → API keys → create a key with write access.
2. Paste it into `.env.local` as `DODO_PAYMENTS_API_KEY=…`. Never paste it into a chat.
3. Run `npm run dodo:setup`. It creates the "Ankiro consultation" product (pay-what-you-want, the site sets the amount) and saves `DODO_PRODUCT_ID`.

## Going live

**1. Database** (once): Supabase → SQL Editor → paste `supabase/bookings/0700_bookings.sql` → Run. If asked, choose "Run without RLS".

**2. Dodo live mode:**
1. Create a live API key, then run the setup with it to get the live product ID.
2. Add a webhook for `https://ankiro.in/api/dodo-webhook` with the `payment.succeeded`, `payment.failed` and `payment.cancelled` events.
3. Copy the webhook's signing secret.

**3. Vercel** → Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `DODO_PAYMENTS_API_KEY` | the live key |
| `DODO_PAYMENTS_ENVIRONMENT` | `live_mode` |
| `DODO_PRODUCT_ID` | the live product ID |
| `DODO_PAYMENTS_WEBHOOK_KEY` | the webhook signing secret (`whsec_…`) |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API keys → secret key |
| `VITE_SUPABASE_URL` | the project URL (already used by the site) |
| `SITE_URL` | `https://ankiro.in` |

Then deploy and make one small real booking to check the whole path.
