import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

/** Signed-out screens plus the short onboarding steps right after sign-in. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="verify-owner" />
      <Stack.Screen name="claim-details" />
      <Stack.Screen name="pending-approval" options={{ gestureEnabled: false }} />
      <Stack.Screen name="request-access" />
      <Stack.Screen name="set-password" options={{ gestureEnabled: false }} />
      <Stack.Screen name="create-password" options={{ gestureEnabled: false }} />
      <Stack.Screen name="login-id" options={{ gestureEnabled: false }} />
      <Stack.Screen name="all-set" options={{ gestureEnabled: false }} />
      <Stack.Screen name="enable-notifications" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
