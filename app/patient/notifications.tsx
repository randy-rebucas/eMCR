import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { useUnread } from '@/lib/unread';
import { NotificationScreen, NotificationsEnvelope, PatientNotification } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';

const DETAIL_ROUTES: Partial<Record<NotificationScreen, string>> = {
  appointments: '/patient/appointments',
  'lab-results': '/patient/results',
  invoices: '/patient/invoices',
  prescriptions: '/patient/prescriptions',
};

type Filter = 'all' | 'unread' | PatientNotification['type'];

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'lab_result', label: 'Results' },
  { value: 'invoice', label: 'Billing' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'message', label: 'Messages' },
];

const TYPE_STYLE: Record<PatientNotification['type'], { icon: IconName; bg: string; fg: string }> = {
  appointment: { icon: 'calendar-outline', bg: '#E3F6F5', fg: '#0A7F7E' },
  lab_result: { icon: 'flask-outline', bg: '#E3F5EC', fg: '#1F7A4A' },
  invoice: { icon: 'receipt-outline', bg: '#E6EEFB', fg: '#2F5FB3' },
  prescription: { icon: 'bandage-outline', bg: '#EEEAFB', fg: '#5B47B0' },
  message: { icon: 'chatbubble-ellipses-outline', bg: '#FDF1E3', fg: '#9A5B13' },
};

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function groupLabel(date: string): string {
  const day = startOfDay(new Date(date));
  const today = startOfDay(new Date());
  const DAY = 24 * 60 * 60 * 1000;
  if (day >= today) return 'Today';
  if (day >= today - DAY) return 'Yesterday';
  if (day >= today - 6 * DAY) return 'This Week';
  return 'Earlier';
}

function timeLabel(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const group = groupLabel(date);
  return group === 'Today' || group === 'Yesterday'
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationsScreen() {
  const bottomPad = useBottomPadding();
  const [filter, setFilter] = useState<Filter>('all');
  const { unreadCount, setUnreadCount } = useUnread();
  // "Unread" is filtered by the server; categories are filtered here from the full feed.
  const list = usePaginatedList<PatientNotification, NotificationsEnvelope>(
    `/api/patients/me/notifications${filter === 'unread' ? '?unreadOnly=true' : ''}`,
    { limit: 20, refreshOn: ['notifications'] }
  );
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const count = list.extra?.unreadCount ?? unreadCount;
  const visible = useMemo(
    () => (filter === 'all' || filter === 'unread' ? list.items : list.items.filter((n) => n.type === filter)),
    [list.items, filter]
  );

  // A category can be sparse in the first page; keep fetching until something shows or the feed ends.
  useEffect(() => {
    if (!list.loading && !list.loadingMore && !list.loadMoreError && list.hasMore && visible.length < 6) {
      list.loadMore();
    }
  }, [visible.length, list.loading, list.loadingMore, list.loadMoreError, list.hasMore, list.loadMore]);

  const sections = useMemo(() => {
    const groups = new Map<string, PatientNotification[]>();
    for (const n of visible) {
      const label = groupLabel(n.date);
      groups.set(label, [...(groups.get(label) ?? []), n]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [visible]);

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
    const base = item.target?.screen ? DETAIL_ROUTES[item.target.screen] : undefined;
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
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Notifications
          </Text>
          <Text style={styles.subtitle}>Updates on your appointments, results and more.</Text>
        </View>
        {count > 0 ? (
          <TouchableOpacity
            style={styles.markAll}
            onPress={markAllRead}
            disabled={markingAll}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
          >
            {markingAll ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={18} color={colors.primaryOnSoft} />
                <Text style={styles.markAllText}>Mark all read</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => {
          const selected = f.value === filter;
          return (
            <TouchableOpacity
              key={f.value}
              style={[styles.filter, selected && styles.filterSelected]}
              onPress={() => setFilter(f.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{f.label}</Text>
              {f.value === 'unread' && count > 0 ? (
                <View style={[styles.countBadge, selected && styles.countBadgeSelected]}>
                  <Text style={[styles.countText, selected && styles.countTextSelected]}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {actionError ? <Banner message={actionError} /> : null}
      {list.error && list.items.length > 0 ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading || (list.hasMore && !list.loadMoreError)) {
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
          <Ionicons name="notifications-off-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{filter === 'unread' ? "You're all caught up" : 'No notifications'}</Text>
        <Text style={styles.emptyText}>
          {filter === 'unread' ? 'New updates from your clinic will show up here.' : 'Nothing here from the last 90 days.'}
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      style={styles.root}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <Text style={styles.groupTitle} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      renderItem={({ item, index, section }) => (
        <NotificationRow
          item={item}
          first={index === 0}
          last={index === section.data.length - 1}
          onPress={() => openNotification(item)}
        />
      )}
      ListEmptyComponent={empty}
      ListFooterComponent={
        <>
          <ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />
          <TouchableOpacity
            style={styles.settings}
            onPress={() => Linking.openSettings()}
            accessibilityRole="link"
            accessibilityLabel="Notification settings, opens your phone's settings"
          >
            <View style={styles.settingsIcon}>
              <Ionicons name="settings-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Notification Settings</Text>
              <Text style={styles.rowMessage}>Turn alerts on or off in your phone's settings</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </>
      }
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

function NotificationRow({
  item,
  first,
  last,
  onPress,
}: {
  item: PatientNotification;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const t = TYPE_STYLE[item.type] ?? TYPE_STYLE.appointment;
  // A message is read in place: its whole text shows and there is nowhere to go.
  const isMessage = item.type === 'message';
  const from = isMessage && typeof item.metadata?.from === 'string' ? item.metadata.from : null;
  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !last && styles.rowDivider]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.message}`}
    >
      <View style={styles.dotSlot}>{!item.read ? <View style={styles.dot} /> : null}</View>
      <View style={[styles.icon, { backgroundColor: t.bg }]}>
        <Ionicons name={t.icon} size={22} color={t.fg} />
      </View>
      <View style={styles.flex}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowTitle, styles.flex, !item.read && styles.rowTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.time}>{timeLabel(item.date)}</Text>
        </View>
        {from ? <Text style={styles.time}>From {from}</Text> : null}
        <Text style={styles.rowMessage} numberOfLines={isMessage ? undefined : 3}>
          {item.message}
        </Text>
      </View>
      {isMessage ? null : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  loading: { marginVertical: spacing.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  markAllText: { fontSize: 13, fontWeight: '700', color: colors.primaryOnSoft },
  filters: { gap: spacing.sm, paddingVertical: spacing.lg, paddingRight: spacing.md },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#E4EEF0',
  },
  filterSelected: { backgroundColor: colors.primary },
  filterText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  filterTextSelected: { color: colors.primaryText },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSelected: { backgroundColor: colors.surface },
  countText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  countTextSelected: { color: colors.primary },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#EAF0F2',
    paddingVertical: spacing.sm + 6,
    paddingRight: spacing.sm + 4,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, marginBottom: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dotSlot: { width: 14, alignItems: 'flex-end' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5484D' },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowTitleUnread: { fontWeight: '800' },
  rowMessage: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 12, color: colors.textMuted },
  settings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    marginTop: spacing.md,
    ...softShadow,
  },
  settingsIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
