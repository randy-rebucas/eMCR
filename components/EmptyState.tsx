import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/lib/theme';

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl * 2 },
  text: { color: colors.textMuted, fontSize: 15, textAlign: 'center', paddingHorizontal: spacing.lg },
});
