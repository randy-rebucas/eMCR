import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { getCredentialStep, getEmcrAccount, setCredentialStep } from '@/lib/emcr';
import { getWelcomeSeen } from '@/lib/storage';
import { LoadingView } from '@/components/ui';

/** Launch check of the account: short, so a dead connection doesn't hold the app on a spinner. */
const ACCOUNT_CHECK_TIMEOUT_MS = 6000;

/**
 * Root routing: signed in → patient tabs (or first /create-password while the clinic's temporary
 * password hasn't been replaced); first launch → welcome; otherwise sign-in.
 */
export default function Index() {
  const { signedIn, loading } = useAuth();
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  /** null while checking the account; true = a password change is owed. */
  const [owesPassword, setOwesPassword] = useState<boolean | null>(() => (getCredentialStep() ? true : null));

  useEffect(() => {
    getWelcomeSeen()
      .then(setWelcomeSeen)
      .catch(() => setWelcomeSeen(true));
  }, []);

  // Opened on a stored session: an account still on the clinic's temporary password must choose
  // its own first. Offline or an error: fail open (the server still refuses data until then, and
  // the api layer opens /create-password when it does).
  useEffect(() => {
    if (!signedIn || owesPassword !== null) return;
    if (getCredentialStep()) {
      setOwesPassword(true);
      return;
    }
    let cancelled = false;
    getEmcrAccount({ timeoutMs: ACCOUNT_CHECK_TIMEOUT_MS })
      .then((account) => {
        if (cancelled) return;
        if (account?.mustChangePassword && !getCredentialStep()) setCredentialStep({ mode: 'temp' }, { forSignIn: false });
        setOwesPassword(!!getCredentialStep());
      })
      .catch(() => {
        if (!cancelled) setOwesPassword(!!getCredentialStep());
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, owesPassword]);

  if (loading) return <LoadingView />;
  if (signedIn) {
    if (owesPassword === null) return <LoadingView />;
    return <Redirect href={owesPassword ? '/create-password' : '/patient/home'} />;
  }
  if (welcomeSeen === null) return <LoadingView />;
  return <Redirect href={welcomeSeen ? '/login' : '/welcome'} />;
}
