import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { maskBirthDate } from '@/lib/emcr';
import { colors, spacing } from '@/lib/theme';
import { IconBadge, IconField, StatusScreen } from './auth';

// Pieces shared by the eMCR claim, request-access and activation screens.

/** The 15-minute phone proof ran out (or the app restarted): verify the phone again. */
export function ClaimExpiredScreen({ signedIn, mode = 'signin' }: { signedIn: boolean; mode?: 'signin' | 'add' }) {
  return (
    <StatusScreen
      art={<IconBadge icon="time-outline" tone="slate" />}
      title="This Step Timed Out"
      message="For your security, please confirm your phone number again with a new code."
      action={{
        title: 'Verify My Phone',
        onPress: () => router.replace(mode === 'add' || signedIn ? '/phone?purpose=add' : '/phone?purpose=signin'),
      }}
      link={
        signedIn
          ? { title: 'Back to the app', onPress: () => router.dismissTo('/patient/home') }
          : { title: 'Back to sign in', onPress: () => router.dismissTo('/login') }
      }
    />
  );
}

/** Birth date typed as digits and shown as YYYY-MM-DD. */
export function BirthDateField({
  value,
  onChange,
  label = 'Birth date (YYYY-MM-DD)',
  error,
  onSubmitEditing,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: boolean;
  onSubmitEditing?: () => void;
}) {
  return (
    <IconField
      icon="calendar-outline"
      label={label}
      value={value}
      onChangeText={(text) => onChange(maskBirthDate(text))}
      keyboardType="number-pad"
      maxLength={10}
      autoComplete="birthdate-full"
      textContentType="birthdate"
      error={error}
      returnKeyType="done"
      onSubmitEditing={onSubmitEditing}
    />
  );
}

/** A wrapping row of single-choice chips. */
export function ChipPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  format = (v) => v,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  format?: (value: T) => string;
}) {
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{format(option)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { marginBottom: spacing.md },
  pickerLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.primaryOnSoft, fontWeight: '700' },
});
