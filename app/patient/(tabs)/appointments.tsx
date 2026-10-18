import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { appointmentStart, isUpcoming } from '@/lib/appointments';
import { Appointment } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { AppointmentCard } from '@/components/AppointmentCard';
import { BookedSummary, BookingForm, BookingSuccess } from '@/components/BookingForm';

type Segment = 'book' | 'upcoming' | 'history';

const SEGMENTS: { label: string; value: Segment }[] = [
  { label: 'Book', value: 'book' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'History', value: 'history' },
];

export default function AppointmentsScreen() {
  const [segment, setSegment] = useState<Segment>('upcoming');
  const [booked, setBooked] = useState<BookedSummary | null>(null);
  // One newest-first list, split client-side: upcoming visits sort to the top of it anyway.
  const list = usePaginatedList<Appointment>('/api/patients/me/appointments', {
    limit: 20,
    refreshOn: ['appointments'],
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

  const data = segment === 'upcoming' ? upcoming : segment === 'history' ? history : [];

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader />
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Appointments
          </Text>
          <Text style={styles.subtitle}>Book, manage, and view your visits.</Text>
        </View>
        {segment !== 'book' ? (
          <TouchableOpacity
            style={styles.bookNew}
            onPress={() => choose('book')}
            accessibilityRole="button"
            accessibilityLabel="Book new appointment"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primaryText} />
            <Text style={styles.bookNewText}>Book New</Text>
          </TouchableOpacity>
        ) : null}
      </View>

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
                {s.label}
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
          <BookingForm onBooked={setBooked} />
        )
      ) : null}
      {segment !== 'book' && list.error && list.items.length > 0 ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty = null;
  if (segment !== 'book') {
    if (list.loading) empty = <Text style={styles.emptyText}>Loading…</Text>;
    else if (list.error && list.items.length === 0) {
      empty = (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{list.error}</Text>
          <Button title="Try again" variant="secondary" onPress={list.reload} />
        </View>
      );
    } else if (segment === 'upcoming') {
      empty = (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={36} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No upcoming appointments</Text>
          <Text style={styles.emptyText}>Book a visit with one of your clinic's doctors.</Text>
          <Button title="Book an Appointment" onPress={() => choose('book')} style={styles.emptyButton} />
        </View>
      );
    } else {
      empty = (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {list.hasMore ? 'Loading earlier appointments…' : 'No past appointments yet.'}
          </Text>
        </View>
      );
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={data}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) =>
          segment === 'upcoming' ? <AppointmentCard appointment={item} actions /> : <AppointmentCard appointment={item} compact />
        }
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.headerSpacing}
        ListEmptyComponent={empty}
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
          ) : null
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  headerSpacing: { marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  bookNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 2,
    minHeight: 44,
  },
  bookNewText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  segments: {
    flexDirection: 'row',
    backgroundColor: '#E4EEF0',
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
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  emptyButton: { alignSelf: 'stretch' },
});
