import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import {
  getPushPermission,
  getPushPrefs,
  PushCategory,
  PushPermission,
  PushPrefs,
  registerForPushNotifications,
  updatePushPrefs,
} from '@/lib/push';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';

const CATEGORIES: { key: PushCategory; icon: IconName; label: string; detail: string }[] = [
  {
    key: 'appointments',
    icon: 'calendar-outline',
    label: 'Appointments',
    detail: 'Confirmations, reminders and schedule changes',
  },
  {
    key: 'followUps',
    icon: 'repeat-outline',
    label: 'Follow-up Visits',
    detail: 'Reminders when a follow-up visit is coming up',
  },
  { key: 'labResults', icon: 'flask-outline', label: 'Lab Results', detail: 'When a new result is ready to view' },
  {
    key: 'prescriptions',
    icon: 'medkit-outline',
    label: 'Prescription Refills',
    detail: 'When a prescription is due for a refill',
  },
  { key: 'billing', icon: 'receipt-outline', label: 'Payments', detail: 'Reminders about unpaid balances' },
  { key: 'queue', icon: 'people-outline', label: 'Queue Updates', detail: "When you're next or it's your turn" },
  { key: 'messages', icon: 'chatbubble-ellipses-outline', label: 'Clinic Messages', detail: 'Messages and announcements from your clinic' },
];

/**
 * Push settings for this phone: the OS permission (ask, or send to Settings once refused) and
 * which kinds of updates to push. Muting a kind stops the push only; it still shows in Notifications.
 */
export default function NotificationSettingsScreen() {
  const bottomPad = useBottomPadding();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Partial<Record<PushCategory, boolean>>>({});
  const [asking, setAsking] = useState(false);

  const loadPrefs = useCallback(() => {
    setLoadError(null);
    getPushPrefs()
      .then(setPrefs)
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load your notification settings.")));
  }, []);

  // Re-read the permission on return from the phone's Settings app; register the token once it's on.
  const lastPermission = useRef<PushPermission | null>(null);
  const checkPermission = useCallback(async () => {
    const next = await getPushPermission().catch((): PushPermission => 'unavailable');
    const prev = lastPermission.current;
    lastPermission.current = next;
    if (prev && prev !== 'granted' && next === 'granted') registerForPushNotifications({ prompt: false }).catch(() => {});
    setPermission(next);
  }, []);

  useEffect(() => {
    checkPermission();
    loadPrefs();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission, loadPrefs]);

  async function turnOn() {
    setAsking(true);
    try {
      await registerForPushNotifications();
    } catch {
      // Permission is re-read below; a failed device registration is retried on next launch.
    } finally {
      await checkPermission();
      setAsking(false);
    }
  }

  async function toggle(key: PushCategory, value: boolean) {
    if (!prefs || saving[key]) return;
    setSaveError(null);
    setPrefs({ ...prefs, [key]: value });
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const saved = await updatePushPrefs({ [key]: value });
      setPrefs((p) => (p ? { ...p, [key]: saved[key] } : saved));
    } catch (err) {
      setPrefs((p) => (p ? { ...p, [key]: !value } : p));
      setSaveError(errorMessage(err, "Couldn't save that change. Please try again."));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  if (permission === null || (!prefs && !loadError)) return <LoadingView />;

  const pushOn = permission === 'granted';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView edges={['top']}>
        <AppHeader back />
        <Text style={styles.title} accessibilityRole="header">
          Notification Settings
        </Text>
        <Text style={styles.subtitle}>Choose which updates this phone alerts you about.</Text>
      </SafeAreaView>

      <PermissionCard permission={permission} asking={asking} onTurnOn={turnOn} />

      <Text style={styles.groupTitle} accessibilityRole="header">
        Notify me about
      </Text>
      {saveError ? <Banner message={saveError} /> : null}
      {loadError ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Button title="Try Again" variant="secondary" icon="refresh" onPress={loadPrefs} style={styles.retry} />
        </View>
      ) : prefs ? (
        <View style={[styles.card, styles.list, !pushOn && styles.dimmed]}>
          {CATEGORIES.map((c, i) => (
            <View key={c.key} style={[styles.row, i < CATEGORIES.length - 1 && styles.rowDivider]}>
              <View style={styles.rowIcon}>
                <Ionicons name={c.icon} size={22} color={colors.primaryOnSoft} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowLabel}>{c.label}</Text>
                <Text style={styles.rowDetail}>{c.detail}</Text>
              </View>
              {saving[c.key] ? <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} /> : null}
              <Switch
                value={prefs[c.key]}
                onValueChange={(v) => toggle(c.key, v)}
                disabled={!pushOn || !!saving[c.key]}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.border}
                accessibilityLabel={`${c.label}. ${c.detail}`}
              />
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.footnote}>
        These settings apply to this phone only. Everything still appears in your Notifications inbox, and your
        clinic may also text or email you.
      </Text>

      {pushOn ? (
        <TouchableOpacity style={styles.link} onPress={() => Linking.openSettings()} accessibilityRole="link">
          <Text style={styles.linkText}>Sounds and banners are set in your phone's settings</Text>
          <Ionicons name="open-outline" size={16} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function PermissionCard({
  permission,
  asking,
  onTurnOn,
}: {
  permission: PushPermission;
  asking: boolean;
  onTurnOn: () => void;
}) {
  if (permission === 'granted') {
    return (
      <View style={[styles.status, styles.statusOn]}>
        <View style={styles.statusIcon}>
          <Ionicons name="notifications" size={22} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.statusTitle}>Notifications are on</Text>
          <Text style={styles.statusText}>This phone can alert you about the updates below.</Text>
        </View>
      </View>
    );
  }

  if (permission === 'unavailable') {
    return (
      <View style={[styles.status, styles.statusOff]}>
        <View style={styles.statusIcon}>
          <Ionicons name="phone-portrait-outline" size={22} color={colors.slate} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.statusTitle}>Not available on this device</Text>
          <Text style={styles.statusText}>
            Alerts work in the eMCR app on a phone. You'll still find every update in Notifications.
          </Text>
        </View>
      </View>
    );
  }

  const denied = permission === 'denied';
  return (
    <View style={[styles.status, styles.statusWarn, styles.statusStack]}>
      <View style={styles.statusRow}>
        <View style={styles.statusIcon}>
          <Ionicons name="notifications-off-outline" size={22} color={colors.warning} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.statusTitle}>Notifications are off</Text>
          <Text style={styles.statusText}>
            {denied
              ? 'Turn on notifications for eMCR in your phone settings to get appointment reminders and results.'
              : "Turn them on so you don't miss appointment reminders, results and queue updates."}
          </Text>
        </View>
      </View>
      {denied ? (
        <Button title="Open Phone Settings" icon="settings-outline" onPress={() => Linking.openSettings()} />
      ) : (
        <Button title="Turn On Notifications" icon="notifications-outline" onPress={onTurnOn} loading={asking} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
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
  statusOn: { backgroundColor: '#DDF3F1', borderColor: '#C6EAE7' },
  statusOff: { backgroundColor: colors.slateSoft, borderColor: colors.border },
  statusWarn: { backgroundColor: colors.warningSoft, borderColor: '#F3DFAE' },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  statusText: { fontSize: 13, lineHeight: 19, color: colors.text, marginTop: 2 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    ...softShadow,
  },
  list: { paddingVertical: 0, paddingHorizontal: spacing.sm + 4 },
  dimmed: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 6, paddingVertical: spacing.sm + 4 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
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
  spinner: { marginRight: -spacing.xs },
  errorText: { fontSize: 14, color: colors.text },
  retry: { marginTop: spacing.md },
  footnote: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: spacing.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, paddingVertical: spacing.xs },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
