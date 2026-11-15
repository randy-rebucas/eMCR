// Referrals the clinic made for the patient (to a specialist or another clinic). Backend:
// `/api/patients/me/referrals` (list), `/referrals/[id]` (detail) and
// `/referrals/[id]/pdf-link` (a 10-minute link to the sealed referral letter).

import { apiRequest } from './api';
import { openPdfLink } from './documents';
import { doctorName } from './format';
import { t } from './i18n';

export const REFERRALS_PATH = '/api/patients/me/referrals';

export type ReferralStatus = 'pending' | 'accepted' | 'completed' | 'declined' | 'cancelled';

export interface ReferralDoctor {
  _id: string;
  firstName?: string;
  lastName?: string;
  title?: string | null;
  specialization?: string | null;
}

export interface Referral {
  _id: string;
  referralCode: string | null;
  /** internal: another doctor at the same clinic; out: another clinic; in: sent to your clinic from elsewhere. */
  direction: 'internal' | 'out' | 'in' | 'patient';
  status: ReferralStatus;
  urgency: 'routine' | 'urgent' | 'stat';
  specialty: string | null;
  reason: string | null;
  /** The clinic that holds this referral. */
  clinic: { tenantId: string | null; name: string | null };
  referredTo: { doctor: ReferralDoctor | null; clinic: string | null };
  referredBy: { doctor: ReferralDoctor | null; clinic: string | null };
  referredDate: string | null;
  acceptedDate: string | null;
  completedDate: string | null;
  declinedDate: string | null;
  followUpDate: string | null;
  appointment: {
    _id: string;
    appointmentCode: string | null;
    appointmentDate: string | null;
    appointmentTime: string | null;
    scheduledAt: string | null;
    status: string | null;
    modality: string | null;
  } | null;
  /** The sealed referral letter can be opened. */
  letterAvailable: boolean;
}

// Labels are getters so they read in the current language.
export const STATUS_LABEL: Readonly<Record<ReferralStatus, string>> = {
  get pending() {
    return t('referrals.status.pending');
  },
  get accepted() {
    return t('referrals.status.accepted');
  },
  get completed() {
    return t('referrals.status.completed');
  },
  get declined() {
    return t('referrals.status.declined');
  },
  get cancelled() {
    return t('referrals.status.cancelled');
  },
};

/** What the status means for the patient, in plain words. */
export const STATUS_HINT: Readonly<Record<ReferralStatus, string>> = {
  get pending() {
    return t('referrals.hint.pending');
  },
  get accepted() {
    return t('referrals.hint.accepted');
  },
  get completed() {
    return t('referrals.hint.completed');
  },
  get declined() {
    return t('referrals.hint.declined');
  },
  get cancelled() {
    return t('referrals.hint.cancelled');
  },
};

export const URGENCY_LABEL: Readonly<Record<Referral['urgency'], string | null>> = {
  routine: null,
  get urgent() {
    return t('referrals.urgency.urgent');
  },
  get stat() {
    return t('referrals.urgency.stat');
  },
};

function personName(doctor: ReferralDoctor | null): string | null {
  if (!doctor) return null;
  const name = doctorName(doctor);
  if (!name || !doctor.title) return name;
  return `${doctor.title} ${[doctor.firstName, doctor.lastName].filter(Boolean).join(' ')}`.trim();
}

/** "Dr. Ana Reyes · Cardiology, Heart Center" — who the patient is referred to. */
export function referredToText(r: Referral): string {
  const who = personName(r.referredTo.doctor);
  const specialty = r.referredTo.doctor?.specialization ?? r.specialty;
  const parts = [who, specialty].filter(Boolean).join(' · ');
  const clinic = r.referredTo.clinic;
  if (parts && clinic) return `${parts}, ${clinic}`;
  return parts || clinic || t('referrals.aSpecialist');
}

export function referredByText(r: Referral): string | null {
  const who = personName(r.referredBy.doctor);
  return [who, r.referredBy.clinic].filter(Boolean).join(', ') || null;
}

/** Download the letter into the app cache and open the share sheet (never the browser). */
export async function openReferralLetter(r: Referral): Promise<void> {
  const link = await apiRequest<{ url: string }>(`${REFERRALS_PATH}/${encodeURIComponent(r._id)}/pdf-link`, { method: 'POST' });
  await openPdfLink(link.url, t('referrals.letterFileName', { code: r.referralCode ?? r._id }), t('referrals.letterTitle'));
}

/**
 * Chip tone per status: sent is waiting (amber), accepted/completed teal, declined and cancelled
 * neutral. Red is kept for destructive actions; a declined referral isn't one.
 */
export function statusTone(status: ReferralStatus): 'attention' | 'teal' | 'neutral' {
  if (status === 'pending') return 'attention';
  if (status === 'accepted' || status === 'completed') return 'teal';
  return 'neutral';
}

export interface ReferralStep {
  key: 'referred' | 'accepted' | 'seen';
  state: 'done' | 'current' | 'todo' | 'ended';
  date: string | null;
}

/**
 * Referred → accepted → seen, with the dates the clinic recorded. A declined or cancelled
 * referral ends at the step it stopped on.
 */
export function referralProgress(r: Referral): ReferralStep[] {
  const referred: ReferralStep = { key: 'referred', state: 'done', date: r.referredDate };
  switch (r.status) {
    case 'completed':
      return [referred, { key: 'accepted', state: 'done', date: r.acceptedDate }, { key: 'seen', state: 'done', date: r.completedDate }];
    case 'accepted':
      return [referred, { key: 'accepted', state: 'done', date: r.acceptedDate }, { key: 'seen', state: 'current', date: null }];
    case 'declined':
      return [referred, { key: 'accepted', state: 'ended', date: r.declinedDate }];
    case 'cancelled':
      return r.acceptedDate
        ? [referred, { key: 'accepted', state: 'done', date: r.acceptedDate }, { key: 'seen', state: 'ended', date: null }]
        : [referred, { key: 'accepted', state: 'ended', date: null }];
    default:
      return [referred, { key: 'accepted', state: 'current', date: null }, { key: 'seen', state: 'todo', date: null }];
  }
}
