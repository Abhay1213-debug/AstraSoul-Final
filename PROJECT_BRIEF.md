# PROJECT BRIEF — Personalized Spiritual Guidance Platform

**Status:** Working product brief  
**Brand name:** Undecided; keep configurable  
**Visual reference:** https://astrasoul.lovable.app/  
**Purpose:** This document is the source of truth for Claude Code and future contributors. Read it before implementing features or changing product decisions.

---

## 1. Product vision

Build a premium, personalized spiritual guidance platform that helps customers identify a concern, choose a relevant service, provide the required details, connect with a human expert through chat, voice, or video, and receive a personalized PDF report containing the expert's guidance.

The platform may also provide limited AI-assisted introductory insights. AI is **not** a replacement for human experts.

The initial launch should be a practical pilot that can validate demand and operations without committing to unnecessary paid infrastructure. The architecture should be maintainable and capable of expanding into a scalable technology business.

### Core principles

- Build a real, usable application—not only a static landing page or visual mock-up.
- Keep the brand name configurable until it is finalized.
- Make the customer journey clear and trustworthy.
- Be transparent about which features are live, manual, in development, or demonstrations.
- Do not invent company history, customer numbers, testimonials, expert credentials, team size, or business achievements.
- Never show a payment, booking, consultation, AI result, or report as completed when it has not actually happened.
- Protect customer information, including dates of birth, palm photographs, consultation details, and reports.

---

## 2. Services and product boundaries

### Four core services

1. **Numerology**
2. **Palmistry**
3. **Gemstone Guidance**
4. **Color Therapy**

Customers choose the service that best matches their concern. Each service should have a clear explanation, the information needed to proceed, and an obvious path to request a consultation.

### Human-expert responsibilities

Human experts provide the detailed service, including consultation, personalized recommendations, remedies, and conclusions. In particular:

- Detailed gemstone recommendations are made by the human expert.
- Palmistry conclusions are made by the human expert.
- Personalized remedies and detailed consultation advice are provided by the human expert.
- The final consultation report records the expert's recommendations.

Do not use AI to fabricate expert findings or pretend that an expert has reviewed a customer's information.

### Limited AI-assisted introductory features

AI-assisted features are limited to basic introductory insights, such as:

- Calculating a customer's **Moolank** from their date of birth and explaining the calculation in simple language.
- A basic weekly horoscope feature.

These features are secondary to the platform's primary positioning as a personalized spiritual guidance service. Do not present the company primarily as an astrology business.

For Moolank, implement the calculation deterministically, validate date inputs, and add tests. Explain the calculation method in the UI or accompanying documentation.

For weekly horoscope content, do not claim a live AI integration exists unless one is configured and tested. If no provider or API key is available, provide a clearly labelled demonstration state and document the exact integration needed later. Never expose secrets in browser code. Do not invent a provider integration.

AI must not independently deliver detailed gemstone recommendations, personalized remedies, palmistry conclusions, or the expert's final PDF report.

---

## 3. Target customer journey

The intended full journey is:

1. Customer visits the website and understands the services.
2. Customer identifies their concern and chooses one of the four services.
3. Customer provides the information required for that service. This may include date of birth and, for palmistry, palm photographs.
4. The platform may provide a limited introductory insight where appropriate.
5. Customer selects a consultation mode: **chat, voice call, or video call**.
6. Customer reviews the booking details and price.
7. Customer pays.
8. Payment is verified and the booking status is updated accurately.
9. Customer connects with the assigned human expert.
10. The expert provides detailed guidance and recommendations.
11. The expert's recommendations are compiled into a personalized PDF report.
12. The customer receives the report and can access it later through their account.
13. The customer can review past bookings and reports and request another consultation.

Do not imply that all steps are automated until the corresponding systems have actually been implemented.

---

## 4. Consultation modes and pilot operations

The three consultation modes are:

- Chat consultation
- Voice consultation
- Video consultation

During the initial pilot, voice and video consultations may be coordinated manually using Google Meet. Expert assignment and scheduling may also be manual at first. Do not build real-time video infrastructure or complex live-chat infrastructure unless specifically requested in a later phase.

The website should be designed so these manual workflows can be replaced or supplemented by integrations later.

A customer must be able to understand whether a request is merely submitted, awaiting confirmation, confirmed, completed, cancelled, or refunded. Use clear status labels. Do not falsely promise instant expert connection or guaranteed availability.

---

## 5. Payments and booking confirmation

The payment gateway has **not yet been selected**. PhonePe and Razorpay are under consideration. Do not hard-code either provider or integrate a gateway until the user confirms the choice.

For the pilot, manual UPI collection and manual verification may be used. Build a payment-ready architecture, but do not pretend that a payment was received just because a customer clicks a button or uploads a screenshot.

Payment-related requirements for the eventual integration:

- Keep payment status separate from booking status.
- Use a trusted server-side verification process or verified provider webhook before marking a gateway transaction paid.
- Never store card details.
- Never put secret API keys in frontend code.
- Prevent duplicate webhook processing and duplicate booking confirmation.
- Clearly handle pending, successful, failed, and refunded payments.
- Provide an admin/manual verification path for pilot payments, with an audit trail.
- Record relevant transaction references without storing unnecessary sensitive information.

Payment integration can be added after the provider is selected; it must not block initial website work.

---

## 6. Customer accounts and dashboard

Customer accounts and the dashboard are important first-version requirements. Implement them in a realistic, testable sequence, rather than leaving them as decorative screens.

The intended account capabilities include:

- Registration and login.
- Customer profile and saved details.
- Access to introductory insights.
- Consultation requests and booking status.
- Consultation history.
- Access to purchased or completed reports.
- Downloading PDF reports securely.
- Ability to request another consultation.

If a real authentication/database backend is not yet configured, do not pretend that registration or data persistence works. Create the frontend and data contracts as appropriate, clearly document what is not yet connected, and implement a real backend in the appropriate development stage. Do not store sensitive customer information in local storage as a substitute for secure authentication.

---

## 7. Expert directory and administration

### Expert directory

Create a structure for expert profiles, including fields such as:

- Display name
- Services offered
- Short biography
- Languages, if known
- Consultation modes
- Availability or booking instructions

Use clearly labelled demonstration profiles until genuine expert information is supplied. Do not fabricate qualifications, credentials, reviews, or professional experience.

### Admin operations

The platform will eventually need an authenticated administrative area to manage:

- Customers
- Experts and their service offerings
- Service descriptions and pricing
- Booking requests and status
- Payment verification/status
- Consultation reports
- Report delivery
- Content and introductory features

Admin functions must be protected by proper authorization. Hiding an admin button in the frontend is not security. Do not create a public admin back door or hard-code production credentials.

---

## 8. Personalized PDF reports

After an expert consultation, the customer's expert-provided guidance and remedies should be compiled into a personalized PDF report.

The eventual workflow should support:

1. Linking the report to the correct customer and consultation.
2. Recording or entering the expert's approved recommendations.
3. Generating or uploading the PDF.
4. Storing it in a secure location.
5. Making it available to the authorized customer.
6. Allowing the customer to download it later from their account.
7. Tracking whether the report is pending, ready, or delivered.

Do not fabricate consultation findings to create a sample report. Use clearly labelled sample data for development only.

---

## 9. Existing website and visual design

Use the existing landing page as the primary visual reference:

**https://astrasoul.lovable.app/**

Inspect it when possible before designing. Retain the existing site's visual direction where suitable, while improving usability, responsiveness, accessibility, and consistency. If the reference is inaccessible, say so and work from the design tokens below rather than claiming to have inspected it.

### Preferred earthy-luxe palette

- Warm ivory: `#F9F4E6`
- Pale sand: `#F1E4C6`
- Soft gold: `#C9A45C`
- Medium earth brown: `#8C6B3F`
- Deep earth brown: `#5A4526`
- Dark chocolate: `#2E2416`

### Visual direction

The site should feel premium, elegant, calming, warm, trustworthy, and contemporary.

Use:
- High-quality, relevant imagery.
- Readable typography and clear hierarchy.
- Generous but consistent spacing.
- Refined cards and calls to action.
- Subtle, purposeful animations.
- Responsive layouts for mobile, tablet, and desktop.
- Consistent design tokens and reusable components.

Avoid:
- Generic template appearance.
- Excessive gradients or emoji as primary illustrations.
- Low-quality placeholder graphics.
- Inconsistent spacing and arbitrary styling.
- Unreadable text or low contrast.
- Unnecessary visual elements that do not support the customer journey.

Do not finalize a new brand name without the user's approval. Keep brand name, logo, and related content configurable where practical.

---

## 10. Website information architecture

The public-facing site should include:

- Home
- About
- Services overview
- Individual service pages or clearly distinct service sections
- How It Works
- Experts
- Consultation options
- Free introductory insight
- Contact
- Sign up / Log in
- Customer dashboard
- Privacy Policy
- Terms and Conditions
- Refund Policy

Some pages can be implemented in stages, but navigation must not contain broken links or buttons that do nothing.

Use calls to action that lead to meaningful next steps, such as exploring a service, trying an introductory insight, registering, or starting a consultation request.

Pricing must be configurable and use clearly marked placeholders until real prices are provided. Do not invent final pricing.

---

## 11. Suggested technical approach

First inspect the selected project folder and existing stack. Do not overwrite useful existing work blindly.

If the folder is empty, choose a modern, maintainable stack suitable for a responsive web application. Prefer TypeScript and reusable components. Keep dependencies reasonable and avoid unnecessary paid services.

A possible future architecture is:

- Frontend: a modern component-based framework.
- Backend/database/authentication: Supabase or another suitable managed backend.
- Secure file storage for PDF reports and palm photographs.
- AI provider integration only for the approved introductory features.
- Payment provider integration after a decision is made.
- Hosting and custom-domain setup after local testing.

These are architectural options, not permission to create paid accounts or commit to a vendor without approval. Keep provider-specific integrations modular.

Never:
- Put secrets in frontend code or commit them to Git.
- Claim a backend exists when it does not.
- Treat browser-side state as secure persistence.
- Invent API responses or payment results.
- Expose one customer's report or personal details to another customer.

---

## 12. Development roadmap

Build incrementally and test each stage. The stages are a delivery plan, not permission to silently remove requirements from the intended first version.

### Phase 1 — Project foundation and public website
- Inspect the project and visual reference.
- Establish the application structure and design system.
- Build the responsive public website and four service journeys.
- Implement and test the deterministic Moolank calculation.
- Provide a clearly labelled placeholder for any unconfigured weekly horoscope integration.
- Build the consultation entry flow and distinguish real functionality from planned integrations.
- Establish the data model/interfaces needed for subsequent phases.
- Run the app locally, test, and fix errors.

### Phase 2 — Authentication and customer accounts
- Implement secure registration and login.
- Create customer profiles and saved details.
- Build a functional customer dashboard.
- Ensure data is persisted securely in a real backend.
- Add appropriate authorization and access controls.

### Phase 3 — Experts and booking workflows
- Implement expert profiles and service offerings.
- Collect consultation requests and mode preference.
- Track booking status and appointment details.
- Support manual expert assignment and manual scheduling during the pilot.
- Design for future availability management and automated matching.

### Phase 4 — Payments
- Confirm the payment provider and commercial pricing.
- Implement the provider's supported checkout flow.
- Verify payment status securely.
- Handle pending, failed, successful, and refunded states.
- Support manual payment verification for pilot cases if required.

### Phase 5 — Consultation records and PDF reports
- Enable authorized staff to enter or upload expert-approved guidance.
- Generate or securely store PDF reports.
- Link reports to customers and consultations.
- Deliver reports and enable secure downloads from the dashboard.

### Phase 6 — Admin, quality assurance, and launch
- Build the protected admin area.
- Test permissions, privacy, responsiveness, forms, booking and payment states.
- Review legal pages and operational policies.
- Configure production environment variables and hosting.
- Connect the user's domain only when ready and with approval.

### Phase 7 — Scale
- Improve expert matching and availability.
- Automate operational communication where valuable.
- Improve AI-assisted introductory features.
- Evaluate additional integrations and a mobile application based on pilot evidence.

---

## 13. Security, privacy, and accessibility

The platform may process personal details, birth information, palm photographs, consultation notes, and reports. Treat these as private customer data.

Requirements:
- Collect only information necessary for the selected service.
- Explain the purpose of data collection clearly.
- Use authentication and authorization for private information.
- Restrict each customer to their own records and reports.
- Secure file storage and downloads.
- Avoid logging sensitive form contents or secrets.
- Validate input on both client and server when a backend exists.
- Keep API keys and secrets server-side.
- Provide understandable error messages without exposing internal details.
- Make forms keyboard accessible and provide appropriate labels.
- Maintain sufficient colour contrast and responsive layouts.
- Include privacy and legal-page templates, but flag them for review before public launch.

---

## 14. Testing and acceptance criteria

Do not report work as complete until it has been implemented and checked.

At minimum:
- The project installs and starts using documented commands.
- The app compiles without unresolved errors.
- Main navigation and calls to action work.
- All four service areas are represented correctly.
- The consultation-mode selection is clear.
- The Moolank calculation is tested against representative valid and invalid dates.
- Forms validate inputs and display clear error/success states.
- Mobile, tablet, and desktop layouts are checked.
- No fake payment, booking, report, or AI success is displayed.
- Demonstration content is clearly labelled.
- No secrets are exposed.
- Missing integrations are documented accurately.

If browser automation or visual testing is available, use it where practical. Do not claim to have tested something that you did not run.

---

## 15. How Claude Code should work

Before coding:

1. Read this entire document.
2. Inspect the current folder and identify existing files, framework, and scripts.
3. Inspect the reference landing page if accessible.
4. Summarize the proposed approach and identify genuine blockers.
5. Start implementing the next agreed phase rather than stopping at a plan.

While coding:
- Make focused, understandable changes.
- Reuse components and centralize design tokens.
- Preserve useful existing work.
- Ask before destructive actions or actions outside the project folder.
- Do not create paid accounts, purchase services, or deploy publicly without approval.
- Do not invent business facts or silently change requirements.
- Keep a clear record of what's implemented, mocked, and still required.

After each phase:
- Run the available checks and fix errors.
- Explain how to run and preview the project locally.
- Summarize files and major components created.
- List functional features and remaining integrations.
- State the next recommended step.

**Immediate instruction:** Start with Phase 1 after inspecting the project. Keep all later phases in mind when designing the structure, but do not claim that later functionality is already implemented.
