# Getting the website talking to your Supabase project (plain English)

Nothing in this guide is done yet. Each step says who does it and why. Menu names are as I understand the Supabase dashboard; if a name differs on your screen, tell me what you see.

## A. One value I need from you (public, safe to share)
The website needs your **project address** and your **publishable key**. The publishable key is designed to be public (every visitor's browser holds it).
- Open your AstraSoul project → **Project Settings → API Keys**.
- Copy **only the key labelled "publishable"** (starts with `sb_publishable_`).
- **Do not copy or paste the "secret" key, a "service role" key, or any password.** If you see them, ignore them.
- Paste the publishable key to me. I write it into a private file on your computer (`.env.local`, which is never uploaded) and keep it out of the code.

## B. Dashboard settings (you click, I tell you exactly what to type) — needed only for sign-up emails
For testing on your own computer the website runs at `http://localhost:5173`.
1. **Authentication → URL Configuration → Site URL**: `http://localhost:5173`.
2. Same page → **Redirect URLs**: add `http://localhost:5173/dashboard` and `http://localhost:5173/reset-password`.
3. **Authentication → Sign In / Providers (or Providers)**: confirm "Email" is on and "Confirm email" is on. Check that anonymous sign-ins are off.
Before the real launch these addresses are replaced by the real website address.

## C. What I do (no clicks from you)
1. Run the read-only checker (needs your OK once).
2. Start the website on your computer with accounts switched on, pointed at your project.
3. Walk one **fake** test customer through everything (sign-up → confirm email → request → fake UPI reference → test-admin verification → status) and record the result in the bug register.

For C3 I need your OK for the specific actions: creating one test customer and one test administrator account. Both use fake names and email addresses you control (for example `yourname+test1@gmail.com`), because Supabase sends them a real email. The free email sending limit is small (a few emails per hour), which is enough for a few tests; whether it is enough for real customers is not verified.
