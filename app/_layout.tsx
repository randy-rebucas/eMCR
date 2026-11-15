// First, so the native splash is held before anything else can render.
import { hideLaunchSplash, markLaunchRootReady, markLaunchRouteReady } from '@/lib/launchSplash';
import { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setPasswordChangeRequiredHandler } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { getCredentialStep, setCredentialStep } from '@/lib/emcr';
import { loadAppLockSetting } from '@/lib/appLock';
import { initI18n, useT } from '@/lib/i18n';
import { colors, spacing } from '@/lib/theme';
import { PrivacyGuard } from '@/components/PrivacyGuard';
import { NotificationTapCatcher } from '@/components/NotificationResponder';
import { UpdateGate } from '@/components/UpdateGate';
import { IconBadge, StatusScreen } from '@/components/auth';

export default function RootLayout() {
  // The saved language is read before the first screen, so nothing flashes in the wrong language;
  // the App Lock setting too, so a locked app never shows a frame of records on launch. The native
  // splash stays up meanwhile (lib/launchSplash.ts), so this null is never seen.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([initI18n(), loadAppLockSetting()]).finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* The app is always light (app.json userInterfaceStyle), so its status bar icons are always
            dark; "auto" turned them white on light screens when the phone was in dark mode. */}
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="patient" />
          <Stack.Screen name="+not-found" />
        </Stack>
        <LaunchSplashRelease />
        <SignedInPrivacy />
        <PasswordChangePrompt />
        <NotificationTapCatcher />
        <UpdateGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Lets the splash go once a real screen is up: the root is ready (this is mounted) and the route
 * has left "/", where app/index.tsx shows only a spinner until it has decided where to go. A deep
 * link that opens elsewhere counts once the session is restored (the patient area is blank until
 * then).
 */
function LaunchSplashRelease() {
  const pathname = usePathname();
  const { loading } = useAuth();
  useEffect(() => {
    markLaunchRootReady();
  }, []);
  useEffect(() => {
    if (pathname !== '/' && !loading) markLaunchRouteReady();
  }, [pathname, loading]);
  return null;
}

/**
 * Whole-app fallback when a screen throws while rendering: a calm message and Try again, never a
 * red screen or a blank app. The error text shows in development only; patients get plain words.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const t = useT();
  useEffect(() => {
    // The throw may come before the first screen: the splash must not hide this.
    hideLaunchSplash();
    console.error('[ErrorBoundary]', error);
  }, [error]);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <StatusScreen
        art={<IconBadge icon="alert-circle-outline" tone="slate" />}
        title={t('common.crash.title')}
        message={t('common.crash.body')}
        action={{ title: t('common.tryAgainTitle'), onPress: () => retry().catch(() => {}) }}
      >
        {__DEV__ ? <Text style={styles.devError}>{String(error?.message ?? error)}</Text> : null}
      </StatusScreen>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  devError: { color: colors.danger, fontSize: 13, textAlign: 'center', marginTop: spacing.md },
});

/**
 * Screenshot blocking and App Lock for the whole signed-in app, including the (auth) steps a
 * signed-in patient can be on (set-password, login-id, a deep link).
 */
function SignedInPrivacy() {
  const { signedIn } = useAuth();
  return signedIn ? <PrivacyGuard /> : null;
}

const CREATE_PASSWORD_HREF = '/create-password';
/** Screens that already lead to /create-password while a password step is owed. */
const ON_THE_WAY = new Set([CREATE_PASSWORD_HREF, '/enable-notifications', '/']);
/** Several calls usually fail together (a screen loading its parts): open the screen once. */
const PROMPT_COOLDOWN_MS = 5000;

/**
 * A call answered 403 PASSWORD_CHANGE_REQUIRED: the session was signed in with the clinic's
 * temporary password, which must be replaced before any record loads. Opens /create-password,
 * which asks for the temporary password when the app no longer has it (after a relaunch).
 */
function PasswordChangePrompt() {
  const { signedIn } = useAuth();
  const pathname = usePathname();
  const state = useRef({ signedIn, pathname, lastShown: 0 });
  state.current.signedIn = signedIn;
  state.current.pathname = pathname;

  useEffect(() => {
    setPasswordChangeRequiredHandler(() => {
      const s = state.current;
      // While signed out or still restoring the session, the launch routing (app/index.tsx) decides.
      if (!s.signedIn) return;
      if (!getCredentialStep()) setCredentialStep({ mode: 'temp' }, { forSignIn: false });
      if (ON_THE_WAY.has(s.pathname)) return;
      const now = Date.now();
      if (now - s.lastShown < PROMPT_COOLDOWN_MS) return;
      s.lastShown = now;
      if (router.canDismiss()) router.dismissAll();
      router.replace(CREATE_PASSWORD_HREF);
    });
    return () => setPasswordChangeRequiredHandler(null);
  }, []);

  return null;
}
