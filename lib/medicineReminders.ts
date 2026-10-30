import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiRequest } from './api';
import { useRefreshOn } from './events';
import { Notifications } from './notifications';
import { isCurrent } from './prescriptions';
import { toYmd } from './format';
import { Medication, Prescription } from './types';

/**
 * Medicine reminders, scheduled on this phone only (no server sync).
 *
 * The schedule is kept per family profile in SecureStore (medicine names are PHI), in a compact
 * form. Notifications are one repeating daily trigger per profile and time of day, never one per
 * dose, and their text never names a medicine. Times are the phone's local wall clock, which is
 * what the OS triggers use.
 */

// ── Frequency → suggested times ──────────────────────────────────────────────

export type TimeSuggestion =
  | { kind: 'times'; times: string[]; basis: string }
  | { kind: 'prn' }
  | { kind: 'unknown' };

/**
 * `count` = doses a day. Within one count, interval patterns ("every 8 hours") come first so they
 * win over the plain count ("TID"). `weak` patterns (plain "daily") give way to any other match,
 * so "twice daily" is twice, not once.
 */
const PATTERNS: { count: number; times: string[]; basis: string; re: RegExp; weak?: boolean }[] = [
  {
    count: 1,
    times: ['08:00'],
    basis: 'once a day',
    weak: true,
    re: /\b(od|qd|q24h|once (a |per |each )?day|once daily|daily|every ?day|every 24 hours|1x( a| per)? day|isang beses( sa isang)? araw|minsan sa isang araw|araw[- ]araw|kada araw)\b/,
  },
  { count: 1, times: ['08:00'], basis: 'every morning', re: /\b(qam|every morning|tuwing umaga)\b/ },
  { count: 1, times: ['21:00'], basis: 'at bedtime', re: /\b(hs|qhs|at bedtime|before bed(time)?|bago matulog)\b/ },
  {
    count: 2,
    times: ['08:00', '20:00'],
    basis: 'twice a day',
    re: /\b(bid|q12h?|twice (a |per |each )?day|twice daily|2x( a| per)? day|every 12 hours|(tuwing|kada) 12 oras|dalawang beses|2 beses|umaga at gabi)\b/,
  },
  { count: 3, times: ['06:00', '14:00', '22:00'], basis: 'every 8 hours', re: /\b(q8h?|every 8 hours|(tuwing|kada) 8 oras)\b/ },
  {
    count: 3,
    times: ['08:00', '14:00', '20:00'],
    basis: 'three times a day',
    re: /\b(tid|thrice (a |per )?day|thrice daily|three times (a |per |each )?day|three times daily|3x( a| per)? day|tatlong beses|3 beses)\b/,
  },
  {
    count: 4,
    times: ['00:00', '06:00', '12:00', '18:00'],
    basis: 'every 6 hours',
    re: /\b(q6h?|every 6 hours|(tuwing|kada) 6 oras)\b/,
  },
  {
    count: 4,
    times: ['08:00', '12:00', '16:00', '20:00'],
    basis: 'four times a day',
    re: /\b(qid|four times (a |per |each )?day|four times daily|4x( a| per)? day|apat na beses|4 beses)\b/,
  },
];

const PRN = /\b(prn|as needed|when needed|if needed|as required|sos|kung kailangan|kapag kailangan|pag kailangan|kung masakit|kapag masakit)\b/;

/**
 * Times suggested by a free-text frequency, only when it's unambiguous (every match agrees on
 * how many doses a day). "As needed" never gets a reminder by default. The patient always confirms.
 */
export function suggestTimes(frequency: string | undefined): TimeSuggestion {
  const text = (frequency ?? '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (!text) return { kind: 'unknown' };
  if (PRN.test(text)) return { kind: 'prn' };
  let hits = PATTERNS.filter((p) => p.re.test(text));
  if (hits.some((h) => !h.weak)) hits = hits.filter((h) => !h.weak);
  // Morning and bedtime are both once a day but different times: still ambiguous.
  const distinct = new Set(hits.map((h) => (h.count === 1 ? h.times.join(',') : String(h.count))));
  if (distinct.size !== 1) return { kind: 'unknown' };
  return { kind: 'times', times: hits[0].times, basis: hits[0].basis };
}

// ── Time helpers ─────────────────────────────────────────────────────────────

/** "HH:mm" → minutes after midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** "08:00" → "8:00 AM". */
export function formatSlot(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function sortTimes(times: string[]): string[] {
  return [...new Set(times)].sort((a, b) => toMinutes(a) - toMinutes(b));
}

// ── Stored schedule ──────────────────────────────────────────────────────────

/** A medicine with reminders on. `key` = `<prescriptionId>.<index>`. */
export interface ReminderMed {
  key: string;
  name: string;
  times: string[];
  /** Epoch ms when the course ends (exclusive), or null when the duration isn't known. */
  end: number | null;
}

export interface ProfileSchedule {
  /** First name for a family member's reminders; null for the signed-in person. */
  who: string | null;
  meds: ReminderMed[];
  /** Doses marked taken today (`<key>@HH:mm`), for `day` (device-local YYYY-MM-DD). */
  taken: { day: string; keys: string[] };
}

/** Compact JSON stored per profile: { w, m: [[key, name, "0800,2000", end|0]], d, t }. */
interface Compact {
  w?: string;
  m: [string, string, string, number][];
  d?: string;
  t?: string[];
}

const INDEX_KEY = 'medrem_index';
const MAX_MEDS = 20;
const MAX_TIMES = 6;
const ID_PREFIX = 'medrem-';
const CHANNEL_ID = 'medicine-reminders';
/** iOS keeps 64 pending local notifications per app; leave headroom. */
const NOTIFICATION_BUDGET = 60;
const DAY = 24 * 60 * 60 * 1000;

const safeId = (id: string) => id.replace(/[^\w.-]/g, '');
const profileKey = (profileId: string) => `medrem_p_${safeId(profileId)}`;

interface Index {
  /** The signed-in account the schedules belong to. */
  owner: string;
  profiles: string[];
}

async function readIndex(): Promise<Index | null> {
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Index;
    return parsed && Array.isArray(parsed.profiles) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeIndex(index: Index): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(index));
}

const emptySchedule = (): ProfileSchedule => ({ who: null, meds: [], taken: { day: toYmd(new Date()), keys: [] } });

export async function loadSchedule(profileId: string): Promise<ProfileSchedule> {
  try {
    const raw = await SecureStore.getItemAsync(profileKey(profileId));
    if (!raw) return emptySchedule();
    const c = JSON.parse(raw) as Compact;
    const today = toYmd(new Date());
    return {
      who: c.w ?? null,
      meds: (c.m ?? []).map(([key, name, times, end]) => ({
        key,
        name,
        times: times ? times.split(',').map((t) => `${t.slice(0, 2)}:${t.slice(2)}`) : [],
        end: end || null,
      })),
      taken: { day: today, keys: c.d === today ? c.t ?? [] : [] },
    };
  } catch {
    return emptySchedule();
  }
}

async function saveSchedule(owner: string, profileId: string, schedule: ProfileSchedule): Promise<void> {
  const meds = schedule.meds.filter((m) => m.times.length).slice(0, MAX_MEDS);
  const index = (await readIndex()) ?? { owner, profiles: [] };
  const key = profileKey(profileId);
  if (!meds.length) {
    await SecureStore.deleteItemAsync(key);
    index.profiles = index.profiles.filter((p) => p !== profileId);
  } else {
    const compact: Compact = {
      m: meds.map((m) => [m.key, m.name, m.times.map((t) => t.replace(':', '')).join(','), m.end ?? 0]),
    };
    if (schedule.who) compact.w = schedule.who;
    if (schedule.taken.keys.length) {
      compact.d = schedule.taken.day;
      compact.t = schedule.taken.keys;
    }
    await SecureStore.setItemAsync(key, JSON.stringify(compact));
    if (!index.profiles.includes(profileId)) index.profiles.push(profileId);
  }
  index.owner = owner;
  await writeIndex(index);
}

// ── Medicines on current prescriptions ───────────────────────────────────────

export interface ActiveMedicine {
  key: string;
  prescription: Prescription;
  med: Medication;
  /** Epoch ms when this medicine's course ends (exclusive), or null. */
  end: number | null;
}

/** Midnight (device-local) after the last day of the course. */
function courseEndFor(p: Prescription, med: Medication): number | null {
  if (!med.durationDays || med.durationDays <= 0) return null;
  const start = new Date(p.issuedAt ?? p.createdAt);
  if (isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + med.durationDays);
  return start.getTime();
}

/** Every medicine on a current prescription whose course hasn't ended. */
export function activeMedicines(prescriptions: Prescription[], now = Date.now()): ActiveMedicine[] {
  const out: ActiveMedicine[] = [];
  for (const p of prescriptions) {
    if (!isCurrent(p)) continue;
    (p.medications ?? []).forEach((med, i) => {
      if (!med?.name) return;
      const end = courseEndFor(p, med);
      if (end !== null && end <= now) return;
      out.push({ key: `${p._id}.${i}`, prescription: p, med, end });
    });
  }
  return out;
}

const PRESCRIPTIONS_PATH = '/api/patients/me/prescriptions?limit=50';
export { PRESCRIPTIONS_PATH as MEDICINE_PRESCRIPTIONS_PATH };

/**
 * Drops medicines that are no longer on a current prescription (stopped, cancelled, course
 * over, or edited to a different medicine) and refreshes course ends. Returns the new schedule.
 */
function reconcile(schedule: ProfileSchedule, active: ActiveMedicine[]): ProfileSchedule {
  const byKey = new Map(active.map((a) => [a.key, a]));
  const meds = schedule.meds.flatMap((m) => {
    const a = byKey.get(m.key);
    if (!a || a.med.name !== m.name) return [];
    return [{ ...m, end: a.end }];
  });
  const keys = new Set(meds.map((m) => m.key));
  return { ...schedule, meds, taken: { ...schedule.taken, keys: schedule.taken.keys.filter((k) => keys.has(k.split('@')[0])) } };
}

// ── Notification permission ──────────────────────────────────────────────────

export type ReminderPermission = 'unavailable' | 'granted' | 'denied' | 'undetermined';

function localSupported(): boolean {
  return !!Notifications && (Platform.OS === 'ios' || Platform.OS === 'android');
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (!localSupported() || !Notifications) return 'unavailable';
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  return status === 'undetermined' && canAskAgain ? 'undetermined' : 'denied';
}

/** Asks the OS when it hasn't been asked yet. */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  const current = await getReminderPermission();
  if (current !== 'undetermined' || !Notifications) return current;
  await Notifications.requestPermissionsAsync();
  return getReminderPermission();
}

// ── Scheduling ───────────────────────────────────────────────────────────────

interface Slot {
  profileId: string;
  who: string | null;
  time: string;
  /** Latest course end among the slot's medicines; null if any runs open-ended. */
  end: number | null;
}

/** Remaining fire dates (device-local) for a slot whose courses all end at `end`. */
function fireDates(time: string, end: number, now: number): Date[] {
  const out: Date[] = [];
  const mins = toMinutes(time);
  const d = new Date(now);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  while (d.getTime() < end && out.length <= NOTIFICATION_BUDGET) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function content(slot: Slot) {
  return {
    title: slot.who ? `Medicine reminder for ${slot.who}` : 'Medicine reminder',
    body: slot.who
      ? `It's time for ${slot.who}'s medicine. Tap to see which.`
      : "It's time for your medicine. Tap to see which.",
    data: { tag: `medicine-reminder-${slot.time}`, profileId: slot.profileId, slot: slot.time },
  };
}

async function cancelOurs(): Promise<void> {
  if (!Notifications) return;
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
  );
}

let queue: Promise<unknown> = Promise.resolve();
/** Scheduling runs one at a time so overlapping syncs can't double-schedule. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

/**
 * Replaces this app's medicine notifications with the stored schedules of every profile.
 * Slots whose courses all end soon get one-off date triggers (so they stop on time even if the
 * app isn't opened) while the budget allows; everything else is a repeating daily trigger, which
 * stops at the next sync after the course ends.
 */
export function rescheduleAll(): Promise<void> {
  return serial(async () => {
    if (!Notifications) return;
    await cancelOurs();
    if ((await getReminderPermission()) !== 'granted') return;
    const index = await readIndex();
    if (!index?.profiles.length) return;

    const now = Date.now();
    const slots = new Map<string, Slot>();
    for (const profileId of index.profiles) {
      const schedule = await loadSchedule(profileId);
      for (const med of schedule.meds) {
        if (med.end !== null && med.end <= now) continue;
        for (const time of med.times) {
          const id = `${profileId}|${time}`;
          const slot = slots.get(id);
          if (!slot) slots.set(id, { profileId, who: schedule.who, time, end: med.end });
          else slot.end = slot.end === null || med.end === null ? null : Math.max(slot.end, med.end);
        }
      }
    }

    const list = [...slots.values()].slice(0, NOTIFICATION_BUDGET);
    const plans = list
      .map((slot) => ({ slot, dates: slot.end === null ? null : fireDates(slot.time, slot.end, now) }))
      .filter((p) => p.dates === null || p.dates.length > 0);
    // Spend the spare budget on the shortest bounded courses first.
    let spare = NOTIFICATION_BUDGET - plans.length;
    for (const plan of [...plans].sort((a, b) => (a.dates?.length ?? Infinity) - (b.dates?.length ?? Infinity))) {
      if (!plan.dates) continue;
      if (plan.dates.length - 1 <= spare) spare -= plan.dates.length - 1;
      else plan.dates = null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Medicine reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const T = Notifications.SchedulableTriggerInputTypes;
    for (const { slot, dates } of plans) {
      const base = `${ID_PREFIX}${safeId(slot.profileId)}-${slot.time.replace(':', '')}`;
      const mins = toMinutes(slot.time);
      if (dates) {
        for (const date of dates) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${base}-${toYmd(date)}`,
            content: content(slot),
            trigger: { type: T.DATE, date, channelId: CHANNEL_ID },
          });
        }
      } else {
        await Notifications.scheduleNotificationAsync({
          identifier: base,
          content: content(slot),
          trigger: { type: T.DAILY, hour: Math.floor(mins / 60), minute: mins % 60, channelId: CHANNEL_ID },
        });
      }
    }
  });
}

// ── Public API for the screen ────────────────────────────────────────────────

/** Turn reminders on (with confirmed times) or off (`times: []`) for one medicine. */
export async function setMedicineReminder(
  owner: string,
  profile: { id: string; who: string | null },
  medicine: ActiveMedicine,
  times: string[]
): Promise<ProfileSchedule> {
  const schedule = await loadSchedule(profile.id);
  const others = schedule.meds.filter((m) => m.key !== medicine.key);
  const clean = sortTimes(times).slice(0, MAX_TIMES);
  const meds = clean.length
    ? [...others, { key: medicine.key, name: medicine.med.name, times: clean, end: medicine.end }]
    : others;
  const next: ProfileSchedule = {
    who: profile.who,
    meds,
    taken: { ...schedule.taken, keys: clean.length ? schedule.taken.keys : schedule.taken.keys.filter((k) => !k.startsWith(`${medicine.key}@`)) },
  };
  await saveSchedule(owner, profile.id, next);
  await rescheduleAll();
  return next;
}

/** Mark (or unmark) today's dose at `time` as taken. Local only. */
export async function setDoseTaken(owner: string, profileId: string, key: string, time: string, taken: boolean): Promise<ProfileSchedule> {
  const schedule = await loadSchedule(profileId);
  const doseKey = `${key}@${time}`;
  const keys = schedule.taken.keys.filter((k) => k !== doseKey);
  if (taken) keys.push(doseKey);
  const next = { ...schedule, taken: { day: toYmd(new Date()), keys } };
  await saveSchedule(owner, profileId, next);
  return next;
}

/**
 * Re-check one profile's schedule against its current prescriptions and reschedule. Medicines
 * that were stopped, cancelled or finished drop out. Returns the reconciled schedule.
 */
export async function syncMedicineReminders(
  owner: string,
  profile: { id: string; who: string | null },
  prescriptions: Prescription[]
): Promise<ProfileSchedule> {
  const schedule = await loadSchedule(profile.id);
  const next = { ...reconcile(schedule, activeMedicines(prescriptions)), who: profile.who };
  if (schedule.meds.length || next.meds.length) await saveSchedule(owner, profile.id, next);
  await rescheduleAll();
  return next;
}

/** Cancels every scheduled medicine reminder and deletes all stored schedules. Call on sign-out. */
export async function clearMedicineReminders(): Promise<void> {
  await serial(async () => {
    await cancelOurs().catch(() => {});
    const index = await readIndex();
    for (const profileId of index?.profiles ?? []) {
      await SecureStore.deleteItemAsync(profileKey(profileId)).catch(() => {});
    }
    await SecureStore.deleteItemAsync(INDEX_KEY).catch(() => {});
  });
}

// ── Today ────────────────────────────────────────────────────────────────────

export type DoseStatus = 'taken' | 'due' | 'missed' | 'upcoming';

/** A dose counts as "due" for this long after its time, then "missed". */
const DUE_WINDOW_MIN = 180;

export function doseStatus(schedule: ProfileSchedule, key: string, time: string, now = new Date()): DoseStatus {
  if (schedule.taken.day === toYmd(now) && schedule.taken.keys.includes(`${key}@${time}`)) return 'taken';
  const diff = now.getHours() * 60 + now.getMinutes() - toMinutes(time);
  if (diff < 0) return 'upcoming';
  return diff <= DUE_WINDOW_MIN ? 'due' : 'missed';
}

// ── Background sync (mounted once in the signed-in area) ─────────────────────

const SYNC_INTERVAL = 6 * 60 * 60 * 1000;

/**
 * Keeps reminders in step without the Medicines screen open: on launch, on return to the app
 * (at most every few hours), and whenever prescriptions refresh, the viewed profile's schedule
 * is reconciled with its current prescriptions. Schedules left by a different account are wiped.
 */
export function useMedicineReminderSync(owner: string | null | undefined, profile: { id: string; who: string | null } | null) {
  const lastSync = useRef(0);
  const profileId = profile?.id ?? null;
  const who = profile?.who ?? null;

  const run = useRef<(force: boolean) => void>(() => {});
  run.current = (force: boolean) => {
    if (!owner || !profileId) return;
    if (!force && Date.now() - lastSync.current < SYNC_INTERVAL) return;
    lastSync.current = Date.now();
    (async () => {
      const index = await readIndex();
      if (index && index.owner !== owner) {
        await clearMedicineReminders();
        return;
      }
      if (!index?.profiles.includes(profileId)) {
        // Nothing to reconcile for this person, but rolling date triggers forward is cheap.
        if (index?.profiles.length) await rescheduleAll();
        return;
      }
      const prescriptions = await apiRequest<Prescription[]>(PRESCRIPTIONS_PATH);
      await syncMedicineReminders(owner, { id: profileId, who }, prescriptions);
    })().catch(() => {
      lastSync.current = 0;
    });
  };

  useEffect(() => {
    run.current(true);
  }, [owner, profileId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run.current(false);
    });
    return () => sub.remove();
  }, []);

  useRefreshOn('prescriptions', () => run.current(true));
}

/** Days left in a course, for "Ends in 3 days" copy. */
export function daysLeft(end: number | null, now = Date.now()): number | null {
  return end === null ? null : Math.max(0, Math.ceil((end - now) / DAY));
}
