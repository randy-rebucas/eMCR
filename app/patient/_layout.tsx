import { useEffect, useRef } from 'react';
import { Redirect, router, Stack, usePathname } from 'expo-router';
import { setActivationRequiredHandler } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { UnreadProvider } from '@/lib/unread';
import { NotificationResponder } from '@/components/NotificationResponder';
import { TourProvider } from '@/components/QuickTour';
import { useT } from '@/lib/i18n';

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
      {/* PrivacyGuard (screenshots, App Lock) is mounted at the root while signed in. */}
    </ProfileProvider>
  );
}

/**
 * Every screen below is remounted when the family profile changes, so each one reloads its data
 * for the person now on screen (and nothing from the previous person lingers).
 */
function ProfileScreens() {
  const { viewing } = useProfile();
  const t = useT();
  return (
    <UnreadProvider key={viewing?.id ?? 'self'}>
      <PendingRoute />
      <TourProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { color: colors.text },
            headerTintColor: colors.primary,
            headerBackTitle: t('common.back'),
            // SDK 58 defaults to a see-through header on iOS 26+, which slides content under it.
            headerTransparent: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="appointments/[id]" options={{ title: t('patient.title.appointment') }} />
          <Stack.Screen name="appointments/book" options={{ title: t('patient.title.book') }} />
          <Stack.Screen name="appointments/reschedule" options={{ title: t('patient.title.reschedule') }} />
          <Stack.Screen name="visits/index" options={{ title: t('patient.title.visitHistory'), headerShown: false }} />
          <Stack.Screen name="visits/[id]" options={{ title: t('patient.title.visit') }} />
          <Stack.Screen name="vitals" options={{ title: t('patient.title.vitals'), headerShown: false }} />
          <Stack.Screen name="share" options={{ title: t('patient.title.share'), headerShown: false }} />
          <Stack.Screen name="medicines" options={{ title: t('patient.title.medicines'), headerShown: false }} />
          <Stack.Screen name="membership" options={{ title: t('patient.title.membership'), headerShown: false }} />
          <Stack.Screen name="waitlist" options={{ title: t('patient.title.waitlist'), headerShown: false }} />
          <Stack.Screen name="referrals/index" options={{ title: t('patient.title.referrals'), headerShown: false }} />
          <Stack.Screen name="referrals/[id]" options={{ title: t('patient.title.referral') }} />
          <Stack.Screen name="results/[id]" options={{ title: t('patient.title.labResult') }} />
          <Stack.Screen name="prescriptions/index" options={{ title: t('patient.title.prescriptions'), headerShown: false }} />
          <Stack.Screen name="prescriptions/[id]" options={{ title: t('patient.title.prescription') }} />
          <Stack.Screen name="invoices/index" options={{ title: t('patient.title.billing'), headerShown: false }} />
          <Stack.Screen name="invoices/[id]" options={{ title: t('patient.title.invoice') }} />
          <Stack.Screen name="documents" options={{ title: t('patient.title.documents'), headerShown: false }} />
          <Stack.Screen name="clinics" options={{ title: t('patient.title.clinics'), headerShown: false }} />
          <Stack.Screen name="health-summary" options={{ title: t('patient.title.healthSummary'), headerShown: false }} />
          <Stack.Screen name="family" options={{ title: t('patient.title.family'), headerShown: false }} />
          <Stack.Screen name="notifications" options={{ title: t('patient.title.notifications'), headerShown: false }} />
          <Stack.Screen name="notification-settings" options={{ title: t('patient.title.notificationSettings'), headerShown: false }} />
          <Stack.Screen name="profile/index" options={{ title: t('patient.title.profile'), headerShown: false }} />
          <Stack.Screen name="profile/edit" options={{ title: t('patient.title.editContact'), headerShown: false }} />
          <Stack.Screen name="profile/password" options={{ title: t('patient.title.password'), headerShown: false }} />
          <Stack.Screen name="activate" options={{ title: t('patient.title.activate'), headerShown: false }} />
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
