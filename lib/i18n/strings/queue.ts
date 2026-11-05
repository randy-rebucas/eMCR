import { defineStrings } from '../types';

// Area "queue": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    title: 'Queue',
    subtitle: 'Track your queue number with live updates from the clinic.',

    'type.appointment': 'Appointment',
    'type.walk-in': 'Walk-in',
    'type.follow-up': 'Follow-up Visit',
    'type.consultation': 'Consultation',

    // Self check-in result. {where} is checkIn.atClinic or empty.
    'checkIn.atClinic': ' at {clinic}',
    'checkIn.turnNow': "It's your turn now.",
    'checkIn.ahead': {
      one: "{count} patient is ahead of you. We'll notify you as your turn gets close.",
      other: "{count} patients are ahead of you. We'll notify you as your turn gets close.",
    },
    'checkIn.next': "You're next. Please stay close.",
    'checkIn.already': "You're already checked in",
    'checkIn.done': "You're checked in",
    'checkIn.body': 'Queue number {number}{where}. {line}',
    'checkIn.failed': "Couldn't check you in",
    'checkIn.failedFallback': 'Please try again or check in at the front desk.',
    'checkIn.scanAgain': 'Scan again',

    'qr.showA11y': 'Show check-in QR code',
    'qr.title': 'Check-in QR',
    'qr.hint': 'Show at the clinic',
    'qr.sheetText': 'Show this at the front desk or scan it at the clinic kiosk.',
    'qr.show': 'Show QR Code',

    stale: 'Checking for updates. Showing your last queue position, which may be out of date.',
    staleWhen: 'Checking for updates. Showing your last queue position from {when}, which may be out of date.',
    // OfflineBanner subject (Filipino: noun phrase without "ang").
    offlineSubject: 'your last queue position, which may be out of date',
    updateFailed: "Couldn't update. Pull down to try again.",
    updateFailedAt: "Couldn't update. Last updated {time}. Pull down to try again.",

    'pill.serving': 'Now Serving',
    'pill.notCheckedIn': 'Not checked in',
    'pill.atLab': 'At the lab',
    'pill.missed': 'See the front desk',
    numberA11y: 'Queue number {number}',

    'hero.proceedTo': 'Proceed to',
    'hero.yourRoom': 'Your room',
    'hero.estimatedWait': 'Estimated Wait',
    'hero.minutes': '~{minutes} min',
    'hero.patientsAhead': 'Patients Ahead',

    'status.turn': "It's your turn!",
    'status.inQueue': "You're in the queue!",
    'status.atLab': "You're at the lab",
    'status.atLabText': "Your place in line is saved. When you're back, tell the front desk so you can rejoin the line.",
    'status.missed': 'We called you',
    'status.missedText': "We couldn't find you when it was your turn. Your place in line is saved. Please see the front desk.",
    'status.checkIn': 'Check in when you arrive',
    'status.proceed': 'Please proceed to {room}.',
    'status.assignedRoom': 'your assigned room',
    'status.waitText': "Wait for your number to be called on the clinic's display or through this app.",
    'status.checkInText':
      'Scan the check-in QR at the clinic, or show your own QR at the front desk, so your number appears on the clinic display.',
    checkingIn: 'Checking in…',
    imHere: "I'm here — scan to check in",

    progress: 'Queue Progress',
    'step.checkIn': 'Check-in',
    'step.waiting': 'Waiting',
    'step.consultation': 'Consultation',
    'step.a11y': 'Step {n}, {label}, {caption}',
    'step.done': 'Done',
    'step.now': 'Now',
    'step.next': 'Next',
    note: 'Times are estimates and refresh about every 30 seconds. Keep your phone nearby and listen for your number.',

    'scanner.prompt': "Point the camera at the check-in QR code at the clinic's front desk or waiting-room screen.",
    'scanner.purpose': "To check in with the clinic's QR code",

    'notIn.title': "You're not in the queue",
    'notIn.text':
      "Have an appointment today? When you arrive, scan the clinic's check-in QR, or let the front desk add you. Your number and live position will show up here.",
    'notIn.scan': 'Scan to Check In',
    'notIn.viewAppointments': 'View Appointments',
  },
  fil: {
    title: 'Pila',
    subtitle: 'Subaybayan nang live ang queue number mo mula sa clinic.',

    'type.appointment': 'Appointment',
    'type.walk-in': 'Walk-in',
    'type.follow-up': 'Follow-up na Pagbisita',
    'type.consultation': 'Konsulta',

    'checkIn.atClinic': ' sa {clinic}',
    'checkIn.turnNow': 'Ikaw na ngayon.',
    'checkIn.ahead': '{count} pasyente ang nauuna sa iyo. Aabisuhan ka namin kapag malapit na ang turn mo.',
    'checkIn.next': 'Ikaw na ang susunod. Manatili lang sa malapit.',
    'checkIn.already': 'Naka-check in ka na',
    'checkIn.done': 'Nakapag-check in ka na',
    'checkIn.body': 'Queue number {number}{where}. {line}',
    'checkIn.failed': 'Hindi ka ma-check in',
    'checkIn.failedFallback': 'Pakisubukan ulit o mag-check in sa front desk.',
    'checkIn.scanAgain': 'I-scan ulit',

    'qr.showA11y': 'Ipakita ang check-in QR code',
    'qr.title': 'Check-in QR',
    'qr.hint': 'Ipakita sa clinic',
    'qr.sheetText': 'Ipakita ito sa front desk o i-scan sa kiosk ng clinic.',
    'qr.show': 'Ipakita ang QR Code',

    stale: 'Tinitingnan kung may update. Ipinapakita ang huling puwesto mo sa pila, na posibleng luma na.',
    staleWhen: 'Tinitingnan kung may update. Ipinapakita ang huling puwesto mo sa pila mula {when}, na posibleng luma na.',
    offlineSubject: 'huling puwesto mo sa pila, na posibleng luma na',
    updateFailed: 'Hindi ma-update. Hilahin pababa para subukan ulit.',
    updateFailedAt: 'Hindi ma-update. Huling update: {time}. Hilahin pababa para subukan ulit.',

    'pill.serving': 'Ikaw na',
    'pill.notCheckedIn': 'Hindi pa naka-check in',
    'pill.atLab': 'Nasa lab',
    'pill.missed': 'Pumunta sa front desk',
    numberA11y: 'Queue number {number}',

    'hero.proceedTo': 'Pumunta sa',
    'hero.yourRoom': 'Kuwarto mo',
    'hero.estimatedWait': 'Tantiyang Paghihintay',
    'hero.minutes': '~{minutes} min',
    'hero.patientsAhead': 'Nauuna sa Iyo',

    'status.turn': 'Ikaw na!',
    'status.inQueue': 'Nakapila ka na!',
    'status.atLab': 'Nasa lab ka',
    'status.atLabText': 'Nakatabi ang puwesto mo sa pila. Pagbalik mo, sabihan ang front desk para makabalik ka sa pila.',
    'status.missed': 'Tinawag ka namin',
    'status.missedText': 'Hindi ka namin nakita noong ikaw na ang tatawagin. Nakatabi ang puwesto mo sa pila. Pumunta sa front desk.',
    'status.checkIn': 'Mag-check in pagdating mo',
    'status.proceed': 'Pumunta na sa {room}.',
    'status.assignedRoom': 'kuwartong itinalaga sa iyo',
    'status.waitText': 'Hintaying tawagin ang number mo sa display ng clinic o dito sa app.',
    'status.checkInText':
      'I-scan ang check-in QR sa clinic, o ipakita ang sarili mong QR sa front desk, para lumabas ang number mo sa display ng clinic.',
    checkingIn: 'Nagche-check in…',
    imHere: 'Nandito na ako — i-scan para mag-check in',

    progress: 'Takbo ng Pila',
    'step.checkIn': 'Check-in',
    'step.waiting': 'Naghihintay',
    'step.consultation': 'Konsulta',
    'step.a11y': 'Hakbang {n}, {label}, {caption}',
    'step.done': 'Tapos na',
    'step.now': 'Ngayon',
    'step.next': 'Susunod',
    note: 'Tantiya lang ang mga oras at nag-a-update kada 30 segundo. Itabi ang phone mo at pakinggan kung tatawagin na ang number mo.',

    'scanner.prompt': 'Itapat ang camera sa check-in QR code sa front desk o sa screen sa waiting area ng clinic.',
    'scanner.purpose': 'Para makapag-check in gamit ang QR code ng clinic',

    'notIn.title': 'Wala ka pa sa pila',
    'notIn.text':
      'May appointment ka ba ngayon? Pagdating mo, i-scan ang check-in QR ng clinic, o magpadagdag sa front desk. Dito lalabas ang number mo at ang live na puwesto mo sa pila.',
    'notIn.scan': 'I-scan para Mag-check In',
    'notIn.viewAppointments': 'Tingnan ang mga Appointment',
  },
});
