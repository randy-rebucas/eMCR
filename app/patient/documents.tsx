import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { openDocument } from '@/lib/documents';
import { errorMessage } from '@/lib/api';
import { PatientDocument } from '@/lib/types';
import { formatDate, formatFileSize, humanize } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Banner, ListFooter, LoadingView, PressableCard, screenStyles } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

export default function DocumentsScreen() {
  const list = usePaginatedList<PatientDocument>('/api/patients/me/documents', { limit: 20, refreshOn: ['documents'] });
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

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

  if (list.loading && list.items.length === 0) return <LoadingView />;
  if (list.error && list.items.length === 0) return <ErrorState message={list.error} onRetry={list.reload} />;

  return (
    <FlatList
      style={screenStyles.container}
      data={list.items}
      keyExtractor={(item) => item._id}
      ListHeaderComponent={openError ? <Banner message={openError} /> : null}
      renderItem={({ item }) => (
        <PressableCard onPress={() => open(item)} accessibilityLabel={`Open ${item.title}`}>
          <View style={screenStyles.cardHeader}>
            <Text style={screenStyles.cardTitle}>{item.title}</Text>
            {openingId === item._id ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
          {item.description ? <Text style={screenStyles.cardLine}>{item.description}</Text> : null}
          <Text style={screenStyles.cardMeta}>
            {[humanize(item.category), formatDate(item.uploadDate), formatFileSize(item.size)].filter(Boolean).join(' · ')}
          </Text>
        </PressableCard>
      )}
      contentContainerStyle={screenStyles.list}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      ListEmptyComponent={<EmptyState message="No documents yet." />}
    />
  );
}
