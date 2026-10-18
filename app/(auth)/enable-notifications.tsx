import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { registerForPushNotifications, shouldAskForNotifications } from '@/lib/push';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, LoadingView } from '@/components/ui';
import { AuthHeader, AuthScreen, TextLink, useBlockHardwareBack } from '@/components/auth';

const BENEFITS = ['Appointment reminders', 'Lab result notifications', 'Queue updates'];

/**
 * Explains notifications before the OS permission dialog. Every fresh sign-in
 * passes through here; it skips straight to home once the OS has been asked.
 */
export default function EnableNotificationsScreen() {
  const { signedIn } = useAuth();
  const [needed, setNeeded] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);
  // Back would reach the sign-in screen, which only redirects here again.
  useBlockHardwareBack();

  useEffect(() => {
    shouldAskForNotifications()
      .then(setNeeded)
      .catch(() => setNeeded(false));
  }, []);

  if (!signedIn) return <Redirect href="/login" />;
  if (needed === null) return <LoadingView />;
  if (!needed) return <Redirect href="/patient/home" />;

  const done = () => router.replace('/patient/home');

  async function allow() {
    setAsking(true);
    try {
      await registerForPushNotifications();
    } catch {
      // Registration failures aren't worth blocking the patient over.
    } finally {
      setAsking(false);
      done();
    }
  }

  return (
    <AuthScreen>
      <AuthHeader
        title="Stay Updated"
        subtitle="Allow notifications so you don't miss important updates about your appointments, results and more."
      />

      <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.phone}>
          <Ionicons name="notifications" size={48} color={colors.primary} />
          <View style={styles.dot} />
        </View>
      </View>

      <View style={styles.list}>
        {BENEFITS.map((label) => (
          <View key={label} style={styles.item}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.itemText}>{label}</Text>
          </View>
        ))}
      </View>

      <Button title="Allow Notifications" onPress={allow} loading={asking} />
      <TextLink title="Not Now" onPress={done} disabled={asking} style={styles.later} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', marginVertical: spacing.lg },
  phone: {
    width: 104,
    height: 132,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: colors.text,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E5484D',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  list: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm + 4,
    marginBottom: spacing.lg,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  itemText: { fontSize: 15, color: colors.text },
  later: { alignSelf: 'center', marginTop: spacing.lg },
});
