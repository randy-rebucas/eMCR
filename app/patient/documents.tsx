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
import { Banner, Button, IconName, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';

type Category = 'all' | 'laboratory_result' | 'medical_certificate' | 'referral' | 'imaging' | 'prescription' | 'other';

const CATEGORIES: { value: Category; label: string; icon: IconName }[] = [
  { value: 'all', label: 'All', icon: 'documents-outline' },
  { value: 'laboratory_result', label: 'Lab Results', icon: 'flask-outline' },
  { value: 'medical_certificate', label: 'Certificates', icon: 'ribbon-outline' },
  { value: 'referral', label: 'Referrals', icon: 'arrow-redo-outline' },
  { value: 'imaging', label: 'Imaging', icon: 'image-outline' },
  { value: 'prescription', label: 'Prescriptions', icon: 'medical-outline' },
  { value: 'other', label: 'Others', icon: 'ellipsis-horizontal' },
];

const CATEGORY_LOOK: Record<string, { label: string; bg: string; fg: string }> = {
  laboratory_result: { label: 'Lab Result', bg: '#E3F5EC', fg: '#1F7A4A' },
  medical_certificate: { label: 'Certificate', bg: '#E3F6F5', fg: '#0A7F7E' },
  referral: { label: 'Referral', bg: '#FDF1DC', fg: '#A15C00' },
  imaging: { label: 'Imaging', bg: '#EEEAFB', fg: '#5B47B0' },
  prescription: { label: 'Prescription', bg: '#E6EEFB', fg: '#2F5FB3' },
  invoice: { label: 'Invoice', bg: '#E6EEFB', fg: '#2F5FB3' },
  insurance: { label: 'Insurance', bg: '#E3F6F5', fg: '#0A7F7E' },
  id: { label: 'ID', bg: colors.slateSoft, fg: colors.slate },
  other: { label: 'Other', bg: colors.slateSoft, fg: colors.slate },
};

function fileIcon(type: PatientDocument['documentType']): IconName {
  if (type === 'image') return 'image-outline';
  if (type === 'excel') return 'grid-outline';
  return 'document-text-outline';
}

function fileKind(doc: PatientDocument): string | null {
  if (doc.documentType === 'pdf') return 'PDF';
  if (doc.documentType === 'image') return 'Image';
  if (doc.documentType === 'word') return 'Word';
  if (doc.documentType === 'excel') return 'Excel';
  const ext = /\.([a-z0-9]{2,5})$/i.exec(doc.filename ?? '');
  return ext ? ext[1].toUpperCase() : null;
}

export default function DocumentsScreen() {
  const bottomPad = useBottomPadding();
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const list = usePaginatedList<PatientDocument, { pagination?: Pagination }>(
    `/api/patients/me/documents${category === 'all' ? '' : `?category=${category}`}`,
    { limit: 20, refreshOn: ['documents'] }
  );
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const total = list.extra?.pagination?.total;
  const q = search.trim().toLowerCase();
  const items = useMemo(
    () =>
      q
        ? list.items.filter((d) =>
            [d.title, d.description, d.filename, formatDate(d.uploadDate), CATEGORY_LOOK[d.category ?? '']?.label]
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
      setOpenError(errorMessage(err, "Couldn't open the document."));
    } finally {
      setOpeningId(null);
    }
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        Documents
      </Text>
      <Text style={styles.subtitle}>Certificates, referrals, reports and other files from your clinic.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {CATEGORIES.map((c) => {
          const selected = c.value === category;
          return (
            <TouchableOpacity
              key={c.value}
              style={[styles.category, selected && styles.categorySelected]}
              onPress={() => setCategory(c.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Ionicons name={c.icon} size={20} color={selected ? colors.primaryText : colors.primary} />
              <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                {c.label}
                {selected && total !== undefined && !list.loading ? ` (${total})` : ''}
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
          placeholder="Search documents…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search documents"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={13} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {openError ? <Banner message={openError} /> : null}
      {list.error && list.items.length > 0 ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading) {
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
          <Ionicons name="folder-open-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{q ? 'No matches' : 'No documents yet'}</Text>
        <Text style={styles.emptyText}>
          {q ? 'Try a different search.' : 'Files your clinic shares with you will show up here.'}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => <DocumentRow doc={item} opening={openingId === item._id} onPress={() => open(item)} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
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

function DocumentRow({ doc, opening, onPress }: { doc: PatientDocument; opening: boolean; onPress: () => void }) {
  const look = CATEGORY_LOOK[doc.category ?? ''] ?? {
    label: doc.category ? humanize(doc.category) : 'Document',
    bg: colors.slateSoft,
    fg: colors.slate,
  };
  const kind = fileKind(doc);
  const fileMeta = [kind, formatFileSize(doc.size)].filter(Boolean).join(' • ');
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={opening}
      accessibilityRole="button"
      accessibilityLabel={`Open ${doc.title}, ${look.label}`}
    >
      <View style={[styles.tile, { backgroundColor: look.bg }]}>
        <Ionicons name={fileIcon(doc.documentType)} size={26} color={look.fg} />
        {doc.documentType === 'pdf' ? (
          <View style={[styles.pdfTag, { backgroundColor: look.fg }]}>
            <Text style={styles.pdfTagText}>PDF</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {doc.title}
        </Text>
        <Text style={styles.rowMeta}>{formatDate(doc.uploadDate)}</Text>
        {doc.description ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {doc.description}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <View style={[styles.pill, { backgroundColor: look.bg }]}>
          <Text style={[styles.pillText, { color: look.fg }]}>{look.label}</Text>
        </View>
        {fileMeta ? <Text style={styles.fileMeta}>{fileMeta}</Text> : null}
      </View>
      {opening ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons name="open-outline" size={18} color={colors.textMuted} />
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
  categories: { gap: spacing.sm, paddingTop: spacing.lg, paddingRight: spacing.md },
  category: {
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: '#E4EEF0',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
  },
  categorySelected: { backgroundColor: colors.primary },
  categoryText: { fontSize: 12, fontWeight: '600', color: colors.text },
  categoryTextSelected: { color: colors.primaryText },
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
  tile: { width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pdfTag: { position: 'absolute', bottom: 6, right: 4, borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 },
  pdfTagText: { fontSize: 8, fontWeight: '800', color: '#FFFFFF' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: 110 },
  pill: { borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  fileMeta: { fontSize: 12, color: colors.textMuted },
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
