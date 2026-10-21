import { ReactNode, useState } from 'react';
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
import { colors, radius, spacing } from '@/lib/theme';
import { IconName } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { useTour } from '@/components/QuickTour';

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
    Alert.alert("Couldn't open the page", 'Please check your connection and try again.')
  );
}

export default function MoreScreen() {
  const { patient: me, signOut, guardianOnly } = useAuth();
  const account = useApiData<EmcrAccount>(EMCR_ENDPOINTS.account, { refreshOn: ['activation'] });
  const activation = account.data?.activation ?? null;
  const activationDetail = !activation
    ? 'Enter your activation code'
    : activation.active && activation.expiresAt
      ? `eMCR active until ${formatDate(activation.expiresAt, { month: 'long', day: 'numeric', year: 'numeric' })}`
      : activation.expiresAt
        ? 'Ended. Enter a new activation code'
        : 'Enter your activation code';
  const { viewing, family } = useProfile();
  const self = viewing?.self !== false;
  // The profile card shows whoever's records are on screen.
  const patient = self ? me : viewing ? { ...viewing, patientCode: null, email: null } : null;
  const familyCount = family?.members.length ?? 0;
  const { unreadCount } = useUnread();
  const { replay: replayTour } = useTour();
  const [signingOut, setSigningOut] = useState(false);

  const fullName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : 'Your profile';
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
        Alert.alert("Couldn't sign out", errorMessage(err, 'Check your connection and try again.'));
      }
    }
  }

  function confirmSignOut() {
    // A guardian-only session is signed in on someone else's record: "all devices" would sign
    // that person out everywhere too, so only this device is offered.
    if (guardianOnly) {
      Alert.alert('Sign out?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => runSignOut(false) },
      ]);
      return;
    }
    Alert.alert('Sign out?', 'Choose "All devices" if you lost a phone or think someone else has access.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'All devices', style: 'destructive', onPress: () => runSignOut(true) },
      { text: 'Sign out', style: 'destructive', onPress: () => runSignOut(false) },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SafeAreaView edges={['top']}>
        <AppHeader />
        <Text style={styles.title} accessibilityRole="header">
          More
        </Text>
        <Text style={styles.subtitle}>Access more features and manage your account.</Text>
      </SafeAreaView>

      {/* Profile card */}
      <TouchableOpacity
        style={styles.profile}
        onPress={() => router.push('/patient/profile')}
        accessibilityRole="button"
        accessibilityLabel={self ? `${fullName}, view profile` : `${fullName}, family member, view profile`}
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
          {!self ? <Text style={styles.profileMeta}>Family member · you manage these records</Text> : null}
          {patient?.patientCode ? <Text style={styles.profileMeta}>Patient ID: {patient.patientCode}</Text> : null}
          {patient?.email ? (
            <Text style={styles.profileMeta} numberOfLines={1}>
              {patient.email}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
      </TouchableOpacity>

      <Group title="Family">
        <Row
          icon="people-outline"
          tint="rose"
          label={self ? 'Family' : 'Switch Profile'}
          detail={
            guardianOnly
              ? `Viewing ${viewing?.firstName}. Switch to another person you look after`
              : !self
              ? `Viewing ${viewing?.firstName}. Switch back to you or another family member`
              : familyCount
                ? `You manage ${familyCount} family member${familyCount === 1 ? '' : 's'}`
                : "Manage your children's or parents' records"
          }
          badge={self ? family?.suggestions.length || undefined : undefined}
          onPress={() => router.push('/patient/family')}
          last
        />
      </Group>

      <Group title="Health Records">
        <Row
          icon="heart-outline"
          tint="rose"
          label="Health Summary"
          detail="Allergies, medicines and vaccines from every clinic"
          onPress={() => router.push('/patient/health-summary')}
        />
        <Row
          icon="business-outline"
          tint="amber"
          label="My Clinics"
          detail="Every clinic you've visited"
          onPress={() => router.push('/patient/clinics')}
        />
        <Row
          icon="bandage-outline"
          tint="teal"
          label="Prescriptions"
          detail="Your current and past prescriptions"
          onPress={() => router.push('/patient/prescriptions')}
        />
        <Row
          icon="document-text-outline"
          tint="purple"
          label="Documents"
          detail="Certificates, referrals and uploaded files"
          onPress={() => router.push('/patient/documents')}
          last
        />
      </Group>

      <Group title="Billing">
        <Row
          icon="receipt-outline"
          tint="blue"
          label="Billing & Invoices"
          detail="Your bills, balance and payment history"
          onPress={() => router.push('/patient/invoices')}
          last
        />
      </Group>

      <Group title="Account & Settings">
        <Row
          icon="key-outline"
          tint={activation && !activation.active && activation.enforced ? 'amber' : 'teal'}
          label="Activation"
          detail={activationDetail}
          onPress={() => router.push('/patient/activate')}
        />
        <Row
          icon="person-outline"
          tint="blue"
          label="Profile"
          detail="Your personal and contact information"
          onPress={() => router.push('/patient/profile')}
        />
        {self && !guardianOnly ? (
          <Row
            icon="lock-closed-outline"
            tint="purple"
            label="Password"
            detail="Set or change your sign-in password"
            onPress={() => router.push('/patient/profile/password')}
          />
        ) : null}
        <Row
          icon="mail-unread-outline"
          tint="teal"
          label="Notifications"
          detail={unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'Updates from your clinic'}
          badge={unreadCount}
          onPress={() => router.push('/patient/notifications')}
        />
        <Row
          icon="notifications-outline"
          tint="amber"
          label="Notification Settings"
          detail="Choose which updates alert you"
          onPress={() => router.push('/patient/notification-settings')}
          last
        />
      </Group>

      <Group title="Help">
        <Row
          icon="compass-outline"
          tint="teal"
          label="Take a Quick Tour"
          detail="A short walkthrough of the app"
          onPress={replayTour}
          last
        />
      </Group>

      <Group title="Legal">
        <Row
          icon="shield-checkmark-outline"
          tint="purple"
          label="Privacy Policy"
          detail="How we protect your data"
          external
          onPress={() => openWebPage(PRIVACY_URL)}
        />
        <Row
          icon="information-circle-outline"
          tint="teal"
          label="Terms of Use"
          detail="The terms for using eMCR"
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
        <Text style={styles.signOutText}>Sign Out</Text>
        {signingOut ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="chevron-forward" size={20} color={colors.danger} />}
      </TouchableOpacity>

      <Text style={styles.version}>eMCR {Constants.expoConfig?.version ?? ''}</Text>
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
