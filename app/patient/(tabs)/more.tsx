import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { useUnread } from '@/lib/unread';
import { ApiError, errorMessage } from '@/lib/api';
import { EMCR_ENDPOINTS } from '@/lib/emcr';
import { formatDate } from '@/lib/format';
import { EmcrAccount } from '@/lib/types';
import { useApiData } from '@/lib/useApiData';
import { canUseAppLock, getAppLockEnabled, setAppLock } from '@/lib/appLock';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { useTour } from '@/components/QuickTour';
import { LanguagePicker, useLanguageSummary } from '@/components/LanguagePicker';
import { t as translate, useT } from '@/lib/i18n';

type Tint = 'teal' | 'blue' | 'purple' | 'amber' | 'rose';

const TINTS: Record<Tint, { bg: string; fg: string }> = {
  teal: { bg: '#E3F6F5', fg: '#0A7F7E' },
  blue: { bg: '#E6EEFB', fg: '#2F5FB3' },
  purple: { bg: '#EEEAFB', fg: '#5B47B0' },
  amber: { bg: '#FDF1DC', fg: '#A15C00' },
  rose: { bg: '#FDE8E8', fg: '#B3261E' },
};

const PRIVACY_URL = 'https://www.myclinicsoft.solutions/privacy';
const TERMS_URL = 'https://www.myclinicsoft.solutions/terms';

function openWebPage(url: string) {
  Linking.openURL(url).catch(() =>
    Alert.alert(translate('more.couldntOpen'), translate('more.checkConnection'))
  );
}

export default function MoreScreen() {
  const { patient: me, signOut, guardianOnly } = useAuth();
  const t = useT();
  const languageSummary = useLanguageSummary();
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const account = useApiData<EmcrAccount>(EMCR_ENDPOINTS.account, { refreshOn: ['activation'] });
  const activation = account.data?.activation ?? null;
  const activationDetail = !activation
    ? t('more.activation.enter')
    : activation.active && activation.expiresAt
      ? t('more.activation.activeUntil', {
          date: formatDate(activation.expiresAt, { month: 'long', day: 'numeric', year: 'numeric' }),
        })
      : activation.expiresAt
        ? t('more.activation.ended')
        : t('more.activation.enter');
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
  const initials = patient ? `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() : '';

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

      {/* Profile card */}
      <TouchableOpacity
        style={styles.profile}
        onPress={() => router.push('/patient/profile')}
        accessibilityRole="button"
        accessibilityLabel={self ? t('more.profile.a11y', { name: fullName }) : t('more.profile.a11yMember', { name: fullName })}
      >
        <View style={styles.avatar}>
          {initials ? (
            <Text style={styles.avatarText}>{initials}</Text>
          ) : (
            <Ionicons name="person" size={26} color={colors.primary} />
          )}
        </View>
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
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
      </TouchableOpacity>

      <Group title={t('more.group.family')}>
        <Row
          icon="people-outline"
          tint="rose"
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

      <Group title={t('more.group.records')}>
        <Row
          icon="heart-outline"
          tint="rose"
          label={t('more.healthSummary.label')}
          detail={t('more.healthSummary.detail')}
          onPress={() => router.push('/patient/health-summary')}
        />
        <Row
          icon="medkit-outline"
          tint="teal"
          label={t('more.visits.label')}
          detail={t('more.visits.detail')}
          onPress={() => router.push('/patient/visits')}
        />
        <Row
          icon="pulse-outline"
          tint="blue"
          label={t('more.vitals.label')}
          detail={t('more.vitals.detail')}
          onPress={() => router.push('/patient/vitals')}
        />
        <Row
          icon="git-branch-outline"
          tint="amber"
          label={t('more.referrals.label')}
          detail={t('more.referrals.detail')}
          onPress={() => router.push('/patient/referrals')}
        />
        <Row
          icon="hourglass-outline"
          tint="blue"
          label={t('more.waitlist.label')}
          detail={t('more.waitlist.detail')}
          onPress={() => router.push('/patient/waitlist')}
        />
        <Row
          icon="share-social-outline"
          tint="purple"
          label={t('more.share.label')}
          detail={t('more.share.detail')}
          onPress={() => router.push('/patient/share')}
        />
        <Row
          icon="business-outline"
          tint="amber"
          label={t('more.clinics.label')}
          detail={t('more.clinics.detail')}
          onPress={() => router.push('/patient/clinics')}
        />
        <Row
          icon="bandage-outline"
          tint="teal"
          label={t('more.prescriptions.label')}
          detail={t('more.prescriptions.detail')}
          onPress={() => router.push('/patient/prescriptions')}
        />
        <Row
          icon="alarm-outline"
          tint="teal"
          label={t('more.medicines.label')}
          detail={t('more.medicines.detail')}
          onPress={() => router.push('/patient/medicines')}
        />
        <Row
          icon="document-text-outline"
          tint="purple"
          label={t('more.documents.label')}
          detail={t('more.documents.detail')}
          onPress={() => router.push('/patient/documents')}
          last
        />
      </Group>

      <Group title={t('more.group.billing')}>
        <Row
          icon="receipt-outline"
          tint="blue"
          label={t('more.invoices.label')}
          detail={t('more.invoices.detail')}
          onPress={() => router.push('/patient/invoices')}
        />
        <Row
          icon="card-outline"
          tint="amber"
          label={t('more.membership.label')}
          detail={t('more.membership.detail')}
          onPress={() => router.push('/patient/membership')}
          last
        />
      </Group>

      <Group title={t('more.group.account')}>
        <Row
          icon="key-outline"
          tint={activation && !activation.active && activation.enforced ? 'amber' : 'teal'}
          label={t('more.activation.label')}
          detail={activationDetail}
          onPress={() => router.push('/patient/activate')}
        />
        <Row
          icon="person-outline"
          tint="blue"
          label={t('more.profile.label')}
          detail={t('more.profile.detail')}
          onPress={() => router.push('/patient/profile')}
        />
        {self && !guardianOnly ? (
          <Row
            icon="lock-closed-outline"
            tint="purple"
            label={t('more.password.label')}
            detail={t('more.password.detail')}
            onPress={() => router.push('/patient/profile/password')}
          />
        ) : null}
        {appLock !== null ? (
          <Row
            icon="finger-print-outline"
            tint="rose"
            label={t('more.appLock.label')}
            detail={appLock ? t('more.appLock.on') : t('more.appLock.off')}
            onPress={toggleAppLock}
          />
        ) : null}
        <Row
          icon="language-outline"
          tint="blue"
          label={t('more.language.label')}
          detail={languageSummary}
          onPress={() => setPickingLanguage(true)}
        />
        <Row
          icon="mail-unread-outline"
          tint="teal"
          label={t('more.notifications.label')}
          detail={unreadCount ? t('more.notifications.unread', { count: unreadCount }) : t('more.notifications.detail')}
          badge={unreadCount}
          onPress={() => router.push('/patient/notifications')}
        />
        <Row
          icon="notifications-outline"
          tint="amber"
          label={t('more.notificationSettings.label')}
          detail={t('more.notificationSettings.detail')}
          onPress={() => router.push('/patient/notification-settings')}
          last
        />
      </Group>

      <Group title={t('more.group.help')}>
        <Row
          icon="compass-outline"
          tint="teal"
          label={t('more.tour.label')}
          detail={t('more.tour.detail')}
          onPress={replayTour}
          last
        />
      </Group>

      <Group title={t('more.group.legal')}>
        <Row
          icon="shield-checkmark-outline"
          tint="purple"
          label={t('more.privacy.label')}
          detail={t('more.privacy.detail')}
          external
          onPress={() => openWebPage(PRIVACY_URL)}
        />
        <Row
          icon="information-circle-outline"
          tint="teal"
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
        <View style={[styles.rowIcon, { backgroundColor: TINTS.rose.bg }]}>
          <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        </View>
        <Text style={styles.signOutText}>{t('more.signOut.button')}</Text>
        {signingOut ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="chevron-forward" size={20} color={colors.danger} />}
      </TouchableOpacity>

      <Text style={styles.version}>eMCR {Constants.expoConfig?.version ?? ''}</Text>
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
  tint,
  label,
  detail,
  onPress,
  badge,
  external,
  last,
}: {
  icon: IconName;
  tint: Tint;
  label: string;
  detail: string;
  onPress: () => void;
  badge?: number;
  external?: boolean;
  last?: boolean;
}) {
  const t = TINTS[tint];
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivider]}
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={`${label}. ${detail}`}
    >
      <View style={[styles.rowIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={22} color={t.fg} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#DDF3F1',
    borderWidth: 1,
    borderColor: '#C6EAE7',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  profileName: { fontSize: 18, fontWeight: '700', color: colors.text },
  profileMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  group: { marginTop: spacing.lg },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    paddingHorizontal: spacing.sm + 4,
    ...softShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 6, paddingVertical: spacing.sm + 4 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: '#E5484D',
    borderRadius: 999,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 6,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F6CACA',
    borderRadius: radius.lg,
    padding: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  signOutText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.danger },
  version: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
