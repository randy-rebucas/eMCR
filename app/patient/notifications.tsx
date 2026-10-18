import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { apiRequest, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { useUnread } from '@/lib/unread';
import { NotificationScreen, NotificationsEnvelope, PatientNotification } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button, ChipGroup, ListFooter, LoadingView, PressableCard, screenStyles } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

const DETAIL_ROUTES: Record<NotificationScreen, string> = {
  appointments: '/patient/appointments',
  'lab-results': '/patient/results',
  invoices: '/patient/invoices',
  prescriptions: '/patient/prescriptions',
};

type Filter = 'all' | 'unread';

export default function NotificationsScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const { unreadCount, setUnreadCount } = useUnread();
  const list = usePaginatedList<PatientNotification, NotificationsEnvelope>(
    `/api/patients/me/notifications${filter === 'unread' ? '?unreadOnly=true' : ''}`,
    { limit: 20, refreshOn: ['notifications'] }
  );
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const count = list.extra?.unreadCount ?? unreadCount;

  function markLocallyRead(ids: string[] | 'all') {
    list.setItems((items) =>
      filter === 'unread'
        ? items.filter((n) => ids !== 'all' && !ids.includes(n.id))
        : items.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n))
    );
  }

  function openNotification(item: PatientNotification) {
    if (!item.read) {
      markLocallyRead([item.id]);
      setUnreadCount(Math.max(0, count - 1));
      apiRequest('/api/patients/me/notifications', { method: 'PATCH', body: { ids: [item.id] } })
        .then(() => emitRefresh('notifications'))
        .catch(() => {
          // Read state is cosmetic; the next refresh shows the server's view.
        });
    }
    const base = DETAIL_ROUTES[item.target?.screen];
    if (base && item.target.id) router.push(`${base}/${item.target.id}`);
  }

  async function markAllRead() {
    setMarkingAll(true);
    setActionError(null);
    try {
      await apiRequest('/api/patients/me/notifications', { method: 'PATCH', body: { markAllRead: true } });
      markLocallyRead('all');
      setUnreadCount(0);
      emitRefresh('notifications');
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't mark notifications as read."));
    } finally {
      setMarkingAll(false);
    }
  }

  const header = (
    <View style={styles.header}>
      {actionError ? <Banner message={actionError} /> : null}
      <ChipGroup
        options={[
          { label: 'All', value: 'all' },
          { label: count ? `Unread (${count})` : 'Unread', value: 'unread' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {count > 0 ? (
        <Button title="Mark all as read" variant="secondary" onPress={markAllRead} loading={markingAll} />
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      {list.loading && list.items.length === 0 ? (
        <LoadingView />
      ) : list.error && list.items.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <FlatList
          style={screenStyles.container}
          data={list.items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <PressableCard onPress={() => openNotification(item)} style={!item.read ? styles.unread : undefined}>
              <View style={screenStyles.cardHeader}>
                <Text style={[screenStyles.cardTitle, !item.read && styles.unreadTitle]}>{item.title}</Text>
                {!item.read ? <View style={styles.dot} accessibilityLabel="Unread" /> : null}
              </View>
              <Text style={screenStyles.cardLine}>{item.message}</Text>
              <Text style={screenStyles.cardMeta}>{formatDateTime(item.date)}</Text>
            </PressableCard>
          )}
          contentContainerStyle={screenStyles.list}
          refreshControl={
            <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />
          }
          ListEmptyComponent={
            <EmptyState message={filter === 'unread' ? "You're all caught up." : 'No notifications in the last 90 days.'} />
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.md, gap: spacing.xs },
  unread: { borderColor: colors.primary },
  unreadTitle: { fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
