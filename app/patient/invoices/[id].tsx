import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApiData } from '@/lib/useApiData';
import { InvoiceDetailEnvelope } from '@/lib/types';
import { formatDate, formatMoney, humanize } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Banner, Card, DetailRow, LoadingView, SectionTitle, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';

/** View only: patients can't pay from the app (the payment flow is staff-side). */
export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh } = useApiData<InvoiceDetailEnvelope>(
    id ? `/api/patients/me/invoices/${encodeURIComponent(id)}` : null,
    { envelope: true, refreshOn: ['invoices'] }
  );

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data?.data) return <ErrorState message="Invoice not found." onRetry={refresh} />;

  const invoice = data.data;
  const { paid, balance } = data.summary ?? { paid: 0, balance: 0 };

  return (
    <ScrollView
      style={screenStyles.container}
      contentContainerStyle={screenStyles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      {balance > 0 ? (
        <Banner message={`Balance due: ${formatMoney(balance)}. Pay at the clinic.`} tone="warning" />
      ) : null}

      <Card>
        <View style={screenStyles.cardHeader}>
          <Text style={screenStyles.title}>
            {invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : 'Invoice'}
          </Text>
          <StatusBadge status={invoice.status} />
        </View>
        <Text style={screenStyles.cardMeta}>{formatDate(invoice.createdAt)}</Text>
      </Card>

      {invoice.items?.length ? (
        <>
          <SectionTitle>Items</SectionTitle>
          <Card>
            {invoice.items.map((item, index) => (
              <View key={`${item.code ?? ''}-${index}`} style={styles.item}>
                <View style={styles.flex}>
                  <Text style={styles.itemName}>{item.description || item.code || 'Item'}</Text>
                  <Text style={screenStyles.cardMeta}>
                    {item.quantity} × {formatMoney(item.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>{formatMoney(item.total)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Summary</SectionTitle>
      <Card>
        <DetailRow label="Subtotal" value={invoice.subtotal !== undefined ? formatMoney(invoice.subtotal) : null} />
        {invoice.discounts?.map((d, index) => (
          <DetailRow
            key={`discount-${index}`}
            label={`Discount (${d.reason || humanize(d.type)})`}
            value={`−${formatMoney(d.amount)}`}
          />
        ))}
        <DetailRow label="Tax" value={invoice.tax ? formatMoney(invoice.tax) : null} />
        <DetailRow label="Total" value={formatMoney(invoice.total)} />
        <DetailRow label="Paid" value={formatMoney(paid)} />
        <DetailRow label="Balance" value={formatMoney(balance)} />
      </Card>

      {invoice.payments?.length ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <Card>
            {invoice.payments.map((p, index) => (
              <DetailRow
                key={`payment-${index}`}
                label={`${formatDate(p.date)} · ${humanize(p.method)}`}
                value={formatMoney(p.amount)}
              />
            ))}
          </Card>
        </>
      ) : null}

      <Text style={[screenStyles.muted, { marginTop: spacing.md }]}>
        Payments are made at the clinic. Online payment isn't available in the app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemName: { fontSize: 15, color: colors.text },
  itemTotal: { fontSize: 15, fontWeight: '600', color: colors.text },
});
