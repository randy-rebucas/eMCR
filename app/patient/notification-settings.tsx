import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest, errorMessage } from '@/lib/api';
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
import { AppHeader } from '@/components/AppHeader';
import { PlainKey, t as translate, useT } from '@/lib/i18n';

const SMS_ENDPOINT = '/api/patients/me/sms-preference';
type SmsPreference = { hasPhone: boolean; textsEnabled: boolean };

// Labels and details are string keys, translated where they are shown.
const CATEGORIES: { key: PushCategory; icon: IconName; label: PlainKey; detail: PlainKey }[] = [
  {
    key: 'appointments',
    icon: 'calendar-outline',
    label: 'patient.notifSettings.appointments',
    detail: 'patient.notifSettings.appointmentsDetail',
  },
  {
    key: 'followUps',
    icon: 'repeat-outline',
    label: 'patient.notifSettings.followUps',
    detail: 'patient.notifSettings.followUpsDetail',
  },
  {
    key: 'labResults',
    icon: 'flask-outline',
    label: 'patient.notifSettings.labResults',
    detail: 'patient.notifSettings.labResultsDetail',
  },
  {
    key: 'prescriptions',
    icon: 'medkit-outline',
    label: 'patient.notifSettings.prescriptions',
    detail: 'patient.notifSettings.prescriptionsDetail',
  },
  {
    key: 'billing',
    icon: 'receipt-outline',
    label: 'patient.notifSettings.billing',
    detail: 'patient.notifSettings.billingDetail',
  },
  {
    key: 'queue',
    icon: 'people-outline',
    label: 'patient.notifSettings.queue',
    detail: 'patient.notifSettings.queueDetail',
  },
  {
    key: 'messages',
    icon: 'chatbubble-ellipses-outline',
    label: 'patient.notifSettings.messages',
    detail: 'patient.notifSettings.messagesDetail',
  },
];

/**
 * Push settings for this phone: the OS permission (ask, or send to Settings once refused) and
 * which kinds of updates to push. Muting a kind stops the push only; it still shows in Notifications.
 */
export default function NotificationSettingsScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Partial<Record<PushCategory, boolean>>>({});
  const [asking, setAsking] = useState(false);
  const [sms, setSms] = useState<SmsPreference | null>(null);
  const [savingSms, setSavingSms] = useState(false);

  const loadPrefs = useCallback(() => {
    setLoadError(null);
    getPushPrefs()
      .then(setPrefs)
      .catch((err) => setLoadError(errorMessage(err, translate('patient.notifSettings.loadFailed'))));
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
    // Older servers don't have this; the switch just stays hidden.
    apiRequest<SmsPreference>(SMS_ENDPOINT, { profile: false }).then(setSms).catch(() => {});
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
      setSaveError(errorMessage(err, t('patient.notifSettings.saveFailed')));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function toggleTexts(value: boolean) {
    if (!sms || savingSms) return;
    setSaveError(null);
    setSms({ ...sms, textsEnabled: value });
    setSavingSms(true);
    try {
      await apiRequest(SMS_ENDPOINT, { method: 'PUT', body: { textsEnabled: value }, profile: false });
    } catch (err) {
      setSms((s) => (s ? { ...s, textsEnabled: !value } : s));
      setSaveError(errorMessage(err, t('patient.notifSettings.saveFailed')));
    } finally {
      setSavingSms(false);
    }
  }

  // Without push on this phone there are no device prefs to wait for.
  if (permission === null || (permission !== 'unavailable' && !prefs && !loadError)) return <LoadingView />;

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
          {t('patient.notifSettings.title')}
        </Text>
        <Text style={styles.subtitle}>{t('patient.notifSettings.subtitle')}</Text>
      </SafeAreaView>

      <PermissionCard permission={permission} asking={asking} onTurnOn={turnOn} />

      {permission !== 'unavailable' ? (
      <>
      <Text style={styles.groupTitle} accessibilityRole="header">
        {t('patient.notifSettings.notifyMe')}
      </Text>
      {/* The switches can't do anything while the phone blocks alerts: say why they're greyed. */}
      {prefs && !pushOn ? <Text style={styles.offNote}>{t('notifications.settings.offNote')}</Text> : null}
      {saveError ? (
        <View style={styles.errorSpacing}>
          <Banner message={saveError} />
        </View>
      ) : null}
      {loadError ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Button title={t('common.tryAgainTitle')} variant="secondary" icon="refresh" onPress={loadPrefs} style={styles.retry} />
        </View>
      ) : prefs ? (
        <View style={[styles.card, styles.list, !pushOn && styles.dimmed]}>
          {CATEGORIES.map((c, i) => (
            <View key={c.key} style={[styles.row, i < CATEGORIES.length - 1 && styles.rowDivider]}>
              <View style={styles.rowIcon}>
                <Ionicons name={c.icon} size={22} color={colors.primaryOnSoft} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowLabel}>{t(c.label)}</Text>
                <Text style={styles.rowDetail}>{t(c.detail)}</Text>
              </View>
              {saving[c.key] ? <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} /> : null}
              <Switch
                value={prefs[c.key]}
                onValueChange={(v) => toggle(c.key, v)}
                disabled={!pushOn || !!saving[c.key]}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.border}
                accessibilityLabel={t('patient.notifSettings.switchA11y', { label: t(c.label), detail: t(c.detail) })}
              />
            </View>
          ))}
        </View>
      ) : null}
      </>
      ) : null}

      {sms?.hasPhone ? (
        <>
          <Text style={styles.groupTitle} accessibilityRole="header">
            {t('patient.notifSettings.textsTitle')}
          </Text>
          <View style={[styles.card, styles.list]}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="chatbox-ellipses-outline" size={22} color={colors.primaryOnSoft} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowLabel}>{t('patient.notifSettings.textsLabel')}</Text>
                <Text style={styles.rowDetail}>{t('patient.notifSettings.textsDetail')}</Text>
              </View>
              {savingSms ? <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} /> : null}
              <Switch
                value={sms.textsEnabled}
                onValueChange={toggleTexts}
                disabled={savingSms}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.border}
                accessibilityLabel={t('patient.notifSettings.switchA11y', {
                  label: t('patient.notifSettings.textsLabel'),
                  detail: t('patient.notifSettings.textsDetail'),
                })}
              />
            </View>
          </View>
        </>
      ) : null}

      <Text style={styles.footnote}>
        {t('patient.notifSettings.footnote')}
      </Text>

      {pushOn ? (
        <TouchableOpacity style={styles.link} onPress={() => Linking.openSettings().catch(() => {})} accessibilityRole="link">
          <Text style={styles.linkText}>{t('patient.notifSettings.soundsLink')}</Text>
          <Ionicons name="open-outline" size={16} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

/**
 * Will alerts reach this phone? Solid navy, one answer, and the one fix inline: allow, or open the
 * phone's settings once it was refused.
 */
function PermissionCard({
  permission,
  asking,
  onTurnOn,
}: {
  permission: PushPermission;
  asking: boolean;
  onTurnOn: () => void;
}) {
  const t = useT();
  const on = permission === 'granted';
  const unavailable = permission === 'unavailable';
  const denied = permission === 'denied';
  const title = on
    ? t('patient.notifSettings.onTitle')
    : unavailable
      ? t('patient.notifSettings.unavailableTitle')
      : t('patient.notifSettings.offTitle');
  const body = on
    ? t('patient.notifSettings.onBody')
    : unavailable
      ? t('patient.notifSettings.unavailableBody')
      : denied
        ? t('patient.notifSettings.offDenied')
        : t('patient.notifSettings.offAsk');
  return (
    <View style={styles.hero} accessibilityLiveRegion="polite">
      <View style={styles.heroTop}>
        <Text style={styles.heroEyebrow}>{t('notifications.settings.eyebrow')}</Text>
        <View style={[styles.heroChip, !on && !unavailable && styles.heroChipWarn]}>
          <Ionicons
            name={on ? 'checkmark-circle' : unavailable ? 'phone-portrait-outline' : 'notifications-off-outline'}
            size={14}
            color={on ? colors.accent : unavailable ? colors.onNavyMuted : colors.warning}
          />
          <Text style={[styles.heroChipText, !on && !unavailable && styles.heroChipTextWarn]}>
            {on ? t('notifications.settings.chipOn') : unavailable ? t('notifications.settings.chipUnavailable') : t('notifications.settings.chipOff')}
          </Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroBody}>{body}</Text>
      {!on && !unavailable ? (
        denied ? (
          <Button
            title={t('patient.notifSettings.openSettings')}
            icon="settings-outline"
            onPress={() => Linking.openSettings().catch(() => {})}
            style={styles.heroButton}
          />
        ) : (
          <Button title={t('patient.notifSettings.turnOn')} icon="notifications-outline" onPress={onTurnOn} loading={asking} style={styles.heroButton} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginTop: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.navyLine,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  heroChipWarn: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  heroChipText: { fontSize: 12, fontWeight: '600', color: colors.primaryText },
  heroChipTextWarn: { color: colors.warning },
  heroTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryText, marginTop: spacing.sm + 4 },
  heroBody: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted, marginTop: spacing.xs },
  heroButton: { marginTop: spacing.md },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, minHeight: 44 },
  offNote: { fontSize: 13, lineHeight: 18, color: colors.warning, fontWeight: '600', marginBottom: spacing.sm },
  errorSpacing: { marginBottom: spacing.sm },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
