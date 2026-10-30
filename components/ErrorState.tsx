import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { useAnnounce } from './ui';

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  useAnnounce(message);
  return (
    <View style={styles.container}>
      <Text style={styles.text} accessibilityRole="alert" accessibilityLiveRegion="polite">
        {message}
      </Text>
      <TouchableOpacity style={styles.button} onPress={onRetry} accessibilityRole="button" accessibilityLabel={t('common.tryAgain')}>
        <Text style={styles.buttonText}>{t('common.tryAgain')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  text: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginBottom: spacing.md },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { color: colors.primary, fontWeight: '600' },
});
