// Reading a lab result's results / referenceRanges / abnormalFlags maps.
// Mirrors the web app's components/lab-results/results.ts so flags agree.
import { LabResult } from './types';

export type Flag = 'high' | 'low' | 'normal';

const READY = new Set(['completed', 'reviewed']);

/** Values are only final once the lab has completed (or a doctor reviewed) the request. */
export function isReady(status: string | null | undefined): boolean {
  return READY.has(status ?? '');
}

/** "whiteBloodCells" → "White blood cells"; short codes like "wbc" → "WBC"; spaced names as written. */
export function analyteLabel(key: string): string {
  if (/\s/.test(key) || key.length <= 4) return key.length <= 4 && key === key.toLowerCase() ? key.toUpperCase() : key;
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** First number in a value such as "13.2", "13.2 g/dL" or 13.2. */
function numberIn(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, ''));
  return m ? Number(m[0]) : null;
}

/** Bounds from "12-16 g/dL", "12 – 16", "<5", "> 40", "≤200". */
function parseRange(range: unknown): { low: number | null; high: number | null } | null {
  if (typeof range !== 'string' || !range.trim()) return null;
  const r = range.replace(/,/g, '').trim();
  const between = /(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i.exec(r);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const below = /^(?:<|≤|<=|up to)\s*(-?\d+(?:\.\d+)?)/i.exec(r);
  if (below) return { low: null, high: Number(below[1]) };
  const above = /^(?:>|≥|>=)\s*(-?\d+(?:\.\d+)?)/i.exec(r);
  if (above) return { low: Number(above[1]), high: null };
  return null;
}

/** The stored flag, else one computed from the value and its range; null when neither is known. */
export function flagOf(result: LabResult, key: string): Flag | null {
  const stored = result.abnormalFlags?.[key];
  if (stored === 'high' || stored === 'low' || stored === 'normal') return stored;
  const v = numberIn(result.results?.[key]);
  const b = parseRange(result.referenceRanges?.[key]);
  if (v === null || !b) return null;
  if (b.low !== null && v < b.low) return 'low';
  if (b.high !== null && v > b.high) return 'high';
  return 'normal';
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface ResultSummary {
  total: number;
  outOfRange: number;
  /** Values with no flag and no readable range. */
  unrated: number;
}

export function summarize(result: LabResult): ResultSummary {
  const keys = Object.keys(result.results ?? {});
  let outOfRange = 0;
  let unrated = 0;
  for (const key of keys) {
    const flag = flagOf(result, key);
    if (flag === 'high' || flag === 'low') outOfRange++;
    else if (flag === null) unrated++;
  }
  return { total: keys.length, outOfRange, unrated };
}
