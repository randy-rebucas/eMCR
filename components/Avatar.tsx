import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

/** "JD" from a first and last name; empty when neither is known. */
export function initialsOf(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.trim()?.[0] ?? ''}${lastName?.trim()?.[0] ?? ''}`.toUpperCase();
}

/**
 * The patient's picture, or their initials when there is none. `solid` = white initials on teal
 * (on navy cards); `soft` = teal initials on a pale tile (the header).
 */
export function Avatar({
  image,
  firstName,
  lastName,
  size,
  tone = 'solid',
  style,
}: {
  image?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size: number;
  tone?: 'solid' | 'soft';
  style?: StyleProp<ViewStyle>;
}) {
  const initials = initialsOf(firstName, lastName);
  const fg = tone === 'solid' ? colors.primaryText : colors.primaryOnSoft;
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tone === 'solid' ? colors.primary : colors.primarySoft },
        style,
      ]}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : initials ? (
        <Text style={[styles.initials, { color: fg, fontSize: Math.round(size * 0.34) }]} maxFontSizeMultiplier={1.2}>
          {initials}
        </Text>
      ) : (
        <Ionicons name="person" size={Math.round(size * 0.44)} color={fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '800' },
});
