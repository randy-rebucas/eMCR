# eMCR release notes

## 1.1.3

1.1.2 plus account security changes and the fixes from the 2026-11-08 audit. Changing or resetting
a password signs you out on your other devices. The app only offers a confirmation code to the
record's own mobile number. Medicine reminders are more reliable.

There are no new native modules. **New permission:** `SCHEDULE_EXACT_ALARM`, so medicine reminders
arrive on time. It needs no Play declaration (`USE_EXACT_ALARM` would). On Android 14+ the patient
grants it from a hint on the Medicines screen. There is no over-the-air update, so this reaches
devices only through a new store build.

Deploy the backend first (branch `fix/patient-api-audit`). On an older server the app still works,
but other devices stay signed in, and the code step falls back to the sign-in code with a notice.

### Google Play "What's new" (under 500 characters)

```
• Better account security: changing or resetting your password signs you out on your other devices
• Medicine reminders arrive on time and keep going for long-term medicines
• Reminders come back when you sign in again after your session ends
• Clearer message when your record has no mobile number for a confirmation code
• Bug fixes and improvements
```

### Full notes

**Privacy and security**
- When you change or reset your password, your other devices are signed out. This phone stays
  signed in. This now also covers accounts that only manage a family member's record. Creating a
  first password doesn't sign anyone out.
- Confirmation codes go only to the mobile number on your own record. If your record has none, the
  app asks you to see the front desk.
- App Lock now also covers screens opened from links, and it is in place from the first frame when
  the app opens.
- Sign-in tokens on iPhone stay on this device and are not included in backups.

**Medicine reminders**
- Medicines with no set duration keep their reminders until the clinic ends the prescription
  (before, they stopped after 30 days).
- If your session ends, reminders pause. They come back when you sign in again, and are removed if
  someone else signs in.
- Every family member's reminders stay in step with their prescriptions, not only the profile on
  screen.
- On Android, reminders can use exact alarms, so they aren't delayed by battery saving.

**Also**
- Opening the app offline and then reconnecting now loads your profile.
- On Android, the keyboard no longer covers fields when booking, signing in, giving feedback or
  sharing.
- The visit feedback card no longer comes back after you send it.
- Notification times and "Today/Yesterday" use clinic time.
- Hardware Back on the booking form goes back to your appointments and asks before discarding.
- The Join button for video consults disappears when the call window closes.
- When a refresh fails, the screen shows a message instead of nothing.
- Searches on results and documents say when older items haven't been loaded yet.
- Accessibility labels and larger touch targets throughout.

## 1.1.2

1.1.1 plus one developer fix: the app no longer crashes after sign-in when run in Expo Go on
Android. `lib/notifications.ts` now uses `isRunningInExpoGo()`, because Expo Go 58 reports its
environment as `bare` and the old check never matched. Store builds took the same path before and
after, so patients won't see a difference.

No new native modules, permissions or backend changes. There is no over-the-air update, so this
reaches devices only through a new store build.

### Google Play "What's new" (under 500 characters)

```
• Bug fixes and improvements
```

### Full notes

**Also**
- Fixed a crash after sign-in that affected development testing only.

## 1.1.1

1.1.0 production build (Android build 6, commit f57bc35) plus one change: removes the
READ_MEDIA_IMAGES, READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE permissions. expo-screen-capture
adds them for its screenshot listener, which eMCR doesn't use, and Google Play flags
READ_MEDIA_IMAGES. The other notes below cover what build 6 added after the 1.1.0 notes were
written. Patients on 1.0.2 also get everything under 1.1.0.

Needs a new store build: moves to Expo SDK 58 and React Native 0.88. Deploy the backend first: the
queue "away" states and the text message switch both need it. On an older server the switch stays
hidden.

### Google Play "What's new" (under 500 characters)

```
• Choose English or Filipino on the welcome screen, before you sign in
• Filipino translation across the app
• Live queue: if you're at the lab or miss your call, the app shows that your place in line is saved
• Turn clinic text messages on or off in Notification settings
• Bug fixes and improvements
```

### Full notes

**Queue**
- If you step out to the lab, the queue screen says so and shows that your place in line is saved.
  When you're back, tell the front desk so you can rejoin the line.
- If you weren't there when you were called, the app tells you your place is saved and asks you to
  see the front desk.

**Language**
- Choose your language on the welcome screen, before you sign in.
- Filipino translation now runs across the app, including error messages.

**Notifications**
- New switch in Notification settings for reminders and updates by text message, from every clinic.
  Sign-in codes always arrive. The switch shows when your record has a mobile number.

**Also**
- Updated the app's underlying platform (Expo SDK 58, React Native 0.88).
- Removed photo and file permissions the app didn't use.

## 1.1.0

Needs a new store build: adds native modules (expo-local-authentication, expo-screen-capture,
expo-web-browser, expo-crypto, expo-localization). Deploy the backend first: payments, reschedule,
share links, waitlist, referrals, feedback, membership and the new reminder pushes all need it.

### Google Play "What's new" (under 500 characters)

```
• Pay your bills in the app with GCash, Maya, card or QR Ph
• Reschedule appointments, or join the waitlist when a doctor is fully booked
• Medicine reminders, visit history and vitals charts
• Share your health summary with a doctor through a link you can revoke
• View your records even when you're offline
• App Lock with your fingerprint, face or screen lock
• Now in Filipino
```

### Full notes

**Appointments**
- Reschedule an appointment to another time with the same doctor.
- When a doctor has no free slots, join the waitlist. If a slot opens, the clinic books it for you
  and lets you know.
- Reminders the day before your appointment now also arrive as notifications.

**Your records**
- Visit history: diagnoses, treatment plan and follow-up date from each visit.
- Vitals: blood pressure, weight, heart rate and more, charted over time.
- Referrals: where your doctor referred you, its status, and the referral letter.
- Share your health summary with another doctor. Choose how long the link works (24 hours, 7 days
  or 30 days), see how many times it was opened, and revoke it any time.
- Your recent records stay viewable when you're offline. They are encrypted on your phone and
  removed when you sign out.

**Medicines**
- Set reminders for the medicines on your prescriptions. The app suggests times from your
  prescription; you confirm them. Reminders don't show medicine names on your lock screen.
- Refill reminders arrive as notifications.

**Bills and membership**
- Pay bills in the app through your clinic's own payment account (GCash, Maya, card, GrabPay,
  QR Ph, or the clinic's bank or QR details), when your clinic offers it.
- Payment reminders arrive as notifications.
- Your membership card, with points, discount and member QR code.

**Privacy and security**
- App Lock: open eMCR with your fingerprint, face or screen lock (More → App Lock).
- Screenshots and screen recording are blocked while you're signed in, and the app is hidden in
  the recent-apps view.
- Prescription and health-summary PDFs now open inside the app instead of the browser.
- Fixed: signing out while the app was renewing your session could leave you signed in.

**Also**
- Tell your clinic how your visit went, right from the Home screen.
- New notification settings for follow-ups, prescription refills and payments.
- The app is now available in Filipino (More → Language).
- If the connection drops while booking, the app checks whether the booking went through before
  asking you to pick another time.
- The live queue says when its numbers are out of date.

## 1.0.2

### Google Play "What's new" (under 500 characters)

```
• Got an invite slip or text from your clinic? Tap "I have an invite from my clinic" to sign in with its code or link
• Sign in with your mobile number or login ID and a password
• Set your own password after your first sign-in
• Forgot your password? Reset it with an SMS code
• See your login ID anytime under More
• Bug fixes and improvements
```

### Full notes

**Clinic invites**
- Your clinic can now invite you to eMCR with a printed slip or a text message.
- Tap "I have an invite from my clinic", then scan or type the code on the slip, or just open the link from the text.
- eMCR sends an SMS code to the mobile number your clinic confirmed. Once you enter it, you're signed in with every record on the invite.

**Passwords and login IDs**
- Sign in with your mobile number or your login ID, plus your password.
- After your first sign-in, or if your clinic gave you a temporary password, you'll be asked to create your own password.
- Your login ID is shown once after you set your first password, and you can always find it under More.
- Forgot your password? Reset it with a one-time SMS code.

## 1.0.1

### Google Play "What's new" (under 500 characters)

```
• Sign in with your phone number and confirm your record with your name and birthdate
• Parents: add your children and family members, even without a record of your own
• Not on file yet? Request access and your clinic will get back to you
• Activate eMCR with the voucher code from your clinic, or scan its QR code
• Reminders before your activation expires
• Bug fixes and improvements
```

### Full notes

**Claim your record with your phone**
- After the SMS code, eMCR asks "Is this your record?" and confirms it with your first name and birthdate.
- Choose "No, it's someone I look after" to add a child or family member instead. Children under 18 are added right away. Adult relatives need the clinic's approval, and you'll see a "Waiting for the clinic" screen until it comes through.
- Parents and guardians can use eMCR to manage their family's records even if they have no records of their own.
- If the confirmation step takes too long, you'll be asked to confirm your phone number again with a new code. This is a security measure.

**Request access**
- If your clinic doesn't have your mobile number, search for the clinic and send an access request. Sign-in instructions only go to the contact details the clinic already has on file, or the clinic contacts you.

**Activation**
- Activate eMCR by entering the code on the voucher from your clinic, or by scanning the voucher's QR code.
- Each code adds one year. A renewal adds its year after the end of your current one.
- You'll get reminders by notification and SMS 30 days and 7 days before your activation ends, and on the day it ends. Tapping a reminder opens the Activate screen.

**Fixes**
- Clearer messages when a document can't be opened.

## 1.0.0 — first release

### Google Play "What's new" (under 500 characters)

```
Welcome to eMCR, your clinic records in your pocket.
• Sign in with your phone number, an SMS code, or the clinic's QR code
• Book, view and cancel appointments
• See your live place in the clinic queue and check in from your phone
• Join video consultations with your doctor
• View lab results, prescriptions, bills and documents
• Health summary of your records
• Manage family members' records from one account
• Notifications for appointments, results and queue updates
```

### Full notes

eMCR (Electronic MyClinic Record) is the patient app for clinics that use MyClinicSoft. This first release includes:

**Getting started**
- Sign in with email and password, a one-time SMS code, or the login QR code from your clinic.
- One account covers every MyClinicSoft clinic you visit.

**Appointments and visits**
- Book, view and cancel appointments.
- See your live position in the clinic queue and check in when you arrive.
- Join video consultations from the appointment screen.

**Your records**
- Lab results, prescriptions (with the e-prescription PDF), invoices and clinic documents.
- A health summary that pulls your records together.

**Family**
- Add family members and switch between their records.

**Notifications**
- Push notifications for appointments, lab results, queue updates and clinic messages. Tap one to open the related screen.
- Choose which notifications you get in Notification settings.

**Not included yet**
- Bills can be viewed but not paid in the app. Pay at the clinic.
