import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { appointmentStart, isUpcoming } from '@/lib/appointments';
import { clinicYmd, formatDate } from '@/lib/format';
import { Appointment } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, KeyboardAvoider, ListFooter } from '@/components/ui';
import { photos, ScrimPhoto } from '@/components/Photo';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppHeader } from '@/components/AppHeader';
import { AppointmentCard } from '@/components/AppointmentCard';
import { BookedSummary, BookingForm, BookingSuccess } from '@/components/BookingForm';
import { PlainKey, useT } from '@/lib/i18n';

type Segment = 'book' | 'upcoming' | 'history';

/**
 * What the list draws, in order. Upcoming: the soonest as the navy card, then "Later" and the
 * rest. History: a heading per month ("November 2026 · 3 visits"), newest first.
 */
type Row =
  | { kind: 'hero'; key: string; a: Appointment }
  | { kind: 'later'; key: string }
  | { kind: 'month'; key: string; label: string; count: number }
  | { kind: 'appt'; key: string; a: Appointment };

function historyRows(items: Appointment[], undatedLabel: string): Row[] {
  // One heading per month even when the list isn't strictly newest-first (pages merged, a
  // moved appointment): months keep the order they first appear in, undated visits go last.
  const groups = new Map<string, { label: string; items: Appointment[] }>();
  const undated: Appointment[] = [];
  for (const a of items) {
    const start = appointmentStart(a);
    if (isNaN(start)) {
      undated.push(a);
      continue;
    }
    const ym = clinicYmd(new Date(start)).slice(0, 7);
    let group = groups.get(ym);
    if (!group) {
      group = { label: formatDate(start, { month: 'long', year: 'numeric' }), items: [] };
      groups.set(ym, group);
    }
    group.items.push(a);
  }
  const rows: Row[] = [];
  const push = (key: string, label: string, list: Appointment[]) => {
    rows.push({ kind: 'month', key, label, count: list.length });
    for (const a of list) rows.push({ kind: 'appt', key: a._id, a });
  };
  for (const [ym, group] of groups) push('m-' + ym, group.label, group.items);
  if (undated.length) push('m-undated', undatedLabel, undated);
  return rows;
}

const SEGMENTS: { label: PlainKey; value: Segment }[] = [
  { label: 'appointments.segment.book', value: 'book' },
  { label: 'appointments.segment.upcoming', value: 'upcoming' },
  { label: 'appointments.segment.history', value: 'history' },
];

export default function AppointmentsScreen() {
  const t = useT();
  const [segment, setSegment] = useState<Segment>('upcoming');
  const [booked, setBooked] = useState<BookedSummary | null>(null);
  const [bookDirty, setBookDirty] = useState(false);
  // One newest-first list, split client-side: upcoming visits sort to the top of it anyway.
  const list = usePaginatedList<Appointment>('/api/patients/me/appointments', {
    limit: 20,
    refreshOn: ['appointments'],
    offline: true,
  });

  const upcoming = useMemo(
    () => list.items.filter(isUpcoming).sort((a, b) => appointmentStart(a) - appointmentStart(b)),
    [list.items]
  );
  const history = useMemo(() => list.items.filter((a) => !isUpcoming(a)), [list.items]);

  function choose(next: Segment) {
    setSegment(next);
    // Leaving the confirmation resets the form for the next booking.
    if (next !== 'book') setBooked(null);
    // The first page can be all upcoming visits; fetch further back so History isn't empty.
    if (next === 'history' && history.length === 0 && list.hasMore) list.loadMore();
  }

  // Android Back on the Book segment returns to the list instead of leaving the tab (and the
  // half-filled form); asks first when something has been entered.
  useFocusEffect(
    useCallback(() => {
      if (segment !== 'book') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const leave = () => {
          setBookDirty(false);
          setBooked(null);
          setSegment('upcoming');
        };
        if (bookDirty && !booked) {
          Alert.alert(t('common.discard.title'), t('common.discard.body'), [
            { text: t('common.discard.keep'), style: 'cancel' },
            { text: t('common.discard.confirm'), style: 'destructive', onPress: leave },
          ]);
        } else {
          leave();
        }
        return true;
      });
      return () => sub.remove();
    }, [segment, bookDirty, booked, t])
  );

  const data: Row[] = useMemo(() => {
    if (segment === 'history') return historyRows(history, t('appointments.month.undated'));
    if (segment !== 'upcoming' || !upcoming.length) return [];
    const [first, ...rest] = upcoming;
    return [
      { kind: 'hero', key: 'h-' + first._id, a: first },
      ...(rest.length ? [{ kind: 'later' as const, key: 'later' }] : []),
      ...rest.map((a) => ({ kind: 'appt' as const, key: a._id, a })),
    ];
  }, [segment, upcoming, history, t]);
  const cached = list.offline || list.stale;

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader />
      {/* No separate "Book New" button: the Book tab right below does the same. */}
      <Text style={styles.title} accessibilityRole="header">
        {t('appointments.title')}
      </Text>
      <Text style={styles.subtitle}>{t('appointments.subtitle')}</Text>

      <View style={styles.segments} accessibilityRole="tablist">
        {SEGMENTS.map((s) => {
          const selected = s.value === segment;
          return (
            <TouchableOpacity
              key={s.value}
              style={[styles.segment, selected && styles.segmentSelected]}
              onPress={() => choose(s.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {t(s.label)}
                {s.value === 'upcoming' && upcoming.length > 0 ? ` (${upcoming.length})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {segment === 'book' ? (
        booked ? (
          <BookingSuccess
            booked={booked}
            onView={() => {
              const id = booked.appointment?._id;
              setBooked(null);
              setSegment('upcoming');
              if (id) router.push(`/patient/appointments/${id}`);
            }}
            onBookAnother={() => setBooked(null)}
          />
        ) : (
          <BookingForm onBooked={setBooked} onDirtyChange={setBookDirty} />
        )
      ) : null}
      {segment !== 'book' ? <OfflineBanner offline={list.offline} updatedAt={list.updatedAt} /> : null}
      {segment !== 'book' && list.error && list.items.length > 0 && !list.offline ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty = null;
  if (segment !== 'book') {
    if (list.loading) empty = <SkeletonCards label={t('appointments.loading')} />;
    else if (list.error && list.items.length === 0) {
      empty = (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{list.error}</Text>
          <Button title={t('common.tryAgain')} variant="secondary" onPress={list.reload} />
        </View>
      );
    } else if (segment === 'upcoming') {
      empty = (
        <ScrimPhoto source={photos.planner} style={styles.emptyPhoto} top={0.4} bottom={0.97}>
          <View style={styles.emptyPhotoInner}>
            <Text style={styles.emptyPhotoTitle} accessibilityRole="header">
              {t('appointments.empty.upcomingTitle')}
            </Text>
            <Text style={styles.emptyPhotoText}>{t('appointments.empty.upcomingText')}</Text>
            <Button title={t('appointments.empty.book')} onPress={() => choose('book')} style={styles.emptyPhotoButton} />
          </View>
        </ScrimPhoto>
      );
    } else {
      empty = (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {list.hasMore ? t('appointments.empty.loadingEarlier') : t('appointments.empty.noPast')}
          </Text>
        </View>
      );
    }
  }

  return (
    <KeyboardAvoider style={styles.root}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.key}
        extraData={cached}
        renderItem={({ item }) => {
          switch (item.kind) {
            case 'hero':
              return <AppointmentCard appointment={item.a} variant="hero" cached={cached} />;
            case 'later':
              return (
                <Text style={[styles.groupTitle, styles.laterTitle]} accessibilityRole="header">
                  {t('appointments.later')}
                </Text>
              );
            case 'month':
              return (
                <View style={styles.monthRow} accessibilityRole="header">
                  <Text style={styles.groupTitle}>{item.label}</Text>
                  <Text style={styles.monthCount}>{t('appointments.month.count', { count: item.count })}</Text>
                </View>
              );
            case 'appt':
              return segment === 'upcoming' ? (
                <AppointmentCard appointment={item.a} actions cached={cached} />
              ) : (
                <AppointmentCard appointment={item.a} compact />
              );
          }
        }}
        ListHeaderComponent={header ?? undefined}
        ListHeaderComponentStyle={styles.headerSpacing}
        ListEmptyComponent={empty ?? undefined}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />
        }
        // Older visits only matter on the History tab.
        onEndReached={segment === 'history' ? list.loadMore : undefined}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          segment === 'history' ? (
            <ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />
          ) : undefined
        }
      />
    </KeyboardAvoider>
  );
}

/** Placeholder cards while the first page loads (nothing saved yet). */
function SkeletonCards({ label }: { label: string }) {
  // One announced element for screen readers; the grey shapes inside stay hidden.
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeleton}>
          <View style={styles.skeletonDate} />
          <View style={styles.flex}>
            <View style={[styles.skeletonLine, { width: '70%' }]} />
            <View style={[styles.skeletonLine, styles.skeletonThin, { width: '50%' }]} />
            <View style={[styles.skeletonLine, styles.skeletonThin, { width: '35%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  headerSpacing: { marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  segments: {
    flexDirection: 'row',
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: 4,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  segmentTextSelected: { color: colors.primaryText },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  emptyPhoto: { minHeight: 300, borderRadius: radius.lg },
  emptyPhotoInner: { flex: 1, justifyContent: 'flex-end', padding: spacing.md + 4 },
  emptyPhotoTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  emptyPhotoText: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted, marginTop: spacing.xs },
  emptyPhotoButton: { marginTop: spacing.md },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  laterTitle: { marginBottom: spacing.sm },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  monthCount: { fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  skeleton: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
  },
  skeletonDate: { width: 68, height: 72, borderRadius: radius.md, backgroundColor: colors.slateSoft },
  skeletonLine: { height: 16, borderRadius: 4, backgroundColor: colors.slateSoft, marginBottom: spacing.sm },
  skeletonThin: { height: 12 },
});
