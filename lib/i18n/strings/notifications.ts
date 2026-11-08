import { defineStrings } from '../types';

// Area "notifications": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
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
    settingsTitle: 'Notification Settings',
    settingsText: 'Choose which reminders and alerts you get',

    rowA11y: '{title}. {message}',
    rowA11yUnread: 'Unread. {title}. {message}',
    from: 'From {name}',
  },
  fil: {
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
    settingsTitle: 'Settings ng Notification',
    settingsText: 'Piliin kung aling mga paalala at alerts ang matatanggap mo',

    rowA11y: '{title}. {message}',
    rowA11yUnread: 'Hindi pa nababasa. {title}. {message}',
    from: 'Mula: {name}',
  },
});
