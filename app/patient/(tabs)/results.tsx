import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { LabResult } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { colors } from '@/lib/theme';
import { ListFooter, LoadingView, PressableCard, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

function ResultCard({ item }: { item: LabResult }) {
  return (
    <PressableCard onPress={() => router.push(`/patient/results/${item._id}`)}>
      <View style={screenStyles.cardHeader}>
        <Text style={screenStyles.cardTitle}>{item.request?.testType ?? 'Lab test'}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={screenStyles.cardMeta}>{formatDate(item.resultDate ?? item.orderDate ?? item.createdAt)}</Text>
      {item.requestCode ? <Text style={screenStyles.cardMeta}>Ref: {item.requestCode}</Text> : null}
    </PressableCard>
  );
}

export default function ResultsScreen() {
  const list = usePaginatedList<LabResult>('/api/patients/me/lab-results', { limit: 20, refreshOn: ['lab-results'] });

  if (list.loading && list.items.length === 0) return <LoadingView />;

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      {list.error && list.items.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <ResultCard item={item} />}
          contentContainerStyle={screenStyles.list}
          refreshControl={
            <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />
          }
          ListEmptyComponent={<EmptyState message="No lab results yet." />}
        />
      )}
    </SafeAreaView>
  );
}
