import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { UnreadProvider } from '@/lib/unread';
import { NotificationResponder } from '@/components/NotificationResponder';

/** Patient area: tabs plus pushed detail screens. Only for a signed-in session. */
export default function PatientLayout() {
  const { signedIn, loading } = useAuth();

  if (loading) return null;
  if (!signedIn) return <Redirect href="/" />;

  return (
    <UnreadProvider>
      <NotificationResponder />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.primary,
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="appointments/[id]" options={{ title: 'Appointment' }} />
        <Stack.Screen name="appointments/book" options={{ title: 'Book appointment' }} />
        <Stack.Screen name="results/[id]" options={{ title: 'Lab result' }} />
        <Stack.Screen name="prescriptions/index" options={{ title: 'Prescriptions' }} />
        <Stack.Screen name="prescriptions/[id]" options={{ title: 'Prescription' }} />
        <Stack.Screen name="invoices/index" options={{ title: 'Billing' }} />
        <Stack.Screen name="invoices/[id]" options={{ title: 'Invoice' }} />
        <Stack.Screen name="documents" options={{ title: 'Documents' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="profile/index" options={{ title: 'Profile' }} />
        <Stack.Screen name="profile/edit" options={{ title: 'Edit contact details' }} />
        <Stack.Screen name="profile/password" options={{ title: 'Password' }} />
      </Stack>
    </UnreadProvider>
  );
}
