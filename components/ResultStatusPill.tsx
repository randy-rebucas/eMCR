import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isReady } from '@/lib/labResults';
import { colors, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { IconName } from './ui';

/**
 * Patient-facing lab status: Ready / Processing / Cancelled, each with its own icon so the state
 * never rests on colour alone. Ready uses the app's teal (not a separate green).
 */
export function ResultStatusPill({ status }: { status: string | null | undefined }) {
  const t = useT();
  const tone: { label: string; bg: string; fg: string; icon: IconName } = isReady(status)
    ? { label: t('common.result.ready'), bg: colors.primarySoft, fg: colors.primaryOnSoft, icon: 'checkmark-circle' }
    : status === 'cancelled'
      ? { label: t('common.result.cancelled'), bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' }
      : { label: t('common.result.processing'), bg: colors.warningSoft, fg: colors.warning, icon: 'time-outline' };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Ionicons name={tone.icon} size={13} color={tone.fg} />
      <Text style={[styles.text, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  text: { fontSize: 12, fontWeight: '700' },
});
