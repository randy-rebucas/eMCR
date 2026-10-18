import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { getWelcomeSeen } from '@/lib/storage';
import { LoadingView } from '@/components/ui';

/** Root routing: signed in → patient tabs; first launch → welcome; otherwise sign-in. */
export default function Index() {
  const { signedIn, loading } = useAuth();
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);

  useEffect(() => {
    getWelcomeSeen()
      .then(setWelcomeSeen)
      .catch(() => setWelcomeSeen(true));
  }, []);

  if (loading) return <LoadingView />;
  if (signedIn) return <Redirect href="/patient/home" />;
  if (welcomeSeen === null) return <LoadingView />;
  return <Redirect href={welcomeSeen ? '/login' : '/welcome'} />;
}
