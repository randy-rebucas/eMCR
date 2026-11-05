import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, apiFetch, apiRequest, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { FAMILY_RELATIONSHIPS, FamilyMember, FamilyOverview, FamilyRelationship, FamilySuggestion } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { OtpConfirm } from '@/components/auth';
import { useT } from '@/lib/i18n';

function age(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) years--;
  return years >= 0 ? years : null;
}

/** Relationship in the app's language; any value the app doesn't know, as the server sent it. */
function isKnownRelationship(value: string): value is FamilyRelationship {
  return (FAMILY_RELATIONSHIPS as readonly string[]).includes(value);
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
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Adding a child needs proof of the phone (OTP_REQUIRED) unless the sign-in was by code just now.
  const [otpFor, setOtpFor] = useState<{ suggestion: FamilySuggestion; phone: string } | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  async function reload(mode: 'initial' | 'refresh' = 'refresh') {
    if (mode === 'refresh') setRefreshing(true);
    const result = await refreshFamily();
    setError(result ? null : t('family.loadFailed'));
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
    setError(null);
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
          setError(errorMessage(sendErr, t('family.sendCodeFailed')));
        }
      } else if (otp) {
        setOtpError(errorMessage(err, t('family.codeFailed')));
      } else {
        setError(errorMessage(err, t('family.addFailed')));
      }
    } finally {
      setBusyKey(null);
    }
  }

  function confirmRemove(member: FamilyMember) {
    Alert.alert(
      t('family.removeTitle', { name: member.firstName }),
      member.source === 'clinic'
        ? t('family.removeClinicLinked')
        : t('family.removeReAdd'),
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

  /** The signed-in record shows with no profile header; any other member is switched to. */
  function choose(member: FamilyMember) {
    switchTo(member.id === auth.patient?.id ? null : member);
  }

  return (
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
        <Text style={styles.subtitle}>
          {guardianOnly
            ? t('family.subtitleGuardian')
            : t('family.subtitle')}
        </Text>
      </SafeAreaView>

      {error ? <Banner message={error} /> : null}

      {overview ? (
        <>
          <View style={styles.card}>
            {overview.self ? (
              <PersonRow
                name={`${overview.self.firstName} ${overview.self.lastName}`}
                detail={t('family.you')}
                active={!!viewing?.self}
                onPress={() => switchTo(null)}
                last={overview.members.length === 0}
              />
            ) : overview.members.length === 0 ? (
              <Text style={styles.empty}>{t('family.noOne')}</Text>
            ) : null}
            {overview.members.map((m, i) => {
              const years = age(m.dateOfBirth);
              const detail = [
                m.relationship
                  ? isKnownRelationship(m.relationship)
                    ? t(`common.relationship.${m.relationship}`)
                    : humanize(m.relationship)
                  : t('family.familyFallback'),
                years !== null ? t('family.years', { count: years }) : null,
                m.clinics.length ? m.clinics.join(', ') : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <PersonRow
                  key={m.id}
                  name={`${m.firstName} ${m.lastName}`}
                  detail={detail}
                  note={m.accessEndsAt ? t('family.accessEnds', { date: formatDate(m.accessEndsAt, { utc: true }) }) : null}
                  active={viewing?.id === m.id}
                  busy={busyKey === m.id}
                  onPress={() => choose(m)}
                  onRemove={guardianOnly ? undefined : () => confirmRemove(m)}
                  last={i === overview.members.length - 1}
                />
              );
            })}
          </View>

          <Button
            title={t('family.addSomeone')}
            icon="person-add-outline"
            variant="secondary"
            onPress={() => router.push('/phone?purpose=add')}
            style={styles.addSomeone}
          />
          <Text style={styles.addNote}>
            {t('family.addNote')}
          </Text>

          {!guardianOnly && overview.suggestions.length ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('family.childrenTitle')}
              </Text>
              <Text style={styles.sectionNote}>
                {t('family.childrenNote')}
              </Text>
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
                      <View style={styles.avatar}>
                        <Ionicons name="person-add-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.name}>
                          {s.firstName} {s.lastInitial}
                        </Text>
                        <Text style={styles.detail}>
                          {[s.birthYear ? t('family.born', { year: s.birthYear }) : null, s.clinics.join(', ') || null].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => add(s)}
                        disabled={busyKey !== null}
                        accessibilityRole="button"
                        accessibilityLabel={t('family.addA11y', { name: s.firstName })}
                        accessibilityState={{ busy: busyKey === s.key, disabled: busyKey !== null }}
                      >
                        <Text style={styles.addText}>{busyKey === s.key ? t('family.adding') : t('family.add')}</Text>
                      </TouchableOpacity>
                    </View>
                  )
                )}
              </View>
            </>
          ) : null}

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
            <Text style={styles.noteText}>
              {t('family.adultNote')}
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function PersonRow({
  name,
  detail,
  note,
  active,
  busy,
  onPress,
  onRemove,
  last,
}: {
  name: string;
  detail: string;
  note?: string | null;
  active: boolean;
  busy?: boolean;
  onPress: () => void;
  onRemove?: () => void;
  last?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const t = useT();
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
        <View style={[styles.avatar, active && styles.avatarActive]}>
          <Text style={[styles.avatarText, active && styles.avatarTextActive]}>{initials}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
          {note ? <Text style={styles.noteSmall}>{note}</Text> : null}
        </View>
        {active ? (
          <View style={styles.activePill}>
            <Ionicons name="checkmark" size={14} color={colors.primaryOnSoft} />
            <Text style={styles.activeText}>{t('family.showing')}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {onRemove ? (
        <TouchableOpacity
          style={styles.remove}
          onPress={onRemove}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('family.stopA11y', { name })}
        >
          <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    paddingHorizontal: spacing.sm + 4,
    ...softShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 44 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: { backgroundColor: colors.primary },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.primaryOnSoft },
  avatarTextActive: { color: colors.primaryText },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  noteSmall: { fontSize: 12, color: colors.warning, marginTop: 2 },
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
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  sectionNote: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm + 4 },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: 'center',
  },
  addText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
  otp: { paddingVertical: spacing.md },
  otpTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.slate },
  empty: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md },
  addSomeone: { marginTop: spacing.md },
  addNote: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
});
