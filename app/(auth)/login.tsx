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
import { isEmcrLoginId, noteAccountCredentials, parseInviteCode, setCredentialStep, signInWithPassword } from '@/lib/emcr';

type Failure = AuthFailure | { kind: 'credentials' };

export default function LoginScreen() {
  const auth = useAuth();
  // A mobile number or eMCR login ID (qc01.jdc.19900425@myclinicsoft.solutions), or for older
  // sign-ins an email address.
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
    const id = email.trim();
    if (!id || !password) {
      setFailure({ kind: 'message', message: 'Enter your mobile number or login ID, and your password.', status: 0 });
      return;
    }
    if (id.includes('@') && !isEmcrLoginId(id)) {
      run(() => auth.loginWithPassword(id, password), { wrongCredentialsScreen: true });
      return;
    }
    run(
      async () => {
        const result = await signInWithPassword(id, password);
        if (!result.session) return;
        if (result.account?.mustChangePassword) setCredentialStep({ mode: 'temp', currentPassword: password });
        else noteAccountCredentials(result.account);
        await auth.applySession(result.session);
      },
      { wrongCredentialsScreen: true }
    );
  }

  function handleQrScanned(data: string) {
    setScanning(false);
    // The QR on a clinic invite slip: continue on the invite screen.
    const invite = parseInviteCode(data);
    if (invite) {
      clear();
      router.push(`/invite?c=${invite}`);
      return;
    }
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
        message="The login or password you entered is incorrect."
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
      <AuthHeader title="Welcome" subtitle="Sign in to see your health records from every clinic." align="center" />

      {auth.notice ? <Banner message={auth.notice} tone="warning" /> : null}
      {inlineError ? <Banner message={inlineError} /> : null}

      <Button
        title="I have an invite from my clinic"
        icon="mail-open-outline"
        onPress={() => {
          clear();
          router.push('/invite');
        }}
        disabled={submitting}
      />
      <Button
        title="Sign in with your phone"
        icon="phone-portrait-outline"
        variant="secondary"
        onPress={() => {
          clear();
          router.push('/phone?purpose=signin');
        }}
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

      <Divider label="or use your password" />

      <IconField
        icon="person-outline"
        label="Mobile number or login ID"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        keyboardType="email-address"
        textContentType="username"
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

      <Button title="Sign In" variant="secondary" onPress={submitPassword} loading={submitting && !scanning} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Clinic doesn't have your number? </Text>
        <TextLink title="Request access" onPress={() => router.push('/request-access')} disabled={submitting} />
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
