import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { initI18n } from '@/lib/i18n';

export default function RootLayout() {
  // The saved language is read before the first screen, so nothing flashes in the wrong language.
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    initI18n().finally(() => setLanguageReady(true));
  }, []);

  if (!languageReady) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="patient" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
