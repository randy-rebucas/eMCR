/**
 * Every string catalog, one per area. A key is `<area>.<key>`, e.g. `t('auth.login.title')`.
 *
 * Ownership: each area file is edited only by whoever translates that area, so parallel work never
 * touches the same file. Add strings to your own area; reuse `common.*` for shared words (Cancel,
 * Try again, …) but don't edit common.ts unless you own it. If you need a new area, add it here.
 *
 *   common        components/ui, ErrorState, AppHeader, StatusBadge + status pills, QrScanner, QuickTour,
 *                 PrivacyGuard, OfflineBanner; lib/api, lib/appLock, useApiData, usePaginatedList; language picker
 *   auth          app/(auth)/*, components/auth.tsx, components/emcr.tsx, lib/auth.tsx, lib/emcr.ts, app/index.tsx
 *   nav           app/patient/(tabs)/_layout.tsx (tab names)
 *   more          app/patient/(tabs)/more.tsx
 *   patient       app/patient/_layout.tsx (stack titles, prompts), NotificationResponder, lib/profile.tsx
 *   home          app/patient/(tabs)/home.tsx
 *   appointments  (tabs)/appointments.tsx, appointments/*, AppointmentCard, BookingForm, lib/appointments, lib/teleconsult
 *   queue         (tabs)/queue.tsx
 *   results       (tabs)/results.tsx, results/[id].tsx, lib/labResults
 *   invoices      invoices/*, lib/invoices, lib/invoicePay
 *   prescriptions prescriptions/*, MedicationCard, lib/prescriptions
 *   medicines     medicines.tsx, lib/medicineReminders (local notification text)
 *   healthSummary health-summary.tsx
 *   visits        visits/*, VisitFeedbackPrompt, lib/visits, lib/visitFeedback
 *   vitals        vitals.tsx
 *   referrals     referrals/*, lib/referrals
 *   waitlist      waitlist.tsx, lib/waitlist
 *   share         share.tsx, lib/shareLinks
 *   membership    membership.tsx, lib/membership
 *   family        family.tsx
 *   clinics       clinics.tsx
 *   documents     documents.tsx, lib/documents
 *   notifications notifications.tsx, notification-settings.tsx, lib/notifications, lib/push
 *   profile       profile/*
 *   activate      activate.tsx
 */
import activate from './strings/activate';
import appointments from './strings/appointments';
import auth from './strings/auth';
import clinics from './strings/clinics';
import common from './strings/common';
import documents from './strings/documents';
import family from './strings/family';
import healthSummary from './strings/healthSummary';
import home from './strings/home';
import invoices from './strings/invoices';
import medicines from './strings/medicines';
import membership from './strings/membership';
import more from './strings/more';
import nav from './strings/nav';
import notifications from './strings/notifications';
import patient from './strings/patient';
import prescriptions from './strings/prescriptions';
import profile from './strings/profile';
import queue from './strings/queue';
import referrals from './strings/referrals';
import results from './strings/results';
import share from './strings/share';
import visits from './strings/visits';
import vitals from './strings/vitals';
import waitlist from './strings/waitlist';
import type { Message, ParamsArg } from './types';

export const catalogs = {
  activate,
  appointments,
  auth,
  clinics,
  common,
  documents,
  family,
  healthSummary,
  home,
  invoices,
  medicines,
  membership,
  more,
  nav,
  notifications,
  patient,
  prescriptions,
  profile,
  queue,
  referrals,
  results,
  share,
  visits,
  vitals,
  waitlist,
};

type Catalogs = typeof catalogs;
type Area = keyof Catalogs;

/** Every valid key, e.g. 'common.tryAgain' | 'auth.login.title' | … */
export type MessageKey = { [A in Area]: `${A}.${keyof Catalogs[A]['en'] & string}` }[Area];

/** The English message behind a key (its literal type carries the placeholders). */
export type MessageOf<K extends MessageKey> = K extends `${infer A}.${infer Rest}`
  ? A extends Area
    ? Rest extends keyof Catalogs[A]['en']
      ? Catalogs[A]['en'][Rest]
      : never
    : never
  : never;

export type TParams<K extends MessageKey> = ParamsArg<MessageOf<K>>;

/** Keys that take no params: use this to type tables of labels, e.g. `Record<Status, PlainKey>`. */
export type PlainKey = { [K in MessageKey]: [] extends TParams<K> ? K : never }[MessageKey];

export function lookup(language: 'en' | 'fil', key: string): Message | undefined {
  const dot = key.indexOf('.');
  const area = catalogs[key.slice(0, dot) as Area] as { en: Record<string, Message>; fil: Record<string, Message> } | undefined;
  if (!area) return undefined;
  const name = key.slice(dot + 1);
  return area[language][name] ?? area.en[name];
}

/** Dev-only: warn when a Filipino string drops or renames a `{placeholder}` from the English one. */
export function checkCatalogs(): void {
  const names = (m: Message) =>
    [...new Set((typeof m === 'string' ? m : `${m.one} ${m.other}`).match(/\{\w+\}/g) ?? [])]
      .filter((p) => p !== '{count}')
      .sort()
      .join(',');
  for (const [area, cat] of Object.entries(catalogs) as [string, { en: Record<string, Message>; fil: Record<string, Message> }][]) {
    for (const key of Object.keys(cat.en)) {
      const fil = cat.fil[key];
      if (fil !== undefined && names(cat.en[key]) !== names(fil)) {
        console.warn(`[i18n] ${area}.${key}: Filipino placeholders ${names(fil)} differ from English ${names(cat.en[key])}`);
      }
    }
  }
}
