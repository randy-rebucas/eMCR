import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { StatusScreen, useBlockHardwareBack } from '@/components/auth';

// Confetti pieces around the check: [x, y, color, kind].
const CONFETTI: [number, number, string, 'dot' | 'dash'][] = [
  [30, 50, colors.accent, 'dot'],
  [52, 20, '#F59E0B', 'dash'],
  [100, 8, colors.primary, 'dot'],
  [150, 18, '#3B82F6', 'dash'],
  [178, 52, '#F43F5E', 'dot'],
  [190, 110, colors.accent, 'dash'],
  [172, 160, '#F59E0B', 'dot'],
  [24, 112, '#3B82F6', 'dot'],
  [40, 162, '#F43F5E', 'dash'],
  [110, 192, colors.accent, 'dot'],
];

/** Shown once activation has saved the patient's email + password. */
export default function AllSetScreen() {
  const { signedIn } = useAuth();
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
      title="You're All Set!"
      message="Your eMCR account is ready. Next time, sign in with your email and password."
      action={{ title: 'Continue', onPress: () => router.replace('/enable-notifications') }}
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
