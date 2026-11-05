import { defineStrings } from '../types';

// Area "home": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    'greeting.morning': 'Good morning,',
    'greeting.afternoon': 'Good afternoon,',
    'greeting.evening': 'Good evening,',
    tagline: 'Your health. Our priority.',

    'shortcut.appointments': 'Appointments',
    'shortcut.queue': 'My Queue',
    'shortcut.results': 'View Results',
    'shortcut.prescriptions': 'Prescriptions',

    'cta.a11y': 'Book an appointment',
    'cta.title': 'Need to book an appointment?',
    'cta.text': 'Choose a doctor and a schedule that works for you.',

    viewAll: 'View All',
    open: 'Open',

    'next.title': 'Next Appointment',
    'next.none': 'No upcoming appointments.',
    'next.bookOne': 'Book one',

    'checkIn.a11y': 'At the clinic? Scan the check-in QR code',
    'checkIn.title': 'At the clinic?',
    'checkIn.text': 'Scan the check-in QR at the front desk to join the queue.',

    'queue.title': 'Queue Status',
    'queue.view': 'View Queue',
    'queue.yourTurn': "It's your turn!",
    'queue.proceedTo': 'Please proceed to {room}.',
    'queue.proceedRoom': 'Please proceed to your room.',
    'queue.yourNumber': 'Your Queue Number',
    'queue.next': "You're next",
    'queue.atLab': "You're at the lab. Tell the front desk when you're back.",
    'queue.missed': 'We called you. Your place is saved. Please see the front desk.',
    'queue.ahead': { one: '{count} patient ahead of you', other: '{count} patients ahead of you' },
    'queue.wait': 'Estimated wait: ~{minutes} min',

    'results.title': 'Recent Results',
    'results.labTest': 'Lab test',

    'health.title': 'Health Summary',
    'health.cardTitle': 'Allergies, medicines and vaccines',
    'health.cardText': 'From every clinic, in one place. Download it as a PDF for a new doctor.',

    'balance.title': 'Outstanding Balance',
    'balance.view': 'View Bills',
    'balance.due': 'Total Amount Due',
    'balance.payAtClinic': 'Pay at the clinic',

    'activation.title': 'Activate eMCR',
    'activation.renewTitle': 'Renew your eMCR',
    'activation.needed': 'Get an activation voucher at your clinic, then enter the code to book, check in and see your results.',
    // {left} is activation.daysLeft (with its leading space) or empty.
    'activation.endsOn': 'Your eMCR ends on {date}{left}. Enter a new code to add a year.',
    'activation.endsSoon': 'Your eMCR ends soon{left}. Enter a new code to add a year.',
    'activation.daysLeft': { one: ' ({count} day left)', other: ' ({count} days left)' },
  },
  fil: {
    'greeting.morning': 'Magandang umaga,',
    'greeting.afternoon': 'Magandang hapon,',
    'greeting.evening': 'Magandang gabi,',
    tagline: 'Kalusugan mo, una sa amin.',

    'shortcut.appointments': 'Mga Appointment',
    'shortcut.queue': 'Pila Ko',
    'shortcut.results': 'Mga Resulta',
    'shortcut.prescriptions': 'Mga Reseta',

    'cta.a11y': 'Mag-book ng appointment',
    'cta.title': 'Kailangang mag-book ng appointment?',
    'cta.text': 'Pumili ng doktor at schedule na swak sa iyo.',

    viewAll: 'Tingnan Lahat',
    open: 'Buksan',

    'next.title': 'Susunod na Appointment',
    'next.none': 'Wala kang paparating na appointment.',
    'next.bookOne': 'Mag-book',

    'checkIn.a11y': 'Nasa clinic ka na? I-scan ang check-in QR code',
    'checkIn.title': 'Nasa clinic ka na?',
    'checkIn.text': 'I-scan ang check-in QR sa front desk para makapila.',

    'queue.title': 'Status ng Pila',
    'queue.view': 'Tingnan ang Pila',
    'queue.yourTurn': 'Ikaw na!',
    'queue.proceedTo': 'Pumunta na sa {room}.',
    'queue.proceedRoom': 'Pumunta na sa kuwarto mo.',
    'queue.yourNumber': 'Queue Number Mo',
    'queue.next': 'Ikaw na ang susunod',
    'queue.atLab': 'Nasa lab ka. Sabihan ang front desk pagbalik mo.',
    'queue.missed': 'Tinawag ka namin. Nakatabi ang puwesto mo. Pumunta sa front desk.',
    'queue.ahead': '{count} pasyente ang nauuna sa iyo',
    'queue.wait': 'Tantiyang paghihintay: ~{minutes} min',

    'results.title': 'Pinakabagong Resulta',
    'results.labTest': 'Lab test',

    'health.title': 'Health Summary',
    'health.cardTitle': 'Mga allergy, gamot at bakuna',
    'health.cardText': 'Mula sa lahat ng clinic, nasa iisang lugar. I-download bilang PDF para sa bagong doktor.',

    'balance.title': 'Natitirang Balanse',
    'balance.view': 'Tingnan ang Bayarin',
    'balance.due': 'Kabuuang Babayaran',
    'balance.payAtClinic': 'Magbayad sa clinic',

    'activation.title': 'I-activate ang eMCR',
    'activation.renewTitle': 'I-renew ang eMCR mo',
    'activation.needed':
      'Kumuha ng activation voucher sa clinic mo, saka ilagay ang code para makapag-book, makapag-check in at makita ang mga resulta mo.',
    'activation.endsOn': 'Matatapos ang eMCR mo sa {date}{left}. Maglagay ng bagong code para madagdagan ng isang taon.',
    'activation.endsSoon': 'Malapit nang matapos ang eMCR mo{left}. Maglagay ng bagong code para madagdagan ng isang taon.',
    'activation.daysLeft': ' ({count} araw na lang)',
  },
});
