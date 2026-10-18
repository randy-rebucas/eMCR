import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingView } from '@/components/ui';

/** Root routing: signed out → sign-in; signed in → patient tabs. */
export default function Index() {
  const { signedIn, loading } = useAuth();

  if (loading) return <LoadingView />;
  if (signedIn) return <Redirect href="/patient/home" />;
  return <Redirect href="/login" />;
}
