import { useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { useApiData } from '@/lib/useApiData';
import { PatientClinic } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { Visit, visitProvider, visitReason, visitTypeLabel } from '@/lib/visits';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';

/** Every clinic visit, newest first; tap one for the doctor's findings. */
export default function VisitsScreen() {
  const bottomPad = useBottomPadding();
  const list = usePaginatedList<Visit>('/api/patients/me/visits', { limit: 20 });
  // Visits carry only the clinic's id; name it from the patient's clinic list.
  const clinics = useApiData<PatientClinic[]>('/api/patients/me/clinics');
  const clinicNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clinics.data ?? []) map.set(String(c.tenantId), c.name);
    return map;
  }, [clinics.data]);

  function refresh() {
    list.refresh();
    if (!clinics.data) clinics.refresh();
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        Visit History
      </Text>
      <Text style={styles.subtitle}>Your clinic visits, newest first. Tap a visit to see what the doctor found.</Text>
      {list.error && list.items.length > 0 ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading) {
    empty = <ActivityIndicator color={colors.primary} style={styles.loading} accessibilityLabel="Loading visits" />;
  } else if (list.error) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyText} accessibilityRole="alert">
          {list.error}
        </Text>
        <Button title="Try Again" variant="secondary" onPress={list.reload} style={styles.stretch} />
      </View>
    );
  } else {
    empty = (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="medkit-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No visits yet</Text>
        <Text style={styles.emptyText}>Your clinic visits will show up here after you see a doctor.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={list.items}
      keyExtractor={(v) => v._id}
      renderItem={({ item }) => (
        <VisitRow visit={item} clinic={item.tenantId ? clinicNames.get(String(item.tenantId)) ?? null : null} />
      )}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

function VisitRow({ visit, clinic }: { visit: Visit; clinic: string | null }) {
  const type = visitTypeLabel(visit.visitType);
  const doctor = visitProvider(visit);
  const reason = visitReason(visit);
  const cancelled = visit.status === 'cancelled';
  const date = formatDate(visit.date);
  const meta = [doctor, clinic].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/patient/visits/${visit._id}`)}
      accessibilityRole="button"
      accessibilityLabel={[`${type}, ${date}`, cancelled ? 'Cancelled' : null, doctor, clinic, reason]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens the visit details"
    >
      <View style={styles.dateTile}>
        <Text style={styles.dateMonth}>{formatDate(visit.date, { month: 'short' })}</Text>
        <Text style={styles.dateDay}>{formatDate(visit.date, { day: 'numeric' })}</Text>
        <Text style={styles.dateYear}>{formatDate(visit.date, { year: 'numeric' })}</Text>
      </View>
      <View style={styles.flex}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {type}
          </Text>
          {cancelled ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>Cancelled</Text>
            </View>
          ) : null}
        </View>
        {meta ? (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {reason ? (
          <Text style={styles.cardReason} numberOfLines={2}>
            {reason}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  headerSpacing: { marginBottom: spacing.md },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  loading: { marginVertical: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.sm + 4,
    marginBottom: spacing.sm + 4,
    minHeight: 44,
    ...softShadow,
  },
  dateTile: {
    width: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  dateMonth: { fontSize: 12, fontWeight: '700', color: colors.primaryOnSoft, textTransform: 'uppercase' },
  dateDay: { fontSize: 20, fontWeight: '800', color: colors.primaryOnSoft },
  dateYear: { fontSize: 11, color: colors.primaryOnSoft },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cardReason: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  pill: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
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
});
