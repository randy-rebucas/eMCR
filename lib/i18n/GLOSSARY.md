# English → Filipino glossary

Every translator follows this list so the app says the same thing everywhere. Add terms you
introduce; flag anything you are unsure of as **needs native review** and keep the English.

## Voice

- Everyday, warm Filipino as in GCash/Maya/Shopee: short sentences, "mo/iyo" (not "ninyo/inyo"),
  "po" only in apologies or requests that need extra courtesy.
- Keep the English word when that is what patients and clinic staff actually say (appointment,
  lab results, OTP, QR code, password, login ID, Settings, notifications).
- Buttons: verb first, capitalised like the English (`I-save`, `Magpatuloy`, `Subukan Ulit`).
  English loan verbs take the hyphen prefix: i-tap, i-scan, mag-sign in, mag-book, i-reschedule.
- Never change medical meaning. Doses, frequencies, test names, diagnoses: if in doubt, keep the
  English term and add it below as needs native review.
- Text from the server (error messages, push notifications written on the server) is not translated.

## Terms

| English | Filipino | Notes |
|---|---|---|
| appointment | appointment / mga appointment | Tab: "Appointment". Verb: mag-book, mag-reschedule, mag-cancel |
| book (an appointment) | mag-book | "Mag-book ng appointment" |
| reschedule / cancel | mag-reschedule / mag-cancel (kanselahin for a Cancel button) | Status: Na-reschedule, Kinansela |
| queue | pila | Tab: "Pila". "Live na pila" |
| queue number | queue number | As printed on clinic tickets |
| check-in | check-in / mag-check in | |
| lab result(s) | lab result / lab results | Patient-facing status: Handa na / Pinoproseso / Kinansela |
| imaging report | imaging report | |
| results (tab) | Resulta | |
| prescription | reseta | "Mga Reseta" |
| medicine | gamot | "Paalala sa Gamot" = Medicine Reminders |
| dose / dosage | dose | **needs native review** for any dose wording; keep numbers and units exactly |
| frequency (once a day, BID, PRN…) | — | **needs native review**; suggested: isang beses sa isang araw, dalawang beses…, kapag kailangan. Keep the English if unsure |
| invoice | invoice | |
| bill / billing | bayarin | "Bayarin at Invoice" |
| payment / pay | bayad / magbayad | Status: Bayad na, Hindi pa bayad, Bahagyang bayad, Na-refund |
| balance | balanse | |
| health summary | Health Summary | Feature name, keep English |
| health records / medical records | health records / medical records | |
| family member | family member / kapamilya | "Family" group = Pamilya |
| someone I look after | taong inaalagaan ko | guardian = nag-aalaga |
| referral / referral letter | referral / referral letter | verb: i-refer |
| waitlist | waitlist | |
| vitals | vital signs | blood pressure, timbang (weight), taas (height), temperatura |
| membership / points / discount | membership / points / discount | |
| visit / visit history | pagbisita / Mga Nakaraang Pagbisita | |
| diagnosis | diagnosis | **needs native review** if translating any diagnosis text |
| follow-up | follow-up | |
| allergy | allergy | |
| vaccine | bakuna | |
| doctor | doktor | |
| clinic | clinic | "clinic mo" |
| front desk | front desk | |
| documents / certificate | mga dokumento / certificate | |
| App Lock | App Lock | Feature name. Naka-on / Naka-off |
| fingerprint, face or screen lock | fingerprint, mukha o screen lock | |
| offline | offline | Banner: "Offline. Ipinapakita ang …" |
| activation / activation code | activation / activation code | verb: i-activate |
| sign in / sign out | mag-sign in / mag-sign out | Never "mag-log in" in one place and "mag-sign in" in another |
| account | account | |
| password | password | |
| OTP / code | code (6-digit na code) | "Ilagay ang code" |
| login ID | login ID | |
| QR code | QR code | verb: i-scan |
| notifications | notifications | "Settings ng Notification" |
| reminder | paalala | |
| announcement | anunsyo | |
| update | update | |
| profile / switch profile | profile / magpalit ng profile | |
| settings | Settings | Phone's Settings app stays "Settings" |
| request access | humingi ng access | |
| invite | invite | |
| birth date | petsa ng kapanganakan | Format hint stays YYYY-MM-DD |
| first name / last name | first name / last name | |
| mobile number | mobile number | |
| try again | subukan ulit | Title case: "Subukan Ulit" |
| continue / next / back / done / skip / cancel | magpatuloy / susunod / bumalik / tapos na / laktawan / kanselahin | |
| status: pending | Pending | |
| status: in progress | Isinasagawa | |
| status: completed | Tapos na | |
| status: confirmed / scheduled | Kumpirmado / Naka-schedule | |
| status: no-show | Hindi sumipot | |
| status: critical / abnormal / normal | Kritikal / Abnormal / Normal | lab flags |
| status: resolved | Resolved | **needs native review** (a resolved condition, not "gumaling") |
| status: discontinued | Itinigil na | medicine stopped by the doctor |
| status: dispensed | Naibigay na | |
| status: reviewed | Nasuri na | |

## Grammar notes

- Possessive names: use `possessiveName(name)` from `@/lib/i18n` — "Maria's" / "ni Maria", and put
  `{whose}` after the noun in Filipino ("records {whose}").
- OfflineBanner `subject`: Filipino noun phrase without "ang" ("huling puwesto mo sa pila").
- Plurals: Filipino nouns usually don't change; a plain string is fine where English needs
  `{ one, other }`. Use "mga" for plural nouns.
- Bold parts use `<b>…</b>` with `rich()` from `@/lib/i18n/rich`, so word order can differ.

## Home, Appointments, Queue, Waitlist, Notifications, Clinics

| English | Filipino | Notes |
|---|---|---|
| open time / slot (free time to book) | bakanteng oras | "{count} bakante"; "Walang bakante" = no openings |
| fully booked | puno na | |
| specialty / specialization | espesyalisasyon | **needs native review** (could stay "specialty") |
| reason for visit | dahilan ng pagbisita | |
| visit type: at the clinic / video call | sa clinic / video call | |
| consultation | konsulta | queue type and progress step |
| room | kuwarto | "Pumunta na sa {room}" |
| your turn / now serving | Ikaw na! / Ikaw na | |
| patients ahead | nauuna sa iyo | "{count} pasyente ang nauuna sa iyo" |
| estimated wait | tantiyang paghihintay | |
| in the queue / not in the queue | nakapila / wala sa pila | |
| at the lab | nasa lab | queue status while a patient is out for tests. **needs native review** |
| we called you | tinawag ka namin | queue status when a patient missed their call. **needs native review** |
| join / leave the waitlist | sumali sa waitlist / umalis sa waitlist | "with Dr. X" = "kay Dr. X", "with this doctor" = "sa doktor na ito" |
| unread | hindi pa nababasa | |
| mark all read | nabasa na lahat | |
| My Clinics | Mga Clinic Ko | |
| Queue Progress | Takbo ng Pila | **needs native review** |

## Invoices, membership, profile, family, activate, patient, notification settings, feedback

| English | Filipino | Notes |
|---|---|---|
| Billing (screen title) | Bayarin | Stack title too |
| Outstanding Balance | Natitirang Balanse | |
| awaiting payment | hindi pa nababayaran | "{count} invoice ang hindi pa nababayaran" |
| Pay online | Magbayad online | |
| payment page | payment page | |
| reference number | reference number | |
| bank transfer | bank transfer | |
| receipt | resibo | |
| subtotal / tax / discount | Subtotal / Tax / Discount | Kept English as printed on clinic invoices |
| Total / Paid (amount) | Kabuuan / Nabayaran | |
| points (membership) | points / pts | |
| renew / renewal due | i-renew / Kailangan nang i-renew | |
| Valid until | Valid hanggang | |
| Suspended | Suspendido | **needs native review** |
| emergency contact | Emergency Contact | |
| contact details | contact details | |
| Province / Street / City / ZIP code | Probinsya / Street / City / ZIP code | |
| sex (Male / Female) | Kasarian (Lalaki / Babae) | Other values shown as the clinic wrote them |
| conditions (medical) | Mga Kondisyon | **needs native review** |
| None reported | Walang naiulat | |
| Discard changes? | Itapon ang mga pagbabago? | |
| Sign out on all devices | Mag-sign out sa lahat ng device | |
| Stop managing {name}'s records | Itigil na ang paghawak sa records ni {name} | "hawak" = manage records |
| Showing (current profile) | Ipinapakita | |
| Switched back to you | Bumalik sa records mo | |
| voucher / activation voucher | voucher / activation voucher | |
| Notify me about | Abisuhan ako tungkol sa | |
| refill | refill / i-refill | |
| Default (Android notification channel) | Default | Shown in the phone's Settings |
| How was your visit? | Kumusta ang pagbisita mo? | |
| rate / star | i-rate / star | |
| (optional) | (optional) | |
| Not now | Mamaya na | |

Notes:
- Relationship chips on Edit Contact Details are translated, but the value saved stays English
  ("Parent", "Spouse"…) because clinic staff read it.
- Visit line in the feedback card: "kay {doctor} sa {clinic} noong {date}"; the card reads
  "Pagbisita {visit}. I-tap para i-rate."

## Results, prescriptions, medicines, visits, vitals, health summary, share, referrals, documents

| English | Filipino | Notes |
|---|---|---|
| Taken (dose) / Due now / Missed / Later | Nainom na / Oras na / Nakaligtaan / Mamaya pa | Medicine Reminders dose status |
| Once a day / Twice a day / Three / Four times a day | Isang beses / Dalawang beses / Tatlong beses / Apat na beses sa isang araw | **needs native review** (prescriptions.freq.*, medicines.basis.*) |
| As needed (PRN) / At bedtime / Every morning / Every evening | Kapag kailangan / Bago matulog / Tuwing umaga / Tuwing gabi | **needs native review** |
| Every {n} hours / Right away (STAT) | Tuwing {n} oras / Agad-agad | **needs native review** |
| Dosage / Duration / Quantity | Dose / Tagal / Dami | MedicationCard labels; values from the clinic stay as written |
| course (of medicine) | gamutan | "kapag tapos na ang gamutan" |
| Doctor's Notes / Doctor's Assessment | Notes ng Doktor / Assessment ng Doktor | |
| Treatment Plan | Plano ng Gamutan | |
| reference range | reference range | High / Low flag: Mataas / Mababa |
| Heart Rate / Blood Pressure / Oxygen (SpO₂) | Heart Rate / Blood Pressure / Oxygen (SpO₂) | Kept English; Weight = Timbang, Height = Taas, Temperature = Temperatura, Breathing Rate = Bilis ng Paghinga |
| Systolic / Diastolic | Systolic / Diastolic | "over" in spoken BP ("120 over 80") kept English, **needs native review** |
| condition (health summary) | kondisyon | Condition status (active/resolved) and allergy severity are shown as the server sends them |
| Severe (allergy flag) | Malala | **needs native review** |
| revoke (a share link) | bawiin / Binawi | |
| Referral status Sent | Naipadala | |
| Urgent / As soon as possible (STAT) | Urgent / Sa lalong madaling panahon | |
| dispensed at (pharmacy) | Ibinigay sa | pharmacy = botika |
| Vaccination (visit type) | Pagbabakuna | Vaccinations section = Mga Bakuna |

Notes:
- Visit types, measure names and share/referral status labels live in lib code as getters or keys
  so they read in the current language; their file names (Prescription-…, Referral-Letter-…) stay English.
- Medicine reminder notifications are translated when scheduled ("Paalala sa gamot", "Oras na ng
  gamot mo. I-tap para makita kung alin.") and never name a medicine. Already-scheduled reminders
  keep the old language until the next reschedule (app open, prescription refresh or save).
