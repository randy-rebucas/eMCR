import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { StatusScreen, useBlockHardwareBack } from '@/components/auth';
import { useT } from '@/lib/i18n';

// Confetti pieces around the check: [x, y, color, kind].
// Brand teal, slate and the light amber: no colours outside lib/theme.ts.
const CONFETTI: [number, number, string, 'dot' | 'dash'][] = [
  [30, 50, colors.accent, 'dot'],
  [52, 20, colors.warningLine, 'dash'],
  [100, 8, colors.primary, 'dot'],
  [150, 18, colors.slate, 'dash'],
  [178, 52, colors.accent, 'dot'],
  [190, 110, colors.warningLine, 'dash'],
  [172, 160, colors.slate, 'dot'],
  [24, 112, colors.primary, 'dot'],
  [40, 162, colors.accent, 'dash'],
  [110, 192, colors.warningLine, 'dot'],
];

/** Shown once activation has saved the patient's email + password. */
export default function AllSetScreen() {
  const { signedIn } = useAuth();
  const t = useT();
  useBlockHardwareBack();
  if (!signedIn) return <Redirect href="/login" />;

  return (
    <StatusScreen
      art={
        <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={210} height={210} style={StyleSheet.absoluteFill}>
            {CONFETTI.map(([x, y, color, kind], i) =>
              kind === 'dot' ? (
                <Circle key={i} cx={x} cy={y} r={3.5} fill={color} />
              ) : (
                <Rect key={i} x={x} y={y} width={10} height={4} rx={2} fill={color} rotation={i * 37} origin={`${x + 5}, ${y + 2}`} />
              )
            )}
          </Svg>
          <View style={styles.check}>
            <Ionicons name="checkmark" size={64} color={colors.primaryText} />
          </View>
        </View>
      }
      title={t('auth.allSet.title')}
      message={t('auth.allSet.message')}
      action={{ title: t('auth.continue'), onPress: () => router.replace('/enable-notifications') }}
    />
  );
}

const styles = StyleSheet.create({
  art: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
