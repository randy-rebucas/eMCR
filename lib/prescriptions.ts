import { formatDate } from './format';
import { Medication, Prescription, PrescriptionVisit } from './types';

const CLOSED = new Set(['completed', 'cancelled']);
const DAY = 24 * 60 * 60 * 1000;

const FREQUENCIES: Record<string, string> = {
  od: 'Once a day',
  qd: 'Once a day',
  once: 'Once',
  daily: 'Once a day',
  bid: 'Twice a day',
  tid: 'Three times a day',
  qid: 'Four times a day',
  prn: 'As needed',
  hs: 'At bedtime',
  qam: 'Every morning',
  qpm: 'Every evening',
  stat: 'Right away',
};

/** "BID" → "Twice a day", "q6h" → "Every 6 hours"; anything else as written. */
export function frequencyLabel(freq: string | undefined): string | null {
  if (!freq?.trim()) return null;
  const key = freq.trim().toLowerCase().replace(/\./g, '');
  if (FREQUENCIES[key]) return FREQUENCIES[key];
  const everyHours = /^q\s*(\d+)\s*h(rs?)?$/.exec(key);
  if (everyHours) return `Every ${everyHours[1]} hours`;
  return freq.trim();
}

function issued(p: Prescription): Date {
  return new Date(p.issuedAt ?? p.createdAt);
}

/** Last day of the longest course in the prescription, or null when no durations are given. */
export function courseEnd(p: Prescription): Date | null {
  const days = Math.max(0, ...(p.medications ?? []).map((m) => m.durationDays ?? 0));
  if (!days) return null;
  return new Date(issued(p).getTime() + (days - 1) * DAY);
}

/**
 * Current = not closed by the clinic and the course hasn't ended. Without
 * durations, an open prescription stays current for 30 days.
 */
export function isCurrent(p: Prescription): boolean {
  if (CLOSED.has(p.status ?? '')) return false;
  const end = courseEnd(p) ?? new Date(issued(p).getTime() + 30 * DAY);
  return end.getTime() + DAY > Date.now();
}

/** "Oct 10 – Oct 15, 2024" for a medication's course, when it has a duration. */
export function courseRange(p: Prescription, med: Medication): string | null {
  if (!med.durationDays) return null;
  const start = issued(p);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + (med.durationDays - 1) * DAY);
  const short = (d: Date) => formatDate(d, { month: 'short', day: 'numeric' });
  return `${short(start)} – ${short(end)}, ${formatDate(end, { year: 'numeric' })}`;
}

export function visitOf(p: Prescription): PrescriptionVisit | null {
  if (!p.visit) return null;
  return typeof p.visit === 'string' ? { _id: p.visit } : p.visit;
}

export interface PrescriptionGroup {
  key: string;
  visit: PrescriptionVisit | null;
  date: string;
  prescriber: string | null;
  prescriptions: Prescription[];
}

export function prescriberName(p: Prescription): string | null {
  const by = p.prescribedBy;
  if (!by) return null;
  // Current servers send `name`; older ones sent firstName/lastName.
  const name = by.name?.trim() || [by.firstName, by.lastName].filter(Boolean).join(' ').trim();
  if (!name) return null;
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

/** One group per visit (newest first); prescriptions written outside a visit stand alone. */
export function groupByVisit(items: Prescription[]): PrescriptionGroup[] {
  const groups = new Map<string, PrescriptionGroup>();
  for (const p of items) {
    const visit = visitOf(p);
    const key = visit ? `v:${visit._id}` : `p:${p._id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.prescriptions.push(p);
      continue;
    }
    groups.set(key, {
      key,
      visit,
      date: visit?.date ?? p.issuedAt ?? p.createdAt,
      prescriber: prescriberName(p),
      prescriptions: [p],
    });
  }
  return [...groups.values()].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
