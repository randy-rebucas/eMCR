import { apiRequest } from './api';
import { emitRefresh } from './events';
import { clinicEpoch, clinicTodayYmd, clinicYmd } from './format';
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

/**
 * Still marked pending/confirmed/rescheduled but the day has gone by: the clinic never closed it.
 * Shown in History with "Date passed", so a past visit doesn't read as one still to come.
 */
export function isOverdue(a: Appointment): boolean {
  return UPCOMING_STATUSES.has(a.status) && !isUpcoming(a);
}

/** Whole clinic days from today to the appointment's day: 0 today, 1 tomorrow; NaN without a date. */
export function daysUntil(a: Appointment): number {
  const start = appointmentStart(a);
  if (isNaN(start)) return NaN;
  const day = Date.parse(`${clinicYmd(new Date(start))}T00:00:00Z`);
  const today = Date.parse(`${clinicTodayYmd()}T00:00:00Z`);
  return Math.round((day - today) / 86_400_000);
}

/** The server has the final say (clinic timezone); this only hides the action when it obviously can't work. */
export function canCancel(a: Appointment): boolean {
  return !NOT_CANCELLABLE.has(a.status) && appointmentStart(a) > Date.now();
}

export async function cancelAppointment(id: string): Promise<void> {
  await apiRequest(`/api/patients/appointments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  emitRefresh('appointments', 'notifications');
}

/**
 * Moving needs a doctor and a booked slot (not a walk-in); otherwise the same rule as cancelling.
 * The server re-checks (clinic timezone, status, the slot's availability).
 */
export function canReschedule(a: Appointment): boolean {
  return canCancel(a) && !!a.doctor?._id && !!a.appointmentDate && !!a.appointmentTime;
}

/** Move an appointment to another free slot with the same doctor; the clinic confirms the new time. */
export async function rescheduleAppointment(id: string, appointmentDate: string, appointmentTime: string): Promise<Appointment | null> {
  const moved = await apiRequest<Appointment>(`/api/patients/appointments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { appointmentDate, appointmentTime },
  });
  emitRefresh('appointments', 'notifications');
  return moved ?? null;
}

/** One step of "where it stands" on the appointment's detail screen. */
export interface ProgressStep {
  key: 'requested' | 'confirm' | 'visit' | 'done';
  state: 'done' | 'current' | 'todo' | 'ended';
}

/**
 * Requested → clinic confirms → visit day → done, from the status alone (the server keeps no
 * confirmation time). `ended` marks where a cancelled, missed or never-closed appointment stopped.
 */
export function appointmentProgress(a: Appointment): ProgressStep[] {
  const steps = (states: ProgressStep['state'][]): ProgressStep[] =>
    (['requested', 'confirm', 'visit', 'done'] as const).map((key, i) => ({ key, state: states[i] }));
  switch (a.status) {
    case 'completed':
      return steps(['done', 'done', 'done', 'done']);
    case 'no-show':
      return steps(['done', 'done', 'ended', 'todo']);
    case 'cancelled':
      // Cancelled before the clinic answered, or after it confirmed: the status can't tell which.
      return steps(['done', 'ended', 'todo', 'todo']);
    case 'pending':
    case 'rescheduled':
      return isOverdue(a) ? steps(['done', 'ended', 'todo', 'todo']) : steps(['done', 'current', 'todo', 'todo']);
    default:
      // confirmed / scheduled: today is the visit; past it without being closed stops there.
      if (isOverdue(a)) return steps(['done', 'done', 'ended', 'todo']);
      return steps(['done', 'done', daysUntil(a) === 0 ? 'current' : 'todo', 'todo']);
  }
}
