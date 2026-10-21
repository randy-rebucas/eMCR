All five phases of the eMCR plan are built, in the web/backend repo and the mobile app. Typecheck passes in both repos and all 557 backend tests pass, 42 of them new for eMCR. None of it has been run against a real database, printed, or opened on a phone. Nothing is committed.

**What patients and parents can now do**
- **Sign in with their phone.** They get an SMS code, then the app asks "Is this your record?" and checks first name and birthdate.
  - A child under 18 is added to the parent's account straight away; that access ends when the child turns 18.
  - An adult relative (for example an elderly parent) becomes a request the clinic has to approve.
  - A parent with no patient record of their own can still have an account.
- **Request access** if their number isn't on file. Sign-in instructions only ever go to the phone or email the clinic already has on that record, never to the contact typed into the form. If nothing matches, the request goes to the clinic's staff.
- **Activate** by entering the voucher code or scanning its QR code. Each code adds one year, and renewals add on to the end of the current year. Reminders go out by push notification and SMS 30 days and 7 days before expiry, and on the day it expires.
- The app never shows prices or "buy" wording, to stay clear of Apple's in-app purchase rule.

**What you and the clinics get**
- **Platform console → eMCR vouchers:**
  - Create a batch for a clinic (₱80 voucher price, ₱60 wholesale, 1 year).
  - Print an A4 voucher sheet with the clinic name, code and QR.
  - Mark a batch paid once you've collected the cash, with the receipt or deposit reference.
  - Void a whole batch or a single lost voucher.
  - See totals: cash received, cash still owed, codes sold and redeemed, and clinic commission.
- **Unpaid batches don't work.** Codes can't be redeemed until you mark the batch paid, so printed vouchers have no value before the clinic pays.
- **Clinic staff get an "eMCR requests" page** to approve access requests and adult-relative requests, each with on-screen guidance.
- **Account lookup by phone**, so you can add days by hand for support cases.

**Before going live**
- **The activation requirement is off by default.** Everything stays free until you set `EMCR_ACTIVATION_ENFORCED=true`, so turn it on once clinics have vouchers to sell. Without activation, patients can still see their profile, appointments, prescriptions, invoices and the lists of visits and lab results.
- **Don't change `ENCRYPTION_KEY`.** Voucher codes are encrypted with it; if it changes, old voucher sheets can't be reprinted.
- **Set `EMCR_APP_URL`** to your app store or landing-page link. It goes into the "your records are ready" messages.
- **Product rule to confirm:** "Add someone I look after" only finds people whose clinic record has the parent's own phone number. Anyone else has to be linked by the clinic.
- **Store risk:** Apple may still ask for an in-app purchase option at review, even with no prices shown.
- **Test before trusting it:**
  - one full run on a phone against a test database: sign in, add a child, redeem a voucher;
  - one real print of the voucher sheet;
  - one approval by clinic staff.

The main new code is in [lib/emcr/](lib/emcr/), [app/api/emcr/](app/api/emcr/) and [app/(platform)/platform/vouchers/](app/(platform)/platform/vouchers/), plus the new screens in the mobile repo. The API is written up in [MOBILE_API.md](MOBILE_API.md) under "eMCR sign-in, claim and activation".