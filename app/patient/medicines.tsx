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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { possessive, useProfile } from '@/lib/profile';
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
  loadSchedule,
  MEDICINE_PRESCRIPTIONS_PATH,
  ProfileSchedule,
  ReminderPermission,
  getReminderPermission,
  requestReminderPermission,
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

const MAX_TIMES = 6;
const STEP_MIN = 30;

const STATUS: Record<DoseStatus, { label: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  taken: { label: 'Taken', fg: colors.primaryOnSoft, bg: colors.primarySoft, icon: 'checkmark-circle' },
  due: { label: 'Due now', fg: colors.warning, bg: colors.warningSoft, icon: 'alarm-outline' },
  missed: { label: 'Missed', fg: colors.danger, bg: colors.dangerSoft, icon: 'close-circle-outline' },
  upcoming: { label: 'Later', fg: colors.slate, bg: colors.slateSoft, icon: 'time-outline' },
};

/**
 * Medicine reminders for the person being viewed: pick which medicines on current prescriptions
 * to be reminded about and at what times, then mark today's doses taken. Everything stays on
 * this phone. Opened from a reminder with `?slot=HH:mm` to show what's due.
 */
export default function MedicinesScreen() {
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
  const medicines = useMemo(() => activeMedicines(data ?? []), [data]);

  const [schedule, setSchedule] = useState<ProfileSchedule | null>(null);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

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
  const checkPermission = useCallback(async () => {
    const next = await getReminderPermission().catch((): ReminderPermission => 'unavailable');
    const prev = lastPermission.current;
    lastPermission.current = next;
    // Turned on in the phone's Settings app: schedule what was saved meanwhile.
    if (prev && prev !== 'granted' && next === 'granted') rescheduleAll().catch(() => {});
    setPermission(next);
  }, []);

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
    if (!owner || !profile) return;
    setBusy(medicine.key);
    setSaveError(null);
    try {
      if (times.length) setPermission(await requestReminderPermission());
      setSchedule(await setMedicineReminder(owner, profile, medicine, times));
      setEditing(({ [medicine.key]: _, ...rest }) => rest);
    } catch {
      setSaveError("Couldn't save your reminders. Please try again.");
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
    if (!owner || !profile) return;
    try {
      setSchedule(await setDoseTaken(owner, profile.id, key, time, taken));
    } catch {
      setSaveError("Couldn't save that. Please try again.");
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
  const whose = possessive(viewing);

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
          Medicine Reminders
        </Text>
        <Text style={styles.subtitle}>
          {whose} medicines from current prescriptions. Reminders are kept on this phone only.
        </Text>
      </SafeAreaView>

      {hasReminders && permission && permission !== 'granted' ? (
        <PermissionCard permission={permission} onTurnOn={turnOn} />
      ) : null}
      {saveError ? <Banner message={saveError} /> : null}
      {error && data ? <Banner message={error} /> : null}

      {doses.length ? (
        <>
          <Text style={styles.groupTitle} accessibilityRole="header">
            Today
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
                      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
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
                          ? `Undo taken for ${d.medicine.med.name} at ${formatSlot(d.time)}`
                          : `Mark ${d.medicine.med.name} at ${formatSlot(d.time)} as taken`
                      }
                    >
                      <Ionicons
                        name={d.status === 'taken' ? 'arrow-undo-outline' : 'checkmark'}
                        size={16}
                        color={d.status === 'taken' ? colors.primary : colors.primaryText}
                      />
                      <Text style={[styles.takenText, d.status === 'taken' && styles.takenTextOn]}>
                        {d.status === 'taken' ? 'Undo' : 'Taken'}
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
        Medicines
      </Text>
      {loading && !data ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : error && !data ? (
        <View style={styles.card}>
          <Text style={styles.bodyText}>{error}</Text>
          <Button title="Try Again" variant="secondary" icon="refresh" onPress={refresh} style={styles.retry} />
        </View>
      ) : !medicines.length ? (
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="medical-outline" size={32} color={colors.primary} />
          <Text style={styles.emptyTitle}>No current medicines</Text>
          <Text style={styles.rowDetail}>Medicines on your current prescriptions will show up here.</Text>
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

      <Text style={styles.footnote}>
        Reminders don't show medicine names on your lock screen. They stop when a course ends or a prescription is
        no longer active. Always follow your doctor's instructions.
      </Text>
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
  const { med } = medicine;
  const title = [med.name, med.strength].filter(Boolean).join(' ');
  const dosage = [med.dose, frequencyLabel(med.frequency)].filter(Boolean).join(' · ');
  const left = daysLeft(medicine.end);
  const ends =
    medicine.end === null
      ? null
      : left !== null && left <= 1
        ? 'Last day today'
        : `Until ${formatDate(new Date(medicine.end - 1), { month: 'short', day: 'numeric' })}`;
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
          accessibilityLabel={`Reminders for ${title}`}
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
            <Text style={styles.linkText}>Change times</Text>
          </TouchableOpacity>
        </View>
      ) : suggestion.kind === 'prn' ? (
        <Text style={styles.hint}>Taken as needed, so no reminder is set.</Text>
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
  const shift = (i: number, by: number) =>
    onChange(sortTimes(times.map((t, j) => (j === i ? fromMinutes(toMinutes(t) + by) : t))));
  const remove = (i: number) => onChange(times.filter((_, j) => j !== i));
  const add = () => {
    const last = times.length ? toMinutes(times[times.length - 1]) + 4 * 60 : 8 * 60;
    onChange(sortTimes([...times, fromMinutes(last)]));
  };

  let note: string;
  if (suggestion.kind === 'times') {
    note = `Suggested for ${suggestion.basis}. Check these match your doctor's instructions, then save.`;
  } else if (suggestion.kind === 'prn') {
    note = 'This medicine is taken as needed. Add a time only if your doctor gave you a set schedule.';
  } else {
    note = frequency?.trim()
      ? `We couldn't tell the times from "${frequency.trim()}". Add the times your doctor told you.`
      : 'Add the times your doctor told you to take it.';
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
            accessibilityLabel={`Earlier than ${formatSlot(t)}`}
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
            accessibilityLabel={`Later than ${formatSlot(t)}`}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => remove(i)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${formatSlot(t)}`}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ))}
      {times.length < MAX_TIMES ? (
        <TouchableOpacity style={styles.addBtn} onPress={add} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.linkText}>Add a time</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.editorActions}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={busy} style={styles.flex} />
        <Button
          title="Save Reminders"
          onPress={onSave}
          loading={busy}
          disabled={!times.length}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

function PermissionCard({ permission, onTurnOn }: { permission: ReminderPermission; onTurnOn: () => void }) {
  if (permission === 'unavailable') {
    return (
      <View style={[styles.status, styles.statusOff]}>
        <Ionicons name="phone-portrait-outline" size={22} color={colors.slate} />
        <Text style={[styles.bodyText, styles.flex]}>
          Reminders can't alert you on this device. You can still check and mark today's doses here.
        </Text>
      </View>
    );
  }
  const denied = permission === 'denied';
  return (
    <View style={[styles.status, styles.statusWarn, styles.statusStack]}>
      <View style={styles.statusRow}>
        <Ionicons name="notifications-off-outline" size={22} color={colors.warning} />
        <View style={styles.flex}>
          <Text style={styles.statusTitle}>Notifications are off</Text>
          <Text style={styles.bodyText}>
            {denied
              ? 'Your reminders are saved, but this phone won’t alert you. Turn on notifications for eMCR in your phone settings.'
              : 'Turn on notifications so this phone can alert you when it’s time for your medicine.'}
          </Text>
        </View>
      </View>
      {denied ? (
        <Button title="Open Phone Settings" icon="settings-outline" onPress={() => Linking.openSettings()} />
      ) : (
        <Button title="Turn On Notifications" icon="notifications-outline" onPress={onTurnOn} />
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
