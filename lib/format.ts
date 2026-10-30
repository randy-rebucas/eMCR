import { getLanguage } from './i18n';

/**
 * Clinics run on Philippine time. Dates and times are shown, and calendar days
 * computed, in this zone regardless of the device's timezone.
 */
export const CLINIC_TIME_ZONE = 'Asia/Manila';
/** Asia/Manila has had no DST since 1978; used only if Intl lacks timezone support. */
const CLINIC_FALLBACK_OFFSET_MS = 8 * 60 * 60 * 1000;
/** Money and the English UI. */
const LOCALE = 'en-PH';

let filDates: boolean | undefined;

/**
 * Locale for month and weekday names: 'fil-PH' ("Okt 18, 2026", "Linggo") while the app is in
 * Filipino, if this JS engine's Intl really has Filipino data; otherwise 'en-PH'.
 */
function dateLocale(): string {
  if (getLanguage() !== 'fil') return LOCALE;
  if (filDates === undefined) {
    try {
      const supported = Intl.DateTimeFormat.supportedLocalesOf(['fil-PH']).length > 0;
      const resolved = new Intl.DateTimeFormat('fil-PH').resolvedOptions().locale.toLowerCase();
      // An engine without Filipino data falls back to its default locale instead of throwing.
      const october = new Date(Date.UTC(2026, 9, 15)).toLocaleDateString('fil-PH', { month: 'long', timeZone: 'UTC' });
      filDates = supported && resolved.startsWith('fil') && october === 'Oktubre';
    } catch {
      filDates = false;
    }
  }
  return filDates ? 'fil-PH' : LOCALE;
}

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

let partsFormatter: Intl.DateTimeFormat | null | undefined;

/** Wall-clock fields of `date` in the clinic timezone. */
function clinicParts(date: Date): { y: number; m: number; d: number; h: number; min: number } {
  if (partsFormatter === undefined) {
    try {
      partsFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: CLINIC_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      partsFormatter = null;
    }
  }
  if (partsFormatter) {
    try {
      const parts: Record<string, string> = {};
      for (const p of partsFormatter.formatToParts(date)) parts[p.type] = p.value;
      const out = {
        y: Number(parts.year),
        m: Number(parts.month),
        d: Number(parts.day),
        h: Number(parts.hour) % 24,
        min: Number(parts.minute),
      };
      if (Object.values(out).every((n) => isFinite(n))) return out;
    } catch {
      // fall through to the fixed offset
    }
  }
  const shifted = new Date(date.getTime() + CLINIC_FALLBACK_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    min: shifted.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The clinic-timezone calendar date of `date` as YYYY-MM-DD. */
export function clinicYmd(date: Date): string {
  const { y, m, d } = clinicParts(date);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Today in the clinic timezone as YYYY-MM-DD. */
export function clinicTodayYmd(): string {
  return clinicYmd(new Date());
}

/**
 * Epoch ms of a clinic wall-clock moment: `ymd` (YYYY-MM-DD) at `hhmm` (HH:mm,
 * default 00:00) in the clinic timezone. NaN when the inputs are malformed.
 */
export function clinicEpoch(ymd: string, hhmm = '00:00'): number {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!dm || !tm) return NaN;
  const wall = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  // Offset of the zone at (about) that instant: wall-clock-as-UTC minus the instant.
  const guess = wall - CLINIC_FALLBACK_OFFSET_MS;
  const p = clinicParts(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess;
  return wall - offset;
}

export interface FormatDateOptions
  extends Pick<Intl.DateTimeFormatOptions, 'weekday' | 'month' | 'day' | 'year'> {
  /** For date-only values stored as UTC midnight (e.g. dates of birth). */
  utc?: boolean;
}

/**
 * "Oct 18, 2026" in the clinic timezone. Pass `weekday`/`month`/`day`/`year`
 * to override the parts shown; `utc` for date-only values stored as UTC midnight.
 */
export function formatDate(value: DateInput, options: FormatDateOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  const { utc, ...parts } = options;
  const fields: Intl.DateTimeFormatOptions =
    Object.keys(parts).length > 0 ? parts : { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    return d.toLocaleDateString(dateLocale(), { ...fields, timeZone: utc ? 'UTC' : CLINIC_TIME_ZONE });
  } catch {
    return d.toLocaleDateString(undefined, fields);
  }
}

/** "Oct 18, 2026 · 2:30 PM" in the clinic timezone. */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)} · ${formatTime(d)}`;
}

/**
 * "2:30 PM". Accepts a clinic wall-clock "HH:mm" string ("14:30") or an
 * instant (ISO string / Date / epoch ms), which is shown in the clinic timezone.
 */
export function formatTime(value: DateInput): string {
  if (value === null || value === undefined || value === '') return '';
  let h: number;
  let min: number;
  const match = typeof value === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null;
  if (match) {
    h = Number(match[1]);
    min = Number(match[2]);
  } else {
    const d = toDate(value);
    if (!d) return typeof value === 'string' ? value : '';
    ({ h, min } = clinicParts(d));
  }
  return `${h % 12 || 12}:${pad2(min)} ${h >= 12 ? 'PM' : 'AM'}`;
}

let moneyFormatter: Intl.NumberFormat | null | undefined;

/**
 * Philippine pesos, en-PH: "₱1,234.50", "−₱1,234.50" (U+2212 minus sign).
 * "—" when there is no amount.
 */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || typeof amount !== 'number' || !isFinite(amount)) return '—';
  const rounded = Math.round(amount * 100) / 100;
  const abs = Math.abs(rounded);
  if (moneyFormatter === undefined) {
    try {
      moneyFormatter = new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency: 'PHP',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      moneyFormatter = null;
    }
  }
  let body: string;
  try {
    body = moneyFormatter ? moneyFormatter.format(abs) : '';
  } catch {
    body = '';
  }
  if (!body.includes('₱')) {
    body = `₱${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return rounded < 0 ? `−${body}` : body;
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

/**
 * Device-local calendar date as YYYY-MM-DD (for dates built from local Y/M/D,
 * e.g. calendar cells). For "today at the clinic" use `clinicTodayYmd()`.
 */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
