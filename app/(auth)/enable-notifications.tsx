import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { getCredentialStep } from '@/lib/emcr';
import { registerForPushNotifications, shouldAskForNotifications } from '@/lib/push';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, IconName, LoadingView } from '@/components/ui';
import { photos } from '@/components/Photo';
import { AuthBand, AuthScreen, TextLink, useBlockHardwareBack } from '@/components/auth';
import { useT } from '@/lib/i18n';

/** What a push carries, in the order patients care about (lib/push.ts routeForNotification). */
const BENEFITS: { label: 'auth.notify.reminders' | 'auth.notify.results' | 'auth.notify.queue' | 'auth.notify.bills' | 'auth.notify.messages'; icon: IconName }[] = [
  { label: 'auth.notify.reminders', icon: 'calendar-outline' },
  { label: 'auth.notify.results', icon: 'flask-outline' },
  { label: 'auth.notify.queue', icon: 'people-outline' },
  { label: 'auth.notify.bills', icon: 'receipt-outline' },
  { label: 'auth.notify.messages', icon: 'chatbubble-ellipses-outline' },
];

/**
 * Explains notifications before the OS permission dialog. Every fresh sign-in
 * passes through here; it skips straight to home once the OS has been asked, and first sends
 * a sign-in that still owes a password to /create-password.
 */
export default function EnableNotificationsScreen() {
  const { signedIn } = useAuth();
  const t = useT();
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
  // A sign-in that still owes a password (none yet, the clinic's temporary one, or a reset).
  if (getCredentialStep()) return <Redirect href="/create-password" />;
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
      <AuthBand source={photos.consultation} title={t('auth.notify.title')} lead={t('auth.notify.subtitle')} />

      <Text style={styles.listTitle} accessibilityRole="header">
        {t('auth.notify.listTitle')}
      </Text>
      <View style={styles.list}>
        {BENEFITS.map((b, i) => (
          <View key={b.label} style={[styles.item, i > 0 && styles.divider]}>
            <Ionicons name={b.icon} size={20} color={colors.primary} />
            <Text style={styles.itemText}>{t(b.label)}</Text>
          </View>
        ))}
      </View>

      <Button title={t('auth.notify.allow')} onPress={allow} loading={asking} />
      <TextLink title={t('auth.notify.notNow')} onPress={done} disabled={asking} style={styles.later} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  listTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  // One ruled card: the drawn phone and its hard-coded red dot are gone.
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  later: { alignSelf: 'center', marginTop: spacing.sm },
});
