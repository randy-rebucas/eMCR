import { StyleSheet, Text, View } from 'react-native';
import { isReady } from '@/lib/labResults';
import { colors, spacing } from '@/lib/theme';

/** Patient-facing lab status: Ready / Processing / Cancelled. */
export function ResultStatusPill({ status }: { status: string | null | undefined }) {
  const tone = isReady(status)
    ? { label: 'Ready', bg: '#DCF5E7', fg: '#1F7A4A' }
    : status === 'cancelled'
      ? { label: 'Cancelled', bg: colors.dangerSoft, fg: colors.danger }
      : { label: 'Processing', bg: colors.warningSoft, fg: colors.warning };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: spacing.sm + 4, paddingVertical: 5 },
  text: { fontSize: 12, fontWeight: '700' },
});
