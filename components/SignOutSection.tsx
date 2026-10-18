import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { Banner, Button, SectionTitle, screenStyles } from './ui';

/** "Sign out" and "Sign out on all devices", shared by both profiles. */
export function SignOutSection() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState<'here' | 'everywhere' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(everywhere: boolean) {
    setBusy(everywhere ? 'everywhere' : 'here');
    setError(null);
    try {
      // On success the auth state flips to signed-out and the layout guard redirects.
      await signOut({ everywhere });
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign out everywhere. Check your connection and try again."));
      setBusy(null);
    }
  }

  function confirmEverywhere() {
    Alert.alert(
      'Sign out on all devices?',
      'Every phone and browser signed in to your account will be signed out, including this one.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out everywhere', style: 'destructive', onPress: () => run(true) },
      ]
    );
  }

  return (
    <>
      <SectionTitle>Session</SectionTitle>
      {error ? <Banner message={error} /> : null}
      <Button title="Sign out" variant="dangerOutline" onPress={() => run(false)} loading={busy === 'here'} disabled={busy !== null} />
      <Button
        title="Sign out on all devices"
        variant="danger"
        onPress={confirmEverywhere}
        loading={busy === 'everywhere'}
        disabled={busy !== null}
      />
      <Text style={[screenStyles.muted, { marginTop: 8 }]}>
        Use "all devices" if you lost a phone or think someone else has access.
      </Text>
    </>
  );
}
