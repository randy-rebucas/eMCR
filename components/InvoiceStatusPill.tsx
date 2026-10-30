import { StyleSheet, Text, View } from 'react-native';
import { InvoiceStatus } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';
import { PlainKey, useT } from '@/lib/i18n';

const TONES: Record<InvoiceStatus, { label: PlainKey; bg: string; fg: string }> = {
  unpaid: { label: 'common.invoice.unpaid', bg: colors.dangerSoft, fg: colors.danger },
  partial: { label: 'common.invoice.partial', bg: colors.warningSoft, fg: colors.warning },
  paid: { label: 'common.invoice.paid', bg: '#DCF5E7', fg: '#1F7A4A' },
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
