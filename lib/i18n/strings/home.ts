import { defineStrings } from '../types';

// Area "home": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    'greeting.morning': 'Good morning,',
    'greeting.afternoon': 'Good afternoon,',
    'greeting.evening': 'Good evening,',
    // The line under the name in the photo band: the one thing worth knowing today.
    'band.today': 'Your visit is today at {time}',
    'band.next': 'Next visit: {when}',
    'band.none': 'No visits booked',
    'band.inQueue': 'You’re number {number} in line',

    'shortcuts.title': 'Your records',
    'shortcut.prescriptions': 'Prescriptions',
    'shortcut.prescriptionsHint': 'From every visit',
    'shortcut.medicines': 'Medicines',
    'shortcut.medicinesHint': 'Dose reminders',
    'shortcut.health': 'Health summary',
    'shortcut.healthHint': 'Allergies, vaccines',
    'shortcut.bills': 'Bills',
    'shortcut.billsHint': 'Receipts and balance',

    'book.title': 'Book a visit',
    'book.text': 'Pick a doctor and a time. Your clinic confirms it here.',
    'book.noneTitle': 'No visits booked',
    'book.noneText': 'When you need a doctor, book here. Your clinic confirms it in the app.',
    'book.action': 'Book a visit',

    'meds.title': 'Today’s medicines',
    'meds.progress': '{taken} of {total} taken',
    'meds.more': { one: '+ {count} more dose', other: '+ {count} more doses' },
    'meds.open': 'All medicines',
    'meds.saveFailed': 'Couldn’t save that. Try again.',

    viewAll: 'View All',
    open: 'Open',

    'next.title': 'Next Appointment',

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
    'band.today': 'Ngayon ang pagbisita mo, {time}',
    'band.next': 'Susunod na pagbisita: {when}',
    'band.none': 'Wala kang naka-book na pagbisita',
    'band.inQueue': 'Ikaw ang numero {number} sa pila',

    'shortcuts.title': 'Mga rekord mo',
    'shortcut.prescriptions': 'Mga Reseta',
    'shortcut.prescriptionsHint': 'Mula sa bawat pagbisita',
    'shortcut.medicines': 'Mga Gamot',
    'shortcut.medicinesHint': 'Paalala sa pag-inom',
    'shortcut.health': 'Health summary',
    'shortcut.healthHint': 'Allergy, bakuna',
    'shortcut.bills': 'Bayarin',
    'shortcut.billsHint': 'Resibo at balanse',

    'book.title': 'Mag-book ng pagbisita',
    'book.text': 'Pumili ng doktor at oras. Dito ikukumpirma ng clinic mo.',
    'book.noneTitle': 'Wala kang naka-book na pagbisita',
    'book.noneText': 'Kapag kailangan mo ng doktor, dito mag-book. Ikukumpirma ito ng clinic mo sa app.',
    'book.action': 'Mag-book ng pagbisita',

    'meds.title': 'Mga gamot ngayong araw',
    'meds.progress': '{taken} sa {total} ang nainom na',
    'meds.more': '+ {count} pang dose',
    'meds.open': 'Lahat ng gamot',
    'meds.saveFailed': 'Hindi na-save. Subukan ulit.',

    viewAll: 'Tingnan Lahat',
    open: 'Buksan',

    'next.title': 'Susunod na Appointment',

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
