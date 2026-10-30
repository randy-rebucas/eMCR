import { useEffect, useRef } from 'react';
import { Redirect, router, Stack, usePathname } from 'expo-router';
import { setActivationRequiredHandler } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { UnreadProvider } from '@/lib/unread';
import { NotificationResponder } from '@/components/NotificationResponder';
import { PrivacyGuard } from '@/components/PrivacyGuard';
import { TourProvider } from '@/components/QuickTour';

/** Patient area: tabs plus pushed detail screens. Only for a signed-in session. */
export default function PatientLayout() {
  const { signedIn, loading } = useAuth();

  if (loading) return null;
  if (!signedIn) return <Redirect href="/" />;

  return (
    <ProfileProvider>
      <NotificationResponder />
      <ActivationPrompt />
      <ProfileScreens />
      <PrivacyGuard />
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
          <Stack.Screen name="appointments/reschedule" options={{ title: 'Reschedule' }} />
          <Stack.Screen name="visits/index" options={{ title: 'Visit History', headerShown: false }} />
          <Stack.Screen name="visits/[id]" options={{ title: 'Visit' }} />
          <Stack.Screen name="vitals" options={{ title: 'Vitals', headerShown: false }} />
          <Stack.Screen name="share" options={{ title: 'Share with a doctor', headerShown: false }} />
          <Stack.Screen name="medicines" options={{ title: 'Medicine Reminders', headerShown: false }} />
          <Stack.Screen name="membership" options={{ title: 'Membership', headerShown: false }} />
          <Stack.Screen name="waitlist" options={{ title: 'Waitlist', headerShown: false }} />
          <Stack.Screen name="referrals/index" options={{ title: 'Referrals', headerShown: false }} />
          <Stack.Screen name="referrals/[id]" options={{ title: 'Referral' }} />
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
          <Stack.Screen name="activate" options={{ title: 'Activate eMCR', headerShown: false }} />
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

const ACTIVATE_HREF = '/patient/activate';
/** Several gated calls often fail together (a screen loading its parts): open the screen once. */
const PROMPT_COOLDOWN_MS = 5000;

/**
 * A call answered 402 ACTIVATION_REQUIRED: open "Enter your activation code", unless it is
 * already showing or was just opened.
 */
function ActivationPrompt() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const lastShown = useRef(0);

  useEffect(() => {
    setActivationRequiredHandler(() => {
      if (pathRef.current === ACTIVATE_HREF) return;
      const now = Date.now();
      if (now - lastShown.current < PROMPT_COOLDOWN_MS) return;
      lastShown.current = now;
      router.push(ACTIVATE_HREF);
    });
    return () => setActivationRequiredHandler(null);
  }, []);

  return null;
}
