import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { Appointment, AppointmentStatus } from '@/lib/types';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Button, ChipGroup, ListFooter, LoadingView, PressableCard, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

type Filter = 'all' | AppointmentStatus;

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function AppointmentCard({ item }: { item: Appointment }) {
  return (
    <PressableCard onPress={() => router.push(`/patient/appointments/${item._id}`)}>
      <View style={screenStyles.cardHeader}>
        <Text style={screenStyles.cardTitle}>
          {formatDate(item.appointmentDate ?? item.scheduledAt)}
          {item.appointmentTime ? ` · ${formatTime(item.appointmentTime)}` : ''}
        </Text>
        <StatusBadge status={item.status} />
      </View>
      {doctorName(item.doctor) ? (
        <Text style={screenStyles.cardLine}>
          {doctorName(item.doctor)}
          {item.doctor?.specialization ? ` · ${item.doctor.specialization}` : ''}
        </Text>
      ) : null}
      {item.reason ? <Text style={screenStyles.cardMeta}>{item.reason}</Text> : null}
    </PressableCard>
  );
}

export default function AppointmentsScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const list = usePaginatedList<Appointment>(
    `/api/patients/me/appointments${filter === 'all' ? '' : `?status=${filter}`}`,
    { limit: 20, refreshOn: ['appointments'] }
  );

  const header = (
    <View style={{ marginBottom: spacing.md }}>
      <Button title="Book an appointment" onPress={() => router.push('/patient/appointments/book')} />
      <View style={{ height: spacing.md }} />
      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} wrap />
    </View>
  );

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      {list.loading && list.items.length === 0 ? (
        <>
          <View style={{ padding: spacing.md }}>{header}</View>
          <LoadingView />
        </>
      ) : list.error && list.items.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <AppointmentCard item={item} />}
          contentContainerStyle={screenStyles.list}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />
          }
          ListEmptyComponent={
            <EmptyState message={filter === 'all' ? 'No appointments yet.' : 'No appointments with this status.'} />
          }
        />
      )}
    </SafeAreaView>
  );
}
