import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { openInvoicePayPage, payLinkPath, type PayOnlineOffer } from '@/lib/invoicePay';
import { InvoiceDetailEnvelope } from '@/lib/types';
import { formatDate, formatMoney, humanize } from '@/lib/format';
import { amountPaid, balanceOf, invoiceLook } from '@/lib/invoices';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, LoadingView, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorState } from '@/components/ErrorState';
import { InvoiceStatusPill } from '@/components/InvoiceStatusPill';
import { softShadow } from '@/components/AppHeader';

/**
 * One invoice. When the clinic takes payments online, "Pay online" opens its pay page (the same
 * one staff text to patients) in an in-app browser; otherwise the balance is paid at the desk.
 */
export default function InvoiceDetailScreen() {
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<InvoiceDetailEnvelope>(
    id ? `/api/patients/me/invoices/${encodeURIComponent(id)}` : null,
    { envelope: true, refreshOn: ['invoices'], offline: true }
  );
  // Fails (e.g. an older server) → treated as not offered: the front-desk note stays.
  const { data: offer } = useApiData<PayOnlineOffer>(id ? payLinkPath(id) : null, { refreshOn: ['invoices'] });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  /** Came back from the pay page this visit: the payment may not have reached the clinic yet. */
  const [returned, setReturned] = useState(false);
  const awaitingReturn = useRef(false);

  const backFromPayPage = useCallback(() => {
    awaitingReturn.current = false;
    setReturned(true);
    // Refetches this invoice, its pay options and the invoice list.
    emitRefresh('invoices');
  }, []);

  // Android hands back control as soon as the browser opens; the app returning to the
  // foreground is when the patient is done with the pay page.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && awaitingReturn.current) backFromPayPage();
    });
    return () => subscription.remove();
  }, [backFromPayPage]);

  const payOnline = useCallback(async () => {
    if (!id) return;
    setPaying(true);
    setPayError(null);
    try {
      awaitingReturn.current = true;
      const result = await openInvoicePayPage(id);
      // iOS resolves when the browser closes.
      if (result.type !== 'opened') backFromPayPage();
    } catch (err) {
      awaitingReturn.current = false;
      setPayError(errorMessage(err, 'The payment page couldn’t be opened. Please try again.'));
      // e.g. paid meanwhile (NOTHING_OWED): show the current state.
      emitRefresh('invoices');
    } finally {
      setPaying(false);
    }
  }, [id, backFromPayPage]);

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data?.data) return <ErrorState message="Invoice not found." onRetry={refresh} />;

  const invoice = data.data;
  const paid = data.summary?.paid ?? amountPaid(invoice);
  // Same rule as the list (balanceOf): a paid or refunded invoice owes nothing,
  // whatever the payment arithmetic says, so no balance or "pay at the desk" note.
  const settled = invoice.status === 'paid' || invoice.status === 'refunded';
  const balance = settled ? 0 : Math.max(0, data.summary?.balance ?? balanceOf(invoice));
  const look = invoiceLook(invoice);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <OfflineBanner offline={offline} updatedAt={updatedAt} />
      {/* Header */}
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.tile, { backgroundColor: look.bg }]}>
            <Ionicons name={look.icon} size={26} color={look.fg} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>{invoice.invoiceNumber ?? 'Invoice'}</Text>
            <Text style={styles.meta}>
              {look.label} · {formatDate(invoice.createdAt)}
            </Text>
          </View>
          <InvoiceStatusPill status={invoice.status} />
        </View>
        <View style={styles.totals}>
          <Total label="Total" value={formatMoney(invoice.total)} />
          <Total label="Paid" value={formatMoney(paid)} />
          <Total label="Balance" value={formatMoney(balance)} tone={balance > 0 ? 'danger' : 'default'} />
        </View>
      </View>

      {balance > 0 && offer?.offered ? (
        <View style={styles.payOnline}>
          {offer.pendingClaim ? (
            <PayNote
              icon="time-outline"
              inline
              text="You sent a payment for the clinic to check. The balance updates once they confirm it, so you don’t need to pay again."
            />
          ) : offer.recentCheckoutAt || returned ? (
            <PayNote
              icon="time-outline"
              inline
              text="If you just paid, it can take a few minutes to show here. Pull down to refresh, and check before paying again."
            />
          ) : null}
          <Button title="Pay online" icon="card-outline" onPress={payOnline} loading={paying} />
          <Text style={styles.payHint}>
            {offer.methods.includes('online')
              ? 'Opens the clinic’s secure payment page.'
              : 'Opens the clinic’s payment page: pay by QR code or bank transfer, then send your reference number. The clinic confirms it before the balance updates.'}
          </Text>
          {payError ? <Banner message={payError} /> : null}
        </View>
      ) : balance > 0 ? (
        <PayNote
          icon="business-outline"
          text={
            offer?.code === 'BELOW_MINIMUM'
              ? `Online payments start at ${formatMoney(offer.minimum)}. Pay the balance at the clinic's front desk.`
              : "Pay the balance at the clinic's front desk."
          }
        />
      ) : null}

      {/* Items */}
      {invoice.items?.length ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            Items
          </Text>
          <View style={styles.card}>
            {invoice.items.map((item, index) => (
              <View
                key={`${item.code ?? ''}-${index}`}
                style={[styles.line, index < invoice.items!.length - 1 && styles.divider]}
              >
                <View style={styles.flex}>
                  <Text style={styles.lineName}>{item.description || item.code || 'Item'}</Text>
                  <Text style={styles.meta}>
                    {item.quantity} × {formatMoney(item.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.lineTotal}>{formatMoney(item.total)}</Text>
              </View>
            ))}

            <View style={styles.breakdown}>
              {invoice.subtotal !== undefined ? <Row label="Subtotal" value={formatMoney(invoice.subtotal)} /> : null}
              {invoice.discounts?.map((d, index) => (
                <Row
                  key={`discount-${index}`}
                  label={`Discount (${d.reason || humanize(d.type)})`}
                  value={typeof d.amount === 'number' ? formatMoney(-Math.abs(d.amount)) : formatMoney(d.amount)}
                />
              ))}
              {invoice.tax ? <Row label="Tax" value={formatMoney(invoice.tax)} /> : null}
              <Row label="Total" value={formatMoney(invoice.total)} strong />
            </View>
          </View>
        </>
      ) : null}

      {/* Payments */}
      <Text style={styles.section} accessibilityRole="header">
        Payment History
      </Text>
      <View style={styles.card}>
        {invoice.payments?.length ? (
          invoice.payments.map((p, index) => (
            <View key={`payment-${index}`} style={[styles.line, index < invoice.payments!.length - 1 && styles.divider]}>
              <View style={styles.payIcon}>
                <Ionicons name="checkmark" size={16} color="#1F7A4A" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.lineName}>{humanize(p.method)}</Text>
                <Text style={styles.meta}>
                  {formatDate(p.date)}
                  {p.receiptNo ? ` · Receipt ${p.receiptNo}` : ''}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{formatMoney(p.amount)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyPayments}>No payments recorded yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function PayNote({ icon, text, inline }: { icon: 'time-outline' | 'business-outline'; text: string; inline?: boolean }) {
  return (
    <View style={[styles.payNote, inline && styles.payNoteInline]}>
      <Ionicons name={icon} size={18} color={colors.slate} />
      <Text style={styles.payNoteText}>{text}</Text>
    </View>
  );
}

function Total({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, tone === 'danger' && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    ...softShadow,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  totals: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.md,
  },
  total: { flex: 1, alignItems: 'center' },
  totalLabel: { fontSize: 12, color: colors.textMuted },
  totalValue: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  payNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.sm + 2,
  },
  payNoteText: { flex: 1, fontSize: 13, color: colors.slate },
  payNoteInline: { marginTop: 0 },
  payOnline: { gap: spacing.sm, marginTop: spacing.sm + 2 },
  payHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 2 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineName: { fontSize: 15, color: colors.text, fontWeight: '500' },
  lineTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  breakdown: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.text },
  strong: { fontWeight: '800', color: colors.text, fontSize: 15 },
  payIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCF5E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPayments: { fontSize: 14, color: colors.textMuted },
});
