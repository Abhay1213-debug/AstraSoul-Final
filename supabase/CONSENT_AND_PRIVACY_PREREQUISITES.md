# Consent wording and privacy prerequisites — DRAFT FOR REVIEW

> **Status: APPROVED BY THE OWNER on 2026-10-16 as version `2026-10-v1`** (the owner has chosen to launch without a lawyer's review; this is not legal advice).
> The approved consent wording is the required, unticked checkbox text in `src/components/ConsultationRequestFlow.tsx`: *"I understand my details will be used
> only to prepare and handle this consultation request, and that this request is not a confirmed booking."* with a link to the Privacy Policy.
> It is registered in the database **only** by the owner running `supabase/scripts/70_go_live_settings.sql` (never by a migration). Until that script is run, online requests are refused.
> If the wording is ever changed, use a NEW version label and retire the old one.

## 1. Prerequisites before bookings are enabled
Bookings must not be switched on until **every** item is done and recorded by you:

- [ ] **Consent wording** finalised and approved by you (section 3 is a draft only).
- [ ] **Version label** chosen (section 4) and the **same label** used in the website and in the database.
- [ ] **Privacy policy** written or reviewed so that it matches what the system *actually* does (section 5 lists the facts to check it against).
- [ ] **Retention periods** decided and written down in `PRODUCTION_READINESS.md` §4 (currently **TO BE DECIDED** — this project deliberately states no period).
- [ ] **Customer-rights procedure** decided (who answers a request to see or delete data, and how — `PRODUCTION_READINESS.md` §5).
- [ ] The consent label registered once in the database (README, "Consent versions") — **only after** the first four items.
- [ ] The website shows the consent text next to a required, unticked checkbox and sends the label that was approved (Stage 4).

## 2. What the consent has to match (facts from the database design)
Data a customer provides: name, email (from the login), optional phone, date of birth (required for Numerology and Gemstone Guidance, optional otherwise,
not collected for services that do not need it), preferred language, the text of their concern, consultation choices; and, if they pay, the **UPI reference,
the payer's name as shown in their UPI app, the payment date** and the amount. The system never asks for a UPI PIN, an OTP, a banking password, or any
card or bank credential.
Who can see it: the customer; the **assigned expert** (name, concern, date of birth, language — not email, phone or payments); **administrators** (everything needed to run the service, including payments).
What remains after an account is deleted: see `PRODUCTION_READINESS.md` §5 and README section 11.

## 3. Draft consent wording (EDIT BEFORE USE — placeholders in square brackets)
> **Your consent**
> I understand that [BUSINESS NAME] will use the details I enter — my name, contact details, date of birth (where the service needs it), preferred language and
> the description of my concern — to prepare and carry out my consultation, and that the expert assigned to my request will be able to see the details they need
> for that purpose.
> If I pay by UPI, I understand that [BUSINESS NAME] will record my UPI transaction reference, the payer name and the payment date I provide, and the amount, so
> that an administrator can check the payment manually. [BUSINESS NAME] will never ask me for a UPI PIN, an OTP, or any banking password.
> I understand that this service provides [DESCRIBE THE NATURE OF THE SERVICE AND ITS LIMITS — TO BE WRITTEN BY THE BUSINESS] and does not replace [MEDICAL / LEGAL / FINANCIAL — TO BE CONFIRMED BY THE BUSINESS] advice.
> I have read the Privacy Policy at [LINK], which explains [HOW LONG DATA IS KEPT — TO BE DECIDED], how to ask for my details to be corrected or removed, and who to contact at [CONTACT].
> [ ] I agree.

Notes for the reviewer: do not add claims about outcomes, expertise or credentials that the business cannot support; keep the wording specific to what is
really collected; decide whether any separate, optional consent is needed (for example marketing) and keep it separate from this one.

## 4. Choosing the version label
- 1–20 characters: letters, digits, `.`, `_`, `-` (the database enforces this).
- A date-based label is simple and sortable, for example the date you approve it. Changing the wording **requires a new label**; never edit an approved text under the old label.
- Registering (once approved) is one statement in the README ("Consent versions"). Retiring an old label sets `active = false`; existing requests keep the label they were made with.

## 5. Privacy-policy review checklist (check the policy against these facts)
- [ ] Controller / business name and contact for privacy questions.
- [ ] Every category of data in section 2, and the purpose of each.
- [ ] Who can see which data (customer, assigned expert, administrators) and that staff do not see payments or other customers.
- [ ] Where the data is stored: Supabase hosting — **the project region and any international transfer position are to be confirmed from your Supabase dashboard; this project does not state them.**
- [ ] The email provider used for login emails (when chosen) and what it receives.
- [ ] Retention periods — **TO BE DECIDED** by the business (and its advisers); none is stated here.
- [ ] What is kept after a deletion request (financial and audit records, with personal text removed) and why.
- [ ] How a customer can ask to see, correct or delete their data, and the expected response time you will commit to.
- [ ] Cookies / local storage the website uses (the login session) and any analytics (none are built).
- [ ] That the service is not astrology-based and makes no promises of outcomes (consistent with the website copy).

## 6. Who decides
Everything in this file is the **business owner's decision**. The assistant that prepared the database has not chosen, approved or activated any consent version and has not decided any retention period.
