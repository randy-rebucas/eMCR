import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { getClaimContext, setClaimContext } from '@/lib/emcr';
import { IconBadge, StatusScreen, useBlockHardwareBack } from '@/components/auth';

/**
 * An adult's records were claimed by someone who looks after them: the clinic has to confirm it
 * with that person in person before the records show up.
 */
export default function PendingApprovalScreen() {
  const { signedIn } = useAuth();
  const params = useLocalSearchParams<{ clinics?: string }>();
  const clinics = Number(params.clinics) || 0;
  const mode = getClaimContext()?.mode ?? 'signin';

  function done() {
    setClaimContext(null);
    if (mode === 'add') router.dismissTo('/patient/family');
    else if (signedIn) router.replace('/enable-notifications');
    else router.dismissTo('/login');
  }

  // Back would return to the form that was just sent.
  useBlockHardwareBack(done);

  const where = clinics > 1 ? `the ${clinics} clinics that have their records` : 'their clinic';
  return (
    <StatusScreen
      art={<IconBadge icon="hourglass-outline" tone="slate" />}
      title="Waiting for the Clinic"
      message={`To protect adults' records, ${where} must confirm with them in person before you can see them. We'll add them to your eMCR once it's confirmed.`}
      action={{ title: signedIn ? 'Continue' : 'Back to Sign In', onPress: done }}
      link={
        getClaimContext()
          ? { title: 'Add another person', onPress: () => router.replace('/verify-owner') }
          : undefined
      }
    />
  );
}
