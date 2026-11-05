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
import { t as translate, useT } from '@/lib/i18n';
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
  const t = useT();
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
      setFailure({ kind: 'message', message: t('auth.login.missingFields'), status: 0 });
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
      setFailure({ kind: 'message', message: t('auth.enterPhMobile'), status: 0 });
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
        message: t('auth.login.patientIdQr'),
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
        title={t('auth.login.wrongTitle')}
        message={t('auth.login.wrongMessage')}
        action={{
          title: t('common.tryAgainTitle'),
          onPress: () => {
            setPassword('');
            clear();
          },
        }}
        link={{ title: t('auth.login.forgotTitle'), onPress: () => router.push('/phone?purpose=forgot') }}
      />
    );
  }

  const inlineError = failure?.kind === 'message' ? failure.message : null;

  return (
    <AuthScreen>
      <View style={styles.logo}>
        <BrandLogo />
      </View>
      <AuthHeader title={t('auth.login.title')} subtitle={t('auth.login.subtitle')} align="center" />

      {auth.notice ? <Banner message={auth.notice} tone="warning" /> : null}
      {inlineError ? <Banner message={inlineError} /> : null}

      <View style={styles.primary}>
        <Text style={styles.primaryLabel}>{t('auth.login.withPhone')}</Text>
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
          title={t('auth.sendCode')}
          icon="chatbubble-ellipses-outline"
          onPress={submitPhone}
          loading={sendingCode}
          disabled={submitting}
        />
        <Text style={styles.primaryHint}>{t('auth.login.phoneHint')}</Text>
      </View>

      <Divider label={t('auth.login.orSignInWith')} />

      <View style={styles.grid}>
        <MethodTile
          icon="mail-outline"
          label={t('auth.login.email')}
          active={showPassword}
          disabled={submitting}
          onPress={() => {
            clear();
            setShowPassword((v) => !v);
          }}
        />
        <MethodTile
          icon="qr-code-outline"
          label={t('auth.login.qr')}
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
            label={t('auth.login.idLabel')}
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
            label={t('auth.login.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submitPassword}
          />
          <TextLink
            title={t('auth.login.forgot')}
            onPress={() => router.push('/phone?purpose=forgot')}
            style={styles.forgot}
          />
          <Button title={t('auth.login.signIn')} onPress={submitPassword} loading={submitting && !scanning && !sendingCode} />
        </View>
      ) : null}

      <Button
        title={t('auth.login.haveInvite')}
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
        <Text style={styles.footerText}>{t('auth.login.noNumber')}</Text>
        <TextLink title={t('auth.requestAccess')} onPress={() => router.push('/request-access')} disabled={submitting} />
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
      accessibilityLabel={translate('auth.login.methodA11y', { method: label })}
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
