import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
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
