import { defineStrings } from '../types';

// Area "clinics": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    title: 'My Clinics',
    subtitle: "Every clinic you're registered at. Your records from all of them show up in this app.",
    empty: 'No clinics yet. Clinics appear here after your first visit.',
    footnote:
      'Missing a clinic? Sign in with a code sent to your phone. Clinics that registered you with the same phone number and birth date are added automatically.',
    book: 'Book',
    directions: 'Directions',
    mostRecent: 'Most recent clinic',
    yourClinic: 'Your clinic',
    others: { one: 'Your other clinic', other: 'Your other {count} clinics' },
    lastVisitShort: 'Last visit {date}',
    noVisitYet: 'No visit yet',
    idShort: 'Patient ID {id}',
    offlineSubject: 'your clinics',
    call: 'Call',
    callFailedTitle: "Couldn't start the call",
    callFailedBody: 'Call the clinic at {phone}.',
  },
  fil: {
    title: 'Mga Clinic Ko',
    subtitle: 'Lahat ng clinic kung saan ka naka-register. Makikita sa app na ito ang records mo mula sa lahat ng ito.',
    empty: 'Wala pang clinic. Lalabas dito ang mga clinic pagkatapos ng una mong pagbisita.',
    footnote:
      'May kulang na clinic? Mag-sign in gamit ang code na ipapadala sa phone mo. Kusang madadagdag ang mga clinic na nag-register sa iyo gamit ang parehong mobile number at petsa ng kapanganakan.',
    book: 'Mag-book',
    directions: 'Direksyon',
    mostRecent: 'Pinakahuling clinic',
    yourClinic: 'Ang clinic mo',
    others: 'Ang iba mo pang {count} clinic',
    lastVisitShort: 'Huling pagbisita {date}',
    noVisitYet: 'Wala pang pagbisita',
    idShort: 'Patient ID {id}',
    offlineSubject: 'mga clinic mo',
    call: 'Tumawag',
    callFailedTitle: 'Hindi masimulan ang tawag',
    callFailedBody: 'Tawagan ang clinic sa {phone}.',
  },
});
