// Referrals the clinic made for the patient (to a specialist or another clinic). Backend:
// `/api/patients/me/referrals` (list), `/referrals/[id]` (detail) and
// `/referrals/[id]/pdf-link` (a 10-minute link to the sealed referral letter).

import { apiRequest } from './api';
import { openPdfLink } from './documents';
import { doctorName } from './format';

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

export const STATUS_LABEL: Record<ReferralStatus, string> = {
  pending: 'Sent',
  accepted: 'Accepted',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/** What the status means for the patient, in plain words. */
export const STATUS_HINT: Record<ReferralStatus, string> = {
  pending: 'Your referral was sent. The doctor or clinic you were referred to hasn’t answered yet.',
  accepted: 'The doctor or clinic accepted your referral. Book or attend the appointment to be seen.',
  completed: 'You were seen. Your doctor may follow up on the results.',
  declined: 'The referral was not accepted. Please ask your clinic about other options.',
  cancelled: 'This referral was cancelled.',
};

export const URGENCY_LABEL: Record<Referral['urgency'], string | null> = {
  routine: null,
  urgent: 'Urgent',
  stat: 'As soon as possible',
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
  return parts || clinic || 'A specialist';
}

export function referredByText(r: Referral): string | null {
  const who = personName(r.referredBy.doctor);
  return [who, r.referredBy.clinic].filter(Boolean).join(', ') || null;
}

/** Download the letter into the app cache and open the share sheet (never the browser). */
export async function openReferralLetter(r: Referral): Promise<void> {
  const link = await apiRequest<{ url: string }>(`${REFERRALS_PATH}/${encodeURIComponent(r._id)}/pdf-link`, { method: 'POST' });
  await openPdfLink(link.url, `Referral-Letter-${r.referralCode ?? r._id}`, 'Referral letter');
}
