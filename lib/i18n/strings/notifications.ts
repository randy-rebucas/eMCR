import { defineStrings } from '../types';

// Area "notifications": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    offlineSubject: 'your notifications',
    'hero.unread': { one: '{count} new', other: '{count} new' },
    'hero.caughtUp': 'All caught up',
    'hero.latest': 'Latest {when}',
    'hero.settings': 'Settings',
    noneOfKind: 'None of these yet',
    showAll: 'Show all notifications',
    // notification-settings.tsx (the rest of its words are patient.notifSettings.*)
    'settings.eyebrow': 'This phone',
    'settings.offNote': 'Turn notifications on above to choose which ones this phone shows.',
    'settings.chipOn': 'On',
    'settings.chipOff': 'Off',
    'settings.chipUnavailable': 'Not on this device',
    title: 'Notifications',
    subtitle: 'Updates on your appointments, results and more.',
    markAllA11y: 'Mark all as read',
    markAll: 'Mark all read',
    markAllFailed: "Couldn't mark notifications as read.",

    'filter.all': 'All',
    'filter.unread': 'Unread',
    'filter.appointment': 'Appointments',
    'filter.lab_result': 'Results',
    'filter.invoice': 'Billing',
    'filter.prescription': 'Prescriptions',
    'filter.message': 'Messages',

    'group.today': 'Today',
    'group.yesterday': 'Yesterday',
    'group.week': 'This Week',
    'group.earlier': 'Earlier',

    caughtUpTitle: "You're all caught up",
    caughtUpText: 'New updates from your clinic will show up here.',
    noneTitle: 'No notifications',
    noneText: 'Nothing here from the last 90 days.',

    settingsA11y: 'Notification settings',

    rowA11y: '{title}. {message}',
    rowA11yUnread: 'Unread. {title}. {message}',
    from: 'From {name}',
  },
  fil: {
    offlineSubject: 'notifications mo',
    'hero.unread': '{count} bago',
    'hero.caughtUp': 'Nabasa mo na lahat',
    'hero.latest': 'Pinakahuli {when}',
    'hero.settings': 'Settings',
    noneOfKind: 'Wala pa nito',
    showAll: 'Ipakita lahat ng notifications',
    'settings.eyebrow': 'Ang phone na ito',
    'settings.offNote': 'I-on muna ang notifications sa itaas para mapili kung alin ang ipapakita ng phone na ito.',
    'settings.chipOn': 'Naka-on',
    'settings.chipOff': 'Naka-off',
    'settings.chipUnavailable': 'Wala sa device na ito',
    title: 'Notifications',
    subtitle: 'Mga update sa appointment, resulta mo at iba pa.',
    markAllA11y: 'Markahang nabasa na lahat',
    markAll: 'Nabasa na lahat',
    markAllFailed: 'Hindi mamarkahang nabasa ang notifications.',

    'filter.all': 'Lahat',
    'filter.unread': 'Hindi pa nababasa',
    'filter.appointment': 'Appointment',
    'filter.lab_result': 'Resulta',
    'filter.invoice': 'Bayarin',
    'filter.prescription': 'Reseta',
    'filter.message': 'Mensahe',

    'group.today': 'Ngayong araw',
    'group.yesterday': 'Kahapon',
    'group.week': 'Ngayong Linggo',
    'group.earlier': 'Nakaraan',

    caughtUpTitle: 'Nabasa mo na lahat',
    caughtUpText: 'Dito lalabas ang mga bagong update mula sa clinic mo.',
    noneTitle: 'Walang notifications',
    noneText: 'Walang notification sa nakaraang 90 araw.',

    settingsA11y: 'Settings ng notification',

    rowA11y: '{title}. {message}',
    rowA11yUnread: 'Hindi pa nababasa. {title}. {message}',
    from: 'Mula: {name}',
  },
});
