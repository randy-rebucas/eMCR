import { defineStrings } from '../types';

// Area "membership": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    // lib/membership.ts
    'state.active': 'Active',
    'state.due': 'Renewal due',
    'state.expired': 'Expired',
    'state.suspended': 'Suspended',
    'state.inactive': 'Inactive',

    // membership.tsx
    points: { one: '{amount} pt', other: '{amount} pts' },
    title: 'Membership',
    subtitle: 'Your clinic membership cards, points and discounts.',
    emptyTitle: 'No membership yet',
    emptyBody: "Ask at your clinic's front desk about joining. Members earn points and get a discount on their bills.",
    clinic: 'Clinic',
    tierMember: '{tier} member',
    pointsLabel: 'Points',
    qrA11y: 'Membership QR code for {number}',
    expiredOn: 'Expired {date}',
    validUntil: 'Valid until {date}',
    status: 'Status',
    discountOnBills: 'Discount on bills',
    noDiscount: 'None right now',
    dueNote: 'Your membership ends soon. Renew it at the clinic to keep your discount.',
    expiredNote: 'Renew at the clinic to use your discount again. Your points are kept.',
    earnedUsed: 'Earned {earned} · Used {used}',
    memberSince: ' · Member since {date}',
    recentPoints: 'Recent points',
  },
  fil: {
    'state.active': 'Aktibo',
    'state.due': 'Kailangan nang i-renew',
    'state.expired': 'Expired na',
    'state.suspended': 'Suspendido',
    'state.inactive': 'Hindi aktibo',

    points: '{amount} pts',
    title: 'Membership',
    subtitle: 'Ang mga membership card, points at discount mo sa clinic.',
    emptyTitle: 'Wala ka pang membership',
    emptyBody:
      'Magtanong sa front desk ng clinic mo kung paano sumali. May points ang mga member at may discount sila sa mga bayarin.',
    clinic: 'Clinic',
    tierMember: '{tier} member',
    pointsLabel: 'Points',
    qrA11y: 'Membership QR code para sa {number}',
    expiredOn: 'Nag-expire noong {date}',
    validUntil: 'Valid hanggang {date}',
    status: 'Status',
    discountOnBills: 'Discount sa bayarin',
    noDiscount: 'Wala sa ngayon',
    dueNote: 'Malapit nang matapos ang membership mo. I-renew ito sa clinic para manatili ang discount mo.',
    expiredNote: 'I-renew sa clinic para magamit ulit ang discount mo. Hindi mawawala ang points mo.',
    earnedUsed: 'Nakuha: {earned} · Nagamit: {used}',
    memberSince: ' · Member mula {date}',
    recentPoints: 'Mga huling points',
  },
});
