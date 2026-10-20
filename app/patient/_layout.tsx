import { useEffect } from 'react';
import { Redirect, router, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { UnreadProvider } from '@/lib/unread';
import { NotificationResponder } from '@/components/NotificationResponder';
import { TourProvider } from '@/components/QuickTour';

/** Patient area: tabs plus pushed detail screens. Only for a signed-in session. */
export default function PatientLayout() {
  const { signedIn, loading } = useAuth();

  if (loading) return null;
  if (!signedIn) return <Redirect href="/" />;

  return (
    <ProfileProvider>
      <NotificationResponder />
      <ProfileScreens />
    </ProfileProvider>
  );
}

/**
 * Every screen below is remounted when the family profile changes, so each one reloads its data
 * for the person now on screen (and nothing from the previous person lingers).
 */
function ProfileScreens() {
  const { viewing } = useProfile();
  return (
    <UnreadProvider key={viewing?.id ?? 'self'}>
      <PendingRoute />
      <TourProvider>
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
          <Stack.Screen name="prescriptions/index" options={{ title: 'Prescriptions', headerShown: false }} />
          <Stack.Screen name="prescriptions/[id]" options={{ title: 'Prescription' }} />
          <Stack.Screen name="invoices/index" options={{ title: 'Billing', headerShown: false }} />
          <Stack.Screen name="invoices/[id]" options={{ title: 'Invoice' }} />
          <Stack.Screen name="documents" options={{ title: 'Documents', headerShown: false }} />
          <Stack.Screen name="clinics" options={{ title: 'My Clinics', headerShown: false }} />
          <Stack.Screen name="health-summary" options={{ title: 'Health Summary', headerShown: false }} />
          <Stack.Screen name="family" options={{ title: 'Family', headerShown: false }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications', headerShown: false }} />
          <Stack.Screen name="notification-settings" options={{ title: 'Notification Settings', headerShown: false }} />
          <Stack.Screen name="profile/index" options={{ title: 'Profile', headerShown: false }} />
          <Stack.Screen name="profile/edit" options={{ title: 'Edit contact details', headerShown: false }} />
          <Stack.Screen name="profile/password" options={{ title: 'Password', headerShown: false }} />
        </Stack>
      </TourProvider>
    </UnreadProvider>
  );
}

/** After a profile switch, open the screen the switch asked for (Home by default). */
function PendingRoute() {
  const { takePendingRoute } = useProfile();
  useEffect(() => {
    const href = takePendingRoute();
    if (!href) return;
    if (router.canDismiss()) router.dismissAll();
    router.navigate(href as never);
  }, [takePendingRoute]);
  return null;
}
