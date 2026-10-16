# Bug register (batch workflow)

Evidence classes used below: **MOCK** = stand-in services (unit/UI tests, or the fake-data browser preview in `tools/mock-preview`); **STATIC** = text checks of source and migration files; **LIVE** = run against the real Supabase project. Only the database install, the post-check and the simulated isolation test have been run LIVE; **no website behaviour has been tested against live Supabase yet.**

## Found and fixed (Phase 2 → Phase 3)

| # | Batch | Found by | Defect | Fix | Regression test |
|---|---|---|---|---|---|
| 1 | D (payments / admin) — security-relevant | Browser walk-through (MOCK) | The administrator's "amount received" box was **pre-filled with the expected amount**, so verifying a payment was one click and did not force a look at the bank statement (the database only checks that the typed number equals the expected one). | Box starts empty; verification needs a typed amount; rejecting does not. | `bug-batch regressions › D: the "amount received" box starts EMPTY…` |
| 2 | A/D (data exposure, display) | Browser walk-through (MOCK) | The stand-in database returned payments to experts (the real database does not), and the expert list showed a "Payment" column, which would have shown a misleading "No payment reference yet" against the real database. | Experts never get a payment column or payment panel; the stand-in now mirrors the Row Level Security rule. | `A/D: an expert is never shown payment information…` and the staff-list test |
| 3 | C/F (booking wording) | Browser walk-through (MOCK) | Administrators and experts were shown **customer-facing** status wording ("We have your request. Please complete the payment steps…"). | Team-specific hints for each status. | `C/F: the team sees team wording…` |
| 4 | F (wording) | Browser walk-through (MOCK) | The customer saw the same sentence twice ("…so our team can start." twice; "This request was cancelled." twice). | Status sentence and next-step sentence no longer overlap. | same test |
| 5 | F (responsive) | Browser walk-through at 375 px (MOCK) | `/admin/requests` scrolled sideways on a phone: a visually-hidden label inside the table was positioned relative to the page. | `.table-wrap { position: relative }`. Re-measured: no page overflow on any admin or customer page at 375 px. | re-measured in the browser (no automated layout test is possible in jsdom) |
| 6 | G | Browser walk-through (MOCK) | Expert saw "Expert: Assigned" and a duplicate "Meeting link" heading. | "You" and "Consultation link". | staff test |

## Earlier defects found and fixed during the build (recorded for completeness)
Provider "checking" state made pages tests fail (fixed in the tests); the boundary test misread normal words as passwords-in-URLs (narrowed, mutation-checked); profile "saved" notice vanished after saving because the card was remounted (fixed: stable card, notice kept); several duplicate/ambiguous labels (fixed).

## Open: not defects in the code, but unverified or not built
| Item | Status |
|---|---|
| Real email confirmation, reset and resend, redirect addresses, free email limits | **Unverified** (needs dashboard settings + a test account; not LIVE-tested) |
| Everything the website does against live Supabase (requests, payments, admin, expert, authenticator codes, two people at once) | **Not tested LIVE** |
| Consultation length | **Not built**: the database has no field (needs a new migration, which would need approval) |
| Email notifications | **Not built** (in-app updates only; no paid email service) |
| Real-time chat/voice/video | **Not built** (consultations are arranged manually) |
| Account deletion | Handled by contacting the business; the database anonymises when a login is deleted; whether the dashboard's "Delete user" fires that path is unverified |
| Consent wording, UPI ID, prices, experts, legal pages, retention decisions | **Owner's business inputs** (placeholders; nothing invented) |
| Two administrators | Not created (owner action) |
| Deployment, domain, hosting | Not chosen/done |
