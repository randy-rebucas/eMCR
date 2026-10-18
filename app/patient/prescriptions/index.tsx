import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { Prescription } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { colors } from '@/lib/theme';
import { ListFooter, LoadingView, PressableCard, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

function PrescriptionCard({ item }: { item: Prescription }) {
  const names = item.medications?.map((m) => m.name).filter(Boolean) ?? [];
  return (
    <PressableCard onPress={() => router.push(`/patient/prescriptions/${item._id}`)}>
      <View style={screenStyles.cardHeader}>
        <Text style={screenStyles.cardTitle}>{formatDate(item.issuedAt ?? item.createdAt)}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={screenStyles.cardLine} numberOfLines={2}>
        {names.length ? names.join(', ') : 'No medications listed'}
      </Text>
      {item.prescriptionCode ? <Text style={screenStyles.cardMeta}>Ref: {item.prescriptionCode}</Text> : null}
    </PressableCard>
  );
}

export default function PrescriptionsScreen() {
  const list = usePaginatedList<Prescription>('/api/patients/me/prescriptions', {
    limit: 20,
    refreshOn: ['prescriptions'],
  });

  if (list.loading && list.items.length === 0) return <LoadingView />;
  if (list.error && list.items.length === 0) return <ErrorState message={list.error} onRetry={list.reload} />;

  return (
    <FlatList
      style={screenStyles.container}
      data={list.items}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => <PrescriptionCard item={item} />}
      contentContainerStyle={screenStyles.list}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      ListEmptyComponent={<EmptyState message="No prescriptions yet." />}
    />
  );
}
