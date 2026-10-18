import { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/lib/theme';
import { BrandLogo } from '@/components/BrandLogo';
import { Banner, Button } from '@/components/ui';
import {
  AuthFailure,
  AuthHeader,
  AuthScreen,
  classifyAuthError,
  Divider,
  IconBadge,
  IconField,
  MaintenanceScreen,
  OfflineScreen,
  StatusScreen,
  TextLink,
} from '@/components/auth';
import { QrScanner } from '@/components/QrScanner';

type Failure = AuthFailure | { kind: 'credentials' };

export default function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<(() => Promise<void>) | null>(null);
  // Keyboard "Go" and the button can both fire before `submitting` re-renders.
  const inFlight = useRef(false);

  // A fresh sign-in continues through the notification step (which skips itself if not needed).
  if (auth.signedIn) return <Redirect href="/enable-notifications" />;

  function clear() {
    setFailure(null);
    auth.clearNotice();
  }

  async function run(action: () => Promise<void>, { wrongCredentialsScreen = false } = {}) {
    if (inFlight.current) return;
    inFlight.current = true;
    clear();
    setLastAttempt(() => action);
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      const f = classifyAuthError(err);
      setFailure(wrongCredentialsScreen && f.kind === 'message' && f.status === 401 ? { kind: 'credentials' } : f);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function submitPassword() {
    if (!email.trim() || !password) {
      setFailure({ kind: 'message', message: 'Enter your email address and password.', status: 0 });
      return;
    }
    run(() => auth.loginWithPassword(email.trim(), password), { wrongCredentialsScreen: true });
  }

  function handleQrScanned(data: string) {
    setScanning(false);
    // Sign-in QRs are JSON. Anything else is usually the clinic's patient-lookup code.
    if (!data.trim().startsWith('{')) {
      clear();
      setFailure({
        kind: 'message',
        message: "That's the clinic's patient ID code, not a sign-in code. Ask the front desk to show your eMCR sign-in QR.",
        status: 0,
      });
      return;
    }
    run(() => auth.loginWithQr(data));
  }

  function retry() {
    if (lastAttempt) run(lastAttempt);
    else clear();
  }

  if (failure?.kind === 'offline') return <OfflineScreen onRetry={retry} onBack={clear} retrying={submitting} />;
  if (failure?.kind === 'maintenance') return <MaintenanceScreen onRetry={retry} onBack={clear} retrying={submitting} />;
  if (failure?.kind === 'credentials') {
    return (
      <StatusScreen
        onBack={clear}
        art={<IconBadge icon="warning" tone="danger" />}
        title="Unable to Sign In"
        message="The email or password you entered is incorrect."
        action={{
          title: 'Try Again',
          onPress: () => {
            setPassword('');
            clear();
          },
        }}
        link={{ title: 'Forgot Password?', onPress: () => router.push('/phone?purpose=forgot') }}
      />
    );
  }

  const inlineError = failure?.kind === 'message' ? failure.message : null;

  return (
    <AuthScreen>
      <View style={styles.logo}>
        <BrandLogo />
      </View>
      <AuthHeader title="Welcome Back" subtitle="Sign in to access your health records." align="center" />

      {auth.notice ? <Banner message={auth.notice} tone="warning" /> : null}
      {inlineError ? <Banner message={inlineError} /> : null}

      <IconField
        icon="person-outline"
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <IconField
        icon="lock-closed-outline"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submitPassword}
      />
      <TextLink
        title="Forgot password?"
        onPress={() => router.push('/phone?purpose=forgot')}
        style={styles.forgot}
      />

      <Button title="Sign In" onPress={submitPassword} loading={submitting && !scanning} />

      <Divider label="or" />

      <Button
        title="Sign in with a phone code"
        icon="phone-portrait-outline"
        variant="secondary"
        onPress={() => router.push('/phone?purpose=signin')}
        disabled={submitting}
      />
      <Button
        title="Scan clinic QR code"
        icon="qr-code-outline"
        variant="secondary"
        onPress={() => {
          clear();
          setScanning(true);
        }}
        disabled={submitting}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>First time on eMCR? </Text>
        <TextLink title="Activate Account" onPress={() => router.push('/phone?purpose=activate')} />
      </View>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <QrScanner onScanned={handleQrScanned} onCancel={() => setScanning(false)} />
      </Modal>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  logo: { marginTop: spacing.lg, marginBottom: spacing.xl },
  forgot: { alignSelf: 'flex-end', marginBottom: spacing.md, marginTop: spacing.xs },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 'auto',
    paddingTop: spacing.xl,
  },
  footerText: { fontSize: 14, color: colors.textMuted },
});
