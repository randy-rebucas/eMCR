import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button } from '@/components/ui';
import {
  AuthFailure,
  AuthHeader,
  AuthScreen,
  classifyAuthError,
  formatPhone,
  IconBadge,
  IconField,
  InlineError,
  MaintenanceScreen,
  OfflineScreen,
  OtpInput,
  TextLink,
} from '@/components/auth';

type Purpose = 'signin' | 'forgot' | 'activate';

const COPY: Record<Purpose, { title: string; subtitle: string; verifyTitle: string }> = {
  signin: {
    title: 'Sign In With a Code',
    subtitle: "Enter the mobile number registered with your clinic and we'll text you a 6-digit code.",
    verifyTitle: 'Enter Your Code',
  },
  forgot: {
    title: 'Forgot Password',
    subtitle: "Enter your registered mobile number and we'll text you a code, then you can choose a new password.",
    verifyTitle: 'Enter Your Code',
  },
  activate: {
    title: 'Activate Your Account',
    subtitle: "Enter the mobile number you gave your clinic. We'll text you a code to confirm it's you.",
    verifyTitle: 'Verify Your Account',
  },
};

const RESEND_SECONDS = 30;

/** Phone + SMS code sign-in, used for "sign in with a code", forgot password and first-time activation. */
export default function PhoneScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ purpose?: string }>();
  const purpose: Purpose = params.purpose === 'forgot' || params.purpose === 'activate' ? params.purpose : 'signin';
  const copy = COPY[purpose];

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [resendIn, setResendIn] = useState(0);
  // Keyboard "send", the button and the auto-submit on the 6th digit can all fire
  // in the same frame, before `submitting` re-renders; this ref is the real guard.
  const inFlight = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const backToPhone = useCallback(() => {
    setFailure(null);
    setStep('phone');
  }, []);

  // Android back on the code step returns to the number step instead of leaving the screen.
  useFocusEffect(
    useCallback(() => {
      if (step !== 'code') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        backToPhone();
        return true;
      });
      return () => sub.remove();
    }, [step, backToPhone])
  );

  if (auth.signedIn) {
    // The code signed the patient in; continue with the step this flow was for.
    const next =
      purpose === 'activate' ? '/set-password' : purpose === 'forgot' ? '/set-password?mode=reset' : '/enable-notifications';
    return <Redirect href={next} />;
  }

  async function sendCode() {
    if (inFlight.current) return;
    if (!phone.trim()) {
      setFailure({ kind: 'message', message: 'Enter the mobile number registered with your clinic.', status: 0 });
      return;
    }
    inFlight.current = true;
    setFailure(null);
    setRetryAction(() => sendCode);
    setSubmitting(true);
    try {
      await auth.requestOtp(phone.trim());
      setCode('');
      setStep('code');
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setFailure(classifyAuthError(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function verify(value = code) {
    if (inFlight.current) return;
    if (!/^\d{6}$/.test(value)) {
      setFailure({ kind: 'message', message: 'Enter the 6-digit code from the SMS.', status: 0 });
      return;
    }
    inFlight.current = true;
    setFailure(null);
    setRetryAction(() => () => verify(value));
    setSubmitting(true);
    try {
      await auth.loginWithOtp(phone.trim(), value);
    } catch (err) {
      const f = classifyAuthError(err);
      if (f.kind === 'message') setCode('');
      setFailure(f);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function onCodeChange(value: string) {
    setCode(value);
    if (failure) setFailure(null);
    if (value.length === 6) verify(value);
  }

  const retry = () => retryAction?.();
  if (failure?.kind === 'offline') {
    return <OfflineScreen onRetry={retry} onBack={() => setFailure(null)} retrying={submitting} />;
  }
  if (failure?.kind === 'maintenance') {
    return <MaintenanceScreen onRetry={retry} onBack={() => setFailure(null)} retrying={submitting} />;
  }
  const errorText = failure?.kind === 'message' ? failure.message : null;

  if (step === 'phone') {
    return (
      <AuthScreen back>
        <AuthHeader title={copy.title} subtitle={copy.subtitle} />
        {errorText ? <Banner message={errorText} /> : null}
        <IconField
          icon="call-outline"
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="send"
          onSubmitEditing={sendCode}
          autoFocus
        />
        <Button title="Send Code" onPress={sendCode} loading={submitting} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen back={backToPhone}>
      <AuthHeader
        title={copy.verifyTitle}
        subtitle={
          <>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.phone}>{formatPhone(phone)}</Text>
          </>
        }
      />
      <View style={styles.art}>
        <IconBadge icon="phone-portrait-outline" badge={{ icon: 'chatbubble-ellipses', tone: 'primary' }} />
      </View>

      <OtpInput value={code} onChange={onCodeChange} error={!!errorText} />
      {errorText ? <InlineError message={errorText} style={styles.error} /> : null}

      <Button title="Verify" onPress={() => verify()} loading={submitting} />

      <View style={styles.resend}>
        <Text style={styles.resendText}>Didn't receive the code?</Text>
        <View style={styles.resendRow}>
          <TextLink title="Resend Code" onPress={sendCode} disabled={resendIn > 0 || submitting} />
          {resendIn > 0 ? <Text style={styles.resendText}> (00:{String(resendIn).padStart(2, '0')})</Text> : null}
        </View>
        <TextLink title="Use a different number" onPress={backToPhone} disabled={submitting} style={styles.change} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  phone: { fontWeight: '700', color: colors.text },
  art: { marginVertical: spacing.md },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', marginTop: -spacing.sm, marginBottom: spacing.sm },
  resend: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
  resendRow: { flexDirection: 'row', alignItems: 'center' },
  resendText: { fontSize: 14, color: colors.textMuted },
  change: { marginTop: spacing.md },
});
