import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { claimContextFrom, noteAccountCredentials, requestPhoneCode, setClaimContext, setCredentialStep, verifyPhoneCode } from '@/lib/emcr';
import { tokenClaims } from '@/lib/api';
import { getSession } from '@/lib/storage';
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

/**
 * - signin: eMCR phone sign-in (emcr/auth/otp/*). A returning account is signed in at once; a
 *   first sign-in continues to "Is this your record?".
 * - add: signed in, adding someone they look after. The claim needs a fresh phone proof.
 * - forgot: the same eMCR code sign-in, then a new password for mobile number + password sign-in.
 */
type Purpose = 'signin' | 'forgot' | 'add';

const COPY: Record<Purpose, { title: string; subtitle: string; verifyTitle: string }> = {
  signin: {
    title: 'Sign In With Your Phone',
    subtitle: "Enter the mobile number your clinic has on file and we'll text you a 6-digit code.",
    verifyTitle: 'Enter Your Code',
  },
  forgot: {
    title: 'Forgot Password',
    subtitle: "Enter the mobile number you sign in with and we'll text you a code, then you can choose a new password.",
    verifyTitle: 'Enter Your Code',
  },
  add: {
    title: 'Confirm Your Phone',
    subtitle:
      "To add someone you look after, confirm your mobile number. It must be the number their clinic has on file. We'll text you a 6-digit code.",
    verifyTitle: 'Enter Your Code',
  },
};

const RESEND_SECONDS = 30;

/**
 * Adding from Family while signed in on an eMCR account (`acc` claim): the number must be that
 * account's. A session without `acc` (password / QR) moves onto the phone's account instead.
 */
async function belongsToOtherAccount(accountId: string | null | undefined): Promise<boolean> {
  const session = await getSession();
  const current = session ? tokenClaims(session.accessToken)?.acc : undefined;
  return typeof current === 'string' && !!accountId && current !== accountId;
}

/** Phone + SMS code: eMCR sign-in, adding someone you look after, and forgot password. */
export default function PhoneScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ purpose?: string }>();
  // 'activate' was the old first-time path; it is the phone sign-in now.
  const purpose: Purpose = params.purpose === 'forgot' || params.purpose === 'add' ? params.purpose : 'signin';
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

  if (auth.signedIn && purpose !== 'add') {
    // The code signed the patient in; continue with the step this flow was for.
    // The notifications step forwards to /create-password while a password is owed.
    return <Redirect href="/enable-notifications" />;
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
      await requestPhoneCode(phone.trim());
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
      const result = await verifyPhoneCode(phone.trim(), value);
      if (purpose === 'forgot') {
        if (!result.session) {
          setCode('');
          setFailure({
            kind: 'message',
            message: 'No records are linked to this number yet, so there is no password to reset. Sign in with your phone instead.',
            status: 0,
          });
          return;
        }
        setCredentialStep({ mode: 'reset' });
        await auth.applySession(result.session);
        return;
      }
      if (purpose === 'signin' && result.session) {
        // A returning account: signed in (the redirect above takes over). No password yet:
        // create one first.
        setClaimContext(null);
        noteAccountCredentials(result.account);
        await auth.applySession(result.session);
        return;
      }
      if (purpose === 'add' && (await belongsToOtherAccount(result.account?.id))) {
        setCode('');
        setFailure({
          kind: 'message',
          message:
            'This number belongs to a different eMCR account. Use the number you signed in with, or sign out and sign in with this one.',
          status: 0,
        });
        return;
      }
      setClaimContext(claimContextFrom(result, phone.trim(), purpose === 'add' ? 'add' : 'signin'));
      router.replace(purpose === 'add' ? '/claim-details?relation=other' : '/verify-owner');
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
        {purpose === 'signin' ? (
          <View style={styles.inviteHint}>
            <Text style={styles.resendText}>Still nothing? Your clinic may have a different number. Ask them for an app invite.</Text>
            <TextLink title="I have an invite" onPress={() => router.replace('/invite')} disabled={submitting} />
          </View>
        ) : null}
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
  inviteHint: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs, paddingHorizontal: spacing.md },
});
