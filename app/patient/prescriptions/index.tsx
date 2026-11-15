import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { Prescription } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { statusLabel } from '@/components/StatusBadge';
import { groupByVisit, isCurrent, PrescriptionGroup } from '@/lib/prescriptions';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppHeader } from '@/components/AppHeader';
import { MedicationCard } from '@/components/MedicationCard';
import { PlainKey, useT } from '@/lib/i18n';

type Tab = 'current' | 'past';

const VISIT_TYPE: Record<string, PlainKey> = {
  consultation: 'prescriptions.visitType.consultation',
  'follow-up': 'prescriptions.visitType.follow-up',
  checkup: 'prescriptions.visitType.checkup',
  emergency: 'prescriptions.visitType.emergency',
  teleconsult: 'prescriptions.visitType.teleconsult',
  vaccination: 'prescriptions.visitType.vaccination',
};

export default function PrescriptionsScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const [tab, setTab] = useState<Tab>('current');
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
        {t('prescriptions.title')}
      </Text>
      <Text style={styles.subtitle}>{t('prescriptions.subtitle')}</Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            {
              value: 'current',
              label: current.length ? t('prescriptions.tab.currentCount', { count: current.length }) : t('prescriptions.tab.current'),
            },
            { value: 'past', label: t('prescriptions.tab.past') },
          ] as { value: Tab; label: string }[]
        ).map((item) => {
          const selected = item.value === tab;
          return (
            <TouchableOpacity
              key={item.value}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setTab(item.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'current' && current.length > 0 ? (
        <TouchableOpacity
          style={styles.reminders}
          onPress={() => router.push('/patient/medicines')}
          accessibilityRole="button"
          accessibilityLabel={`${t('prescriptions.reminders.title')}. ${t('prescriptions.reminders.text')}`}
        >
          <Ionicons name="alarm-outline" size={22} color={colors.primaryOnSoft} />
          <View style={styles.flex}>
            <Text style={styles.remindersTitle}>{t('prescriptions.reminders.title')}</Text>
            <Text style={styles.remindersText}>{t('prescriptions.reminders.text')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primaryOnSoft} />
        </TouchableOpacity>
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
        <Button title={t('common.tryAgainTitle')} variant="secondary" onPress={list.reload} style={styles.stretch} />
      </View>
    );
  } else {
    empty = (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="medical-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{tab === 'current' ? t('prescriptions.empty.current') : t('prescriptions.empty.past')}</Text>
        <Text style={styles.emptyText}>{t('prescriptions.empty.text')}</Text>
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
  const t = useT();
  const visitKey = group.visit ? VISIT_TYPE[group.visit.visitType ?? ''] : undefined;
  const label = group.visit
    ? visitKey
      ? t(visitKey)
      : group.visit.visitType
        ? humanize(group.visit.visitType)
        : t('prescriptions.clinicVisit')
    : t('prescriptions.prescription');
  return (
    <View style={styles.groupWrap}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>
          {label} · {formatDate(group.date)}
        </Text>
        <Text style={styles.groupMeta}>
          {[group.prescriber, group.visit?.visitCode].filter(Boolean).join(' · ') || t('prescriptions.fromClinic')}
        </Text>
      </View>
      <View style={styles.group}>
        {group.prescriptions.map((p, pi) => (
          <View key={p._id} style={pi > 0 ? styles.dividerTop : null}>
            {(p.medications ?? []).map((med, i) => (
              <MedicationCard key={`${p._id}-${i}`} prescription={p} med={med} compact first={i === 0} />
            ))}
            {!p.medications?.length ? <Text style={styles.noMeds}>{t('prescriptions.noMeds')}</Text> : null}
            <PrescriptionFooter prescription={p} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** The prescription itself: its Rx code, where it was dispensed, and the way into its details. */
function PrescriptionFooter({ prescription: p }: { prescription: Prescription }) {
  const t = useT();
  const pharmacy = p.pharmacyDispenses?.find((d) => d.pharmacyName)?.pharmacyName;
  const closed = p.status === 'cancelled' || p.status === 'completed';
  const line = [
    p.prescriptionCode ? t('prescriptions.rx', { code: p.prescriptionCode }) : t('prescriptions.prescription'),
    closed && p.status ? statusLabel(t, p.status) : null,
    pharmacy ? t('prescriptions.dispensedAt', { pharmacy }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <TouchableOpacity
      style={[styles.footer, styles.dividerTop]}
      onPress={() => router.push(`/patient/prescriptions/${p._id}`)}
      accessibilityRole="button"
      accessibilityLabel={t('prescriptions.viewA11y', { code: p.prescriptionCode ?? '' })}
    >
      <Ionicons name="document-text-outline" size={18} color={colors.primary} />
      <Text style={styles.footerText} numberOfLines={2}>
        {line}
      </Text>
      <Text style={styles.footerAction}>{t('prescriptions.viewDetails')}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
  tabs: { flexDirection: 'row', backgroundColor: colors.slateSoft, borderRadius: radius.md, padding: 4, marginTop: spacing.lg },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  tabTextSelected: { color: colors.primaryText },
  reminders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 56,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
  },
  remindersTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryOnSoft },
  remindersText: { fontSize: 13, color: colors.primaryOnSoft, marginTop: 2 },
  groupWrap: { marginBottom: spacing.lg },
  groupHeader: { marginBottom: spacing.sm },
  groupTitle: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  groupMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  noMeds: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.sm + 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingVertical: spacing.sm },
  footerText: { flex: 1, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  footerAction: { fontSize: 14, fontWeight: '700', color: colors.primary },
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
