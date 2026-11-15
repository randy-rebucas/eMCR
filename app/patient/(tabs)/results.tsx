import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { openDocument } from '@/lib/documents';
import { errorMessage } from '@/lib/api';
import { isReady, ResultSummary, summarize } from '@/lib/labResults';
import { LabResult, PatientDocument } from '@/lib/types';
import { formatDate, formatFileSize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName, ListFooter, SearchMoreHint } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ResultStatusPill } from '@/components/ResultStatusPill';
import { photos, ScrimPhoto } from '@/components/Photo';
import { PlainKey, useT } from '@/lib/i18n';

type Segment = 'lab' | 'imaging' | 'reports';
type LabFilter = 'all' | 'ready' | 'processing';

const SEGMENTS: { value: Segment; label: PlainKey; icon: IconName }[] = [
  { value: 'lab', label: 'results.segment.lab', icon: 'flask-outline' },
  { value: 'imaging', label: 'results.segment.imaging', icon: 'image-outline' },
  { value: 'reports', label: 'results.segment.reports', icon: 'document-text-outline' },
];

const LAB_FILTERS: { value: LabFilter; label: PlainKey }[] = [
  { value: 'all', label: 'results.filter.all' },
  { value: 'ready', label: 'results.filter.ready' },
  { value: 'processing', label: 'results.filter.processing' },
];

// Imaging studies and uploaded lab reports are clinic documents, filtered by category.
const DOC_CATEGORY: Record<Exclude<Segment, 'lab'>, string> = {
  imaging: 'imaging',
  reports: 'laboratory_result',
};

export default function ResultsScreen() {
  const t = useT();
  const [segment, setSegment] = useState<Segment>('lab');
  const [visited, setVisited] = useState<Set<Segment>>(() => new Set(['lab']));
  const [search, setSearch] = useState('');
  const [labFilter, setLabFilter] = useState<LabFilter>('all');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Each tab loads the first time it's opened, then stays loaded.
  const labs = usePaginatedList<LabResult>('/api/patients/me/lab-results', {
    limit: 20,
    refreshOn: ['lab-results'],
    offline: true,
  });
  const imaging = usePaginatedList<PatientDocument>(
    visited.has('imaging') ? `/api/patients/me/documents?category=${DOC_CATEGORY.imaging}` : null,
    { limit: 20, refreshOn: ['documents'] }
  );
  const reports = usePaginatedList<PatientDocument>(
    visited.has('reports') ? `/api/patients/me/documents?category=${DOC_CATEGORY.reports}` : null,
    { limit: 20, refreshOn: ['documents'] }
  );

  const q = search.trim().toLowerCase();

  const labItems = useMemo(
    () =>
      labs.items.filter((r) => {
        if (labFilter === 'ready' && !isReady(r.status)) return false;
        if (labFilter === 'processing' && (isReady(r.status) || r.status === 'cancelled')) return false;
        if (!q) return true;
        const haystack = [
          r.request?.testType,
          r.requestCode,
          formatDate(r.resultDate ?? r.orderDate ?? r.createdAt),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }),
    [labs.items, labFilter, q]
  );

  const labCounts = useMemo(() => {
    let ready = 0;
    let processing = 0;
    for (const r of labs.items) {
      if (isReady(r.status)) ready++;
      else if (r.status !== 'cancelled') processing++;
    }
    return { all: labs.items.length, ready, processing };
  }, [labs.items]);

  const docList = segment === 'imaging' ? imaging : reports;
  const docItems = useMemo(
    () =>
      docList.items.filter((d) =>
        !q ? true : [d.title, d.description, formatDate(d.uploadDate)].join(' ').toLowerCase().includes(q)
      ),
    [docList.items, q]
  );

  function choose(next: Segment) {
    setSegment(next);
    setOpenError(null);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  async function open(doc: PatientDocument) {
    if (openingId) return;
    setOpeningId(doc._id);
    setOpenError(null);
    try {
      await openDocument(doc);
    } catch (err) {
      setOpenError(errorMessage(err, t('results.openFailed')));
    } finally {
      setOpeningId(null);
    }
  }

  const active = segment === 'lab' ? labs : docList;

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader />
      <Text style={styles.title} accessibilityRole="header">
        {t('results.title')}
      </Text>
      <Text style={styles.subtitle}>{t('results.subtitle')}</Text>

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
              <Ionicons name={s.icon} size={18} color={selected ? colors.primaryText : colors.textMuted} />
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{t(s.label)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={segment === 'lab' ? t('results.search.lab') : t('results.search.docs')}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={t('results.search.a11y')}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={13} accessibilityRole="button" accessibilityLabel={t('results.search.clear')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {segment === 'lab' ? (
        <View style={styles.filters}>
          {LAB_FILTERS.map((f) => {
            const selected = f.value === labFilter;
            return (
              <TouchableOpacity
                key={f.value}
                style={[styles.filter, selected && styles.filterSelected]}
                onPress={() => setLabFilter(f.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {t(f.label)}
                  {labCounts[f.value] > 0 ? <Text style={styles.filterCount}>{'  ' + labCounts[f.value]}</Text> : null}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {openError ? <Banner message={openError} /> : null}
      <OfflineBanner offline={active.offline} updatedAt={active.updatedAt} />
      {active.error && active.items.length > 0 && !active.offline ? <Banner message={active.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (active.loading) {
    empty = <ActivityIndicator color={colors.primary} style={styles.loading} />;
  } else if (active.error && active.items.length === 0) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{active.error}</Text>
        <Button title={t('common.tryAgainTitle')} variant="secondary" onPress={active.reload} style={styles.stretch} />
      </View>
    );
  } else {
    const filtered = q || (segment === 'lab' && labFilter !== 'all');
    empty = !filtered && segment === 'lab' ? (
      <ScrimPhoto source={photos.labTubes} style={styles.emptyPhoto} top={0.35} bottom={0.97}>
        <View style={styles.emptyPhotoInner}>
          <Text style={styles.emptyPhotoTitle} accessibilityRole="header">
            {t('results.empty.labTitle')}
          </Text>
          <Text style={styles.emptyPhotoText}>{t('results.empty.lab')}</Text>
        </View>
      </ScrimPhoto>
    ) : (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name={SEGMENTS.find((s) => s.value === segment)!.icon} size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{filtered ? t('results.empty.noMatches') : t('results.empty.nothing')}</Text>
        <Text style={styles.emptyText}>
          {filtered
            ? t('results.empty.tryDifferent')
            : segment === 'lab'
              ? t('results.empty.lab')
              : segment === 'imaging'
                ? t('results.empty.imaging')
                : t('results.empty.reports')}
        </Text>
      </View>
    );
  }

  // Search and the lab filter run on the loaded pages only (the API has no search parameter).
  const narrowing = !!q || (segment === 'lab' && labFilter !== 'all');
  const footer = (
    <>
      <ListFooter loadingMore={active.loadingMore} error={active.loadMoreError} onRetry={active.loadMore} />
      {narrowing && active.hasMore && !active.loading && !active.loadingMore && !active.loadMoreError ? (
        <SearchMoreHint onLoadMore={active.loadMore} />
      ) : null}
    </>
  );
  const refreshControl = (
    <RefreshControl refreshing={active.refreshing} onRefresh={active.refresh} tintColor={colors.primary} />
  );

  if (segment === 'lab') {
    return (
      <FlatList
        style={styles.root}
        data={labItems}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <LabRow item={item} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.headerSpacing}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={refreshControl}
        onEndReached={labs.loadMore}
        onEndReachedThreshold={0.4}
      />
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={docItems}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => (
        <DocRow item={item} imaging={segment === 'imaging'} opening={openingId === item._id} onPress={() => open(item)} />
      )}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      refreshControl={refreshControl}
      onEndReached={docList.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

function LabRow({ item }: { item: LabResult }) {
  const t = useT();
  const ready = isReady(item.status);
  const summary = ready ? summarize(item) : null;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/patient/results/${item._id}`)}
      accessibilityRole="button"
    >
      <View style={styles.tile}>
        <Ionicons name="flask-outline" size={24} color={colors.primaryOnSoft} />
      </View>
      <View style={styles.flex}>
        <View style={styles.rowHead}>
          <Text style={[styles.rowTitle, styles.flex]} numberOfLines={2}>
            {item.request?.testType ?? t('results.labTest')}
          </Text>
          <ResultStatusPill status={item.status} />
        </View>
        <Text style={styles.rowMeta}>
          {formatDate(item.resultDate ?? item.orderDate ?? item.createdAt)}
          {item.requestCode ? ` · ${t('results.ref', { code: item.requestCode })}` : ''}
        </Text>
        {summary && summary.total > 0 ? (
          <RangeSummary summary={summary} />
        ) : !ready && item.status !== 'cancelled' ? (
          <View style={styles.pendingLine}>
            <Ionicons name="hourglass-outline" size={14} color={colors.textMuted} />
            <Text style={styles.rowMeta}>{t('results.pending')}</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

/**
 * How a ready result reads at a glance: a thin bar, one segment per group of values (in range
 * teal, outside range amber, no range a neutral gap), and the same counts in words underneath.
 * The words carry the meaning; the bar is hidden from screen readers in favour of one sentence.
 */
function RangeSummary({ summary }: { summary: ResultSummary }) {
  const t = useT();
  const outside = summary.outOfRange;
  const unrated = summary.unrated;
  const inRange = summary.total - outside - unrated;
  const parts = [
    { n: inRange, color: colors.accent },
    { n: outside, color: colors.warning },
    { n: unrated, color: colors.slateSoft },
  ].filter((p) => p.n > 0);
  return (
    <View
      style={styles.range}
      accessible
      accessibilityLabel={t('results.range.a11y', { inRange, outside, unrated })}
    >
      <View style={styles.rangeBar}>
        {parts.map((p, i) => (
          <View key={i} style={[styles.rangePart, { flex: p.n, backgroundColor: p.color }]} />
        ))}
      </View>
      <View style={styles.rangeWords}>
        {outside > 0 ? (
          <>
            <Ionicons name="alert-circle" size={14} color={colors.warning} />
            <Text style={styles.rangeOut}>{t('results.range.someOut', { count: outside, total: summary.total })}</Text>
          </>
        ) : inRange > 0 ? (
          <>
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
            <Text style={styles.rangeIn}>{t('results.range.allIn', { count: inRange })}</Text>
          </>
        ) : null}
        {unrated > 0 ? <Text style={styles.rowMeta}>{(outside > 0 || inRange > 0 ? '· ' : '') + t('results.range.unrated', { count: unrated })}</Text> : null}
      </View>
    </View>
  );
}

function DocRow({
  item,
  imaging,
  opening,
  onPress,
}: {
  item: PatientDocument;
  imaging: boolean;
  opening: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={t('results.openDoc', { title: item.title })}>
      <View style={[styles.tile, imaging && styles.tileImaging]}>
        <Ionicons
          name={imaging ? 'scan-outline' : 'document-text-outline'}
          size={24}
          color={imaging ? colors.slate : colors.primaryOnSoft}
        />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rowMeta}>
          {[formatDate(item.uploadDate), formatFileSize(item.size)].filter(Boolean).join(' · ')}
        </Text>
        {item.description ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
      </View>
      {opening ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons name="open-outline" size={20} color={colors.textMuted} />
      )}
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
  segments: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.slateSoft,
    paddingHorizontal: spacing.xs,
  },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextSelected: { color: colors.primaryText },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 2,
    minHeight: 46,
    marginTop: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm + 4 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  filterSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  filterTextSelected: { color: colors.primaryOnSoft },
  filterCount: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 6,
    marginBottom: spacing.sm + 2,
    ...softShadow,
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImaging: { backgroundColor: colors.slateSoft },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  pendingLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  range: { marginTop: spacing.sm },
  // A 2px surface gap between segments; rounded ends on the bar as a whole.
  rangeBar: { flexDirection: 'row', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden' },
  rangePart: { height: 6 },
  rangeWords: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: spacing.xs + 2 },
  rangeIn: { fontSize: 13, fontWeight: '600', color: colors.primaryOnSoft, fontVariant: ['tabular-nums'] },
  rangeOut: { fontSize: 13, fontWeight: '600', color: colors.warning, fontVariant: ['tabular-nums'] },
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
  emptyPhoto: { minHeight: 280, borderRadius: radius.lg },
  emptyPhotoInner: { flex: 1, justifyContent: 'flex-end', padding: spacing.md + 4 },
  emptyPhotoTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  emptyPhotoText: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted, marginTop: spacing.xs },
});
