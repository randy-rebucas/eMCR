import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import { useAuth } from '@/lib/auth';
import { authenticate, getAppLockEnabled, LOCK_AFTER_MS, lockDeferred, takeLaunchLock } from '@/lib/appLock';
import { colors, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { Button } from './ui';
import { BrandLogo } from './BrandLogo';

const CAPTURE_KEY = 'patient-records';

/**
 * Patient records are PHI. While signed in:
 * - screenshots and screen recording are blocked, and the recent-apps preview is blanked
 *   (Android FLAG_SECURE) or blurred (iOS app switcher protection);
 * - with App Lock on, the app asks for the fingerprint, face or screen lock on launch and after
 *   `LOCK_AFTER_MS` in the background.
 */
export function PrivacyGuard() {
  const { signOut } = useAuth();
  const t = useT();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
    if (Platform.OS === 'ios') ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
      if (Platform.OS === 'ios') ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (takeLaunchLock()) {
      getAppLockEnabled().then((on) => on && setLocked(true));
    }
    // Only 'background' counts: the biometric prompt and share sheet make iOS 'inactive'.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away >= LOCK_AFTER_MS && !lockDeferred()) getAppLockEnabled().then((on) => on && setLocked(true));
      }
    });
    return () => subscription.remove();
  }, []);

  const unlock = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const result = await authenticate();
    setBusy(false);
    if (result.ok) setLocked(false);
    else setMessage(result.message);
  }, []);

  // Ask straight away when the lock comes up.
  useEffect(() => {
    if (locked) unlock();
  }, [locked, unlock]);

  return (
    <Modal visible={locked} animationType="none" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <SafeAreaView style={styles.root}>
        <View style={styles.body}>
          <BrandLogo size="lg" />
          <Text style={styles.title} accessibilityRole="header">
            {t('common.lock.title')}
          </Text>
          <Text style={styles.text}>{t('common.lock.body')}</Text>
          {message ? (
            <Text style={styles.error} accessibilityRole="alert">
              {message}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          <Button title={t('common.lock.unlock')} icon="lock-open-outline" onPress={unlock} loading={busy} />
          <Button title={t('common.signOut')} variant="secondary" onPress={() => signOut().catch(() => {})} disabled={busy} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  text: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center', fontWeight: '500' },
  actions: { gap: spacing.sm },
});
