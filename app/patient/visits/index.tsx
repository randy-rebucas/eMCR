import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { useApiData } from '@/lib/useApiData';
import { PatientClinic } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { diagnosisText, primaryDiagnosis, Visit, visitProvider, visitReason, visitTypeLabel } from '@/lib/visits';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { photos, ScrimPhoto } from '@/components/Photo';
import { useT } from '@/lib/i18n';

interface YearSection {
  title: string;
  data: Visit[];
}

/** Newest-first visits split by calendar year (clinic time), keeping the order. */
function byYear(visits: Visit[]): YearSection[] {
  const sections: YearSection[] = [];
  for (const v of visits) {
    const year = formatDate(v.date, { year: 'numeric' });
    const last = sections[sections.length - 1];
    if (last && last.title === year) last.data.push(v);
    else sections.push({ title: year, data: [v] });
  }
  return sections;
}

/** Every clinic visit, newest first, one ruled card per year; tap one for the doctor's findings. */
export default function VisitsScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const list = usePaginatedList<Visit>('/api/patients/me/visits', { limit: 20, offline: true });
  // Visits carry only the clinic's id; name it from the patient's clinic list.
  const clinics = useApiData<PatientClinic[]>('/api/patients/me/clinics', { offline: true });
  const clinicNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clinics.data ?? []) map.set(String(c.tenantId), c.name);
    return map;
  }, [clinics.data]);
  const sections = useMemo(() => byYear(list.items), [list.items]);
  // Only named when there's more than one clinic: with one, the name on every row is noise.
  const manyClinics = (clinics.data?.length ?? 0) > 1;

  function refresh() {
    list.refresh();
    if (!clinics.data) clinics.refresh();
  }

  const latest = list.items.find((v) => v.status !== 'cancelled') ?? null;
  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {t('visits.title')}
      </Text>
      <Text style={styles.subtitle}>
        {latest ? t('visits.lastSeen', { date: formatDate(latest.date, { month: 'long', day: 'numeric', year: 'numeric' }) }) : t('visits.subtitle')}
      </Text>
      {list.offline ? (
        <View style={styles.banner}>
          <OfflineBanner offline={list.offline} updatedAt={list.updatedAt} subject={t('visits.offlineSubject')} />
        </View>
      ) : list.error && list.items.length > 0 ? (
        <Banner message={list.error} />
      ) : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading) {
    empty = <ActivityIndicator color={colors.primary} style={styles.loading} accessibilityLabel={t('visits.loading')} />;
  } else if (list.error) {
    empty = (
      <View style={styles.errorBox}>
        <Text style={styles.errorText} accessibilityRole="alert">
          {list.error}
        </Text>
        <Button title={t('common.tryAgainTitle')} variant="secondary" onPress={list.reload} style={styles.stretch} />
      </View>
    );
  } else {
    empty = (
      <ScrimPhoto source={photos.consultation} style={styles.emptyPhoto} top={0.3}>
        <View style={styles.emptyFoot}>
          <Text style={styles.emptyTitle}>{t('visits.empty.title')}</Text>
          <Text style={styles.emptyText}>{t('visits.empty.text')}</Text>
        </View>
      </ScrimPhoto>
    );
  }

  return (
    <SectionList
      style={styles.root}
      sections={sections}
      keyExtractor={(v) => v._id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text style={styles.year} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      renderItem={({ item, index, section }) => (
        <VisitRow
          visit={item}
          clinic={manyClinics && item.tenantId ? clinicNames.get(String(item.tenantId)) ?? null : null}
          first={index === 0}
          last={index === section.data.length - 1}
        />
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

/**
 * One visit as a row of the year's ruled card: the day first, then what the doctor found (the
 * main diagnosis, else why the patient came), and who saw them.
 */
function VisitRow({ visit, clinic, first, last }: { visit: Visit; clinic: string | null; first: boolean; last: boolean }) {
  const t = useT();
  const type = visitTypeLabel(visit.visitType);
  const doctor = visitProvider(visit);
  const main = primaryDiagnosis(visit);
  const finding = main ? diagnosisText(main) : visitReason(visit);
  const cancelled = visit.status === 'cancelled';
  const meta = [type, doctor, clinic].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !first && styles.rowDivider]}
      onPress={() => router.push(`/patient/visits/${visit._id}`)}
      accessibilityRole="button"
      accessibilityLabel={[formatDate(visit.date, { month: 'long', day: 'numeric', year: 'numeric' }), cancelled ? t('visits.cancelled') : null, finding, meta]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint={t('visits.openHint')}
    >
      <View style={styles.day}>
        <Text style={[styles.dayNum, cancelled && styles.muted]}>{formatDate(visit.date, { day: 'numeric' })}</Text>
        <Text style={styles.dayMonth}>{formatDate(visit.date, { month: 'short' })}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.finding, cancelled && styles.muted]} numberOfLines={2}>
          {finding || type}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {cancelled ? <Text style={styles.cancelled}>{t('visits.cancelled')}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  loading: { marginVertical: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  banner: { marginTop: spacing.md },
  year: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm, fontVariant: ['tabular-nums'] },
  // Rows draw one ruled card per year: the outer border on every row, corners on the ends.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    // Android draws a rounded view's border on another path; keep every row on the same one.
    borderRadius: 1,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  day: { width: 44, alignItems: 'center' },
  dayNum: { fontSize: 20, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  dayMonth: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  finding: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cancelled: { fontSize: 12, fontWeight: '700', color: colors.slate, marginTop: 2 },
  muted: { color: colors.textMuted },
  errorBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  errorText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyPhoto: { minHeight: 260, borderRadius: radius.lg, marginTop: spacing.lg },
  emptyFoot: { flex: 1, justifyContent: 'flex-end', padding: spacing.md + 4, gap: spacing.xs },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.primaryText },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted },
});
