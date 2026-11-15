import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { IconName } from './ui';
import type { PhotoSource } from '@/lib/avatar';

/**
 * Bottom sheet for the profile picture: Take a photo / Choose from your photos / Remove picture.
 * A sheet, not an alert: Android alerts hold three buttons at most, and this needs four with Cancel.
 */
export function PhotoSheet({
  visible,
  hasPhoto,
  onPick,
  onRemove,
  onClose,
}: {
  visible: boolean;
  hasPhoto: boolean;
  onPick: (source: PhotoSource) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
        <Text style={styles.title} accessibilityRole="header">
          {t('profile.photo.sheetTitle')}
        </Text>
        <Option icon="camera-outline" label={t('profile.photo.take')} onPress={() => onPick('camera')} />
        <Option icon="images-outline" label={t('profile.photo.choose')} onPress={() => onPick('library')} />
        {hasPhoto ? <Option icon="trash-outline" label={t('profile.photo.remove')} danger onPress={onRemove} /> : null}
        <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function Option({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const color = danger ? colors.danger : colors.primary;
  return (
    <TouchableOpacity style={styles.option} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.optionText, danger && { color: colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.text },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
