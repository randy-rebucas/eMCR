import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import { useAuth } from '@/lib/auth';
import {
  appLockEnabledSync,
  authenticate,
  getAppLockEnabled,
  launchLockPending,
  LOCK_AFTER_MS,
  takeLaunchLock,
  takeLockDeferral,
} from '@/lib/appLock';
import { colors, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { Button } from './ui';
import { BrandLogo } from './BrandLogo';

const CAPTURE_KEY = 'patient-records';

/**
 * Patient records are PHI. Mounted at the root while signed in (the patient area and the
 * signed-in onboarding steps such as set-password and login-id):
 * - screenshots and screen recording are blocked, and the recent-apps preview is blanked
 *   (Android FLAG_SECURE) or blurred (iOS app switcher protection);
 * - with App Lock on, the app asks for the fingerprint, face or screen lock on launch and after
 *   `LOCK_AFTER_MS` in the background. On launch the lock is up from the first render: the
 *   setting is read before the first screen (root layout), and while it is still unknown an
 *   opaque cover hides the records.
 */
export function PrivacyGuard() {
  const { signOut } = useAuth();
  const t = useT();
  // Decided on the first render, so no frame of records shows before the lock.
  const [launch] = useState(() => (launchLockPending() ? appLockEnabledSync() : false));
  const [locked, setLocked] = useState(launch === true);
  const [checking, setChecking] = useState(launch === null);
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
    if (takeLaunchLock() && launch === null) {
      // The setting wasn't read in time: keep the cover until it is.
      getAppLockEnabled()
        .then((on) => on && setLocked(true))
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
    // Only 'background' counts: the biometric prompt and share sheet make iOS 'inactive'.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        // The deferral (pay page) is checked on every return, so on Android it ends here.
        const deferred = takeLockDeferral();
        if (away >= LOCK_AFTER_MS && !deferred) getAppLockEnabled().then((on) => on && setLocked(true));
      }
    });
    return () => subscription.remove();
  }, [launch]);

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
    <>
      {/* Opaque cover in the app's own view tree: up on the same frame as the screens, before the
          native modal has presented. */}
      {locked || checking ? <View style={styles.cover} pointerEvents="auto" /> : null}
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
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, zIndex: 1000, elevation: 1000 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  text: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center', fontWeight: '500' },
  actions: { gap: spacing.sm },
});
