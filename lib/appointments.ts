import { apiRequest } from './api';
import { emitRefresh } from './events';
import { clinicEpoch, clinicYmd } from './format';
import { Appointment } from './types';

const UPCOMING_STATUSES = new Set(['pending', 'scheduled', 'confirmed', 'rescheduled']);
const NOT_CANCELLABLE = new Set(['completed', 'cancelled', 'no-show']);

/**
 * Start time in epoch ms, or NaN when the record has no date. `appointmentTime`
 * is clinic wall-clock time, so it is applied to the appointment's calendar day
 * in the clinic timezone (not the device's).
 */
export function appointmentStart(a: Appointment): number {
  const date = a.appointmentDate ?? a.scheduledAt;
  if (!date) return NaN;
  const day = new Date(date);
  if (isNaN(day.getTime())) return NaN;
  if (a.appointmentTime && /^\d{1,2}:\d{2}$/.test(a.appointmentTime.trim())) {
    const start = clinicEpoch(clinicYmd(day), a.appointmentTime);
    if (!isNaN(start)) return start;
  }
  return day.getTime();
}

/** Still ahead (with an hour's grace for a running visit) and not closed out. */
export function isUpcoming(a: Appointment): boolean {
  return UPCOMING_STATUSES.has(a.status) && appointmentStart(a) >= Date.now() - 60 * 60 * 1000;
}

/** The server has the final say (clinic timezone); this only hides the action when it obviously can't work. */
export function canCancel(a: Appointment): boolean {
  return !NOT_CANCELLABLE.has(a.status) && appointmentStart(a) > Date.now();
}

export async function cancelAppointment(id: string): Promise<void> {
  await apiRequest(`/api/patients/appointments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  emitRefresh('appointments', 'notifications');
}
