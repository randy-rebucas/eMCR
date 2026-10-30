import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LANGUAGE_PREFERENCES, LanguagePreference, languageChoiceLabel, systemLanguage, useLanguage, useT } from '@/lib/i18n';
import { colors, radius, spacing } from '@/lib/theme';

/** "Filipino", or "Same as phone (English)" when following the phone. */
export function useLanguageSummary(): string {
  const t = useT();
  const { preference } = useLanguage();
  if (preference !== 'system') return languageChoiceLabel(preference);
  return t('common.language.systemNow', { language: languageChoiceLabel(systemLanguage()) });
}

/** Bottom sheet: Same as phone / English / Filipino. The app re-renders in the new language at once. */
export function LanguagePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const { preference, setPreference } = useLanguage();
  const insets = useSafeAreaInsets();

  function choose(choice: LanguagePreference) {
    setPreference(choice).catch(() => {});
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
        <Text style={styles.title} accessibilityRole="header">
          {t('common.language.choose')}
        </Text>
        <View accessibilityRole="radiogroup">
          {LANGUAGE_PREFERENCES.map((choice) => {
            const selected = choice === preference;
            const label =
              choice === 'system'
                ? t('common.language.systemNow', { language: languageChoiceLabel(systemLanguage()) })
                : languageChoiceLabel(choice);
            return (
              <TouchableOpacity
                key={choice}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => choose(choice)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={selected ? colors.primary : colors.textMuted}
                />
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6, 24, 38, 0.45)' },
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
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionText: { fontSize: 16, color: colors.text },
  optionTextSelected: { fontWeight: '700', color: colors.primaryOnSoft },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
