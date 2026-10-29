import { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing } from '@/lib/theme';
import { BrandLogo } from '@/components/BrandLogo';
import { Banner, Button, IconName } from '@/components/ui';
import {
  AuthFailure,
  AuthHeader,
  AuthScreen,
  classifyAuthError,
  Divider,
  IconBadge,
  IconField,
  isPhMobile,
  MaintenanceScreen,
  OfflineScreen,
  PhPhoneField,
  StatusScreen,
  TextLink,
  toPhE164,
} from '@/components/auth';
import { QrScanner } from '@/components/QrScanner';
import {
  isEmcrLoginId,
  noteAccountCredentials,
  parseInviteCode,
  requestPhoneCode,
  setCredentialStep,
  signInWithPassword,
} from '@/lib/emcr';

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
  const [showPassword, setShowPassword] = useState(false);
  // The 10 digits after +63.
  const [phone, setPhone] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
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

  function submitPhone() {
    if (!isPhMobile(phone)) {
      setFailure({ kind: 'message', message: 'Enter a PH mobile number, like 917 123 4567.', status: 0 });
      return;
    }
    const e164 = toPhE164(phone);
    run(async () => {
      setSendingCode(true);
      try {
        await requestPhoneCode(e164);
        router.push(`/phone?purpose=signin&sent=1&phone=${encodeURIComponent(e164)}`);
      } finally {
        setSendingCode(false);
      }
    });
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

      <View style={styles.primary}>
        <Text style={styles.primaryLabel}>Sign in with your mobile number</Text>
        <PhPhoneField
          value={phone}
          onChange={(v) => {
            setPhone(v);
            if (failure) clear();
          }}
          returnKeyType="send"
          onSubmitEditing={submitPhone}
        />
        <Button
          title="Send Code"
          icon="chatbubble-ellipses-outline"
          onPress={submitPhone}
          loading={sendingCode}
          disabled={submitting}
        />
        <Text style={styles.primaryHint}>Use the number your clinic has on file. We'll text you a 6-digit code.</Text>
      </View>

      <Divider label="or sign in with" />

      <View style={styles.grid}>
        <MethodTile
          icon="mail-outline"
          label="Email"
          active={showPassword}
          disabled={submitting}
          onPress={() => {
            clear();
            setShowPassword((v) => !v);
          }}
        />
        <MethodTile
          icon="qr-code-outline"
          label="QR code"
          disabled={submitting}
          onPress={() => {
            clear();
            setScanning(true);
          }}
        />
      </View>

      {showPassword ? (
        <View style={styles.passwordForm}>
          <IconField
            icon="person-outline"
            label="Email, mobile number or login ID"
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
          <Button title="Sign In" onPress={submitPassword} loading={submitting && !scanning && !sendingCode} />
        </View>
      ) : null}

      <Button
        title="I have an invite from my clinic"
        icon="mail-open-outline"
        variant="secondary"
        style={styles.invite}
        onPress={() => {
          clear();
          router.push('/invite');
        }}
        disabled={submitting}
      />

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

function MethodTile({
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tile, active && styles.tileActive, disabled && styles.tileDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Sign in with ${label}`}
      accessibilityState={{ disabled, expanded: active }}
    >
      <Ionicons name={icon} size={26} color={active ? colors.primaryOnSoft : colors.primary} />
      <Text style={[styles.tileLabel, active && styles.tileLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  logo: { marginTop: spacing.lg, marginBottom: spacing.xl },
  primary: { marginBottom: spacing.sm },
  primaryLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  primaryHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  grid: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 84,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileDisabled: { opacity: 0.5 },
  tileLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  tileLabelActive: { color: colors.primaryOnSoft },
  passwordForm: { marginTop: spacing.md },
  invite: { marginTop: spacing.md },
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
