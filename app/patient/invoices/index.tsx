import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { Invoice, InvoiceListEnvelope, InvoiceStatus } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import { balanceOf, invoiceLook, itemsSummary, lastPaymentDate } from '@/lib/invoices';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { InvoiceStatusPill } from '@/components/InvoiceStatusPill';

type Filter = 'all' | InvoiceStatus;

export default function InvoicesScreen() {
  const bottomPad = useBottomPadding();
  const [filter, setFilter] = useState<Filter>('all');
  const list = usePaginatedList<Invoice, InvoiceListEnvelope>(
    `/api/patients/me/invoices${filter === 'all' ? '' : `?status=${filter}`}`,
    { limit: 20, refreshOn: ['invoices'] }
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

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'partial', label: 'Partial' },
    { value: 'paid', label: 'Paid' },
  ];

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        Billing
      </Text>
      <Text style={styles.subtitle}>Your bills, balance and payment history.</Text>

      <View style={styles.balanceCard}>
        <View style={styles.wallet}>
          <Ionicons name="wallet-outline" size={32} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.balanceLabel}>Outstanding Balance</Text>
          <Text style={[styles.balance, balance === 0 && styles.balanceClear]}>
            {current ? formatMoney(balance) : '—'}
          </Text>
          <Text style={styles.balanceMeta}>
            {!current
              ? ' '
              : unpaid > 0
                ? `${unpaid} invoice${unpaid === 1 ? '' : 's'} awaiting payment`
                : "You're all paid up"}
          </Text>
        </View>
      </View>
      {balance > 0 ? (
        <View style={styles.payNote}>
          <Ionicons name="business-outline" size={18} color={colors.slate} />
          <Text style={styles.payNoteText}>
            Pay at the clinic's front desk. Online payment isn't available in the app yet.
          </Text>
        </View>
      ) : null}

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
          <Ionicons name="receipt-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{filter === 'all' ? 'No invoices yet' : 'Nothing here'}</Text>
        <Text style={styles.emptyText}>
          {filter === 'all' ? 'Bills from your clinic visits will show up here.' : 'No invoices with this status.'}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={list.items}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => <InvoiceRow invoice={item} />}
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

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const look = invoiceLook(invoice);
  const balance = balanceOf(invoice);
  const paidOn = lastPaymentDate(invoice);
  const items = itemsSummary(invoice);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/patient/invoices/${invoice._id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.invoiceNumber ?? ''}, ${formatMoney(invoice.total)}, ${invoice.status}`}
    >
      <View style={[styles.tile, { backgroundColor: look.bg }]}>
        <Ionicons name={look.icon} size={24} color={look.fg} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {invoice.invoiceNumber ?? 'Invoice'}
        </Text>
        <Text style={styles.rowSub}>{look.label}</Text>
        <Text style={styles.rowMeta}>{formatDate(invoice.createdAt)}</Text>
        {items ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {items}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>{formatMoney(invoice.total)}</Text>
        <InvoiceStatusPill status={invoice.status} />
        {invoice.status === 'paid' && paidOn ? (
          <Text style={styles.rowMeta}>Paid {formatDate(paidOn)}</Text>
        ) : balance > 0 ? (
          <Text style={styles.due}>Balance {formatMoney(balance)}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md + 2,
    marginTop: spacing.lg,
    ...softShadow,
  },
  wallet: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  balance: { fontSize: 30, fontWeight: '800', color: colors.primary, letterSpacing: -0.5, marginTop: 2 },
  balanceClear: { color: colors.text },
  balanceMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  payNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.sm + 2,
  },
  payNoteText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.slate },
  tabs: { flexDirection: 'row', backgroundColor: '#E4EEF0', borderRadius: radius.md, padding: 4, marginTop: spacing.lg },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextSelected: { color: colors.primaryText },
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
  tile: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  rowSub: { fontSize: 13, color: colors.text, marginTop: 2 },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 6 },
  amount: { fontSize: 16, fontWeight: '800', color: colors.primary },
  due: { fontSize: 12, fontWeight: '600', color: colors.danger },
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
