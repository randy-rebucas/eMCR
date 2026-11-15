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
import { Banner, Button, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorState } from '@/components/ErrorState';
import { InvoiceStatusPill } from '@/components/InvoiceStatusPill';
import { t as translate, useT } from '@/lib/i18n';

/**
 * One invoice. When the clinic takes payments online, "Pay online" opens its pay page (the same
 * one staff text to patients) in an in-app browser; otherwise the balance is paid at the desk.
 */
export default function InvoiceDetailScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, offline, stale, updatedAt } = useApiData<InvoiceDetailEnvelope>(
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
      setPayError(errorMessage(err, translate('invoices.payPageFailed')));
      // e.g. paid meanwhile (NOTHING_OWED): show the current state.
      emitRefresh('invoices');
    } finally {
      setPaying(false);
    }
  }, [id, backFromPayPage]);

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data?.data) return <ErrorState message={t('invoices.notFound')} onRetry={refresh} />;

  const invoice = data.data;
  const paid = data.summary?.paid ?? amountPaid(invoice);
  // Same rule as the list (balanceOf): a paid or refunded invoice owes nothing,
  // whatever the payment arithmetic says, so no balance or "pay at the desk" note.
  const settled = invoice.status === 'paid' || invoice.status === 'refunded';
  const balance = settled ? 0 : Math.max(0, data.summary?.balance ?? balanceOf(invoice));
  const look = invoiceLook(invoice);
  // A saved copy: the pay options weren't asked for, and the balance may be out of date.
  const needsServer = offline || stale;
  const canPayOnline = balance > 0 && !needsServer && !!offer?.offered;
  const payNote =
    balance <= 0
      ? null
      : needsServer
        ? t('invoices.payNeedsConnection')
        : offer?.offered
          ? offer.pendingClaim
            ? t('invoices.pendingClaim')
            : offer.recentCheckoutAt || returned
              ? t('invoices.justPaid')
              : null
          : offer?.code === 'BELOW_MINIMUM'
            ? t('invoices.belowMinimum', { minimum: formatMoney(offer.minimum) })
            : t('invoices.payAtDesk');
  const payments = invoice.payments ?? [];
  const items = invoice.items ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <OfflineBanner offline={offline} updatedAt={updatedAt} />

      {/* What's owed on this bill and how to pay it: solid navy. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroTile}>
            <Ionicons name={look.icon} size={20} color={colors.primaryText} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroTitle} selectable>
              {invoice.invoiceNumber ?? t('invoices.invoice')}
            </Text>
            <Text style={styles.heroMeta}>
              {look.label} · {formatDate(invoice.createdAt)}
            </Text>
          </View>
          <InvoiceStatusPill status={invoice.status} />
        </View>

        <Text style={styles.heroLabel}>{balance > 0 ? t('invoices.balanceDue') : t('invoices.total')}</Text>
        <Text style={styles.heroAmount}>{formatMoney(balance > 0 ? balance : invoice.total)}</Text>
        {balance > 0 && paid > 0 ? (
          <Text style={styles.heroMeta}>{t('invoices.paidOfTotal', { paid: formatMoney(paid), total: formatMoney(invoice.total) })}</Text>
        ) : settled && invoice.status === 'paid' ? (
          <Text style={styles.heroMeta}>{t('invoices.paidInFull')}</Text>
        ) : null}

        {payNote || canPayOnline ? (
          <View style={styles.heroFoot}>
            {payNote ? (
              <View style={styles.heroNote}>
                <Ionicons name={offer?.offered && !needsServer ? 'time-outline' : needsServer ? 'cloud-offline-outline' : 'business-outline'} size={16} color={colors.onNavyMuted} />
                <Text style={styles.heroNoteText}>{payNote}</Text>
              </View>
            ) : null}
            {canPayOnline ? (
              <>
                <Button title={t('invoices.payOnline')} icon="card-outline" onPress={payOnline} loading={paying} />
                <Text style={styles.payHint}>
                  {offer?.methods?.includes('online') ? t('invoices.payHintOnline') : t('invoices.payHintManual')}
                </Text>
              </>
            ) : null}
            {payError ? <Banner message={payError} /> : null}
          </View>
        ) : null}
      </View>

      {items.length ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            {t('invoices.items')}
          </Text>
          <View style={styles.card}>
            {items.map((item, index) => (
              <View key={`${item.code ?? ''}-${index}`} style={[styles.line, index > 0 && styles.rule]}>
                <View style={styles.flex}>
                  <Text style={styles.lineName}>{item.description || item.code || t('invoices.item')}</Text>
                  <Text style={styles.meta}>
                    {item.quantity} × {formatMoney(item.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.lineTotal}>{formatMoney(item.total)}</Text>
              </View>
            ))}

            <View style={styles.breakdown}>
              {invoice.subtotal !== undefined ? <Row label={t('invoices.subtotal')} value={formatMoney(invoice.subtotal)} /> : null}
              {invoice.discounts?.map((d, index) => (
                <Row
                  key={`discount-${index}`}
                  label={t('invoices.discount', { reason: d.reason || humanize(d.type) })}
                  value={typeof d.amount === 'number' ? formatMoney(-Math.abs(d.amount)) : formatMoney(d.amount)}
                />
              ))}
              {invoice.tax ? <Row label={t('invoices.tax')} value={formatMoney(invoice.tax)} /> : null}
              <Row label={t('invoices.total')} value={formatMoney(invoice.total)} strong />
              {paid > 0 ? <Row label={t('invoices.paid')} value={formatMoney(-paid)} /> : null}
              {balance > 0 ? <Row label={t('invoices.balance')} value={formatMoney(balance)} strong attention /> : null}
            </View>
          </View>
        </>
      ) : null}

      <Text style={styles.section} accessibilityRole="header">
        {t('invoices.paymentHistory')}
      </Text>
      <View style={styles.card}>
        {payments.length ? (
          payments.map((p, index) => (
            <View key={`payment-${index}`} style={[styles.line, index > 0 && styles.rule]}>
              <PayIcon icon="checkmark" />
              <View style={styles.flex}>
                <Text style={styles.lineName}>{humanize(p.method)}</Text>
                <Text style={styles.meta} selectable>
                  {formatDate(p.date)}
                  {p.receiptNo ? t('invoices.receipt', { number: p.receiptNo }) : ''}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{formatMoney(p.amount)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyPayments}>{t('invoices.noPayments')}</Text>
        )}
      </View>
    </ScrollView>
  );
}

function PayIcon({ icon }: { icon: IconName }) {
  return (
    <View style={styles.payIcon}>
      <Ionicons name={icon} size={16} color={colors.primaryOnSoft} />
    </View>
  );
}

function Row({ label, value, strong, attention }: { label: string; value: string; strong?: boolean; attention?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong, attention && styles.attention]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong, attention && styles.attention]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  flex: { flex: 1 },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  heroTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 16, fontWeight: '700', color: colors.primaryText, fontVariant: ['tabular-nums'] },
  heroMeta: { fontSize: 13, color: colors.onNavyMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onNavyMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
  },
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
    gap: spacing.sm + 2,
  },
  heroNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  heroNoteText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.onNavyMuted },
  payHint: { fontSize: 12, lineHeight: 17, color: colors.onNavyMuted, textAlign: 'center' },

  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineName: { fontSize: 15, color: colors.text, fontWeight: '500' },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  lineTotal: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  breakdown: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  rowLabel: { flexShrink: 1, fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '800', color: colors.text, fontSize: 15 },
  attention: { color: colors.warning },
  payIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPayments: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md },
});
