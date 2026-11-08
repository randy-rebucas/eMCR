import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { useApiData } from '@/lib/useApiData';
import { Prescription } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { frequencyLabel } from '@/lib/prescriptions';
import {
  ActiveMedicine,
  activeMedicines,
  daysLeft,
  doseStatus,
  DoseStatus,
  formatSlot,
  fromMinutes,
  getExactAlarmAllowed,
  loadSchedule,
  MEDICINE_PRESCRIPTIONS_PATH,
  ProfileSchedule,
  ReminderPermission,
  getReminderPermission,
  requestReminderPermission,
  reminderKeys,
  requestExactAlarms,
  rescheduleAll,
  setDoseTaken,
  setMedicineReminder,
  sortTimes,
  suggestTimes,
  syncMedicineReminders,
  toMinutes,
} from '@/lib/medicineReminders';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { PlainKey, possessiveName, useT } from '@/lib/i18n';

const MAX_TIMES = 6;
const STEP_MIN = 30;
/** Set once the patient hid the Android "reminders on time" tip. Not PHI. */
const EXACT_HINT_DISMISSED_KEY = 'medrem_exact_hint_dismissed';

const STATUS: Record<DoseStatus, { label: PlainKey; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  taken: { label: 'medicines.status.taken', fg: colors.primaryOnSoft, bg: colors.primarySoft, icon: 'checkmark-circle' },
  due: { label: 'medicines.status.due', fg: colors.warning, bg: colors.warningSoft, icon: 'alarm-outline' },
  missed: { label: 'medicines.status.missed', fg: colors.danger, bg: colors.dangerSoft, icon: 'close-circle-outline' },
  upcoming: { label: 'medicines.status.upcoming', fg: colors.slate, bg: colors.slateSoft, icon: 'time-outline' },
};

/**
 * Medicine reminders for the person being viewed: pick which medicines on current prescriptions
 * to be reminded about and at what times, then mark today's doses taken. Everything stays on
 * this phone. Opened from a reminder with `?slot=HH:mm` to show what's due.
 */
export default function MedicinesScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { slot } = useLocalSearchParams<{ slot?: string }>();
  const { patient } = useAuth();
  const { viewing } = useProfile();
  const owner = patient?.id ?? null;
  const profile = useMemo(
    () => (viewing ? { id: viewing.id, who: viewing.self ? null : viewing.firstName } : null),
    [viewing]
  );

  const { data, loading, refreshing, error, refresh } = useApiData<Prescription[]>(MEDICINE_PRESCRIPTIONS_PATH, {
    refreshOn: ['prescriptions'],
  });
  const [schedule, setSchedule] = useState<ProfileSchedule | null>(null);
  // Medicines with reminders stay listed while their prescription is open (maintenance medicines
  // without a duration), so their reminders can still be changed or turned off.
  const scheduledKeys = useMemo(() => [...reminderKeys(schedule)].sort().join('|'), [schedule]);
  const medicines = useMemo(
    () => activeMedicines(data ?? [], Date.now(), new Set(scheduledKeys ? scheduledKeys.split('|') : [])),
    [data, scheduledKeys]
  );
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Android: reminders can only fire on the minute with "Alarms & reminders" allowed.
  const [exactAllowed, setExactAllowed] = useState<boolean | null>(null);
  const [exactHintDismissed, setExactHintDismissed] = useState(true);

  // Stored schedule first (fast), then reconciled with the prescriptions once they load.
  useEffect(() => {
    if (!profile) return;
    loadSchedule(profile.id).then(setSchedule);
  }, [profile]);

  useEffect(() => {
    if (!data || !owner || !profile) return;
    syncMedicineReminders(owner, profile, data)
      .then(setSchedule)
      .catch(() => {});
  }, [data, owner, profile]);

  const lastPermission = useRef<ReminderPermission | null>(null);
  const lastExact = useRef<boolean | null>(null);
  const checkPermission = useCallback(async () => {
    const next = await getReminderPermission().catch((): ReminderPermission => 'unavailable');
    const prev = lastPermission.current;
    lastPermission.current = next;
    const exact = await getExactAlarmAllowed();
    const prevExact = lastExact.current;
    lastExact.current = exact;
    // Turned on in the phone's Settings app: schedule what was saved meanwhile (alarms set
    // without the exact-alarm permission stay inexact until they are scheduled again).
    if ((prev && prev !== 'granted' && next === 'granted') || (prevExact === false && exact === true)) {
      rescheduleAll().catch(() => {});
    }
    setPermission(next);
    setExactAllowed(exact);
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(EXACT_HINT_DISMISSED_KEY)
      .then((v) => setExactHintDismissed(v === '1'))
      .catch(() => setExactHintDismissed(false));
  }, []);

  function dismissExactHint() {
    setExactHintDismissed(true);
    SecureStore.setItemAsync(EXACT_HINT_DISMISSED_KEY, '1').catch(() => {});
  }

  async function allowExact() {
    const granted = await requestExactAlarms();
    if (granted !== null) {
      lastExact.current = granted;
      setExactAllowed(granted);
    }
  }

  useEffect(() => {
    checkPermission();
    const tick = setInterval(() => setNow(new Date()), 60 * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(new Date());
        checkPermission();
      }
    });
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, [checkPermission]);

  const reminderFor = useCallback((key: string) => schedule?.meds.find((m) => m.key === key) ?? null, [schedule]);

  async function save(medicine: ActiveMedicine, times: string[]) {
    // Opened offline: who is signed in isn't known yet, and schedules are saved per account.
    if (!owner || !profile) {
      setSaveError(t('medicines.notReady'));
      return;
    }
    setBusy(medicine.key);
    setSaveError(null);
    try {
      if (times.length) setPermission(await requestReminderPermission());
      setSchedule(await setMedicineReminder(owner, profile, medicine, times));
      setEditing(({ [medicine.key]: _, ...rest }) => rest);
    } catch {
      setSaveError(t('medicines.saveFailed'));
    } finally {
      setBusy(null);
    }
  }

  function toggle(medicine: ActiveMedicine, on: boolean) {
    if (on) {
      const suggestion = suggestTimes(medicine.med.frequency);
      setEditing((e) => ({ ...e, [medicine.key]: suggestion.kind === 'times' ? suggestion.times : [] }));
    } else if (editing[medicine.key] && !reminderFor(medicine.key)) {
      setEditing(({ [medicine.key]: _, ...rest }) => rest);
    } else {
      save(medicine, []);
    }
  }

  async function markTaken(key: string, time: string, taken: boolean) {
    if (!owner || !profile) {
      setSaveError(t('medicines.notReady'));
      return;
    }
    try {
      setSchedule(await setDoseTaken(owner, profile.id, key, time, taken));
    } catch {
      setSaveError(t('medicines.markFailed'));
    }
  }

  async function turnOn() {
    setPermission(await requestReminderPermission());
    rescheduleAll().catch(() => {});
  }

  // Today's doses for medicines with reminders, in time order.
  const doses = useMemo(() => {
    if (!schedule) return [];
    const names = new Map(medicines.map((m) => [m.key, m]));
    return schedule.meds
      .filter((m) => names.has(m.key))
      .flatMap((m) =>
        m.times.map((time) => ({ key: m.key, time, medicine: names.get(m.key)!, status: doseStatus(schedule, m.key, time, now) }))
      )
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  }, [schedule, medicines, now]);

  const hasReminders = (schedule?.meds.length ?? 0) > 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <SafeAreaView edges={['top']}>
        <AppHeader back />
        <Text style={styles.title} accessibilityRole="header">
          {t('medicines.title')}
        </Text>
        <Text style={styles.subtitle}>
          {!viewing || viewing.self
            ? t('medicines.subtitleSelf')
            : t('medicines.subtitleOther', { whose: possessiveName(viewing.firstName) })}
        </Text>
      </SafeAreaView>

      {hasReminders && permission && permission !== 'granted' ? (
        <PermissionCard permission={permission} onTurnOn={turnOn} />
      ) : null}
      {hasReminders && permission === 'granted' && exactAllowed === false && !exactHintDismissed ? (
        <ExactAlarmHint onAllow={allowExact} onDismiss={dismissExactHint} />
      ) : null}
      {saveError ? <Banner message={saveError} /> : null}
      {error && data ? <Banner message={error} /> : null}

      {doses.length ? (
        <>
          <Text style={styles.groupTitle} accessibilityRole="header">
            {t('medicines.today')}
          </Text>
          <View style={[styles.card, styles.list]}>
            {doses.map((d, i) => {
              const s = STATUS[d.status];
              const highlight = d.time === slot && d.status !== 'taken';
              return (
                <View
                  key={`${d.key}@${d.time}`}
                  style={[styles.doseRow, i < doses.length - 1 && styles.rowDivider, highlight && styles.highlight]}
                >
                  <Text style={styles.doseTime}>{formatSlot(d.time)}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.doseName} numberOfLines={2}>
                      {[d.medicine.med.name, d.medicine.med.strength].filter(Boolean).join(' ')}
                    </Text>
                    {d.medicine.med.dose ? <Text style={styles.rowDetail}>{d.medicine.med.dose}</Text> : null}
                    <View style={[styles.pill, { backgroundColor: s.bg }]}>
                      <Ionicons name={s.icon} size={13} color={s.fg} />
                      <Text style={[styles.pillText, { color: s.fg }]}>{t(s.label)}</Text>
                    </View>
                  </View>
                  {d.status === 'upcoming' ? null : (
                    <TouchableOpacity
                      style={[styles.takenBtn, d.status === 'taken' && styles.takenBtnOn]}
                      onPress={() => markTaken(d.key, d.time, d.status !== 'taken')}
                      accessibilityRole="button"
                      accessibilityState={{ checked: d.status === 'taken' }}
                      accessibilityLabel={
                        d.status === 'taken'
                          ? t('medicines.undoA11y', { name: d.medicine.med.name, time: formatSlot(d.time) })
                          : t('medicines.markA11y', { name: d.medicine.med.name, time: formatSlot(d.time) })
                      }
                    >
                      <Ionicons
                        name={d.status === 'taken' ? 'arrow-undo-outline' : 'checkmark'}
                        size={16}
                        color={d.status === 'taken' ? colors.primary : colors.primaryText}
                      />
                      <Text style={[styles.takenText, d.status === 'taken' && styles.takenTextOn]}>
                        {d.status === 'taken' ? t('medicines.undo') : t('medicines.taken')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.groupTitle} accessibilityRole="header">
        {t('medicines.medicines')}
      </Text>
      {loading && !data ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : error && !data ? (
        <View style={styles.card}>
          <Text style={styles.bodyText}>{error}</Text>
          <Button title={t('common.tryAgainTitle')} variant="secondary" icon="refresh" onPress={refresh} style={styles.retry} />
        </View>
      ) : !medicines.length ? (
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="medical-outline" size={32} color={colors.primary} />
          <Text style={styles.emptyTitle}>{t('medicines.empty.title')}</Text>
          <Text style={styles.rowDetail}>{t('medicines.empty.text')}</Text>
        </View>
      ) : (
        medicines.map((m) => (
          <MedicineCard
            key={m.key}
            medicine={m}
            times={reminderFor(m.key)?.times ?? null}
            draft={editing[m.key] ?? null}
            busy={busy === m.key}
            onToggle={(on) => toggle(m, on)}
            onEdit={(times) => setEditing((e) => ({ ...e, [m.key]: times }))}
            onCancel={() => setEditing(({ [m.key]: _, ...rest }) => rest)}
            onSave={(times) => save(m, times)}
          />
        ))
      )}

      <Text style={styles.footnote}>{t('medicines.footnote')}</Text>
    </ScrollView>
  );
}

function MedicineCard({
  medicine,
  times,
  draft,
  busy,
  onToggle,
  onEdit,
  onCancel,
  onSave,
}: {
  medicine: ActiveMedicine;
  /** Saved reminder times, or null when reminders are off. */
  times: string[] | null;
  /** Times being edited, or null when not editing. */
  draft: string[] | null;
  busy: boolean;
  onToggle: (on: boolean) => void;
  onEdit: (times: string[]) => void;
  onCancel: () => void;
  onSave: (times: string[]) => void;
}) {
  const t = useT();
  const { med } = medicine;
  const title = [med.name, med.strength].filter(Boolean).join(' ');
  const dosage = [med.dose, frequencyLabel(med.frequency)].filter(Boolean).join(' · ');
  const left = daysLeft(medicine.end);
  const ends =
    medicine.end === null
      ? null
      : left !== null && left <= 1
        ? t('medicines.lastDay')
        : t('medicines.until', { date: formatDate(new Date(medicine.end - 1), { month: 'short', day: 'numeric' }) });
  const suggestion = suggestTimes(med.frequency);
  const on = times !== null || draft !== null;

  return (
    <View style={styles.card}>
      <View style={styles.medTop}>
        <View style={styles.rowIcon}>
          <Ionicons name="medkit-outline" size={22} color={colors.primaryOnSoft} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowLabel}>{title}</Text>
          {dosage ? <Text style={styles.rowDetail}>{dosage}</Text> : null}
          {ends ? <Text style={styles.rowDetail}>{ends}</Text> : null}
        </View>
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        <Switch
          value={on}
          onValueChange={onToggle}
          disabled={busy}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.border}
          accessibilityLabel={t('medicines.remindersFor', { name: title })}
        />
      </View>

      {draft ? (
        <TimeEditor
          frequency={med.frequency}
          suggestion={suggestion}
          times={draft}
          busy={busy}
          onChange={onEdit}
          onCancel={onCancel}
          onSave={() => onSave(draft)}
        />
      ) : times ? (
        <View style={styles.savedRow}>
          <Ionicons name="alarm-outline" size={18} color={colors.primary} />
          <Text style={[styles.bodyText, styles.flex]}>{times.map(formatSlot).join(', ')}</Text>
          <TouchableOpacity onPress={() => onEdit(times)} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.linkText}>{t('medicines.changeTimes')}</Text>
          </TouchableOpacity>
        </View>
      ) : suggestion.kind === 'prn' ? (
        <Text style={styles.hint}>{t('medicines.prnNoReminder')}</Text>
      ) : null}
    </View>
  );
}

function TimeEditor({
  frequency,
  suggestion,
  times,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  frequency: string | undefined;
  suggestion: ReturnType<typeof suggestTimes>;
  times: string[];
  busy: boolean;
  onChange: (times: string[]) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const tr = useT();
  const shift = (i: number, by: number) =>
    onChange(sortTimes(times.map((t, j) => (j === i ? fromMinutes(toMinutes(t) + by) : t))));
  const remove = (i: number) => onChange(times.filter((_, j) => j !== i));
  const add = () => {
    const last = times.length ? toMinutes(times[times.length - 1]) + 4 * 60 : 8 * 60;
    onChange(sortTimes([...times, fromMinutes(last)]));
  };

  let note: string;
  if (suggestion.kind === 'times') {
    note = tr('medicines.suggested', { basis: tr(suggestion.basis) });
  } else if (suggestion.kind === 'prn') {
    note = tr('medicines.prnNote');
  } else {
    note = frequency?.trim()
      ? tr('medicines.unknownFreq', { frequency: frequency.trim() })
      : tr('medicines.noFreq');
  }

  return (
    <View style={styles.editor}>
      <Text style={styles.hint}>{note}</Text>
      {times.map((t, i) => (
        <View key={`${t}-${i}`} style={styles.timeRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => shift(i, -STEP_MIN)}
            accessibilityRole="button"
            accessibilityLabel={tr('medicines.earlier', { time: formatSlot(t) })}
          >
            <Ionicons name="remove" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.timeText} accessibilityLiveRegion="polite">
            {formatSlot(t)}
          </Text>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => shift(i, STEP_MIN)}
            accessibilityRole="button"
            accessibilityLabel={tr('medicines.later', { time: formatSlot(t) })}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => remove(i)}
            accessibilityRole="button"
            accessibilityLabel={tr('medicines.remove', { time: formatSlot(t) })}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ))}
      {times.length < MAX_TIMES ? (
        <TouchableOpacity style={styles.addBtn} onPress={add} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.linkText}>{tr('medicines.addTime')}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.editorActions}>
        <Button title={tr('common.cancel')} variant="secondary" onPress={onCancel} disabled={busy} style={styles.flex} />
        <Button
          title={tr('medicines.saveReminders')}
          onPress={onSave}
          loading={busy}
          disabled={!times.length}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

/**
 * Android 12+ without "Alarms & reminders": reminders may come a few minutes late. Opens the
 * system screen for it (expo-notifications' requestExactAlarmPermissionsAsync); hidden for good
 * with "Not now".
 */
function ExactAlarmHint({ onAllow, onDismiss }: { onAllow: () => void; onDismiss: () => void }) {
  const t = useT();
  return (
    <View style={[styles.status, styles.statusOff]}>
      <Ionicons name="alarm-outline" size={22} color={colors.slate} />
      <View style={styles.flex}>
        <Text style={styles.statusTitle}>{t('medicines.exact.title')}</Text>
        <Text style={styles.bodyText}>{t('medicines.exact.body')}</Text>
        <View style={styles.hintActions}>
          <TouchableOpacity onPress={onAllow} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.linkText}>{t('medicines.exact.allow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('medicines.exact.dismissA11y')}
            hitSlop={8}
          >
            <Text style={styles.mutedLink}>{t('medicines.exact.dismiss')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PermissionCard({ permission, onTurnOn }: { permission: ReminderPermission; onTurnOn: () => void }) {
  const t = useT();
  if (permission === 'unavailable') {
    return (
      <View style={[styles.status, styles.statusOff]}>
        <Ionicons name="phone-portrait-outline" size={22} color={colors.slate} />
        <Text style={[styles.bodyText, styles.flex]}>{t('medicines.unavailable')}</Text>
      </View>
    );
  }
  const denied = permission === 'denied';
  return (
    <View style={[styles.status, styles.statusWarn, styles.statusStack]}>
      <View style={styles.statusRow}>
        <Ionicons name="notifications-off-outline" size={22} color={colors.warning} />
        <View style={styles.flex}>
          <Text style={styles.statusTitle}>{t('medicines.off.title')}</Text>
          <Text style={styles.bodyText}>
            {denied
              ? t('medicines.off.denied')
              : t('medicines.off.undetermined')}
          </Text>
        </View>
      </View>
      {denied ? (
        <Button title={t('medicines.openSettings')} icon="settings-outline" onPress={() => Linking.openSettings()} />
      ) : (
        <Button title={t('medicines.turnOn')} icon="notifications-outline" onPress={onTurnOn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  loading: { marginVertical: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
    ...softShadow,
  },
  list: { paddingVertical: 0, paddingHorizontal: spacing.sm + 4 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  highlight: { backgroundColor: colors.warningSoft, marginHorizontal: -(spacing.sm + 4), paddingHorizontal: spacing.sm + 4 },
  doseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  doseTime: { width: 72, fontSize: 15, fontWeight: '700', color: colors.text },
  doseName: { fontSize: 15, fontWeight: '600', color: colors.text },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  takenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  takenBtnOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  takenText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
  takenTextOn: { color: colors.primary },
  medTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  bodyText: { fontSize: 14, lineHeight: 20, color: colors.text },
  hint: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: spacing.sm + 4 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm + 4 },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  mutedLink: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  hintActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  editor: { marginTop: spacing.xs },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: { minWidth: 96, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  removeBtn: { marginLeft: 'auto', padding: spacing.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm + 4, paddingVertical: spacing.xs },
  editorActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  retry: { marginTop: spacing.md },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm + 6,
    marginTop: spacing.lg,
  },
  statusStack: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  statusOff: { backgroundColor: colors.slateSoft, borderColor: colors.border },
  statusWarn: { backgroundColor: colors.warningSoft, borderColor: '#F3DFAE' },
  statusTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  footnote: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: spacing.md },
});
