import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { formatInviteCode, noteAccountCredentials, parseInviteCode, previewInvite, redeemInvite, sendInviteCode } from '@/lib/emcr';
import { ApiError } from '@/lib/api';
import type { EmcrInvitePreview } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button } from '@/components/ui';
import {
  AuthFailure,
  AuthHeader,
  AuthScreen,
  classifyAuthError,
  IconBadge,
  IconField,
  InlineError,
  MaintenanceScreen,
  OfflineScreen,
  OtpInput,
  TextLink,
} from '@/components/auth';
import { QrScanner } from '@/components/QrScanner';

const RESEND_SECONDS = 30;

/** "Maria D." · "Maria D. and Jose D." · "Maria D., Jose D. and Ana D." */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A clinic invite (printed slip, texted link, or myclinicsoft://invite?c=CODE): enter or scan the
 * code → see who it is for → SMS code to the number the clinic confirmed → signed in, with every
 * record on the invite. No name or birth-date questions.
 */
export default function InviteScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ c?: string }>();
  const initial = parseInviteCode(params.c);

  const [step, setStep] = useState<'code' | 'confirm' | 'otp'>('code');
  const [typed, setTyped] = useState(initial ? formatInviteCode(initial) : '');
  const [code, setCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmcrInvitePreview | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [signedInBefore] = useState(auth.signedIn);
  const inFlight = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const goBack = useCallback(() => {
    setFailure(null);
    setStep((s) => (s === 'otp' ? 'confirm' : 'code'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (step === 'code') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack();
        return true;
      });
      return () => sub.remove();
    }, [step, goBack])
  );

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    setRetryAction(() => () => run(action));
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setFailure(classifyAuthError(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function lookUp(input = typed) {
    const parsed = parseInviteCode(input);
    if (!parsed) {
      setFailure({ kind: 'message', message: 'Enter the 8-character code from your invite, like ABCD-2345.', status: 0 });
      return;
    }
    run(async () => {
      const result = await previewInvite(parsed);
      setCode(parsed);
      setTyped(formatInviteCode(parsed));
      setPreview(result);
      setStep('confirm');
    });
  }

  // Opened from the link or slip: look it up straight away.
  useEffect(() => {
    if (initial && !opened.current && !signedInBefore) {
      opened.current = true;
      lookUp(initial);
    }
  }, [initial]);

  function sendCode() {
    if (!code) return;
    run(async () => {
      setSentTo(await sendInviteCode(code));
      setOtp('');
      setStep('otp');
      setResendIn(RESEND_SECONDS);
    });
  }

  function verify(value = otp) {
    if (!code) return;
    if (!/^\d{6}$/.test(value)) {
      setFailure({ kind: 'message', message: 'Enter the 6-digit code from the SMS.', status: 0 });
      return;
    }
    run(async () => {
      try {
        const result = await redeemInvite(code, value);
        if (result.session) {
          noteAccountCredentials(result.account);
          await auth.applySession(result.session);
          return;
        }
        // Linked, but nothing to sign in as yet (rare): the phone sign-in takes over.
        router.replace('/phone?purpose=signin');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setOtp('');
        throw err;
      }
    });
  }

  function onOtpChange(value: string) {
    setOtp(value);
    if (failure) setFailure(null);
    if (value.length === 6) verify(value);
  }

  function onScanned(data: string) {
    setScanning(false);
    const parsed = parseInviteCode(data);
    if (!parsed) {
      setFailure({ kind: 'message', message: "That isn't an eMCR invite. Scan the QR code on the slip from your clinic.", status: 0 });
      return;
    }
    lookUp(parsed);
  }

  if (auth.signedIn && !signedInBefore) return <Redirect href="/enable-notifications" />;

  const retry = () => retryAction?.();
  if (failure?.kind === 'offline') return <OfflineScreen onRetry={retry} onBack={() => setFailure(null)} retrying={submitting} />;
  if (failure?.kind === 'maintenance') return <MaintenanceScreen onRetry={retry} onBack={() => setFailure(null)} retrying={submitting} />;
  const errorText = failure?.kind === 'message' ? failure.message : null;

  if (signedInBefore) {
    return (
      <AuthScreen back>
        <AuthHeader
          title="You're Already Signed In"
          subtitle="To use this invite, sign out first, then open the invite link again or enter the code on the welcome screen."
        />
        <Button title="Back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </AuthScreen>
    );
  }

  if (step === 'confirm' && preview) {
    const forOthers = preview.mode === 'guardian';
    return (
      <AuthScreen back={goBack}>
        <View style={styles.art}>
          <IconBadge icon="mail-open-outline" badge={{ icon: 'checkmark', tone: 'primary' }} />
        </View>
        <AuthHeader
          title={`Invite From ${preview.clinicName}`}
          subtitle={
            forOthers ? (
              <>
                For the person who looks after{'\n'}
                <Text style={styles.strong}>{joinNames(preview.people)}</Text>
              </>
            ) : (
              <>
                Health records for <Text style={styles.strong}>{joinNames(preview.people)}</Text>
              </>
            )
          }
          align="center"
        />
        {errorText ? <Banner message={errorText} /> : null}
        <Text style={styles.note}>
          We'll text a 6-digit code to <Text style={styles.strong}>{preview.phoneHint}</Text>, the number your clinic confirmed. If that's not your
          number, ask the clinic for a new invite.
        </Text>
        <Button title="Send Code" onPress={sendCode} loading={submitting} />
      </AuthScreen>
    );
  }

  if (step === 'otp') {
    return (
      <AuthScreen back={goBack}>
        <AuthHeader
          title="Enter Your Code"
          subtitle={
            <>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.strong}>{sentTo || preview?.phoneHint}</Text>
            </>
          }
        />
        <View style={styles.art}>
          <IconBadge icon="phone-portrait-outline" badge={{ icon: 'chatbubble-ellipses', tone: 'primary' }} />
        </View>
        <OtpInput value={otp} onChange={onOtpChange} error={!!errorText} />
        {errorText ? <InlineError message={errorText} style={styles.error} /> : null}
        <Button title="Verify" onPress={() => verify()} loading={submitting} />
        <View style={styles.resend}>
          <Text style={styles.muted}>Didn't receive the code?</Text>
          <View style={styles.row}>
            <TextLink title="Resend Code" onPress={sendCode} disabled={resendIn > 0 || submitting} />
            {resendIn > 0 ? <Text style={styles.muted}> (00:{String(resendIn).padStart(2, '0')})</Text> : null}
          </View>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen back>
      <AuthHeader title="Your Clinic Invite" subtitle="Scan the QR code on the slip from your clinic, or type the code under it." />
      {errorText ? <Banner message={errorText} /> : null}
      <Button title="Scan Invite QR" icon="qr-code-outline" onPress={() => setScanning(true)} disabled={submitting} />
      <IconField
        icon="ticket-outline"
        label="Invite code"
        value={typed}
        onChangeText={(v) => {
          setTyped(v);
          if (failure) setFailure(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCD-2345"
        returnKeyType="go"
        onSubmitEditing={() => lookUp()}
      />
      <Button title="Continue" variant="secondary" onPress={() => lookUp()} loading={submitting && !scanning} />
      <View style={styles.footer}>
        <Text style={styles.muted}>No invite? </Text>
        <TextLink title="Sign in with your phone" onPress={() => router.replace('/phone?purpose=signin')} disabled={submitting} />
      </View>
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <QrScanner onScanned={onScanned} onCancel={() => setScanning(false)} />
      </Modal>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  art: { marginVertical: spacing.md, alignItems: 'center' },
  strong: { fontWeight: '700', color: colors.text },
  note: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', marginTop: -spacing.sm, marginBottom: spacing.sm },
  resend: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center' },
  muted: { fontSize: 14, color: colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 'auto', paddingTop: spacing.xl },
});
