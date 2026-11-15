import { useEffect, useRef, useState } from 'react';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setPasswordChangeRequiredHandler } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { getCredentialStep, setCredentialStep } from '@/lib/emcr';
import { loadAppLockSetting } from '@/lib/appLock';
import { initI18n } from '@/lib/i18n';
import { PrivacyGuard } from '@/components/PrivacyGuard';

export default function RootLayout() {
  // The saved language is read before the first screen, so nothing flashes in the wrong language;
  // the App Lock setting too, so a locked app never shows a frame of records on launch.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([initI18n(), loadAppLockSetting()]).finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="patient" />
        </Stack>
        <SignedInPrivacy />
        <PasswordChangePrompt />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

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
