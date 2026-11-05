import { defineStrings } from '../types';

// Area "clinics": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    title: 'My Clinics',
    subtitle: "Every clinic you're registered at. Your records from all of them show up in this app.",
    empty: 'No clinics yet. Clinics appear here after your first visit.',
    footnote:
      'Missing a clinic? Sign in with a code sent to your phone. Clinics that registered you with the same phone number and birth date are added automatically.',
    // Bold part uses rich().
    lastVisit: 'Last visit: <b>{date}</b>',
    noneYet: 'None yet',
    patientId: 'Patient ID: <b>{id}</b>',
    book: 'Book',
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
    lastVisit: 'Huling pagbisita: <b>{date}</b>',
    noneYet: 'Wala pa',
    patientId: 'Patient ID: <b>{id}</b>',
    book: 'Mag-book',
    call: 'Tumawag',
    callFailedTitle: 'Hindi masimulan ang tawag',
    callFailedBody: 'Tawagan ang clinic sa {phone}.',
  },
});
