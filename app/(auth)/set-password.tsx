import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { apiFetch, ApiError, errorMessage, TokenPair } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { emitRefresh } from '@/lib/events';
import { useApiData } from '@/lib/useApiData';
import { PatientProfile } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button, LoadingView } from '@/components/ui';
import {
  AuthHeader,
  AuthScreen,
  ChecklistItem,
  IconBadge,
  IconField,
  OtpConfirm,
  PASSWORD_RULES,
  StatusScreen,
  TextLink,
  useBlockHardwareBack,
} from '@/components/auth';
import { useT } from '@/lib/i18n';

/**
 * Step right after an SMS code signed the patient in.
 *
 * - Activation (default): choose the email + password used for future sign-ins
 *   (POST setup-credentials).
 * - `?mode=reset` (forgot password): choose a new password. A session from an
 *   OTP sign-in in the last 15 minutes may change it without the current one
 *   (POST change-password with only `newPassword`).
 *
 * Skipping either keeps the patient signed in and continues the normal flow.
 */
export default function SetPasswordScreen() {
  const { signedIn, applyRotatedTokens, requestOtp } = useAuth();
  const t = useT();
  const params = useLocalSearchParams<{ mode?: string }>();
  const reset = params.mode === 'reset';
  const { data: profile, loading } = useApiData<PatientProfile>(signedIn ? '/api/patients/me' : null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetExpired, setResetExpired] = useState(false);
  const inFlight = useRef(false);
  // Code sign-in older than 15 minutes: the server asks for a fresh SMS code (OTP_REQUIRED).
  const [otpStep, setOtpStep] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Android back would reach the sign-in screen, which only redirects past this step.
  useBlockHardwareBack();

  useEffect(() => {
    const existing = profile?.email ?? profile?.contacts?.email;
    if (existing) setEmail((current) => current || existing);
  }, [profile]);

  if (!signedIn) return <Redirect href="/login" />;
  if (loading) return <LoadingView />;

  const skip = () => router.replace('/enable-notifications');

  if (reset && resetDone) {
    return (
      <StatusScreen
        art={<IconBadge icon="checkmark-circle" />}
        title={t('auth.setPw.updatedTitle')}
        message={t('auth.setPw.updatedMessage')}
        action={{ title: t('auth.continue'), onPress: skip }}
      />
    );
  }

  if (reset && resetExpired) {
    return (
      <StatusScreen
        art={<IconBadge icon="time-outline" tone="slate" />}
        title={t('auth.setPw.expiredTitle')}
        message={t('auth.setPw.expiredMessage')}
        action={{ title: t('auth.continue'), onPress: skip }}
      />
    );
  }

  if (!reset && profile?.hasPassword) {
    return (
      <StatusScreen
        art={<IconBadge icon="checkmark-circle" />}
        title={t('auth.setPw.alreadyTitle')}
        message={t('auth.setPw.alreadyMessage')}
        action={{ title: t('auth.continue'), onPress: skip }}
      />
    );
  }

  const rulesMet = PASSWORD_RULES.every((rule) => rule.test(password));
  const matches = confirm.length > 0 && confirm === password;
  // The record's own phone only: the server doesn't take a code sent to a contact number as proof.
  const phone = (profile?.phone ?? '').trim();
  const sendCode = () => requestOtp(phone);

  function save() {
    if (inFlight.current) return;
    if (!reset && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t('auth.invalidEmail'));
    if (!rulesMet) return setError(t('auth.pw.rulesError'));
    if (!matches) return setError(t('auth.pw.mismatch'));
    send();
  }

  async function send(otp?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setOtpError(null);
    setSaving(true);
    const withOtp = otp ? { otp } : {};
    try {
      if (reset) {
        const result = await apiFetch<Partial<TokenPair>>('/api/patients/me/change-password', {
          method: 'POST',
          body: { newPassword: password, ...withOtp },
        });
        await applyRotatedTokens(result);
        emitRefresh('profile');
        setResetDone(true);
      } else {
        const result = await apiFetch<Partial<TokenPair>>('/api/patients/auth/setup-credentials', {
          method: 'POST',
          body: { email: email.trim(), password, ...withOtp },
        });
        await applyRotatedTokens(result);
        router.replace('/all-set');
      }
    } catch (err) {
      if (reset && err instanceof ApiError && err.code === 'CURRENT_PASSWORD_REQUIRED') {
        setResetExpired(true);
        return;
      }
      if (err instanceof ApiError && err.code === 'OTP_REQUIRED' && !otp) {
        if (!phone) {
          setError(t('auth.setPw.noPhone'));
          return;
        }
        try {
          await sendCode();
          setOtpStep(true);
        } catch (sendErr) {
          setError(errorMessage(sendErr, t('auth.setPw.sendFailed')));
        }
        return;
      }
      // A wrong/expired code keeps the code step open; anything else (e.g. 409
      // EMAIL_IN_USE, whose message says so) goes back to the form.
      if (otpStep && err instanceof ApiError && err.status === 400 && err.code !== 'EMAIL_IN_USE') {
        setOtpError(errorMessage(err, t('auth.setPw.codeFailed')));
        return;
      }
      setOtpStep(false);
      setError(
        err instanceof ApiError && err.code === 'NETWORK'
          ? t('common.network')
          : errorMessage(err, t('auth.pw.saveFailed'))
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  if (otpStep) {
    return (
      <AuthScreen>
        <AuthHeader title={t('auth.setPw.confirmTitle')} />
        <OtpConfirm
          phone={phone}
          sendCode={sendCode}
          onVerify={(code) => send(code)}
          onCancel={() => {
            setOtpStep(false);
            setOtpError(null);
          }}
          verifying={saving}
          error={otpError}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <AuthHeader
        title={reset ? t('auth.createPw.reset.title') : t('auth.createPw.create.title')}
        subtitle={reset ? t('auth.setPw.resetSubtitle') : t('auth.setPw.createSubtitle')}
      />
      {error ? <Banner message={error} /> : null}

      {reset ? null : (
        <IconField
          icon="mail-outline"
          label={t('auth.setPw.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
      )}
      <IconField
        icon="lock-closed-outline"
        label={reset ? t('auth.pw.new') : t('auth.pw.create')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <IconField
        icon="lock-closed-outline"
        label={t('auth.pw.confirm')}
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
        <Text style={styles.rulesTitle}>{t('auth.pw.mustHave')}</Text>
        {PASSWORD_RULES.map((rule) => (
          <ChecklistItem key={rule.label} label={rule.label} met={rule.test(password)} />
        ))}
        <ChecklistItem label={t('auth.pw.match')} met={matches} />
      </View>

      <Button title={reset ? t('auth.setPw.saveNew') : t('auth.pw.saveAndContinue')} onPress={save} loading={saving} />
      <TextLink title={t('auth.setPw.skip')} onPress={skip} disabled={saving} style={styles.skip} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  rules: { marginTop: spacing.xs, marginBottom: spacing.md },
  rulesTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  skip: { alignSelf: 'center', marginTop: spacing.lg },
});
