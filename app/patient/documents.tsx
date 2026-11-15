import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { openDocument } from '@/lib/documents';
import { errorMessage, Pagination } from '@/lib/api';
import { PatientDocument } from '@/lib/types';
import { formatDate, formatFileSize, humanize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName, ListFooter, SearchMoreHint, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PlainKey, t as translate, useT } from '@/lib/i18n';

type Category = 'all' | 'laboratory_result' | 'medical_certificate' | 'referral' | 'imaging' | 'prescription' | 'other';

const CATEGORIES: { value: Category; label: PlainKey; icon: IconName }[] = [
  { value: 'all', label: 'documents.tab.all', icon: 'documents-outline' },
  { value: 'laboratory_result', label: 'documents.tab.laboratory_result', icon: 'flask-outline' },
  { value: 'medical_certificate', label: 'documents.tab.medical_certificate', icon: 'ribbon-outline' },
  { value: 'referral', label: 'documents.tab.referral', icon: 'arrow-redo-outline' },
  { value: 'imaging', label: 'documents.tab.imaging', icon: 'image-outline' },
  { value: 'prescription', label: 'documents.tab.prescription', icon: 'medical-outline' },
  { value: 'other', label: 'documents.tab.other', icon: 'ellipsis-horizontal' },
];

const CATEGORY_LABEL: Record<string, PlainKey> = {
  laboratory_result: 'documents.cat.laboratory_result',
  medical_certificate: 'documents.cat.medical_certificate',
  referral: 'documents.cat.referral',
  imaging: 'documents.cat.imaging',
  prescription: 'documents.cat.prescription',
  invoice: 'documents.cat.invoice',
  insurance: 'documents.cat.insurance',
  id: 'documents.cat.id',
  other: 'documents.cat.other',
};

const CATEGORY_ICON: Record<string, IconName> = {
  laboratory_result: 'flask-outline',
  medical_certificate: 'ribbon-outline',
  referral: 'arrow-redo-outline',
  imaging: 'image-outline',
  prescription: 'medical-outline',
  invoice: 'receipt-outline',
  insurance: 'shield-checkmark-outline',
  id: 'card-outline',
};

function categoryLabel(category: string | undefined): string {
  const key = CATEGORY_LABEL[category ?? ''];
  return key ? translate(key) : category ? humanize(category) : translate('documents.document');
}

function fileIcon(type: PatientDocument['documentType']): IconName {
  if (type === 'image') return 'image-outline';
  if (type === 'excel') return 'grid-outline';
  return 'document-text-outline';
}

function fileKind(doc: PatientDocument): string | null {
  if (doc.documentType === 'pdf') return 'PDF';
  if (doc.documentType === 'image') return translate('documents.image');
  if (doc.documentType === 'word') return 'Word';
  if (doc.documentType === 'excel') return 'Excel';
  const ext = /\.([a-z0-9]{2,5})$/i.exec(doc.filename ?? '');
  return ext ? ext[1].toUpperCase() : null;
}

export default function DocumentsScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const list = usePaginatedList<PatientDocument, { pagination?: Pagination }>(
    `/api/patients/me/documents${category === 'all' ? '' : `?category=${category}`}`,
    { limit: 20, refreshOn: ['documents'], offline: true }
  );
  const [openingId, setOpeningId] = useState<string | null>(null);
  // Shown on the row that failed, not at the top of the list where it may be off screen.
  const [openError, setOpenError] = useState<{ id: string; message: string } | null>(null);
  // Files download from the server: a saved list can be read, not opened.
  const needsServer = list.offline || list.stale;

  const total = list.extra?.pagination?.total;
  const q = search.trim().toLowerCase();
  const items = useMemo(
    () =>
      q
        ? list.items.filter((d) =>
            [d.title, d.description, d.filename, formatDate(d.uploadDate), categoryLabel(d.category)]
              .join(' ')
              .toLowerCase()
              .includes(q)
          )
        : list.items,
    [list.items, q]
  );

  async function open(doc: PatientDocument) {
    if (openingId) return;
    setOpeningId(doc._id);
    setOpenError(null);
    try {
      await openDocument(doc);
    } catch (err) {
      setOpenError({ id: doc._id, message: errorMessage(err, t('documents.openFailed')) });
    } finally {
      setOpeningId(null);
    }
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {t('documents.title')}
      </Text>
      <Text style={styles.subtitle}>{t('documents.subtitle')}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chips}
        accessibilityRole="tablist"
      >
        {CATEGORIES.map((c) => {
          const selected = c.value === category;
          return (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setCategory(c.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Ionicons name={c.icon} size={16} color={selected ? colors.primaryText : colors.primary} />
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {t(c.label)}
                {selected && total !== undefined && !list.loading ? ` · ${total}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('documents.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={t('documents.searchA11y')}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={13} accessibilityRole="button" accessibilityLabel={t('documents.clearSearch')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {list.offline ? (
        <View style={styles.banner}>
          <OfflineBanner offline={list.offline} updatedAt={list.updatedAt} subject={t('documents.offlineSubject')} />
          <Text style={styles.offlineNote}>{t('documents.openNeedsConnection')}</Text>
        </View>
      ) : list.error && list.items.length > 0 ? (
        <Banner message={list.error} />
      ) : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading) {
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
          <Ionicons name="folder-open-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{q ? t('documents.noMatches') : t('documents.empty')}</Text>
        <Text style={styles.emptyText}>
          {q ? t('documents.tryDifferent') : t('documents.emptyText')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={(item) => item._id}
      renderItem={({ item, index }) => (
        <DocumentRow
          doc={item}
          opening={openingId === item._id}
          error={openError?.id === item._id ? openError.message : null}
          disabled={needsServer}
          first={index === 0}
          last={index === items.length - 1}
          onPress={() => open(item)}
        />
      )}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={empty}
      ListFooterComponent={
        <>
          <ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />
          {/* The search runs on the loaded pages only (the API has no search parameter). */}
          {q && list.hasMore && !list.loading && !list.loadingMore && !list.loadMoreError ? (
            <SearchMoreHint onLoadMore={list.loadMore} />
          ) : null}
        </>
      }
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

/** One file as a row of the list's ruled card: title, then kind · type · size · date. */
function DocumentRow({
  doc,
  opening,
  error,
  disabled,
  first,
  last,
  onPress,
}: {
  doc: PatientDocument;
  opening: boolean;
  error: string | null;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const label = categoryLabel(doc.category);
  const meta = [label, fileKind(doc), formatFileSize(doc.size), formatDate(doc.uploadDate)].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !first && styles.rowDivider]}
      onPress={onPress}
      disabled={opening || disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || opening, busy: opening }}
      accessibilityLabel={t('documents.openA11y', { title: doc.title, category: label })}
    >
      <View style={styles.rowMain}>
        <View style={styles.tile}>
          <Ionicons name={CATEGORY_ICON[doc.category ?? ''] ?? fileIcon(doc.documentType)} size={22} color={colors.primaryOnSoft} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {doc.title}
          </Text>
          <Text style={styles.rowMeta}>{meta}</Text>
          {doc.description ? (
            <Text style={styles.rowMeta} numberOfLines={2}>
              {doc.description}
            </Text>
          ) : null}
        </View>
        {opening ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Ionicons name="open-outline" size={18} color={disabled ? colors.border : colors.textMuted} />
        )}
      </View>
      {error ? (
        <Text style={styles.rowError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
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
  chipRow: { marginTop: spacing.lg, marginHorizontal: -(spacing.md + 4) },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md + 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  chipTextSelected: { color: colors.primaryText },
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
  banner: { marginTop: spacing.md, gap: spacing.xs },
  offlineNote: { fontSize: 13, color: colors.textMuted },
  // Rows draw one ruled card: outer border on every row, corners on the ends.
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    borderRadius: 1,
    minHeight: 64,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  tile: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  rowError: { fontSize: 13, color: colors.danger, marginTop: spacing.sm },
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
