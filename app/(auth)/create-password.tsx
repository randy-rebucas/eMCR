import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getCredentialStep, rememberIssuedLoginId, saveAccountPassword, setCredentialStep } from '@/lib/emcr';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button } from '@/components/ui';
import { AuthHeader, AuthScreen, ChecklistItem, IconField, PASSWORD_RULES, StatusScreen, IconBadge, useBlockHardwareBack } from '@/components/auth';

const COPY = {
  create: {
    title: 'Create Your Password',
    subtitle: 'Next time, sign in with your mobile number and this password. No code needed.',
  },
  temp: {
    title: 'Choose Your Own Password',
    subtitle: 'The password from your clinic was for your first sign-in only. Choose one only you know.',
  },
  reset: {
    title: 'Choose a New Password',
    subtitle: "You're signed in with your code. Set a new password for signing in with your mobile number.",
  },
} as const;

/**
 * The eMCR sign-in credential (mobile number + password), owed right after a sign-in
 * (lib/emcr.ts `CredentialStep`): a first password after the phone was proven, the
 * replacement for the clinic's temporary one, or a reset. Not skippable: without it the
 * person could only ever get back in by SMS code.
 */
export default function CreatePasswordScreen() {
  const { signedIn, signOut } = useAuth();
  const [step] = useState(getCredentialStep);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const inFlight = useRef(false);

  useBlockHardwareBack();

  if (!signedIn) return <Redirect href="/login" />;
  if (!step) return <Redirect href="/enable-notifications" />;

  const copy = COPY[step.mode];
  const rulesMet = PASSWORD_RULES.every((rule) => rule.test(password));
  const matches = confirm.length > 0 && confirm === password;

  if (stale) {
    return (
      <StatusScreen
        art={<IconBadge icon="time-outline" tone="slate" />}
        title="Sign In Again"
        message="For your security, a password is set within 15 minutes of confirming your phone. Sign in with an SMS code again to set it."
        action={{
          title: 'Sign In Again',
          onPress: async () => {
            setCredentialStep(null);
            await signOut();
            router.replace('/phone?purpose=signin');
          },
        }}
      />
    );
  }

  async function save() {
    if (inFlight.current || !step) return;
    if (!rulesMet) return setError('Your password needs at least 8 characters, an uppercase letter and a number.');
    if (!matches) return setError("The passwords don't match.");
    inFlight.current = true;
    setError(null);
    setSaving(true);
    try {
      const result = await saveAccountPassword(password, step.mode === 'temp' ? step.currentPassword : undefined);
      setCredentialStep(null);
      // A first password comes with the structured login ID: show it once before going on.
      if (step.mode !== 'reset' && result.account?.loginId) {
        rememberIssuedLoginId(result.account.loginId);
        router.replace('/login-id');
        return;
      }
      router.replace('/enable-notifications');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'OTP_REQUIRED' || err.code === 'CURRENT_PASSWORD_REQUIRED')) {
        setStale(true);
        return;
      }
      setError(
        err instanceof ApiError && err.code === 'NETWORK'
          ? "Can't reach the server. Check your connection and try again."
          : errorMessage(err, "Couldn't save your password. Please try again.")
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <AuthScreen>
      <AuthHeader title={copy.title} subtitle={copy.subtitle} />
      {error ? <Banner message={error} /> : null}
      <IconField
        icon="lock-closed-outline"
        label={step.mode === 'create' ? 'Create password' : 'New password'}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <IconField
        icon="lock-closed-outline"
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={confirm.length > 0 && !matches && confirm.length >= password.length}
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <View style={styles.rules}>
        <Text style={styles.rulesTitle}>Password must have:</Text>
        {PASSWORD_RULES.map((rule) => (
          <ChecklistItem key={rule.label} label={rule.label} met={rule.test(password)} />
        ))}
        <ChecklistItem label="Passwords match" met={matches} />
      </View>
      <Button title="Save and Continue" onPress={save} loading={saving} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  rules: { marginTop: spacing.xs, marginBottom: spacing.md },
  rulesTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
});
