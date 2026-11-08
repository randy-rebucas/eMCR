import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import { useApiData } from '@/lib/useApiData';
import { useProfile } from '@/lib/profile';
import { doctorName, formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { leaveWaitlist, WAITLIST_PATH, waitlistExplainer, WaitlistEntry, WaitlistList } from '@/lib/waitlist';
import { Badge, Button, LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
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
  const { data, setData, loading, refreshing, error, refresh } = useApiData<WaitlistList>(WAITLIST_PATH, {
    // A fill arrives as an appointment push, which refreshes "appointments".
    refreshOn: ['appointments', 'profile', 'family'],
  });
  const [leaving, setLeaving] = useState<string | null>(null);

  // possessive(viewing) === 'Your'
  const self = !viewing || viewing.self;
  const explainer = waitlistExplainer();
  const entries = data?.entries ?? [];
  const waiting = entries.filter((e) => e.status === 'waiting');
  const filled = entries.filter((e) => e.status === 'filled');

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

      <View style={styles.explain} accessible accessibilityLabel={t('waitlist.explain.a11y', { lines: explainer.join(' ') })}>
        <Text style={styles.explainTitle}>{t('waitlist.explain.title')}</Text>
        {explainer.map((line) => (
          <View key={line} style={styles.infoRow}>
            <Ionicons name="ellipse" size={6} color={colors.slate} style={styles.bullet} />
            <Text style={styles.infoText}>{line}</Text>
          </View>
        ))}
      </View>

      <RefreshErrorBanner error={error} show={!!data} />
      {error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('waitlist.waiting')}
          </Text>
          {waiting.length ? (
            <View style={[styles.card, styles.list]}>
              {waiting.map((entry, i) => (
                <EntryRow
                  key={entry._id}
                  entry={entry}
                  last={i === waiting.length - 1}
                  leaving={leaving === entry._id}
                  onLeave={() => confirmLeave(entry)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {t('waitlist.empty')}
              </Text>
              <Button
                title={t('waitlist.book')}
                icon="calendar-outline"
                variant="secondary"
                onPress={() => router.push('/patient/appointments/book')}
              />
            </View>
          )}
          {data && waiting.length >= data.maxActive ? (
            <Text style={styles.hint}>{t('waitlist.max', { max: data.maxActive })}</Text>
          ) : null}

          {filled.length ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('waitlist.filledTitle')}
              </Text>
              <View style={[styles.card, styles.list]}>
                {filled.map((entry, i) => (
                  <EntryRow key={entry._id} entry={entry} last={i === filled.length - 1} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function EntryRow({
  entry,
  last,
  leaving,
  onLeave,
}: {
  entry: WaitlistEntry;
  last: boolean;
  leaving?: boolean;
  onLeave?: () => void;
}) {
  const t = useT();
  const who = doctorName(entry.doctor) ?? t('waitlist.entry.anyDoctor');
  const when = entry.preferredDate ? t('waitlist.entry.around', { date: dayText(entry.preferredDate) }) : t('waitlist.entry.anyDay');
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {who}
        </Text>
        {entry.status === 'filled' ? (
          <Badge label={t('waitlist.entry.booked')} tone="primary" />
        ) : entry.lapsed ? (
          <Badge label={t('waitlist.entry.dayPassed')} tone="neutral" />
        ) : (
          <Badge label={t('waitlist.waiting')} tone="warning" />
        )}
      </View>
      {entry.doctor?.specialization ? <Text style={styles.rowLine}>{entry.doctor.specialization}</Text> : null}
      {entry.clinic.name ? <Text style={styles.rowLine}>{entry.clinic.name}</Text> : null}
      <Text style={styles.rowLine}>{when}</Text>
      {entry.joinedAt ? <Text style={styles.rowMeta}>{t('waitlist.entry.joined', { date: formatDate(entry.joinedAt) })}</Text> : null}
      {entry.lapsed ? (
        <Text style={styles.rowMeta}>{t('waitlist.entry.lapsed')}</Text>
      ) : null}
      {entry.status === 'filled' && entry.appointmentId ? (
        <Button
          title={t('waitlist.entry.viewAppointment')}
          icon="calendar-outline"
          variant="secondary"
          onPress={() => router.push(`/patient/appointments/${entry.appointmentId}`)}
          style={styles.action}
        />
      ) : null}
      {entry.status === 'waiting' && onLeave ? (
        <Button
          title={t('waitlist.entry.leave')}
          variant="dangerOutline"
          icon="exit-outline"
          onPress={onLeave}
          loading={leaving}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  explain: { backgroundColor: colors.slateSoft, borderRadius: radius.md, padding: spacing.sm + 4, gap: spacing.sm },
  explainTitle: { fontSize: 14, fontWeight: '700', color: colors.slate },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet: { marginTop: 7 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.slate },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    paddingHorizontal: spacing.md,
    ...softShadow,
  },
  list: { paddingVertical: 0 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { paddingVertical: spacing.sm + 4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  rowLine: { fontSize: 14, color: colors.text, marginTop: 2 },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  action: { marginTop: spacing.sm },
  empty: { gap: spacing.sm, paddingVertical: spacing.sm },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
});
