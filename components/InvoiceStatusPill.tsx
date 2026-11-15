import { StyleSheet, Text, View } from 'react-native';
import { InvoiceStatus } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';
import { PlainKey, useT } from '@/lib/i18n';

/**
 * Owing is amber (it needs the patient), paid is teal, refunded is neutral. Red is kept for
 * destructive actions, and a bill isn't one.
 */
const TONES: Record<InvoiceStatus, { label: PlainKey; bg: string; fg: string }> = {
  unpaid: { label: 'common.invoice.unpaid', bg: colors.warningSoft, fg: colors.warning },
  partial: { label: 'common.invoice.partial', bg: colors.warningSoft, fg: colors.warning },
  paid: { label: 'common.invoice.paid', bg: colors.primarySoft, fg: colors.primaryOnSoft },
  refunded: { label: 'common.invoice.refunded', bg: colors.slateSoft, fg: colors.slate },
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const t = useT();
  const tone = TONES[status] ?? TONES.unpaid;
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{t(tone.label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});
