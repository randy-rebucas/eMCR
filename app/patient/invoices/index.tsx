import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { Invoice, InvoiceListEnvelope, InvoiceStatus } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Card, ChipGroup, ListFooter, LoadingView, PressableCard, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

type Filter = 'all' | InvoiceStatus;

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Partial', value: 'partial' },
  { label: 'Paid', value: 'paid' },
];

function InvoiceCard({ item }: { item: Invoice }) {
  return (
    <PressableCard onPress={() => router.push(`/patient/invoices/${item._id}`)}>
      <View style={screenStyles.cardHeader}>
        <Text style={screenStyles.cardTitle}>{item.invoiceNumber ? `Invoice #${item.invoiceNumber}` : 'Invoice'}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={screenStyles.cardLine}>{formatMoney(item.total)}</Text>
      <Text style={screenStyles.cardMeta}>{formatDate(item.createdAt)}</Text>
    </PressableCard>
  );
}

export default function InvoicesScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const list = usePaginatedList<Invoice, InvoiceListEnvelope>(
    `/api/patients/me/invoices${filter === 'all' ? '' : `?status=${filter}`}`,
    { limit: 20, refreshOn: ['invoices'] }
  );

  const summary = list.extra?.summary;

  const header = (
    <View>
      <Card style={styles.summary}>
        <Text style={screenStyles.muted}>Outstanding balance</Text>
        <Text style={styles.balance}>{summary ? formatMoney(summary.outstandingBalance) : '—'}</Text>
        {summary && summary.unpaidCount > 0 ? (
          <Text style={screenStyles.cardMeta}>
            {summary.unpaidCount} unpaid invoice{summary.unpaidCount === 1 ? '' : 's'}
          </Text>
        ) : null}
        <Text style={styles.payNote}>Pay at the clinic. Online payment isn't available in the app.</Text>
      </Card>
      <View style={{ marginVertical: spacing.md }}>
        <ChipGroup options={FILTERS} value={filter} onChange={setFilter} wrap />
      </View>
    </View>
  );

  if (list.loading && list.items.length === 0) return <LoadingView />;
  if (list.error && list.items.length === 0) return <ErrorState message={list.error} onRetry={list.reload} />;

  return (
    <FlatList
      style={screenStyles.container}
      data={list.items}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => <InvoiceCard item={item} />}
      contentContainerStyle={screenStyles.list}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      ListEmptyComponent={<EmptyState message={filter === 'all' ? 'No invoices yet.' : 'No invoices with this status.'} />}
    />
  );
}

const styles = StyleSheet.create({
  summary: { marginBottom: 0 },
  balance: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  payNote: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
});
