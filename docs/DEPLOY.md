# Putting Ankiro on the internet (GitHub → Vercel → your domain)

The website folder is ready. The build needs **no secrets** and, in its launch setup, **no environment variables at all**.

## What the site does at launch (accounts OFF)
Public pages, the free Moolank insight, payment information (UPI ID + QR), the Privacy/Terms/Refund pages, and a **"Get in touch" button on every page** that opens WhatsApp (+91 87952 72576) or Gmail with a ready-made message. Visitors prepare a consultation request and **send it to you on WhatsApp or email**; you reply, connect the expert, agree a time (Google Meet, about 20 minutes) and confirm the price and payment by hand. There are no log-in/sign-up links while accounts are off. Prices show "Price coming soon".

## 1. Send the folder to GitHub (once)
In Terminal, from the project folder (the commit is already made):
```bash
git remote add origin <the HTTPS address of your empty GitHub repository>
git push -u origin main
```
`.env.local` (your Supabase address and key) is **not** uploaded: it is excluded by `.gitignore`.

## 2. Vercel
1. Vercel → **Add New → Project** → pick the GitHub repository.
2. Leave everything as detected (Framework: Vite). `vercel.json` already contains the page-refresh rule, security headers and caching. **Do not add environment variables for launch.**
3. **Deploy.** You get an address like `ankiro-xxxx.vercel.app`. Open it and check: home, a service page, `/payment`, the "Get in touch" button (WhatsApp opens with your number and the message), and a page refresh on `/payment` (must not show a 404).

**About the free Vercel plan:** as I understand Vercel's terms, the free "Hobby" plan is meant for personal, non-commercial use. A site that takes payments may need the paid plan. Please check their current terms before relying on the free plan; if needed, Cloudflare Pages is a free alternative that allows commercial use (the same folder works there; it needs a one-line redirect file I can add).

## 3. Your .com domain (later)
Vercel project → **Settings → Domains** → add the domain and follow the two DNS records Vercel shows at your domain provider. No code changes are needed. When the domain is decided, also update `VITE_CONTACT_EMAIL` (Vercel → Settings → Environment Variables) to your branded address, e.g. `hello@yourdomain.com`.

## 4. Turning on accounts, online requests and the admin screens (later, when you are ready)
Everything is already built and tested with stand-in data; nothing below has been run against the live project yet.
1. **Email sending.** Supabase's built-in sender is only for testing, so real customers would not get confirmation or reset emails. Set up a free email service on your domain (for example Resend or Brevo) and enter its SMTP details in Supabase (Authentication → SMTP). Needs the domain and its DNS.
2. **Supabase → Authentication → URL Configuration:** Site URL = your live address; Redirect URLs = `<live address>/dashboard` and `<live address>/reset-password`.
3. In the SQL Editor run `supabase/scripts/70_go_live_settings.sql` once (approved consent version + UPI settings).
4. In Vercel add three environment variables, then **Redeploy**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (both public values from your `.env.local`), and `VITE_ACCOUNTS_ENABLED` = `true`.
5. Sign up on the live site with `abhayprabhakar1213@gmail.com`, confirm the email, open **My dashboard → Account security** and set up an authenticator app, then run `supabase/scripts/71_grant_first_admin_READY.sql` once. `/admin` then asks for your authenticator code.
6. In **Admin → Services & prices**, set real prices when you decide them. Test with a second address such as `abhayprabhakar1213+test@gmail.com` (a customer; an administrator cannot verify their own payment).
