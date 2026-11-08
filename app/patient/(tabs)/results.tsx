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
import { isReady, summarize } from '@/lib/labResults';
import { LabResult, PatientDocument } from '@/lib/types';
import { formatDate, formatFileSize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName, ListFooter, SearchMoreHint } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ResultStatusPill } from '@/components/ResultStatusPill';
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
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{t(f.label)}</Text>
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
    empty = (
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
  const flagged = summary?.outOfRange ?? 0;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/patient/results/${item._id}`)}
      accessibilityRole="button"
    >
      <View style={styles.tile}>
        <Ionicons name="flask-outline" size={24} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.request?.testType ?? t('results.labTest')}
        </Text>
        <Text style={styles.rowMeta}>{formatDate(item.resultDate ?? item.orderDate ?? item.createdAt)}</Text>
        {flagged > 0 ? (
          <Text style={styles.rowFlag}>
            {t('results.outsideRange', { count: flagged })}
          </Text>
        ) : item.requestCode ? (
          <Text style={styles.rowMeta}>{t('results.ref', { code: item.requestCode })}</Text>
        ) : null}
      </View>
      <ResultStatusPill status={item.status} />
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
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
          color={imaging ? '#2F5FB3' : colors.primary}
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
    backgroundColor: '#E4EEF0',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
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
  tileImaging: { backgroundColor: '#E6EEFB' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowFlag: { fontSize: 13, color: colors.danger, fontWeight: '600', marginTop: 2 },
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
