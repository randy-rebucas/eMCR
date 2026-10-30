// Clinic waitlist: when no time is free with a doctor, the patient waits for a cancellation.
// Backend: `/api/patients/me/waitlist` (list, join) and `/waitlist/[id]` (leave); the clinic's
// automation (lib/automations/waitlist-management.ts) fills cancelled slots from it.

import { apiRequest } from './api';

export const WAITLIST_PATH = '/api/patients/me/waitlist';

export interface WaitlistDoctor {
  _id: string;
  firstName?: string;
  lastName?: string;
  specialization?: string | null;
}

export interface WaitlistEntry {
  _id: string;
  /** waiting, or filled (a time was booked for you: `appointmentId`); removed only in a leave reply. */
  status: 'waiting' | 'filled' | 'removed';
  /** Still waiting, but its day is more than a week past, so no opening will match it. */
  lapsed: boolean;
  clinic: { tenantId: string | null; name: string | null };
  doctor: WaitlistDoctor | null;
  /** "yyyy-MM-dd" (clinic day); null = any day. */
  preferredDate: string | null;
  preferredTime: string | null;
  joinedAt: string | null;
  filledAt: string | null;
  appointmentId: string | null;
}

export interface WaitlistList {
  entries: WaitlistEntry[];
  /** Most entries that can wait at once. */
  maxActive: number;
}

/** Codes the join can fail with (409); their messages are written for the patient. */
export type WaitlistErrorCode = 'WAITLIST_OFF' | 'ALREADY_WAITING' | 'WAITLIST_LIMIT';

/** Wait for an opening with this doctor, on (about) `date` or on any day when it is null. */
export function joinWaitlist(doctorId: string, date: string | null): Promise<{ entry: WaitlistEntry }> {
  return apiRequest(WAITLIST_PATH, { method: 'POST', body: { doctorId, ...(date ? { preferredDate: date } : {}) } });
}

export function leaveWaitlist(id: string): Promise<{ entry: WaitlistEntry }> {
  return apiRequest(`${WAITLIST_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * What happens when a time opens, in plain words. Mirrors the server: a cancelled time with the
 * doctor goes to the first person waiting whose day is within a week of it (or who chose any day),
 * and it is booked for them straight away.
 */
export const WAITLIST_EXPLAINER = [
  'If someone cancels a time with this doctor, it goes to the people waiting, in the order they joined (the clinic may put urgent cases first).',
  'If you chose a day, a time up to a week before or after it counts. If you chose any day, any time counts. Times starting within the hour aren’t offered.',
  'The time is booked for you straight away. You’ll get a notification here, and a text or email if the clinic has your number or address.',
  'Check the new appointment. If it doesn’t suit you, cancel it so someone else can have it.',
  'You stay on the list until a time is booked for you or you leave it.',
] as const;
