import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { apiFetch, errorMessage, TokenPair } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { emitRefresh } from '@/lib/events';
import { Banner, Button, TextField, screenStyles } from './ui';

const MIN_LENGTH = 8;

/**
 * Change (or, for a patient who signed in by OTP/QR, set) the password. The
 * server signs out every other device and returns a new token pair for this one,
 * which must replace the stored pair or the next request would fail.
 */
export function ChangePasswordForm({ endpoint, requireCurrent }: { endpoint: string; requireCurrent: boolean }) {
  const { applyRotatedTokens } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (requireCurrent && !current) return setError('Enter your current password.');
    if (next.length < MIN_LENGTH) return setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setError("The new passwords don't match.");
    setError(null);
    setSaving(true);
    try {
      const result = await apiFetch<Partial<TokenPair>>(endpoint, {
        method: 'POST',
        body: { ...(current ? { currentPassword: current } : {}), newPassword: next },
      });
      await applyRotatedTokens(result);
      emitRefresh('profile');
      router.back();
    } catch (err) {
      setError(errorMessage(err, "Couldn't change your password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={screenStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        {error ? <Banner message={error} /> : null}
        <TextField
          label={requireCurrent ? 'Current password' : 'Current password (leave blank if you never set one)'}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
        />
        <TextField
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
          hint={`At least ${MIN_LENGTH} characters.`}
        />
        <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
        <Button title="Save password" onPress={submit} loading={saving} />
        <Text style={[screenStyles.muted, { marginTop: 12 }]}>
          Changing your password signs you out on every other device. This device stays signed in.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
