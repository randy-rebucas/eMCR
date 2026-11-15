import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ApiError, errorMessage, withSessionHold } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getCredentialStep, rememberIssuedLoginId, saveAccountPassword, setCredentialStep } from '@/lib/emcr';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button } from '@/components/ui';
import {
  AuthHeader,
  AuthScreen,
  ChecklistItem,
  IconField,
  PASSWORD_RULES,
  StatusScreen,
  IconBadge,
  TextLink,
  useBlockHardwareBack,
} from '@/components/auth';
import { useT } from '@/lib/i18n';

/**
 * The eMCR sign-in credential (mobile number + password), owed right after a sign-in
 * (lib/emcr.ts `CredentialStep`): a first password after the phone was proven, the
 * replacement for the clinic's temporary one, or a reset. Not skippable: without it the
 * person could only ever get back in by SMS code. A `temp` step without the temporary password in
 * memory (the app was relaunched, or the server answered PASSWORD_CHANGE_REQUIRED) asks for it;
 * a patient who no longer has it signs in with an SMS code instead (forgot password).
 */
export default function CreatePasswordScreen() {
  const { signedIn, signOut, applyRotatedTokens } = useAuth();
  const t = useT();
  const [step] = useState(getCredentialStep);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const inFlight = useRef(false);

  useBlockHardwareBack();

  if (!signedIn) return <Redirect href="/login" />;
  if (!step) return <Redirect href="/enable-notifications" />;

  /** The temporary password has to be typed in: the app doesn't have it any more. */
  const asksCurrent = step.mode === 'temp' && !step.currentPassword;
  const copy = {
    title: t(`auth.createPw.${step.mode}.title`),
    subtitle: asksCurrent ? t('auth.createPw.temp.askSubtitle') : t(`auth.createPw.${step.mode}.subtitle`),
  };
  const rulesMet = PASSWORD_RULES.every((rule) => rule.test(password));
  const matches = confirm.length > 0 && confirm === password;

  if (stale) {
    return (
      <StatusScreen
        art={<IconBadge icon="time-outline" tone="slate" />}
        title={t('auth.createPw.staleTitle')}
        message={t('auth.createPw.staleMessage')}
        action={{
          title: t('auth.createPw.staleTitle'),
          onPress: async () => {
            setCredentialStep(null);
            await signOut();
            router.replace('/phone?purpose=signin');
          },
        }}
      />
    );
  }

  async function signInWithCodeInstead() {
    setCredentialStep(null);
    await signOut().catch(() => {});
    router.replace('/phone?purpose=forgot');
  }

  async function save() {
    if (inFlight.current || !step) return;
    if (asksCurrent && !current) return setError(t('auth.createPw.enterTemp'));
    if (!rulesMet) return setError(t('auth.pw.rulesError'));
    if (!matches) return setError(t('auth.pw.mismatch'));
    inFlight.current = true;
    setError(null);
    setSaving(true);
    try {
      // Held: other calls don't refresh (and lose) the session while the token pair rotates.
      const result = await withSessionHold(async () => {
        const saved = await saveAccountPassword(
          password,
          step.mode === 'temp' ? step.currentPassword || current : undefined
        );
        await applyRotatedTokens(saved);
        return saved;
      });
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
      if (asksCurrent && err instanceof ApiError && err.code === 'WRONG_CURRENT_PASSWORD') {
        setError(t('auth.createPw.wrongTemp'));
        return;
      }
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

  return (
    <AuthScreen>
      <AuthHeader title={copy.title} subtitle={copy.subtitle} />
      {asksCurrent ? (
        <IconField
          icon="key-outline"
          label={t('auth.createPw.tempField')}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
        />
      ) : null}
      <IconField
        icon="lock-closed-outline"
        label={step.mode === 'create' ? t('auth.pw.create') : t('auth.pw.new')}
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
      {error ? <Banner message={error} /> : null}
      <Button title={t('auth.pw.saveAndContinue')} onPress={save} loading={saving} />
      {asksCurrent ? (
        <TextLink title={t('auth.createPw.useCode')} onPress={signInWithCodeInstead} disabled={saving} style={styles.useCode} />
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  rules: { marginTop: spacing.xs, marginBottom: spacing.md },
  rulesTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  useCode: { marginTop: spacing.md },
});
