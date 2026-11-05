import { defineStrings } from '../types';

// Area "waitlist": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    title: 'Waitlist',
    subtitleSelf: 'Doctors you’re waiting on for an earlier time.',
    subtitleOther: 'Doctors {name} is waiting on for an earlier time.',

    // {who} is leave.who or leave.whoThisDoctor.
    'leave.who': '{doctor}',
    'leave.whoThisDoctor': 'this doctor',
    'leave.title': 'Leave the waitlist?',
    'leave.body': 'You won’t get a time with {who} if one opens up. You can join again later, but you’ll be at the back of the line.',
    'leave.stay': 'Stay',
    'leave.leave': 'Leave',
    'leave.failed': 'Couldn’t leave the waitlist',
    pleaseTryAgain: 'Please try again.',

    'explain.a11y': 'How the waitlist works. {lines}',
    'explain.title': 'What happens when a time opens',
    // lib/waitlist waitlistExplainer(): mirrors the server's rules.
    'explain.1':
      'If someone cancels a time with this doctor, it goes to the people waiting, in the order they joined (the clinic may put urgent cases first).',
    'explain.2':
      'If you chose a day, a time up to a week before or after it counts. If you chose any day, any time counts. Times starting within the hour aren’t offered.',
    'explain.3':
      'The time is booked for you straight away. You’ll get a notification here, and a text or email if the clinic has your number or address.',
    'explain.4': 'Check the new appointment. If it doesn’t suit you, cancel it so someone else can have it.',
    'explain.5': 'You stay on the list until a time is booked for you or you leave it.',

    waiting: 'Waiting',
    empty: 'Not waiting for any doctor. When a doctor has no free times, choose “Join the waitlist” while booking.',
    book: 'Book an appointment',
    max: 'You can wait for up to {max} doctors at once.',
    filledTitle: 'Booked from the waitlist',

    'entry.anyDoctor': 'Any doctor',
    'entry.around': 'Around {date}',
    'entry.anyDay': 'Any day',
    'entry.booked': 'Booked',
    'entry.dayPassed': 'Day passed',
    'entry.joined': 'Joined {date}',
    'entry.lapsed': 'This day has passed, so no time will be booked from this entry. Leave it and join again for a new day.',
    'entry.viewAppointment': 'View appointment',
    'entry.leave': 'Leave waitlist',
  },
  fil: {
    title: 'Waitlist',
    subtitleSelf: 'Mga doktor na hinihintayan mo ng mas maagang oras.',
    subtitleOther: 'Mga doktor na hinihintayan ni {name} ng mas maagang oras.',

    'leave.who': 'kay {doctor}',
    'leave.whoThisDoctor': 'sa doktor na ito',
    'leave.title': 'Umalis sa waitlist?',
    'leave.body':
      'Hindi ka na mabibigyan ng oras {who} kapag may nabakante. Puwede kang sumali ulit mamaya, pero mapupunta ka sa hulihan ng pila.',
    'leave.stay': 'Manatili',
    'leave.leave': 'Umalis',
    'leave.failed': 'Hindi ka maalis sa waitlist',
    pleaseTryAgain: 'Pakisubukan ulit.',

    'explain.a11y': 'Paano gumagana ang waitlist. {lines}',
    'explain.title': 'Ano ang mangyayari kapag may nabakanteng oras',
    'explain.1':
      'Kapag may nag-cancel ng oras sa doktor na ito, mapupunta ito sa mga naghihintay, ayon sa pagkakasunod-sunod ng pagsali nila (puwedeng unahin ng clinic ang mga urgent na kaso).',
    'explain.2':
      'Kung pumili ka ng araw, pasok ang oras na hanggang isang linggo bago o pagkatapos nito. Kung kahit anong araw ang pinili mo, pasok ang kahit anong oras. Hindi iniaalok ang mga oras na magsisimula sa loob ng isang oras.',
    'explain.3':
      'Agad na ibo-book ang oras para sa iyo. Makakatanggap ka ng notification dito, at text o email kung may number o email address mo ang clinic.',
    'explain.4': 'Tingnan ang bagong appointment. Kung hindi ito swak sa iyo, i-cancel ito para mapunta sa iba.',
    'explain.5': 'Mananatili ka sa listahan hanggang may ma-book na oras para sa iyo o umalis ka rito.',

    waiting: 'Naghihintay',
    empty: 'Wala kang hinihintay na doktor. Kapag walang bakanteng oras ang isang doktor, piliin ang “Sumali sa waitlist” habang nagbo-book.',
    book: 'Mag-book ng appointment',
    max: 'Hanggang {max} doktor lang ang puwede mong hintayin nang sabay-sabay.',
    filledTitle: 'Na-book mula sa waitlist',

    'entry.anyDoctor': 'Kahit sinong doktor',
    'entry.around': 'Bandang {date}',
    'entry.anyDay': 'Kahit anong araw',
    'entry.booked': 'Na-book',
    'entry.dayPassed': 'Lumipas na ang araw',
    'entry.joined': 'Sumali noong {date}',
    'entry.lapsed': 'Lumipas na ang araw na ito, kaya wala nang oras na ibo-book mula rito. Umalis dito at sumali ulit para sa bagong araw.',
    'entry.viewAppointment': 'Tingnan ang appointment',
    'entry.leave': 'Umalis sa waitlist',
  },
});
