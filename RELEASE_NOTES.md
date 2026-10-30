# eMCR release notes

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
