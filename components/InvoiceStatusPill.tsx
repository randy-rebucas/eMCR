import { StyleSheet, Text, View } from 'react-native';
import { InvoiceStatus } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';

const TONES: Record<InvoiceStatus, { label: string; bg: string; fg: string }> = {
  unpaid: { label: 'Unpaid', bg: colors.dangerSoft, fg: colors.danger },
  partial: { label: 'Partly Paid', bg: colors.warningSoft, fg: colors.warning },
  paid: { label: 'Paid', bg: '#DCF5E7', fg: '#1F7A4A' },
  refunded: { label: 'Refunded', bg: colors.slateSoft, fg: colors.slate },
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const tone = TONES[status] ?? TONES.unpaid;
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});
