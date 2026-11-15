import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import { useApiData } from '@/lib/useApiData';
import { useProfile } from '@/lib/profile';
import { doctorName, formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { leaveWaitlist, WAITLIST_PATH, waitlistExplainer, WaitlistEntry, WaitlistList } from '@/lib/waitlist';
import { Button, LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useT } from '@/lib/i18n';

/** "Thu, Nov 5, 2026" for a clinic day ("yyyy-MM-dd"). */
function dayText(ymd: string): string {
  return formatDate(`${ymd}T00:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', utc: true });
}

/**
 * The doctors this profile is waiting on (a time is booked automatically when one opens), and
 * times booked from the waitlist in the last 30 days. Each waiting entry can be left.
 */
export default function WaitlistScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { viewing } = useProfile();
  const { data, setData, loading, refreshing, error, refresh, offline, stale, updatedAt } = useApiData<WaitlistList>(WAITLIST_PATH, {
    // A fill arrives as an appointment push, which refreshes "appointments".
    refreshOn: ['appointments', 'profile', 'family'],
    offline: true,
  });
  const [leaving, setLeaving] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);

  const self = !viewing || viewing.self;
  const explainer = waitlistExplainer();
  const entries = data?.entries ?? [];
  const waiting = entries.filter((e) => e.status === 'waiting');
  const filled = entries.filter((e) => e.status === 'filled');
  const lapsed = waiting.filter((e) => e.lapsed).length;
  // Leaving is a server change: not from a saved copy.
  const needsServer = offline || stale;

  function confirmLeave(entry: WaitlistEntry) {
    Alert.alert(
      t('waitlist.leave.title'),
      t('waitlist.leave.body', {
        who: doctorName(entry.doctor)
          ? t('waitlist.leave.who', { doctor: doctorName(entry.doctor) ?? '' })
          : t('waitlist.leave.whoThisDoctor'),
      }),
      [
        { text: t('waitlist.leave.stay'), style: 'cancel' },
        {
          text: t('waitlist.leave.leave'),
          style: 'destructive',
          onPress: async () => {
            setLeaving(entry._id);
            try {
              await leaveWaitlist(entry._id);
              setData((prev) => (prev ? { ...prev, entries: prev.entries.filter((e) => e._id !== entry._id) } : prev));
            } catch (err) {
              Alert.alert(t('waitlist.leave.failed'), errorMessage(err, t('waitlist.pleaseTryAgain')));
              refresh();
            } finally {
              setLeaving(null);
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
        {t('waitlist.title')}
      </Text>
      <Text style={styles.subtitle}>
        {self ? t('waitlist.subtitleSelf') : t('waitlist.subtitleOther', { name: viewing?.firstName ?? '' })}
      </Text>
    </SafeAreaView>
  );

  if (loading && !data) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>{header}</View>
        <LoadingView />
      </View>
    );
  }

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
          <OfflineBanner offline={offline} updatedAt={updatedAt} subject={t('waitlist.offlineSubject')} />
        </View>
      ) : (
        <RefreshErrorBanner error={error} show={!!data} />
      )}

      {error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          {/* Where the waiting stands: how many doctors, and what was booked from it. */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>
              {waiting.length ? t('waitlist.hero.waiting', { count: waiting.length }) : t('waitlist.hero.none')}
            </Text>
            {data ? <Text style={styles.heroMeta}>{t('waitlist.max', { max: data.maxActive })}</Text> : null}
            {filled.length || lapsed ? (
              <View style={styles.heroFoot}>
                {filled.length ? (
                  <View style={styles.heroLine}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                    <Text style={styles.heroLineText}>{t('waitlist.hero.filled', { count: filled.length })}</Text>
                  </View>
                ) : null}
                {lapsed ? (
                  <View style={styles.lapsedChip}>
                    <Ionicons name="alert-circle" size={14} color={colors.warning} />
                    <Text style={styles.lapsedChipText}>{t('waitlist.hero.lapsed', { count: lapsed })}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('waitlist.waiting')}
          </Text>
          {waiting.length ? (
            <View style={styles.card}>
              {waiting.map((entry, i) => (
                <EntryRow
                  key={entry._id}
                  entry={entry}
                  first={i === 0}
                  leaving={leaving === entry._id}
                  leaveDisabled={needsServer}
                  onLeave={() => confirmLeave(entry)}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.card, styles.empty]}>
              <Text style={styles.emptyText}>{t('waitlist.empty')}</Text>
              <Button
                title={t('waitlist.book')}
                icon="calendar-outline"
                variant="secondary"
                onPress={() => router.push('/patient/appointments/book')}
              />
            </View>
          )}
          {needsServer && waiting.length ? <Text style={styles.hint}>{t('waitlist.leaveNeedsConnection')}</Text> : null}

          {filled.length ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('waitlist.filledTitle')}
              </Text>
              <View style={styles.card}>
                {filled.map((entry, i) => (
                  <EntryRow key={entry._id} entry={entry} first={i === 0} />
                ))}
              </View>
            </>
          ) : null}

          {/* The rules, for when the patient wants them: not in the way of their own entries. */}
          <View style={[styles.card, styles.how]}>
            <TouchableOpacity
              style={styles.howToggle}
              onPress={() => setShowHow((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showHow }}
              accessibilityLabel={showHow ? undefined : t('waitlist.explain.a11y', { lines: explainer.join(' ') })}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.howTitle}>{t('waitlist.explain.title')}</Text>
              <Ionicons name={showHow ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
            </TouchableOpacity>
            {showHow
              ? explainer.map((line, i) => (
                  <View key={line} style={styles.howRow}>
                    <Text style={styles.howNum}>{i + 1}</Text>
                    <Text style={styles.howText}>{line}</Text>
                  </View>
                ))
              : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function EntryRow({
  entry,
  first,
  leaving,
  leaveDisabled,
  onLeave,
}: {
  entry: WaitlistEntry;
  first: boolean;
  leaving?: boolean;
  leaveDisabled?: boolean;
  onLeave?: () => void;
}) {
  const t = useT();
  const who = doctorName(entry.doctor) ?? t('waitlist.entry.anyDoctor');
  const when = entry.preferredDate ? t('waitlist.entry.around', { date: dayText(entry.preferredDate) }) : t('waitlist.entry.anyDay');
  const where = [entry.doctor?.specialization, entry.clinic.name].filter(Boolean).join(' · ');
  return (
    <View style={[styles.row, !first && styles.rule]}>
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {who}
        </Text>
        {entry.status === 'filled' ? (
          <Chip label={t('waitlist.entry.booked')} tone="teal" />
        ) : entry.lapsed ? (
          <Chip label={t('waitlist.entry.dayPassed')} tone="attention" />
        ) : (
          <Chip label={t('waitlist.waiting')} tone="neutral" />
        )}
      </View>
      {where ? <Text style={styles.rowLine}>{where}</Text> : null}
      <Text style={styles.rowLine}>{when}</Text>
      {entry.joinedAt ? <Text style={styles.rowMeta}>{t('waitlist.entry.joined', { date: formatDate(entry.joinedAt) })}</Text> : null}
      {entry.lapsed ? <Text style={styles.rowAttention}>{t('waitlist.entry.lapsed')}</Text> : null}
      {entry.status === 'filled' && entry.appointmentId ? (
        <TouchableOpacity
          style={styles.action}
          onPress={() => router.push(`/patient/appointments/${entry.appointmentId}`)}
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.actionText}>{t('waitlist.entry.viewAppointment')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
      {entry.status === 'waiting' && onLeave ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onLeave}
          disabled={leaving || leaveDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: leaving || leaveDisabled, busy: leaving }}
        >
          {leaving ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={[styles.leaveText, leaveDisabled && styles.leaveOff]}>{t('waitlist.entry.leave')}</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Chip({ label, tone }: { label: string; tone: 'teal' | 'attention' | 'neutral' }) {
  return (
    <View style={[styles.chip, tone === 'teal' && styles.chipTeal, tone === 'attention' && styles.chipAttention]}>
      <Text style={[styles.chipText, tone === 'teal' && styles.chipTextTeal, tone === 'attention' && styles.chipTextAttention]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  banner: { marginBottom: spacing.md },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.primaryText },
  heroMeta: { fontSize: 13, color: colors.onNavyMuted, marginTop: 4 },
  heroFoot: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    gap: spacing.sm,
  },
  heroLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  heroLineText: { flexShrink: 1, fontSize: 14, color: colors.primaryText },
  lapsedChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  lapsedChipText: { fontSize: 12, fontWeight: '600', color: colors.warning },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: { paddingVertical: spacing.sm + 4 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  rowLine: { fontSize: 14, color: colors.text, marginTop: 2 },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  rowAttention: { fontSize: 13, lineHeight: 18, color: colors.warning, marginTop: spacing.xs },
  chip: { backgroundColor: colors.slateSoft, borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  chipTeal: { backgroundColor: colors.primarySoft },
  chipAttention: { backgroundColor: colors.warningSoft },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.slate },
  chipTextTeal: { color: colors.primaryOnSoft },
  chipTextAttention: { color: colors.warning },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, minHeight: 44, alignSelf: 'flex-start', marginTop: spacing.xs },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  leaveText: { fontSize: 14, fontWeight: '600', color: colors.danger },
  leaveOff: { color: colors.textMuted },
  empty: { gap: spacing.sm + 4, paddingVertical: spacing.md },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },

  how: { marginTop: spacing.lg },
  howToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  howTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  howRow: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  howNum: { width: 18, fontSize: 14, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] },
  howText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
});
