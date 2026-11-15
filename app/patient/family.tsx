import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, apiFetch, apiRequest, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { FAMILY_RELATIONSHIPS, FamilyMember, FamilyOverview, FamilyRelationship, FamilySuggestion } from '@/lib/types';
import { clinicTodayYmd, formatDate, humanize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, KeyboardAvoider, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { OtpConfirm } from '@/components/auth';
import { TFunction, useT } from '@/lib/i18n';

/** Whole years on the clinic's calendar (Manila), from a YYYY-MM-DD birth date. */
function age(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const [by, bm, bd] = dateOfBirth.slice(0, 10).split('-').map(Number);
  const [y, m, d] = clinicTodayYmd().split('-').map(Number);
  if (!by || !bm || !bd) return null;
  let years = y - by;
  if (m < bm || (m === bm && d < bd)) years--;
  return years >= 0 ? years : null;
}

/** Whole days from today (Manila) to a YYYY-MM-DD date. */
function daysUntil(ymd: string): number {
  return Math.round((Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`) - Date.parse(`${clinicTodayYmd()}T00:00:00Z`)) / 86_400_000);
}

/** An 18th birthday this close is worth flagging in amber; further off it's just a fact. */
const ACCESS_SOON_DAYS = 60;

/** Relationship in the app's language; any value the app doesn't know, as the server sent it. */
function isKnownRelationship(value: string): value is FamilyRelationship {
  return (FAMILY_RELATIONSHIPS as readonly string[]).includes(value);
}

function relationshipLabel(t: TFunction, m: FamilyMember): string {
  if (!m.relationship) return t('family.familyFallback');
  return isKnownRelationship(m.relationship) ? t(`common.relationship.${m.relationship}`) : humanize(m.relationship);
}

/** "Child · 9 yrs" (clinics are listed on their own line). */
function memberLine(t: TFunction, m: FamilyMember): string {
  const years = age(m.dateOfBirth);
  return [relationshipLabel(t, m), years !== null ? t('family.years', { count: years }) : null].filter(Boolean).join(' · ');
}

/**
 * Family accounts: switch whose records the app shows, add children registered with this
 * phone number, and stop managing someone. Always about the signed-in person, whichever
 * profile is on screen.
 */
export default function FamilyScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const { viewing, family, refreshFamily, switchTo } = useProfile();
  const auth = useAuth();
  const [loading, setLoading] = useState(!family);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** An add that failed: shown with the children it's about, not at the top of the screen. */
  const [addError, setAddError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Adding a child needs proof of the phone (OTP_REQUIRED) unless the sign-in was by code just now.
  const [otpFor, setOtpFor] = useState<{ suggestion: FamilySuggestion; phone: string } | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  async function reload(mode: 'initial' | 'refresh' = 'refresh') {
    if (mode === 'refresh') setRefreshing(true);
    const result = await refreshFamily();
    setLoadError(result ? null : t('family.loadFailed'));
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    reload('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Text a code to the signed-in person's own phone; returns the masked number. */
  async function sendCode(): Promise<string> {
    const sent = await apiRequest<{ phone: string }>('/api/patients/me/phone-code', { method: 'POST', profile: false });
    return sent.phone;
  }

  async function add(suggestion: FamilySuggestion, otp?: string) {
    setBusyKey(suggestion.key);
    setAddError(null);
    setOtpError(null);
    try {
      await apiFetch<{ data: { members: FamilyMember[] } }>('/api/patients/me/family', {
        method: 'POST',
        profile: false,
        body: { key: suggestion.key, relationship: 'child', ...(otp ? { otp } : {}) },
      });
      setOtpFor(null);
      await refreshFamily();
      Alert.alert(t('family.addedTitle'), t('family.addedBody', { name: suggestion.firstName }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_REQUIRED' && !otp) {
        try {
          setOtpFor({ suggestion, phone: await sendCode() });
        } catch (sendErr) {
          setAddError(errorMessage(sendErr, t('family.sendCodeFailed')));
        }
      } else if (otp) {
        setOtpError(errorMessage(err, t('family.codeFailed')));
      } else {
        setAddError(errorMessage(err, t('family.addFailed')));
      }
    } finally {
      setBusyKey(null);
    }
  }

  function confirmRemove(member: FamilyMember) {
    Alert.alert(
      t('family.removeTitle', { name: member.firstName }),
      member.source === 'clinic' ? t('family.removeClinicLinked') : t('family.removeReAdd'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('family.remove'),
          style: 'destructive',
          onPress: async () => {
            setBusyKey(member.id);
            try {
              await apiRequest(`/api/patients/me/family/${encodeURIComponent(member.id)}`, { method: 'DELETE', profile: false });
              if (viewing?.id === member.id) switchTo(null, '/patient/family');
              await refreshFamily();
            } catch (err) {
              Alert.alert(t('family.removeFailed'), errorMessage(err, t('family.removeFailedBody')));
            } finally {
              setBusyKey(null);
            }
          },
        },
      ]
    );
  }

  if (loading && !family) return <LoadingView />;

  const overview: FamilyOverview | null = family;
  // An eMCR account with no record of its own: signed in on one of the members, no "you" row,
  // and the family add/remove routes refuse the session.
  const guardianOnly = !!overview?.guardianOnly || auth.guardianOnly;
  const showingMember = overview?.members.find((m) => m.id === viewing?.id) ?? null;
  const showingSelf = !!viewing?.self;

  /** The signed-in record shows with no profile header; any other member is switched to. */
  function choose(member: FamilyMember) {
    switchTo(member.id === auth.patient?.id ? null : member);
  }

  return (
    // The child-OTP form sits low on the screen; keep it above the keyboard.
    <KeyboardAvoider style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload()} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']}>
          <AppHeader back />
          <Text style={styles.title} accessibilityRole="header">
            {t('family.title')}
          </Text>
          <Text style={styles.subtitle}>{guardianOnly ? t('family.subtitleGuardian') : t('family.subtitle')}</Text>
        </SafeAreaView>

        {loadError ? <Banner message={loadError} /> : null}

        {/* Whose records the whole app is showing right now: the one thing this screen changes. */}
        {viewing ? (
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>{t('family.showingNow')}</Text>
            <View style={styles.heroTop}>
              <Avatar
                image={viewing.profileImage}
                firstName={viewing.firstName}
                lastName={viewing.lastName}
                size={56}
              />
              <View style={styles.flex}>
                <Text style={styles.heroName}>{`${viewing.firstName} ${viewing.lastName}`.trim()}</Text>
                <Text style={styles.heroMeta}>
                  {showingSelf ? t('family.yourOwnRecords') : showingMember ? memberLine(t, showingMember) : t('family.familyFallback')}
                </Text>
              </View>
            </View>
            {!showingSelf && overview?.self ? (
              <TouchableOpacity
                style={styles.heroButton}
                onPress={() => switchTo(null)}
                accessibilityRole="button"
              >
                <Ionicons name="arrow-undo-outline" size={18} color={colors.primaryText} />
                <Text style={styles.heroButtonText}>{t('family.backToYou')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {overview ? (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {guardianOnly ? t('family.peopleGuardian') : t('family.people')}
            </Text>
            <View style={styles.card}>
              {overview.self ? (
                <PersonRow
                  firstName={overview.self.firstName}
                  lastName={overview.self.lastName}
                  image={auth.patient?.profileImage ?? null}
                  detail={t('family.you')}
                  active={showingSelf}
                  onPress={() => switchTo(null)}
                  last={overview.members.length === 0}
                />
              ) : overview.members.length === 0 ? (
                <Text style={styles.empty}>{t('family.noOne')}</Text>
              ) : null}
              {overview.members.map((m, i) => {
                const ends = m.accessEndsAt ? daysUntil(m.accessEndsAt) : null;
                return (
                  <PersonRow
                    key={m.id}
                    firstName={m.firstName}
                    lastName={m.lastName}
                    detail={memberLine(t, m)}
                    clinics={m.clinics.length ? m.clinics.join(', ') : null}
                    note={m.accessEndsAt ? t('family.accessEnds', { date: formatDate(m.accessEndsAt, { utc: true }) }) : null}
                    noteSoon={ends !== null && ends <= ACCESS_SOON_DAYS}
                    active={viewing?.id === m.id}
                    busy={busyKey === m.id}
                    onPress={() => choose(m)}
                    onRemove={guardianOnly ? undefined : () => confirmRemove(m)}
                    last={i === overview.members.length - 1}
                  />
                );
              })}
            </View>

            {!guardianOnly && overview.suggestions.length ? (
              <>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('family.childrenTitle')}
                </Text>
                <Text style={styles.sectionNote}>{t('family.childrenNote')}</Text>
                <View style={styles.card}>
                  {overview.suggestions.map((s, i) =>
                    otpFor?.suggestion.key === s.key ? (
                      <View key={s.key} style={[styles.otp, i < overview.suggestions.length - 1 && styles.divider]}>
                        <Text style={styles.otpTitle}>{t('family.confirmToAdd', { name: s.firstName })}</Text>
                        <OtpConfirm
                          phone={otpFor.phone}
                          sendCode={sendCode}
                          onVerify={(code) => add(s, code)}
                          onCancel={() => {
                            setOtpFor(null);
                            setOtpError(null);
                          }}
                          verifying={busyKey === s.key}
                          error={otpError}
                        />
                      </View>
                    ) : (
                      <View key={s.key} style={[styles.row, i < overview.suggestions.length - 1 && styles.divider]}>
                        <View style={styles.suggestIcon}>
                          <Ionicons name="person-add-outline" size={20} color={colors.primaryOnSoft} />
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.name}>
                            {s.firstName} {s.lastInitial}
                          </Text>
                          <Text style={styles.detail}>
                            {[s.birthYear ? t('family.born', { year: s.birthYear }) : null, s.clinics.join(', ') || null]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.addButton, busyKey !== null && styles.addButtonBusy]}
                          onPress={() => add(s)}
                          disabled={busyKey !== null}
                          accessibilityRole="button"
                          accessibilityLabel={t('family.addA11y', { name: s.firstName })}
                          accessibilityState={{ busy: busyKey === s.key, disabled: busyKey !== null }}
                        >
                          {busyKey === s.key ? (
                            <ActivityIndicator size="small" color={colors.primaryText} />
                          ) : (
                            <Text style={styles.addText}>{t('family.add')}</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )
                  )}
                </View>
                {addError ? (
                  <View style={styles.addError}>
                    <Banner message={addError} />
                  </View>
                ) : null}
              </>
            ) : null}

            {/* The phone-code add flow works for guardian-only accounts too (it's how they add people). */}
            {overview ? (
              <>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('family.addTitle')}
                </Text>
                <View style={[styles.card, styles.cardPadded]}>
                  <Text style={styles.body}>{t('family.addNote')}</Text>
                  <Button
                    title={t('family.addSomeone')}
                    icon="person-add-outline"
                    variant="secondary"
                    onPress={() => router.push('/phone?purpose=add')}
                  />
                  <View style={styles.adultRow}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
                    <Text style={styles.adultText}>{t('family.adultNote')}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoider>
  );
}

function PersonRow({
  firstName,
  lastName,
  image,
  detail,
  clinics,
  note,
  noteSoon,
  active,
  busy,
  onPress,
  onRemove,
  last,
}: {
  firstName: string;
  lastName: string;
  image?: string | null;
  detail: string;
  clinics?: string | null;
  note?: string | null;
  /** The note is an 18th birthday close enough to act on: amber. */
  noteSoon?: boolean;
  active: boolean;
  busy?: boolean;
  onPress: () => void;
  onRemove?: () => void;
  last?: boolean;
}) {
  const t = useT();
  const name = `${firstName} ${lastName}`.trim();
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <TouchableOpacity
        style={styles.person}
        onPress={onPress}
        disabled={active}
        accessibilityRole="button"
        accessibilityLabel={active ? t('family.showingA11y', { name }) : t('family.switchA11y', { name })}
        accessibilityState={{ selected: active }}
      >
        <Avatar image={image} firstName={firstName} lastName={lastName} size={44} tone={active ? 'solid' : 'soft'} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.detail}>{detail}</Text>
          {clinics ? (
            <Text style={styles.detail} numberOfLines={2}>
              {clinics}
            </Text>
          ) : null}
          {note ? <Text style={[styles.note, noteSoon && styles.noteSoon]}>{note}</Text> : null}
        </View>
        {active ? (
          <View style={styles.activePill}>
            <Ionicons name="checkmark" size={14} color={colors.primaryOnSoft} />
            <Text style={styles.activeText}>{t('family.showing')}</Text>
          </View>
        ) : (
          <Ionicons name="swap-horizontal" size={18} color={colors.textMuted} />
        )}
      </TouchableOpacity>
      {onRemove ? (
        <TouchableOpacity
          style={styles.remove}
          onPress={onRemove}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('family.stopA11y', { name })}
        >
          {busy ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="close-circle-outline" size={22} color={colors.danger} />}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionNote: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: -spacing.xs, marginBottom: spacing.sm + 4 },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm + 4 },
  heroName: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  heroMeta: { fontSize: 14, color: colors.onNavyMuted, marginTop: 2 },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyLine,
    marginTop: spacing.md,
  },
  heroButtonText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 4,
  },
  cardPadded: { padding: spacing.md, gap: spacing.sm + 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 44 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  note: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  noteSoon: { color: colors.warning, fontWeight: '600' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  activeText: { fontSize: 12, fontWeight: '700', color: colors.primaryOnSoft },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  suggestIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonBusy: { opacity: 0.7 },
  addText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
  addError: { marginTop: spacing.sm },
  otp: { paddingVertical: spacing.md },
  otpTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: 14, lineHeight: 20, color: colors.text },
  adultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  adultText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  empty: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md },
});
