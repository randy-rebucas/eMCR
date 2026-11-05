// Visit history and vitals: response shapes for `GET /api/patients/me/visits`,
// `/visits/[id]` and `/vitals`, plus display helpers. Fields follow the backend's
// Visit model; everything is optional because older records may lack it.

import { humanize } from './format';
import { PlainKey, t } from './i18n';

export type VisitType = 'consultation' | 'follow-up' | 'checkup' | 'emergency' | 'teleconsult' | 'vaccination';

/** Vitals taken at a visit. `bp` is a string such as "120/80". */
export interface VisitVitals {
  bp?: string | null;
  hr?: number | null;
  rr?: number | null;
  tempC?: number | null;
  spo2?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  bmi?: number | null;
}

export interface VisitDiagnosis {
  code?: string;
  description?: string;
  primary?: boolean;
}

export interface VisitTreatmentPlan {
  medications?: { name: string; dosage?: string; frequency?: string; duration?: string; quantity?: number; instructions?: string }[];
  procedures?: { name: string; description?: string; scheduledDate?: string }[];
  lifestyle?: { category?: string; instructions: string }[];
  followUp?: { date?: string; instructions?: string };
}

/** One row of `GET /api/patients/me/visits` and the body of `/visits/[id]`. */
export interface Visit {
  _id: string;
  tenantId?: string;
  visitCode?: string;
  date: string;
  /** Populated `{ _id, name }`; a bare id when the user record is gone. */
  provider?: { _id?: string; name?: string } | string | null;
  visitType?: VisitType | string;
  chiefComplaint?: string;
  vitals?: VisitVitals | null;
  diagnoses?: VisitDiagnosis[];
  /** Legacy fields; current records use `soapNotes`. */
  assessment?: string;
  plan?: string;
  soapNotes?: { assessment?: string; plan?: string } | null;
  treatmentPlan?: VisitTreatmentPlan | null;
  /** Prescription ids written at this visit. */
  prescriptions?: string[];
  followUpDate?: string | null;
  status?: 'draft' | 'open' | 'closed' | 'cancelled' | string;
}

/** One entry of `GET /api/patients/me/vitals` (oldest first). */
export interface VitalsEntry {
  visitId: string;
  visitCode?: string;
  visitType?: string;
  date: string;
  vitals: VisitVitals;
}

const VISIT_TYPE: Record<string, PlainKey> = {
  consultation: 'visits.type.consultation',
  'follow-up': 'visits.type.follow-up',
  checkup: 'visits.type.checkup',
  emergency: 'visits.type.emergency',
  teleconsult: 'visits.type.teleconsult',
  vaccination: 'visits.type.vaccination',
};

export function visitTypeLabel(type: string | null | undefined): string {
  if (!type) return t('visits.type.default');
  const key = VISIT_TYPE[type];
  return key ? t(key) : humanize(type);
}

/** "Dr. Ana Cruz", or null when the visit names no provider. */
export function visitProvider(visit: Pick<Visit, 'provider'>): string | null {
  const p = visit.provider;
  if (!p || typeof p === 'string') return null;
  const name = p.name?.trim();
  if (!name) return null;
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

export function primaryDiagnosis(visit: Pick<Visit, 'diagnoses'>): VisitDiagnosis | null {
  const list = (visit.diagnoses ?? []).filter((d) => d.description?.trim() || d.code?.trim());
  return list.find((d) => d.primary) ?? list[0] ?? null;
}

export function diagnosisText(d: VisitDiagnosis): string {
  return d.description?.trim() || d.code?.trim() || '';
}

/** The line under a visit in the list: the reason for the visit, else what was found. */
export function visitReason(visit: Visit): string | null {
  const complaint = visit.chiefComplaint?.trim();
  if (complaint) return complaint;
  const dx = primaryDiagnosis(visit);
  return dx ? diagnosisText(dx) : null;
}

export function visitAssessment(visit: Visit): string | null {
  return visit.soapNotes?.assessment?.trim() || visit.assessment?.trim() || null;
}

export function visitPlan(visit: Visit): string | null {
  return visit.soapNotes?.plan?.trim() || visit.plan?.trim() || null;
}

export function followUp(visit: Visit): { date: string | null; instructions: string | null } | null {
  const date = visit.followUpDate || visit.treatmentPlan?.followUp?.date || null;
  const instructions = visit.treatmentPlan?.followUp?.instructions?.trim() || null;
  return date || instructions ? { date, instructions } : null;
}

// ── Vitals ───────────────────────────────────────────────────────────────────

/** Systolic/diastolic from "120/80"; null when it doesn't parse. */
export function parseBp(bp: string | null | undefined): { systolic: number; diastolic: number } | null {
  if (!bp) return null;
  const m = /^\s*(\d{2,3}(?:\.\d+)?)\s*\/\s*(\d{2,3}(?:\.\d+)?)\s*$/.exec(bp);
  if (!m) return null;
  return { systolic: Number(m[1]), diastolic: Number(m[2]) };
}

export type MeasureKey = 'bp' | 'hr' | 'weightKg' | 'bmi' | 'tempC' | 'spo2' | 'rr' | 'heightCm';

export interface Measure {
  key: MeasureKey;
  label: string;
  unit: string;
  /** The unit as a screen reader should say it. */
  unitSpoken: string;
  decimals: number;
}

/** A measure whose label and spoken unit are read in the current language each time. */
function measure(key: MeasureKey, label: PlainKey, unit: string, unitSpoken: PlainKey | null, decimals: number): Measure {
  return {
    key,
    get label() {
      return t(label);
    },
    unit,
    get unitSpoken() {
      return unitSpoken ? t(unitSpoken) : '';
    },
    decimals,
  };
}

/** Display order of the measures; only those present in the data are offered. */
export const MEASURES: Measure[] = [
  measure('bp', 'visits.measure.bp', 'mmHg', 'visits.spoken.bp', 0),
  measure('hr', 'visits.measure.hr', 'bpm', 'visits.spoken.hr', 0),
  measure('weightKg', 'visits.measure.weightKg', 'kg', 'visits.spoken.weightKg', 1),
  measure('bmi', 'visits.measure.bmi', '', null, 1),
  measure('tempC', 'visits.measure.tempC', '°C', 'visits.spoken.tempC', 1),
  measure('spo2', 'visits.measure.spo2', '%', 'visits.spoken.spo2', 0),
  measure('rr', 'visits.measure.rr', '/min', 'visits.spoken.rr', 0),
  measure('heightCm', 'visits.measure.heightCm', 'cm', 'visits.spoken.heightCm', 1),
];

/** One reading of a measure. `values` has one entry, or two for blood pressure (systolic, diastolic). */
export interface Reading {
  visitId: string;
  date: string;
  time: number;
  values: number[];
}

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** The readings of one measure, oldest first, skipping visits that didn't record it. */
export function readingsFor(entries: VitalsEntry[], key: MeasureKey): Reading[] {
  const out: Reading[] = [];
  for (const e of entries) {
    const time = new Date(e.date).getTime();
    if (!isFinite(time)) continue;
    let values: number[] | null = null;
    if (key === 'bp') {
      const bp = parseBp(e.vitals?.bp);
      values = bp ? [bp.systolic, bp.diastolic] : null;
    } else {
      const v = num(e.vitals?.[key]);
      values = v === null ? null : [v];
    }
    if (values) out.push({ visitId: e.visitId, date: e.date, time, values });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function availableMeasures(entries: VitalsEntry[]): Measure[] {
  return MEASURES.filter((m) => readingsFor(entries, m.key).length > 0);
}

export function formatNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  // 72.0 → 72; keep 36.5.
  return decimals > 0 ? String(Number(fixed)) : fixed;
}

/** "120/80 mmHg", "72 kg", "24.1". */
export function formatReading(measure: Measure, values: number[], withUnit = true): string {
  const text = values.map((v) => formatNumber(v, measure.decimals)).join('/');
  return withUnit && measure.unit ? `${text}${measure.unit === '%' || measure.unit === '°C' ? '' : ' '}${measure.unit}` : text;
}

/** Vitals of one visit as label/value rows, in display order, only what was recorded. */
export function vitalRows(vitals: VisitVitals | null | undefined): { label: string; value: string }[] {
  if (!vitals) return [];
  const rows: { label: string; value: string }[] = [];
  for (const m of MEASURES) {
    if (m.key === 'bp') {
      const bp = parseBp(vitals.bp);
      if (bp) rows.push({ label: m.label, value: formatReading(m, [bp.systolic, bp.diastolic]) });
      else if (vitals.bp?.trim()) rows.push({ label: m.label, value: vitals.bp.trim() });
      continue;
    }
    const v = num(vitals[m.key]);
    if (v !== null) rows.push({ label: m.label, value: formatReading(m, [v]) });
  }
  return rows;
}
