import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { useUnread } from '@/lib/unread';
import { ApiError, errorMessage } from '@/lib/api';
import { EMCR_ENDPOINTS } from '@/lib/emcr';
import { formatDate } from '@/lib/format';
import { EmcrAccount } from '@/lib/types';
import { useApiData } from '@/lib/useApiData';
import { canUseAppLock, getAppLockEnabled, setAppLock } from '@/lib/appLock';
import { openWebPage, PRIVACY_URL, TERMS_URL, versionLabel } from '@/lib/support';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { useTour } from '@/components/QuickTour';
import { LanguagePicker, useLanguageSummary } from '@/components/LanguagePicker';
import { useT } from '@/lib/i18n';

/**
 * Icon tiles carry meaning, not decoration: teal for everything ordinary, amber when something
 * needs the patient (eMCR not activated), red only for destructive actions (delete, sign out).
 */
type Tone = 'default' | 'attention' | 'danger';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  default: { bg: colors.primarySoft, fg: colors.primaryOnSoft },
  attention: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export default function MoreScreen() {
  const { patient: me, signOut, guardianOnly } = useAuth();
  const t = useT();
  const languageSummary = useLanguageSummary();
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const account = useApiData<EmcrAccount>(EMCR_ENDPOINTS.account, { refreshOn: ['activation'] });
  const activation = account.data?.activation ?? null;
  // Only say "enter a code" when the server said eMCR isn't active: a failed check must not send an
  // activated patient off to buy another voucher.
  const activationUnknown = !activation && !!account.error && !account.loading;
  const activationDetail = !activation
    ? account.loading
      ? t('more.activation.checking')
      : account.error
        ? t('more.activation.couldntCheck')
        : t('more.activation.view')
    : activation.active
      ? activation.expiresAt
        ? t('more.activation.activeUntil', {
            date: formatDate(activation.expiresAt, { month: 'long', day: 'numeric', year: 'numeric' }),
          })
        : t('more.activation.active')
      : activation.expiresAt
        ? t('more.activation.ended')
        : t('more.activation.enter');
  const needsActivation = !!activation && !activation.active && activation.enforced;
  const { viewing, family } = useProfile();
  const self = viewing?.self !== false;
  // The profile card shows whoever's records are on screen.
  const patient = self ? me : viewing ? { ...viewing, patientCode: null, email: null } : null;
  const familyCount = family?.members.length ?? 0;
  const { unreadCount } = useUnread();
  const { replay: replayTour } = useTour();
  const [signingOut, setSigningOut] = useState(false);
  // null while loading, or when the phone has no screen lock App Lock could use.
  const [appLock, setAppLockState] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      if (await canUseAppLock()) setAppLockState(await getAppLockEnabled());
    })();
  }, []);

  async function toggleAppLock() {
    const next = !appLock;
    const result = await setAppLock(next);
    if (result.ok) setAppLockState(next);
    else if (result.message) Alert.alert(t('more.appLock.failedTitle'), result.message);
  }

  const fullName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : t('more.yourProfile');

  async function runSignOut(everywhere: boolean) {
    setSigningOut(true);
    try {
      // On success the auth state flips to signed-out and the layout guard redirects.
      await signOut({ everywhere });
    } catch (err) {
      setSigningOut(false);
      // signOut always clears this device's session. When other devices couldn't be
      // signed out it sets the auth notice (shown on the sign-in screen this one is
      // about to be replaced by), so only unexpected errors need an alert here.
      if (!(err instanceof ApiError && err.code === 'SIGN_OUT_EVERYWHERE_FAILED')) {
        Alert.alert(t('more.signOut.failed'), errorMessage(err, t('more.signOut.failedFallback')));
      }
    }
  }

  function confirmSignOut() {
    // A guardian-only session is signed in on someone else's record: "all devices" would sign
    // that person out everywhere too, so only this device is offered.
    if (guardianOnly) {
      Alert.alert(t('more.signOut.title'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.signOut'), style: 'destructive', onPress: () => runSignOut(false) },
      ]);
      return;
    }
    Alert.alert(t('more.signOut.title'), t('more.signOut.everywhereHint'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut.allDevices'), style: 'destructive', onPress: () => runSignOut(true) },
      { text: t('common.signOut'), style: 'destructive', onPress: () => runSignOut(false) },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SafeAreaView edges={['top']}>
        <AppHeader />
        <Text style={styles.title} accessibilityRole="header">
          {t('more.title')}
        </Text>
        <Text style={styles.subtitle}>{t('more.subtitle')}</Text>
      </SafeAreaView>

      {/* Whose records these are, and whether eMCR is active: solid navy, no shadow. */}
      <TouchableOpacity
        style={styles.profile}
        onPress={() => router.push('/patient/profile')}
        accessibilityRole="button"
        accessibilityLabel={self ? t('more.profile.a11y', { name: fullName }) : t('more.profile.a11yMember', { name: fullName })}
      >
        <View style={styles.profileTop}>
          <Avatar image={patient?.profileImage} firstName={patient?.firstName} lastName={patient?.lastName} size={64} />
          <View style={styles.flex}>
            <Text style={styles.profileName} numberOfLines={1}>
              {fullName}
            </Text>
            {!self ? <Text style={styles.profileMeta}>{t('more.profile.member')}</Text> : null}
            {patient?.patientCode ? <Text style={styles.profileMeta}>{t('more.profile.patientId', { id: patient.patientCode })}</Text> : null}
            {self && account.data?.loginId ? (
              <Text style={styles.profileMeta} numberOfLines={1} selectable>
                {t('more.profile.loginId', { id: account.data.loginId })}
              </Text>
            ) : null}
            {patient?.email ? (
              <Text style={styles.profileMeta} numberOfLines={1}>
                {patient.email}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.profileFoot}>
          {activation ? (
            <View style={[styles.chip, needsActivation && styles.chipAttention]}>
              <Ionicons
                name={activation.active ? 'checkmark-circle' : needsActivation ? 'key-outline' : 'information-circle-outline'}
                size={14}
                color={activation.active ? colors.accent : needsActivation ? colors.warning : colors.onNavyMuted}
              />
              <Text style={[styles.chipText, needsActivation && styles.chipTextAttention]} numberOfLines={1}>
                {activation.active && activation.expiresAt
                  ? t('more.activation.activeUntil', {
                      date: formatDate(activation.expiresAt, { month: 'short', day: 'numeric', year: 'numeric' }),
                    })
                  : t('more.hero.notActive')}
              </Text>
            </View>
          ) : (
            <View style={styles.flex} />
          )}
          <View style={styles.viewLink}>
            <Text style={styles.viewLinkText}>{t('more.hero.view')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
          </View>
        </View>
      </TouchableOpacity>

      <Group title={t('more.group.family')}>
        <Row
          icon="people-outline"
          label={self ? t('more.family.label') : t('more.family.switch')}
          detail={
            guardianOnly
              ? t('more.family.guardian', { name: viewing?.firstName ?? '' })
              : !self
                ? t('more.family.viewing', { name: viewing?.firstName ?? '' })
                : familyCount
                  ? t('more.family.count', { count: familyCount })
                  : t('more.family.none')
          }
          badge={self ? family?.suggestions.length || undefined : undefined}
          onPress={() => router.push('/patient/family')}
          last
        />
      </Group>

      <Group title={t('more.group.health')}>
        <Row
          icon="heart-outline"
          label={t('more.healthSummary.label')}
          detail={t('more.healthSummary.detail')}
          onPress={() => router.push('/patient/health-summary')}
        />
        <Row icon="medkit-outline" label={t('more.visits.label')} detail={t('more.visits.detail')} onPress={() => router.push('/patient/visits')} />
        <Row icon="pulse-outline" label={t('more.vitals.label')} detail={t('more.vitals.detail')} onPress={() => router.push('/patient/vitals')} />
        <Row
          icon="document-text-outline"
          label={t('more.prescriptions.label')}
          detail={t('more.prescriptions.detail')}
          onPress={() => router.push('/patient/prescriptions')}
        />
        <Row
          icon="alarm-outline"
          label={t('more.medicines.label')}
          detail={t('more.medicines.detail')}
          onPress={() => router.push('/patient/medicines')}
          last
        />
      </Group>

      <Group title={t('more.group.records')}>
        <Row
          icon="folder-open-outline"
          label={t('more.documents.label')}
          detail={t('more.documents.detail')}
          onPress={() => router.push('/patient/documents')}
        />
        <Row
          icon="arrow-redo-outline"
          label={t('more.referrals.label')}
          detail={t('more.referrals.detail')}
          onPress={() => router.push('/patient/referrals')}
        />
        <Row
          icon="hourglass-outline"
          label={t('more.waitlist.label')}
          detail={t('more.waitlist.detail')}
          onPress={() => router.push('/patient/waitlist')}
        />
        <Row
          icon="share-social-outline"
          label={t('more.share.label')}
          detail={t('more.share.detail')}
          onPress={() => router.push('/patient/share')}
        />
        <Row
          icon="business-outline"
          label={t('more.clinics.label')}
          detail={t('more.clinics.detail')}
          onPress={() => router.push('/patient/clinics')}
          last
        />
      </Group>

      <Group title={t('more.group.billing')}>
        <Row
          icon="receipt-outline"
          label={t('more.invoices.label')}
          detail={t('more.invoices.detail')}
          onPress={() => router.push('/patient/invoices')}
        />
        <Row
          icon="card-outline"
          label={t('more.membership.label')}
          detail={t('more.membership.detail')}
          onPress={() => router.push('/patient/membership')}
          last
        />
      </Group>

      <Group title={t('more.group.account')}>
        <Row
          icon="key-outline"
          tone={needsActivation ? 'attention' : 'default'}
          label={t('more.activation.label')}
          detail={activationDetail}
          onPress={activationUnknown ? account.refresh : () => router.push('/patient/activate')}
          retry={activationUnknown}
        />
        {self && !guardianOnly ? (
          <Row
            icon="lock-closed-outline"
            label={t('more.password.label')}
            detail={t('more.password.detail')}
            onPress={() => router.push('/patient/profile/password')}
          />
        ) : null}
        {appLock !== null ? (
          <Row
            icon="finger-print-outline"
            label={t('more.appLock.label')}
            detail={appLock ? t('more.appLock.on') : t('more.appLock.off')}
            onPress={toggleAppLock}
            switchValue={appLock}
          />
        ) : null}
        <Row
          icon="language-outline"
          label={t('more.language.label')}
          detail={languageSummary}
          onPress={() => setPickingLanguage(true)}
        />
        <Row
          icon="mail-unread-outline"
          label={t('more.notifications.label')}
          detail={unreadCount ? t('more.notifications.unread', { count: unreadCount }) : t('more.notifications.detail')}
          badge={unreadCount}
          onPress={() => router.push('/patient/notifications')}
        />
        <Row
          icon="notifications-outline"
          label={t('more.notificationSettings.label')}
          detail={t('more.notificationSettings.detail')}
          onPress={() => router.push('/patient/notification-settings')}
        />
        <Row
          icon="trash-outline"
          tone="danger"
          label={t('more.deleteAccount.label')}
          detail={t('more.deleteAccount.detail')}
          onPress={() => router.push('/patient/delete-account')}
          last
        />
      </Group>

      <Group title={t('more.group.help')}>
        <Row
          icon="compass-outline"
          label={t('more.tour.label')}
          detail={t('more.tour.detail')}
          onPress={replayTour}
        />
        <Row
          icon="chatbubble-ellipses-outline"
          label={t('more.support.label')}
          detail={t('more.support.detail')}
          onPress={() => router.push('/patient/support')}
        />
        <Row
          icon="information-circle-outline"
          label={t('more.about.label')}
          detail={t('more.about.detail', { version: versionLabel() })}
          onPress={() => router.push('/patient/about')}
          last
        />
      </Group>

      <Group title={t('more.group.legal')}>
        <Row
          icon="shield-checkmark-outline"
          label={t('more.privacy.label')}
          detail={t('more.privacy.detail')}
          external
          onPress={() => openWebPage(PRIVACY_URL)}
        />
        <Row
          icon="reader-outline"
          label={t('more.terms.label')}
          detail={t('more.terms.detail')}
          external
          onPress={() => openWebPage(TERMS_URL)}
          last
        />
      </Group>

      <TouchableOpacity
        style={styles.signOut}
        onPress={confirmSignOut}
        disabled={signingOut}
        accessibilityRole="button"
        accessibilityState={{ busy: signingOut }}
      >
        <View style={[styles.rowIcon, { backgroundColor: TONES.danger.bg }]}>
          <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        </View>
        <Text style={styles.signOutText}>{t('more.signOut.button')}</Text>
        {signingOut ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="chevron-forward" size={20} color={colors.danger} />}
      </TouchableOpacity>

      <Text style={styles.version} selectable>
        eMCR {versionLabel()}
      </Text>
      <LanguagePicker visible={pickingLanguage} onClose={() => setPickingLanguage(false)} />
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  tone = 'default',
  label,
  detail,
  onPress,
  badge,
  external,
  retry,
  switchValue,
  last,
}: {
  icon: IconName;
  tone?: Tone;
  label: string;
  detail: string;
  onPress: () => void;
  badge?: number;
  external?: boolean;
  /** The detail is a failed check: tapping retries it. */
  retry?: boolean;
  /** An on/off setting (App Lock): read out as a switch with its state. */
  switchValue?: boolean | null;
  last?: boolean;
}) {
  const t = TONES[tone];
  const isSwitch = switchValue !== undefined && switchValue !== null;
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivider]}
      onPress={onPress}
      accessibilityRole={isSwitch ? 'switch' : external ? 'link' : 'button'}
      accessibilityState={isSwitch ? { checked: switchValue } : undefined}
      accessibilityLabel={`${label}. ${detail}`}
    >
      <View style={[styles.rowIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={22} color={t.fg} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, tone === 'danger' && styles.rowLabelDanger]}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      <Ionicons name={retry ? 'refresh' : external ? 'open-outline' : 'chevron-forward'} size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  profile: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginTop: spacing.lg },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileName: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  profileMeta: { fontSize: 13, color: colors.onNavyMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  profileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.navyLine,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  chipAttention: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  chipText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: colors.primaryText },
  chipTextAttention: { color: colors.warning },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto', minHeight: 44 },
  viewLinkText: { fontSize: 14, fontWeight: '600', color: colors.primaryText },
  group: { marginTop: spacing.lg },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 4,
    ...softShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 6, paddingVertical: spacing.sm + 4 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowLabelDanger: { color: colors.danger },
  rowDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  // Unread count on teal, as on the header bell: "something here for you", not an error.
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeText: { color: colors.primaryText, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  signOutText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.danger },
  version: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
