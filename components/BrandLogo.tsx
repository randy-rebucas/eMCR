import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import { colors } from '@/lib/theme';

/** Heart-with-pulse mark on its own (app chrome, small placements). */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="heart" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill="url(#heart)"
      />
      <Polyline
        points="3.5,11.5 8,11.5 9.5,8.5 11.5,15 13.5,7 15,11.5 20.5,11.5"
        fill="none"
        stroke={colors.primaryText}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Mark + "eMCR" wordmark + descriptor, as on the welcome and sign-in screens. `tone="onNavy"` for
 * the photo bands: white wordmark, the descriptor in onNavyMuted.
 */
export function BrandLogo({
  size = 'md',
  align = 'center',
  tone = 'default',
}: {
  size?: 'sm' | 'md' | 'lg';
  align?: 'center' | 'left';
  tone?: 'default' | 'onNavy';
}) {
  const s = SIZES[size];
  const onNavy = tone === 'onNavy';
  return (
    <View style={[styles.row, align === 'left' && styles.left]} accessible accessibilityRole="header" accessibilityLabel="eMCR, Electronic MyClinic Record">
      <BrandMark size={s.mark} />
      <View>
        <Text style={[styles.word, onNavy && styles.wordOnNavy, { fontSize: s.word, lineHeight: s.word * 1.05 }]}>
          <Text style={onNavy ? styles.wordAccentOnNavy : styles.wordAccent}>e</Text>MCR
        </Text>
        <Text style={[styles.sub, onNavy && styles.subOnNavy, { fontSize: s.sub }]}>Electronic MyClinic Record</Text>
      </View>
    </View>
  );
}

// The descriptor was 9-10 pt; 11 is the smallest that stays legible in the header (sm).
const SIZES = {
  sm: { mark: 36, word: 26, sub: 11 },
  md: { mark: 44, word: 34, sub: 12 },
  lg: { mark: 60, word: 48, sub: 13 },
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' },
  left: { alignSelf: 'flex-start' },
  word: { fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  wordAccent: { color: colors.primary },
  wordOnNavy: { color: colors.primaryText },
  // The brighter brand teal: `primary` is too dark to read on navy.
  wordAccentOnNavy: { color: colors.accent },
  sub: { color: colors.textMuted, fontWeight: '500', marginTop: 1, letterSpacing: 0.2 },
  subOnNavy: { color: colors.onNavyMuted },
});
