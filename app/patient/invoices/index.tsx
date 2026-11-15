import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { Invoice, InvoiceListEnvelope, InvoiceStatus } from '@/lib/types';
import { formatDate, formatMoney, humanize } from '@/lib/format';
import { balanceOf, invoiceLook, itemsSummary, lastPaymentDate } from '@/lib/invoices';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppHeader } from '@/components/AppHeader';
import { InvoiceStatusPill } from '@/components/InvoiceStatusPill';
import { MessageKey, useT } from '@/lib/i18n';
import { catalogs } from '@/lib/i18n/registry';

type Filter = 'all' | InvoiceStatus;

export default function InvoicesScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const list = usePaginatedList<Invoice, InvoiceListEnvelope>(
    `/api/patients/me/invoices${filter === 'all' ? '' : `?status=${filter}`}`,
    { limit: 20, refreshOn: ['invoices'], offline: true }
  );
  // The summary covers every invoice regardless of the filter; keep the last one seen.
  const [summary, setSummary] = useState<InvoiceListEnvelope['summary']>(undefined);
  const latest = list.extra?.summary;
  useEffect(() => {
    if (latest) setSummary(latest);
  }, [latest]);
  const current = latest ?? summary;

  const balance = current?.outstandingBalance ?? 0;
  const unpaid = current?.unpaidCount ?? 0;
  const owing = !!current && balance > 0;

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: t('invoices.filter.all') },
    { value: 'unpaid', label: t('invoices.filter.unpaid') },
    { value: 'partial', label: t('invoices.filter.partial') },
    { value: 'paid', label: t('invoices.filter.paid') },
  ];

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {t('invoices.title')}
      </Text>
      <Text style={styles.subtitle}>{t('invoices.subtitle')}</Text>

      {/* What the patient owes across every clinic bill: solid navy, the one thing this screen is for. */}
      <View
        style={styles.hero}
        accessible
        accessibilityLabel={
          current
            ? owing
              ? `${t('invoices.outstandingBalance')}: ${formatMoney(balance)}. ${t('invoices.awaitingPayment', { count: unpaid })}`
              : t('invoices.allPaidUp')
            : t('invoices.outstandingBalance')
        }
      >
        <Text style={styles.heroEyebrow}>{t('invoices.outstandingBalance')}</Text>
        <Text style={styles.heroAmount}>{current ? formatMoney(balance) : '—'}</Text>
        {current ? (
          <View style={styles.heroFoot}>
            {owing ? (
              <View style={styles.owingChip}>
                <Ionicons name="alert-circle" size={14} color={colors.warning} />
                <Text style={styles.owingChipText}>{t('invoices.awaitingPayment', { count: unpaid })}</Text>
              </View>
            ) : (
              <View style={styles.doneChip}>
                <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                <Text style={styles.doneChipText}>{t('invoices.allPaidUp')}</Text>
              </View>
            )}
            {owing ? <Text style={styles.heroNote}>{t('invoices.howToPay')}</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {filters.map((f) => {
          const selected = f.value === filter;
          return (
            <TouchableOpacity
              key={f.value}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setFilter(f.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]} numberOfLines={1}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <OfflineBanner offline={list.offline} updatedAt={list.updatedAt} />
      {list.error && list.items.length > 0 && !list.offline ? <Banner message={list.error} /> : null}
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
      <View style={[styles.emptyCard]}>
        <Ionicons name="receipt-outline" size={28} color={colors.primary} />
        <Text style={styles.emptyTitle}>{filter === 'all' ? t('invoices.emptyTitle') : t('invoices.emptyFilteredTitle')}</Text>
        <Text style={styles.emptyText}>{filter === 'all' ? t('invoices.emptyBody') : t('invoices.emptyFilteredBody')}</Text>
        {filter !== 'all' ? (
          <TouchableOpacity style={styles.showAll} onPress={() => setFilter('all')} accessibilityRole="button">
            <Text style={styles.showAllText}>{t('invoices.showAll')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const last = list.items.length - 1;
  return (
    <FlatList
      style={styles.root}
      data={list.items}
      keyExtractor={(item) => item._id}
      renderItem={({ item, index }) => <InvoiceRow invoice={item} first={index === 0} last={index === last} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

/** One row of a single ruled card that runs down the list: the first and last round its corners. */
function InvoiceRow({ invoice, first, last }: { invoice: Invoice; first: boolean; last: boolean }) {
  const t = useT();
  const look = invoiceLook(invoice);
  const balance = balanceOf(invoice);
  const paidOn = lastPaymentDate(invoice);
  const items = itemsSummary(invoice);
  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast]}
      onPress={() => router.push(`/patient/invoices/${invoice._id}`)}
      accessibilityRole="button"
      accessibilityLabel={t('invoices.rowA11y', {
        number: invoice.invoiceNumber ?? '',
        amount: formatMoney(invoice.total),
        // A status this build doesn't know yet is read out as the server's word (like StatusBadge).
        status:
          `invoice.${invoice.status}` in catalogs.common.en
            ? t(`common.invoice.${invoice.status}` as MessageKey & `common.invoice.${string}`)
            : humanize(invoice.status),
      })}
    >
      <View style={[styles.rowInner, !first && styles.rowRule]}>
        <View style={styles.tile}>
          <Ionicons name={look.icon} size={22} color={colors.primaryOnSoft} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {invoice.invoiceNumber ?? t('invoices.invoice')}
          </Text>
          <Text style={styles.rowMeta}>
            {look.label} · {formatDate(invoice.createdAt)}
          </Text>
          {items ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {items}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>{formatMoney(invoice.total)}</Text>
          {balance > 0 ? (
            <Text style={styles.due}>{t('invoices.balanceAmount', { amount: formatMoney(balance) })}</Text>
          ) : invoice.status === 'paid' && paidOn ? (
            <Text style={styles.rowMeta}>{t('invoices.paidOn', { date: formatDate(paidOn, { month: 'short', day: 'numeric' }) })}</Text>
          ) : (
            <InvoiceStatusPill status={invoice.status} />
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
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

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginTop: spacing.lg },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: -0.5,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  heroFoot: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    gap: spacing.sm,
  },
  owingChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  owingChipText: { fontSize: 12, fontWeight: '600', color: colors.warning },
  doneChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.navyLine,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  doneChipText: { fontSize: 12, fontWeight: '600', color: colors.primaryText },
  heroNote: { fontSize: 13, lineHeight: 18, color: colors.onNavyMuted },

  tabs: { flexDirection: 'row', backgroundColor: colors.slateSoft, borderRadius: radius.md, padding: 4, marginTop: spacing.lg },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextSelected: { color: colors.primaryText },

  // Each row draws its own sides; together they read as one card with hairlines between rows.
  row: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  due: { fontSize: 12, fontWeight: '700', color: colors.warning, fontVariant: ['tabular-nums'] },

  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  showAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  showAllText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
