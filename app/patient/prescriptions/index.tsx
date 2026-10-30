import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { Prescription } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { groupByVisit, isCurrent, PrescriptionGroup } from '@/lib/prescriptions';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { MedicationCard } from '@/components/MedicationCard';

type Tab = 'current' | 'past';

const VISIT_TYPE: Record<string, string> = {
  consultation: 'Consultation',
  'follow-up': 'Follow-up Visit',
  checkup: 'Check-up',
  emergency: 'Emergency Visit',
  teleconsult: 'Teleconsultation',
  vaccination: 'Vaccination',
};

export default function PrescriptionsScreen() {
  const bottomPad = useBottomPadding();
  const [tab, setTab] = useState<Tab>('current');
  const [tipDismissed, setTipDismissed] = useState(false);
  const list = usePaginatedList<Prescription>('/api/patients/me/prescriptions', {
    limit: 20,
    refreshOn: ['prescriptions'],
    offline: true,
  });

  const current = useMemo(() => list.items.filter(isCurrent), [list.items]);
  const past = useMemo(() => list.items.filter((p) => !isCurrent(p)), [list.items]);
  const groups = useMemo(() => groupByVisit(tab === 'current' ? current : past), [tab, current, past]);

  // Past prescriptions can sit beyond the first page; fetch on until there's something to show.
  useEffect(() => {
    if (tab === 'past' && past.length < 5 && list.hasMore && !list.loading && !list.loadingMore && !list.loadMoreError) {
      list.loadMore();
    }
  }, [tab, past.length, list.hasMore, list.loading, list.loadingMore, list.loadMoreError, list.loadMore]);

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        Prescriptions
      </Text>
      <Text style={styles.subtitle}>Your current and past prescriptions, by visit.</Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            { value: 'current', label: `Current${current.length ? ` (${current.length})` : ''}` },
            { value: 'past', label: 'Past' },
          ] as { value: Tab; label: string }[]
        ).map((t) => {
          const selected = t.value === tab;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setTab(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'current' && !tipDismissed && current.length > 0 ? (
        <View style={styles.tip}>
          <View style={styles.tipIcon}>
            <Ionicons name="medical-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.tipTitle}>Take your medications as prescribed.</Text>
            <Text style={styles.tipText}>If you have questions, please contact your clinic.</Text>
          </View>
          <TouchableOpacity onPress={() => setTipDismissed(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss tip">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <OfflineBanner offline={list.offline} updatedAt={list.updatedAt} />
      {list.error && list.items.length > 0 && !list.offline ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading || (tab === 'past' && list.hasMore && !list.loadMoreError)) {
    empty = <ActivityIndicator color={colors.primary} style={styles.loading} />;
  } else if (list.error && list.items.length === 0) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{list.error}</Text>
        <Button title="Try Again" variant="secondary" onPress={list.reload} style={styles.stretch} />
      </View>
    );
  } else {
    empty = (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="medical-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{tab === 'current' ? 'No current prescriptions' : 'No past prescriptions'}</Text>
        <Text style={styles.emptyText}>Prescriptions from your clinic visits will show up here.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={groups}
      keyExtractor={(g) => g.key}
      renderItem={({ item }) => <VisitGroup group={item} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

function VisitGroup({ group }: { group: PrescriptionGroup }) {
  const label = group.visit
    ? VISIT_TYPE[group.visit.visitType ?? ''] ?? (group.visit.visitType ? humanize(group.visit.visitType) : 'Clinic Visit')
    : 'Prescription';
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <View style={styles.groupIcon}>
          <Ionicons name={group.visit ? 'medkit-outline' : 'document-text-outline'} size={20} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.groupTitle}>
            {label} · {formatDate(group.date)}
          </Text>
          <Text style={styles.groupMeta}>
            {[group.prescriber, group.visit?.visitCode].filter(Boolean).join(' · ') || 'From your clinic'}
          </Text>
        </View>
      </View>

      {group.prescriptions.map((p) => (
        <View key={p._id}>
          {(p.medications ?? []).map((med, i) => (
            <MedicationCard key={`${p._id}-${i}`} prescription={p} med={med} />
          ))}
          {!p.medications?.length ? <Text style={styles.noMeds}>No medications listed.</Text> : null}
          <PrescriptionFooter prescription={p} />
        </View>
      ))}
    </View>
  );
}

function PrescriptionFooter({ prescription: p }: { prescription: Prescription }) {
  const pharmacy = p.pharmacyDispenses?.find((d) => d.pharmacyName)?.pharmacyName;
  return (
    <View style={styles.footer}>
      <View style={styles.flex}>
        {p.prescriptionCode ? <Text style={styles.footerCode}>Rx {p.prescriptionCode}</Text> : null}
        {pharmacy ? (
          <View style={styles.pharmacy}>
            <Ionicons name="storefront-outline" size={14} color={colors.textMuted} />
            <Text style={styles.footerMeta} numberOfLines={1}>
              Dispensed at {pharmacy}
            </Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.details}
        onPress={() => router.push(`/patient/prescriptions/${p._id}`)}
        accessibilityRole="button"
        accessibilityLabel={`View prescription ${p.prescriptionCode ?? ''} details`}
      >
        <Ionicons name="document-text-outline" size={16} color={colors.primaryText} />
        <Text style={styles.detailsText}>View Details</Text>
      </TouchableOpacity>
    </View>
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
  tabs: { flexDirection: 'row', backgroundColor: '#E4EEF0', borderRadius: radius.md, padding: 4, marginTop: spacing.lg },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextSelected: { color: colors.primaryText },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: '#EAF5FA',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D4E9F2',
    padding: spacing.sm + 6,
    marginTop: spacing.md,
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  tipText: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
    ...softShadow,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, marginBottom: spacing.sm + 4 },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  groupMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  noMeds: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  footerCode: { fontSize: 13, fontWeight: '600', color: colors.text },
  pharmacy: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  footerMeta: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 2,
    minHeight: 44,
  },
  detailsText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
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
