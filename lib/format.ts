/** "Oct 18, 2026". `utc` for date-only values stored as UTC midnight (e.g. dates of birth). */
export function formatDate(value: string | null | undefined, options: { utc?: boolean } = {}): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(options.utc ? { timeZone: 'UTC' } : {}),
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return `${formatDate(value)} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** "14:30" → "2:30 PM" */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return hhmm;
  const h = Number(match[1]);
  return `${h % 12 || 12}:${match[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Clinics bill in Philippine pesos. */
export function formatMoney(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && isFinite(amount) ? amount : 0;
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "in-progress" / "lab_result" → "In progress" / "Lab result" */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const text = value.replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function doctorName(doctor: { firstName?: string; lastName?: string } | null | undefined): string | null {
  if (!doctor || (!doctor.firstName && !doctor.lastName)) return null;
  return `Dr. ${[doctor.firstName, doctor.lastName].filter(Boolean).join(' ')}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The YYYY-MM-DD part of a stored UTC-midnight date. */
export function isoToYmd(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidHhmm(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
}
