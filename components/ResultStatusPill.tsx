import { StyleSheet, Text, View } from 'react-native';
import { isReady } from '@/lib/labResults';
import { colors, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';

/** Patient-facing lab status: Ready / Processing / Cancelled. */
export function ResultStatusPill({ status }: { status: string | null | undefined }) {
  const t = useT();
  const tone = isReady(status)
    ? { label: t('common.result.ready'), bg: '#DCF5E7', fg: '#1F7A4A' }
    : status === 'cancelled'
      ? { label: t('common.result.cancelled'), bg: colors.dangerSoft, fg: colors.danger }
      : { label: t('common.result.processing'), bg: colors.warningSoft, fg: colors.warning };
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
