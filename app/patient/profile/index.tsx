import { ReactNode, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { ApiError, errorMessage } from '@/lib/api';
import { PatientProfile } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { t as translate, useT } from '@/lib/i18n';

/** "Male" / "Female" in the app's language; any other value as the clinic wrote it. */
function sexLabel(sex: string): string {
  const key = sex.toLowerCase();
  if (key === 'male') return translate('profile.sex.male');
  if (key === 'female') return translate('profile.sex.female');
  return humanize(sex);
}

function joinAddress(a: PatientProfile['address']): string | null {
  if (!a) return null;
  const text = [a.street, a.city, a.state, a.zipCode].filter(Boolean).join(', ');
  return text || null;
}

/** Whole years since a date-only DOB stored as UTC midnight. */
function ageFrom(dob: string | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getUTCFullYear();
  if (now.getMonth() < d.getUTCMonth() || (now.getMonth() === d.getUTCMonth() && now.getDate() < d.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

function allergyText(a: NonNullable<PatientProfile['allergies']>[number]): string {
  if (typeof a === 'string') return a;
  return [a.substance, a.reaction ? `(${a.reaction})` : null].filter(Boolean).join(' ');
}

export default function ProfileScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const { signOut } = useAuth();
  const { viewing } = useProfile();
  const self = viewing?.self !== false;
  const { data, loading, refreshing, error, refresh } = useApiData<PatientProfile>('/api/patients/me', {
    refreshOn: ['profile'],
  });
  const [signingOutAll, setSigningOutAll] = useState(false);

  function confirmSignOutEverywhere() {
    Alert.alert(
      t('profile.signOutAll.title'),
      t('profile.signOutAll.body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.signOutAll.confirm'),
          style: 'destructive',
          onPress: async () => {
            setSigningOutAll(true);
            try {
              await signOut({ everywhere: true });
            } catch (err) {
              setSigningOutAll(false);
              // signOut always clears this device's session. When other devices couldn't be
              // signed out it sets the auth notice (shown on the sign-in screen this one is
              // about to be replaced by), so only unexpected errors need an alert here.
              if (!(err instanceof ApiError && err.code === 'SIGN_OUT_EVERYWHERE_FAILED')) {
                Alert.alert(t('profile.signOutAll.failed'), errorMessage(err, t('profile.signOutAll.failedFallback')));
              }
            }
          },
        },
      ]
    );
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {self ? t('profile.myProfile') : t('profile.memberProfile', { name: `${viewing?.firstName}` })}
      </Text>
      <Text style={styles.subtitle}>
        {self ? t('profile.selfSubtitle') : t('profile.memberSubtitle')}
      </Text>
    </SafeAreaView>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>{header}</View>
        <LoadingView />
      </View>
    );
  }

  const p = data;
  const fullName = p ? [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ') : '';
  const initials = p ? `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() : '';
  const age = ageFrom(p?.dateOfBirth);
  const editContacts = () => router.push('/patient/profile/edit');
  const allergies = (p?.allergies ?? []).map(allergyText).filter(Boolean);
  const conditions = (p?.preExistingConditions ?? []).filter((c) => c.condition && c.status !== 'resolved');

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {header}

      {error && !p ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.muted}>{error}</Text>
          <Button title={t('common.tryAgainTitle')} variant="secondary" onPress={refresh} style={styles.stretch} />
        </View>
      ) : p ? (
        <>
          {/* Identity */}
          <View style={[styles.card, styles.identity]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{fullName}</Text>
              {p.patientCode ? <Text style={styles.meta}>{t('profile.patientId', { id: p.patientCode })}</Text> : null}
              <View style={styles.facts}>
                {age !== null ? (
                  <View style={styles.fact}>
                    <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
                    <Text style={styles.factText}>{t('profile.yearsOld', { count: age })}</Text>
                  </View>
                ) : null}
                {p.sex ? (
                  <View style={styles.fact}>
                    <Ionicons name="person-outline" size={15} color={colors.textMuted} />
                    <Text style={styles.factText}>{sexLabel(p.sex)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <Section title={t('profile.personalInfo')} note={t('profile.managedByClinic')}>
            <InfoRow icon="person-outline" label={t('profile.fullName')} value={fullName} />
            <InfoRow
              icon="calendar-outline"
              label={t('profile.dateOfBirth')}
              value={p.dateOfBirth ? formatDate(p.dateOfBirth, { utc: true }) : null}
            />
            <InfoRow icon="male-female-outline" label={t('profile.sex')} value={p.sex ? sexLabel(p.sex) : null} />
            <InfoRow icon="call-outline" label={t('profile.mobileNumber')} value={p.phone} />
            <InfoRow icon="mail-outline" label={t('profile.signInEmail')} value={p.email} last />
          </Section>
          <Text style={styles.hint}>{t('profile.askFrontDesk')}</Text>

          <Section title={t('profile.contactAddress')} onEdit={editContacts}>
            <InfoRow icon="mail-outline" label={t('profile.contactEmail')} value={p.contacts?.email} />
            <InfoRow
              icon="location-outline"
              label={t('profile.homeAddress')}
              value={joinAddress(p.address) ?? p.contacts?.address}
              last
            />
          </Section>

          <Section title={t('profile.emergencyContact')} onEdit={editContacts}>
            <InfoRow icon="person-outline" label={t('profile.contactName')} value={p.emergencyContact?.name} />
            <InfoRow icon="call-outline" label={t('profile.phoneNumber')} value={p.emergencyContact?.phone} />
            <InfoRow icon="people-outline" label={t('profile.relationship')} value={p.emergencyContact?.relationship} last />
          </Section>

          <Section title={t('profile.medicalInfo')} note={t('profile.recordedByClinic')}>
            <InfoRow
              icon="alert-circle-outline"
              label={t('profile.allergies')}
              value={allergies.length ? allergies.join(', ') : t('profile.noneReported')}
              highlight={allergies.length > 0}
            />
            <InfoRow
              icon="medkit-outline"
              label={t('profile.conditions')}
              value={conditions.length ? conditions.map((c) => c.condition).join(', ') : t('profile.noneReported')}
              last
            />
          </Section>

          {self ? (
          <Section title={t('profile.accountSecurity')}>
            <ActionRow
              icon="lock-closed-outline"
              label={t('profile.password')}
              detail={p.hasPassword === false ? t('profile.passwordNotSet') : '••••••••'}
              onPress={() => router.push('/patient/profile/password')}
            />
            <ActionRow
              icon="phone-portrait-outline"
              label={t('profile.signOutAllDevices')}
              detail={t('profile.signOutAllDetail')}
              danger
              busy={signingOutAll}
              onPress={confirmSignOutEverywhere}
              last
            />
          </Section>
          ) : (
            <Text style={styles.hint}>
              {t('profile.memberSignsIn', { name: `${viewing?.firstName}` })}
            </Text>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Section({
  title,
  note,
  onEdit,
  children,
}: {
  title: string;
  note?: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('profile.editA11y', { section: title })}>
            <Text style={styles.edit}>{t('profile.edit')}</Text>
          </TouchableOpacity>
        ) : note ? (
          <Text style={styles.note}>{note}</Text>
        ) : null}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
  highlight,
}: {
  icon: IconName;
  label: string;
  value: string | null | undefined;
  last?: boolean;
  highlight?: boolean;
}) {
  const t = useT();
  return (
    <View
      style={[styles.row, !last && styles.divider]}
      accessible
      accessibilityLabel={t('profile.rowA11y', { label, value: value || t('profile.notSetLower') })}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.rowEmpty, highlight && styles.rowHighlight]}>{value || t('profile.notSet')}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  detail,
  onPress,
  danger,
  busy,
  last,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
  last?: boolean;
}) {
  const color = danger ? colors.danger : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.divider]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.flex}>
        <Text style={[styles.actionLabel, danger && { color: colors.danger }]}>{label}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      {busy ? <ActivityIndicator color={color} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  muted: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    paddingHorizontal: spacing.md,
    ...softShadow,
  },
  errorCard: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, marginTop: spacing.lg },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: colors.primaryOnSoft },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factText: { fontSize: 13, color: colors.textMuted },
  section: { marginTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  edit: { fontSize: 14, fontWeight: '700', color: colors.primary },
  note: { fontSize: 12, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, marginLeft: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { width: 112, fontSize: 14, fontWeight: '600', color: colors.text },
  rowValue: { flex: 1, fontSize: 14, color: colors.textMuted },
  rowEmpty: { fontStyle: 'italic' },
  rowHighlight: { color: colors.danger, fontWeight: '600' },
  actionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  actionDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
