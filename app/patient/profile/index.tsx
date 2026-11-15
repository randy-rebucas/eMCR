import { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { emitRefresh } from '@/lib/events';
import { ApiError, errorMessage } from '@/lib/api';
import { PatientProfile } from '@/lib/types';
import { clinicTodayYmd, formatDate, humanize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, IconName, LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { Avatar } from '@/components/Avatar';
import { PhotoSheet } from '@/components/PhotoSheet';
import { PhotoPermissionError, PhotoSource, pickProfilePhoto, saveProfilePhoto } from '@/lib/avatar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { t as translate, useT } from '@/lib/i18n';

/** The picture on the navy card: larger than More's, since tapping it changes it. */
const AVATAR = 76;

/** Same set as the Health Summary, so both screens flag the same allergies. */
const SEVERE = new Set(['severe', 'high', 'life-threatening', 'anaphylaxis']);

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

/**
 * Whole years since a date-only DOB stored as UTC midnight, counted against today at the clinic
 * (not the phone's clock), so a birthday turns over on the same day the clinic sees it.
 */
function ageFrom(dob: string | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const [y, m, day] = clinicTodayYmd().split('-').map(Number);
  let age = y - d.getUTCFullYear();
  const bm = d.getUTCMonth() + 1;
  if (m < bm || (m === bm && day < d.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

interface AllergyLine {
  name: string;
  reaction: string | null;
  severe: boolean;
}

function allergyLine(a: NonNullable<PatientProfile['allergies']>[number]): AllergyLine | null {
  if (typeof a === 'string') return a.trim() ? { name: a.trim(), reaction: null, severe: false } : null;
  if (!a.substance) return null;
  return { name: a.substance, reaction: a.reaction || null, severe: !!a.severity && SEVERE.has(a.severity.toLowerCase()) };
}

/**
 * The one contact gap worth raising, most important first: who to call in an emergency, then
 * where the patient lives. Null when both are on file.
 */
function contactGap(p: PatientProfile): 'emergency' | 'address' | null {
  if (!p.emergencyContact?.name || !p.emergencyContact?.phone) return 'emergency';
  if (!joinAddress(p.address) && !p.contacts?.address) return 'address';
  return null;
}

export default function ProfileScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const { signOut, guardianOnly, patient: me, setPatientSummary } = useAuth();
  const { viewing } = useProfile();
  const self = viewing?.self !== false;
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<PatientProfile>('/api/patients/me?include=photo', {
    refreshOn: ['profile'],
    offline: true,
  });
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** The picture just saved or removed, shown until the refetch lands (undefined = use `data`). */
  const [photoOverride, setPhotoOverride] = useState<string | null | undefined>(undefined);
  useEffect(() => setPhotoOverride(undefined), [data]);

  async function savePhoto(image: string | null) {
    setPhotoBusy(true);
    try {
      const saved = await saveProfilePhoto(image);
      setPhotoOverride(saved);
      // Refetches this screen and, for a family member, the header's picture.
      emitRefresh('profile');
      // The header and More show the signed-in record's picture: update it there too.
      if (me && data?._id === me.id) setPatientSummary({ ...me, profileImage: saved });
    } catch (err) {
      Alert.alert(
        image ? t('profile.photo.saveFailed') : t('profile.photo.removeFailed'),
        errorMessage(err, t('profile.photo.failedFallback'))
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  function pickPhoto(source: PhotoSource) {
    setSheetOpen(false);
    // iOS can't present the picker while the sheet is still animating away.
    setTimeout(async () => {
      let image: string | null;
      try {
        image = await pickProfilePhoto(source);
      } catch (err) {
        if (err instanceof PhotoPermissionError) {
          Alert.alert(
            source === 'camera' ? t('profile.photo.cameraBlocked') : t('profile.photo.photosBlocked'),
            t('profile.photo.blockedBody'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('profile.photo.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
            ]
          );
        } else {
          Alert.alert(t('profile.photo.saveFailed'), t('profile.photo.failedFallback'));
        }
        return;
      }
      if (image) await savePhoto(image);
    }, Platform.OS === 'ios' ? 400 : 0);
  }

  function removePhoto() {
    setSheetOpen(false);
    Alert.alert(t('profile.photo.removeTitle'), t('profile.photo.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.photo.removeConfirm'), style: 'destructive', onPress: () => savePhoto(null) },
    ]);
  }

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
      <Text style={styles.subtitle}>{self ? t('profile.selfSubtitle') : t('profile.memberSubtitle')}</Text>
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
  const editContacts = () => router.push('/patient/profile/edit');

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {header}

      {offline ? (
        <View style={styles.banner}>
          <OfflineBanner offline={offline} updatedAt={updatedAt} subject={t('profile.offlineSubject')} />
        </View>
      ) : (
        <RefreshErrorBanner error={error} show={!!p} />
      )}

      {error && !p ? (
        <View style={styles.errorWrap}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      ) : p ? (
        <ProfileBody
          p={p}
          self={self}
          guardianOnly={guardianOnly}
          memberName={viewing?.firstName ?? ''}
          onEdit={editContacts}
          signingOutAll={signingOutAll}
          onSignOutAll={confirmSignOutEverywhere}
          photo={photoOverride !== undefined ? photoOverride : (p.profileImage ?? null)}
          // An older server has no photo route: it sends no `profileImage` field at all. For
          // someone else (a family member, or a guardian-only session) the server allows it only
          // while they're a minor.
          canChangePhoto={p.profileImage !== undefined && (self || (ageFrom(p.dateOfBirth) ?? 18) < 18)}
          photoBusy={photoBusy}
          onPhoto={() => setSheetOpen(true)}
        />
      ) : null}
      <PhotoSheet
        visible={sheetOpen}
        hasPhoto={!!(photoOverride !== undefined ? photoOverride : p?.profileImage)}
        onPick={pickPhoto}
        onRemove={removePhoto}
        onClose={() => setSheetOpen(false)}
      />
    </ScrollView>
  );
}

function ProfileBody({
  p,
  self,
  guardianOnly,
  memberName,
  onEdit,
  signingOutAll,
  onSignOutAll,
  photo,
  canChangePhoto,
  photoBusy,
  onPhoto,
}: {
  p: PatientProfile;
  self: boolean;
  guardianOnly: boolean;
  memberName: string;
  onEdit: () => void;
  signingOutAll: boolean;
  onSignOutAll: () => void;
  photo: string | null;
  canChangePhoto: boolean;
  photoBusy: boolean;
  onPhoto: () => void;
}) {
  const t = useT();
  const fullName = [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ');
  const age = ageFrom(p.dateOfBirth);
  const facts = [age !== null ? t('profile.yearsOld', { count: age }) : null, p.sex ? sexLabel(p.sex) : null].filter(Boolean);
  const allergies = (p.allergies ?? []).map(allergyLine).filter((a): a is AllergyLine => !!a);
  const conditions = (p.preExistingConditions ?? []).filter((c) => c.condition && c.status !== 'resolved');
  const gap = contactGap(p);
  const ec = p.emergencyContact;
  const hasEmergency = !!(ec?.name || ec?.phone || ec?.relationship);

  return (
    <>
      {/* Who this is, and the one thing missing from it: solid navy, no shadow (as on More). */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          {canChangePhoto ? (
            <TouchableOpacity
              onPress={onPhoto}
              disabled={photoBusy}
              accessibilityRole="button"
              accessibilityLabel={photo ? t('profile.photo.changeA11y') : t('profile.photo.addA11y')}
              accessibilityState={{ busy: photoBusy }}
            >
              <Avatar image={photo} firstName={p.firstName} lastName={p.lastName} size={AVATAR} />
              {photoBusy ? (
                <View style={styles.avatarBusy}>
                  <ActivityIndicator color={colors.primaryText} />
                </View>
              ) : null}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color={colors.primaryText} />
              </View>
            </TouchableOpacity>
          ) : (
            <Avatar image={photo} firstName={p.firstName} lastName={p.lastName} size={AVATAR} />
          )}
          <View style={styles.flex}>
            <Text style={styles.heroName}>{fullName}</Text>
            {p.patientCode ? (
              <Text style={styles.heroMeta} selectable>
                {t('profile.patientId', { id: p.patientCode })}
              </Text>
            ) : null}
            {facts.length ? <Text style={styles.heroMeta}>{facts.join(' · ')}</Text> : null}
          </View>
        </View>
        <View style={styles.heroFoot}>
          {gap ? (
            <TouchableOpacity style={styles.gap} onPress={onEdit} accessibilityRole="button">
              <View style={styles.gapChip}>
                <Ionicons name="alert-circle" size={14} color={colors.warning} />
                <Text style={styles.gapChipText}>{gap === 'emergency' ? t('profile.gap.emergency') : t('profile.gap.address')}</Text>
              </View>
              <Text style={styles.gapAction}>{t('profile.gap.add')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
            </TouchableOpacity>
          ) : (
            <View style={styles.doneChip}>
              <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
              <Text style={styles.doneChipText}>{t('profile.gap.none')}</Text>
            </View>
          )}
        </View>
      </View>

      <Section title={t('profile.personalInfo')}>
        <InfoRow icon="person-outline" label={t('profile.fullName')} value={fullName} />
        <InfoRow
          icon="calendar-outline"
          label={t('profile.dateOfBirth')}
          value={p.dateOfBirth ? formatDate(p.dateOfBirth, { utc: true, month: 'long', day: 'numeric', year: 'numeric' }) : null}
        />
        <InfoRow icon="male-female-outline" label={t('profile.sex')} value={p.sex ? sexLabel(p.sex) : null} />
        <InfoRow icon="call-outline" label={t('profile.mobileNumber')} value={p.phone} figures />
        <InfoRow icon="mail-outline" label={t('profile.signInEmail')} value={p.email} />
        <View style={styles.cardFoot}>
          <Ionicons name="business-outline" size={16} color={colors.textMuted} />
          <Text style={styles.cardFootText}>{t('profile.askFrontDesk')}</Text>
        </View>
      </Section>

      <Section title={t('profile.contactAddress')} onEdit={onEdit}>
        <InfoRow icon="mail-outline" label={t('profile.contactEmail')} value={p.contacts?.email} />
        <InfoRow
          icon="location-outline"
          label={t('profile.homeAddress')}
          value={joinAddress(p.address) ?? p.contacts?.address}
          attention={gap === 'address'}
          last
        />
      </Section>

      <Section title={t('profile.emergencyContact')} onEdit={hasEmergency ? onEdit : undefined}>
        {hasEmergency ? (
          <>
            <InfoRow icon="person-outline" label={t('profile.contactName')} value={ec?.name} attention={!ec?.name} />
            <InfoRow icon="call-outline" label={t('profile.phoneNumber')} value={ec?.phone} figures attention={!ec?.phone} />
            <InfoRow icon="people-outline" label={t('profile.relationship')} value={ec?.relationship} last />
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('profile.emergency.empty')}</Text>
            <Button title={t('profile.emergency.add')} icon="add" variant="secondary" onPress={onEdit} style={styles.stretch} />
          </View>
        )}
      </Section>

      <Section title={t('profile.medicalInfo')} note={t('profile.recordedByClinic')}>
        <Text style={styles.groupLabel}>{t('profile.allergies')}</Text>
        {allergies.length ? (
          allergies.map((a, i) => (
            <View
              key={`${a.name}-${i}`}
              style={[styles.medRow, styles.divider]}
              accessible
              accessibilityLabel={[a.name, a.reaction, a.severe ? t('healthSummary.severe') : null].filter(Boolean).join(', ')}
            >
              <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
              <View style={styles.flex}>
                <Text style={styles.medName}>{a.name}</Text>
                {a.reaction ? <Text style={styles.medDetail}>{a.reaction}</Text> : null}
              </View>
              {a.severe ? (
                <View style={styles.severe}>
                  <Text style={styles.severeText}>{t('healthSummary.severe')}</Text>
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={[styles.noneText, styles.divider]}>{t('profile.noAllergies')}</Text>
        )}
        <Text style={styles.groupLabel}>{t('profile.conditions')}</Text>
        {conditions.length ? (
          conditions.map((c, i) => (
            <View key={`${c.condition}-${i}`} style={[styles.medRow, styles.divider]} accessible>
              <Ionicons name="medkit-outline" size={20} color={colors.primary} />
              <Text style={[styles.medName, styles.flex]}>{c.condition}</Text>
              {c.status === 'chronic' ? <Text style={styles.medStatus}>{t('profile.condition.chronic')}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={[styles.noneText, styles.divider]}>{t('profile.noConditions')}</Text>
        )}
        <LinkRow
          icon="heart-outline"
          label={t('profile.summaryLink')}
          detail={t('profile.summaryDetail')}
          onPress={() => router.push('/patient/health-summary')}
          last
        />
      </Section>

      {/* A guardian-only session has no password of its own, and the server refuses
          "sign out everywhere" for it (as on the More tab). */}
      {self && !guardianOnly ? (
        <Section title={t('profile.accountSecurity')}>
          <LinkRow
            icon="lock-closed-outline"
            label={t('profile.password')}
            detail={p.hasPassword === false ? t('profile.passwordNotSet') : t('profile.passwordChange')}
            attention={p.hasPassword === false}
            onPress={() => router.push('/patient/profile/password')}
          />
          <LinkRow
            icon="phone-portrait-outline"
            label={t('profile.signOutAllDevices')}
            detail={t('profile.signOutAllDetail')}
            danger
            busy={signingOutAll}
            onPress={onSignOutAll}
            last
          />
        </Section>
      ) : (
        <Section title={t('profile.signingIn')}>
          <LinkRow
            icon="people-outline"
            label={t('profile.familyLink')}
            detail={t('profile.memberSignsIn', { name: memberName })}
            onPress={() => router.push('/patient/family')}
            last
          />
        </Section>
      )}
    </>
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
          <TouchableOpacity
            onPress={onEdit}
            style={styles.editButton}
            accessibilityRole="button"
            accessibilityLabel={t('profile.editA11y', { section: title })}
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
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

/** Label above value: long Filipino labels and long addresses both get the full width. */
function InfoRow({
  icon,
  label,
  value,
  last,
  figures,
  attention,
}: {
  icon: IconName;
  label: string;
  value: string | null | undefined;
  last?: boolean;
  /** Phone numbers: tabular figures so digits line up. */
  figures?: boolean;
  /** An empty field the patient should fill in (amber "Not set"). */
  attention?: boolean;
}) {
  const t = useT();
  return (
    <View
      style={[styles.row, !last && styles.divider]}
      accessible
      accessibilityLabel={t('profile.rowA11y', { label, value: value || t('profile.notSetLower') })}
    >
      <Ionicons name={icon} size={20} color={colors.primary} style={styles.rowIcon} />
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text
          style={[styles.rowValue, figures && styles.figures, !value && styles.rowEmpty, !value && attention && styles.rowAttention]}
          selectable={!!value}
        >
          {value || t('profile.notSet')}
        </Text>
      </View>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  detail,
  onPress,
  danger,
  attention,
  busy,
  last,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onPress: () => void;
  danger?: boolean;
  attention?: boolean;
  busy?: boolean;
  last?: boolean;
}) {
  const color = danger ? colors.danger : attention ? colors.warning : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.row, styles.linkRow, !last && styles.divider]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityState={{ busy: !!busy }}
    >
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.flex}>
        <Text style={[styles.linkLabel, danger && { color: colors.danger }]}>{label}</Text>
        <Text style={[styles.linkDetail, attention && { color: colors.warning }]}>{detail}</Text>
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
  banner: { marginTop: spacing.md },
  errorWrap: { paddingVertical: spacing.xl },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginTop: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Teal disc with a navy ring, so it reads as a separate control on the navy card.
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  heroMeta: { fontSize: 13, color: colors.onNavyMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  heroFoot: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
  },
  gap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  gapChip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  gapChipText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: colors.warning },
  gapAction: { marginLeft: 'auto', fontSize: 14, fontWeight: '600', color: colors.primaryText },
  doneChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.navyLine,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  doneChipText: { fontSize: 12, fontWeight: '600', color: colors.primaryText },

  section: { marginTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    minHeight: 44,
  },
  sectionTitle: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: spacing.md },
  edit: { fontSize: 14, fontWeight: '700', color: colors.primary },
  note: { fontSize: 12, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 4 },
  cardFootText: { flex: 1, fontSize: 13, color: colors.textMuted },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  rowIcon: { marginTop: 2 },
  rowLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  rowValue: { fontSize: 15, color: colors.text, marginTop: 2 },
  figures: { fontVariant: ['tabular-nums'] },
  rowEmpty: { color: colors.textMuted, fontStyle: 'italic' },
  rowAttention: { color: colors.warning, fontStyle: 'normal', fontWeight: '600' },

  linkRow: { alignItems: 'center', minHeight: 56 },
  linkLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  linkDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  empty: { paddingVertical: spacing.md, gap: spacing.sm + 4 },
  emptyText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },

  groupLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, paddingTop: spacing.sm + 4 },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  medName: { fontSize: 15, fontWeight: '600', color: colors.text },
  medDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  medStatus: { fontSize: 12, fontWeight: '600', color: colors.slate },
  severe: { backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  severeText: { fontSize: 12, fontWeight: '700', color: colors.warning },
  noneText: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.sm + 4 },
});
