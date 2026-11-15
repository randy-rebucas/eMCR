import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { clinicTodayYmd, clinicYmd, formatDate, formatTime } from '@/lib/format';
import { Banner, IconName, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorView, SkeletonCards } from '@/components/StateView';
import { PlainKey, useT } from '@/lib/i18n';

/** Where each kind opens: its detail with an id, else its list (never a dead tap). */
const ROUTES: Partial<Record<NotificationScreen, { list: string; detail: string }>> = {
  appointments: { list: '/patient/appointments', detail: '/patient/appointments' },
  'lab-results': { list: '/patient/results', detail: '/patient/results' },
  invoices: { list: '/patient/invoices', detail: '/patient/invoices' },
  prescriptions: { list: '/patient/prescriptions', detail: '/patient/prescriptions' },
};

/** Where tapping this notification goes, or null when it is read in place (clinic messages). */
function hrefFor(item: PatientNotification): string | null {
  if (item.type === 'message') return null;
  const route = item.target?.screen ? ROUTES[item.target.screen] : undefined;
  if (!route) return null;
  return item.target.id ? `${route.detail}/${item.target.id}` : route.list;
}

type Filter = 'all' | 'unread' | PatientNotification['type'];

const FILTERS: { value: Filter; label: PlainKey }[] = [
  { value: 'all', label: 'notifications.filter.all' },
  { value: 'unread', label: 'notifications.filter.unread' },
  { value: 'appointment', label: 'notifications.filter.appointment' },
  { value: 'lab_result', label: 'notifications.filter.lab_result' },
  { value: 'invoice', label: 'notifications.filter.invoice' },
  { value: 'prescription', label: 'notifications.filter.prescription' },
  { value: 'message', label: 'notifications.filter.message' },
];

/**
 * The icon tells the kinds apart; colour doesn't have to. Teal tiles for clinic updates, slate for
 * a message from a person at the clinic.
 */
const TYPE_ICON: Record<PatientNotification['type'], IconName> = {
  appointment: 'calendar-outline',
  lab_result: 'flask-outline',
  invoice: 'receipt-outline',
  prescription: 'bandage-outline',
  message: 'chatbubble-ellipses-outline',
};

/** Days since the epoch of a YYYY-MM-DD calendar date (for whole-day differences). */
function dayNumber(ymd: string): number {
  return Math.round(Date.parse(`${ymd}T00:00:00Z`) / (24 * 60 * 60 * 1000));
}

type Group = 'today' | 'yesterday' | 'week' | 'earlier';

const GROUP_LABEL: Record<Group, PlainKey> = {
  today: 'notifications.group.today',
  yesterday: 'notifications.group.yesterday',
  week: 'notifications.group.week',
  earlier: 'notifications.group.earlier',
};

/** Today / Yesterday / … by the clinic's calendar (Asia/Manila), not the phone's timezone. */
function groupLabel(date: string): Group {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'earlier';
  const ago = dayNumber(clinicTodayYmd()) - dayNumber(clinicYmd(d));
  if (ago <= 0) return 'today';
  if (ago === 1) return 'yesterday';
  if (ago <= 6) return 'week';
  return 'earlier';
}

/** Clinic-time "2:30 PM" for today and yesterday, otherwise "Oct 18" in the app language. */
function timeLabel(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const group = groupLabel(date);
  return group === 'today' || group === 'yesterday' ? formatTime(d) : formatDate(d, { month: 'short', day: 'numeric' });
}

export default function NotificationsScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const [filter, setFilter] = useState<Filter>('all');
  const { unreadCount, setUnreadCount } = useUnread();
  // "Unread" is filtered by the server; categories are filtered here from the full feed.
  const list = usePaginatedList<PatientNotification, NotificationsEnvelope>(
    `/api/patients/me/notifications${filter === 'unread' ? '?unreadOnly=true' : ''}`,
    { limit: 20, refreshOn: ['notifications'], offline: true }
  );
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const count = list.extra?.unreadCount ?? unreadCount;
  const visible = useMemo(
    () => (filter === 'all' || filter === 'unread' ? list.items : list.items.filter((n) => n.type === filter)),
    [list.items, filter]
  );
  const newest = list.items[0] ?? null;
  // Marking read needs the server: not from a saved copy.
  const cached = list.offline || list.stale;

  // A category can be sparse in the first page; keep fetching until something shows or the feed ends.
  useEffect(() => {
    if (!list.loading && !list.loadingMore && !list.loadMoreError && list.hasMore && visible.length < 6) {
      list.loadMore();
    }
  }, [visible.length, list.loading, list.loadingMore, list.loadMoreError, list.hasMore, list.loadMore]);

  const sections = useMemo(() => {
    const groups = new Map<Group, PatientNotification[]>();
    for (const n of visible) {
      const label = groupLabel(n.date);
      groups.set(label, [...(groups.get(label) ?? []), n]);
    }
    return [...groups.entries()].map(([group, data]) => ({ title: t(GROUP_LABEL[group]), data }));
  }, [visible, t]);

  function markLocallyRead(ids: string[] | 'all') {
    list.setItems((items) =>
      filter === 'unread'
        ? items.filter((n) => ids !== 'all' && !ids.includes(n.id))
        : items.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n))
    );
  }

  function openNotification(item: PatientNotification) {
    if (!item.read && !cached) {
      markLocallyRead([item.id]);
      setUnreadCount(Math.max(0, count - 1));
      apiRequest('/api/patients/me/notifications', { method: 'PATCH', body: { ids: [item.id] } })
        .then(() => emitRefresh('notifications'))
        .catch(() => {
          // Read state is cosmetic; the next refresh shows the server's view.
        });
    }
    const href = hrefFor(item);
    if (href) router.push(href);
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
      setActionError(errorMessage(err, t('notifications.markAllFailed')));
    } finally {
      setMarkingAll(false);
    }
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {t('notifications.title')}
      </Text>
      <Text style={styles.subtitle}>{t('notifications.subtitle')}</Text>

      {list.offline ? (
        <View style={styles.banner}>
          <OfflineBanner offline={list.offline} updatedAt={list.updatedAt} subject={t('notifications.offlineSubject')} />
        </View>
      ) : null}

      {/* What's new at a glance, and the one action on it. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.heroCount}>
              {count > 0 ? t('notifications.hero.unread', { count }) : t('notifications.hero.caughtUp')}
            </Text>
            {newest ? (
              <Text style={styles.heroMeta}>{t('notifications.hero.latest', { when: timeLabel(newest.date) })}</Text>
            ) : null}
          </View>
          <Ionicons name={count > 0 ? 'notifications' : 'checkmark-done'} size={26} color={count > 0 ? colors.accent : colors.onNavyMuted} />
        </View>
        <View style={styles.heroActions}>
          {count > 0 ? (
            <TouchableOpacity
              style={[styles.heroButton, styles.heroButtonPrimary, cached && styles.heroButtonOff]}
              onPress={markAllRead}
              disabled={markingAll || cached}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.markAllA11y')}
              accessibilityState={{ busy: markingAll, disabled: markingAll || cached }}
            >
              {markingAll ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color={colors.primaryText} />
                  <Text style={styles.heroButtonText}>{t('notifications.markAll')}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.heroButton, styles.heroButtonGhost]}
            onPress={() => router.push('/patient/notification-settings')}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.settingsA11y')}
          >
            <Ionicons name="settings-outline" size={18} color={colors.primaryText} />
            <Text style={styles.heroButtonText}>{t('notifications.hero.settings')}</Text>
          </TouchableOpacity>
        </View>
        {actionError ? (
          <View style={styles.heroError}>
            <Banner message={actionError} />
          </View>
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
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{t(f.label)}</Text>
              {f.value === 'unread' && count > 0 ? (
                <View style={[styles.countBadge, selected && styles.countBadgeSelected]}>
                  <Text style={[styles.countText, selected && styles.countTextSelected]}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {list.error && list.items.length > 0 && !list.offline ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading) {
    empty = <SkeletonCards />;
  } else if (list.hasMore && !list.loadMoreError) {
    // A filter with no matches yet while older pages are still coming in.
    empty = <ActivityIndicator color={colors.primary} style={styles.loading} />;
  } else if (list.error && list.items.length === 0) {
    empty = <ErrorView message={list.error} onRetry={list.reload} />;
  } else {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>
          {filter === 'unread'
            ? t('notifications.caughtUpTitle')
            : filter === 'all'
              ? t('notifications.noneTitle')
              : t('notifications.noneOfKind')}
        </Text>
        <Text style={styles.emptyText}>
          {filter === 'unread' ? t('notifications.caughtUpText') : filter === 'all' ? t('notifications.noneText') : ''}
        </Text>
        {filter !== 'all' ? (
          <TouchableOpacity onPress={() => setFilter('all')} style={styles.showAll} accessibilityRole="button">
            <Text style={styles.showAllText}>{t('notifications.showAll')}</Text>
          </TouchableOpacity>
        ) : null}
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
        <NotificationRow item={item} first={index === 0} last={index === section.data.length - 1} onPress={() => openNotification(item)} />
      )}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
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
  const t = useT();
  // A message is read in place: its whole text shows and there is nowhere to go.
  const isMessage = item.type === 'message';
  const goes = hrefFor(item) !== null;
  const from = isMessage && typeof item.metadata?.from === 'string' ? item.metadata.from : null;
  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !first && styles.rowDivider]}
      onPress={onPress}
      // Nothing to open and already read: the row is just text.
      disabled={!goes && item.read}
      accessibilityRole={goes ? 'button' : 'text'}
      accessibilityLabel={
        item.read
          ? t('notifications.rowA11y', { title: item.title, message: item.message })
          : t('notifications.rowA11yUnread', { title: item.title, message: item.message })
      }
    >
      <View style={styles.dotSlot}>{!item.read ? <View style={styles.dot} /> : null}</View>
      <View style={[styles.icon, isMessage ? styles.iconMessage : styles.iconUpdate]}>
        <Ionicons name={TYPE_ICON[item.type] ?? 'notifications-outline'} size={20} color={isMessage ? colors.slate : colors.primaryOnSoft} />
      </View>
      <View style={styles.flex}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowTitle, styles.flex, !item.read && styles.rowTitleUnread]} numberOfLines={isMessage ? undefined : 1}>
            {item.title}
          </Text>
          <Text style={styles.time}>{timeLabel(item.date)}</Text>
        </View>
        {from ? <Text style={styles.from}>{t('notifications.from', { name: from })}</Text> : null}
        <Text style={styles.rowMessage} numberOfLines={isMessage ? undefined : 3}>
          {item.message}
        </Text>
      </View>
      {goes ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  loading: { marginVertical: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  banner: { marginTop: spacing.md },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginTop: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroCount: { fontSize: 22, fontWeight: '800', color: colors.primaryText, fontVariant: ['tabular-nums'] },
  heroMeta: { fontSize: 14, color: colors.onNavyMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  heroButton: {
    flexGrow: 1,
    flexBasis: 128,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  heroButtonPrimary: { backgroundColor: colors.primary },
  heroButtonGhost: { borderWidth: 1, borderColor: colors.navyLine },
  heroButtonOff: { opacity: 0.5 },
  heroButtonText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },
  heroError: { marginTop: spacing.sm },

  filters: { gap: spacing.sm, paddingVertical: spacing.lg, paddingRight: spacing.md },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  filterTextSelected: { color: colors.primaryText },
  // Teal, as on More and the header bell: "something here for you", not an error.
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSelected: { backgroundColor: colors.surface },
  countText: { fontSize: 12, fontWeight: '700', color: colors.primaryText, fontVariant: ['tabular-nums'] },
  countTextSelected: { color: colors.primary },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm },

  // Rows of one ruled card per day group: the first and last round its corners.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 6,
    paddingRight: spacing.sm + 4,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, marginBottom: spacing.md },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dotSlot: { width: 14, alignItems: 'flex-end' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconUpdate: { backgroundColor: colors.primarySoft },
  iconMessage: { backgroundColor: colors.slateSoft },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowTitleUnread: { fontWeight: '800' },
  rowMessage: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  from: { fontSize: 12, color: colors.slate, fontWeight: '600', marginTop: 2 },

  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  showAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  showAllText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
