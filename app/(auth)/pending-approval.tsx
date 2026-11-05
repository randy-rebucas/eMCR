import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { getClaimContext, setClaimContext } from '@/lib/emcr';
import { IconBadge, StatusScreen, useBlockHardwareBack } from '@/components/auth';
import { useT } from '@/lib/i18n';

/**
 * An adult's records were claimed by someone who looks after them: the clinic has to confirm it
 * with that person in person before the records show up.
 */
export default function PendingApprovalScreen() {
  const { signedIn } = useAuth();
  const t = useT();
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

  return (
    <StatusScreen
      art={<IconBadge icon="hourglass-outline" tone="slate" />}
      title={t('auth.pending.title')}
      message={clinics > 1 ? t('auth.pending.manyClinics', { count: clinics }) : t('auth.pending.oneClinic')}
      action={{ title: signedIn ? t('auth.continue') : t('auth.backToSignIn'), onPress: done }}
      link={
        getClaimContext()
          ? { title: t('auth.addAnother'), onPress: () => router.replace('/verify-owner') }
          : undefined
      }
    />
  );
}
