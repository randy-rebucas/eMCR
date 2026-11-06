import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, ApiError, apiRequest, errorMessage, TokenPair } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { emitRefresh } from '@/lib/events';
import { useApiData } from '@/lib/useApiData';
import { PatientProfile } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ChecklistItem, IconField, OtpConfirm, PASSWORD_RULES } from '@/components/auth';
import { useT } from '@/lib/i18n';

/**
 * Change (or, for a patient who only ever signed in by code/QR, set) the
 * password. The server signs out every other device and returns a new token
 * pair for this one, which must replace the stored pair or the next request fails.
 */
export default function PasswordScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const { applyRotatedTokens } = useAuth();
  const { data, loading } = useApiData<PatientProfile>('/api/patients/me');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  // Setting a first password outside a fresh code sign-in needs an SMS code (OTP_REQUIRED).
  const [otpStep, setOtpStep] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  // Keyboard "Done" and the button can both fire before `saving` re-renders.
  const inFlight = useRef(false);

  if (loading) return <LoadingView />;

  // Patients who only ever used a code or QR have no password yet, so "current" isn't asked for.
  const hasPassword = data?.hasPassword !== false;
  const rulesMet = PASSWORD_RULES.every((r) => r.test(next));
  const matches = confirm.length > 0 && confirm === next;
  const differs = !hasPassword || !current || next !== current;
  // The record's own phone only: the server doesn't take a code sent to a contact number as proof.
  const phone = (data?.phone ?? '').trim();
  // Sent to this patient's own record, never another record that shares the phone number.
  const sendCode = () => apiRequest('/api/patients/me/phone-code', { method: 'POST' });

  function submit() {
    if (inFlight.current) return;
    if (hasPassword && !current) return setError(t('profile.pw.enterCurrent'));
    if (!rulesMet) return setError(t('profile.pw.rulesNotMet'));
    if (!matches) return setError(t('profile.pw.noMatch'));
    if (!differs) return setError(t('profile.pw.mustDiffer'));
    send();
  }

  async function send(otp?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setOtpError(null);
    setWrongCurrent(false);
    setSaving(true);
    try {
      const result = await apiFetch<Partial<TokenPair>>('/api/patients/me/change-password', {
        method: 'POST',
        body: { ...(hasPassword ? { currentPassword: current } : {}), newPassword: next, ...(otp ? { otp } : {}) },
      });
      await applyRotatedTokens(result);
      emitRefresh('profile');
      setOtpStep(false);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_REQUIRED' && !otp) {
        if (!phone) {
          setError(
            t('profile.pw.noPhone'),
          );
          return;
        }
        try {
          await sendCode();
          setOtpStep(true);
        } catch (sendErr) {
          setError(errorMessage(sendErr, t('profile.pw.sendCodeFailed')));
        }
      } else if (otpStep) {
        setOtpError(errorMessage(err, t('profile.pw.codeFailed')));
      } else if (err instanceof ApiError && err.code === 'WRONG_CURRENT_PASSWORD') {
        setWrongCurrent(true);
        setCurrent('');
        setError(t('profile.pw.wrongCurrent'));
      } else {
        setError(errorMessage(err, t('profile.pw.saveFailed')));
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']}>
          <AppHeader back />
          <Text style={styles.title} accessibilityRole="header">
            {hasPassword ? t('profile.pw.changeTitle') : t('profile.pw.setTitle')}
          </Text>
          <Text style={styles.subtitle}>
            {hasPassword
              ? t('profile.pw.changeSubtitle')
              : t('profile.pw.setSubtitle')}
          </Text>
        </SafeAreaView>

        {done ? (
          <View style={[styles.card, styles.success]}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={40} color={colors.primaryText} />
            </View>
            <Text style={styles.successTitle}>{hasPassword ? t('profile.pw.updated') : t('profile.pw.set')}</Text>
            <Text style={styles.successText}>
              {hasPassword
                ? t('profile.pw.updatedBody')
                : t('profile.pw.setBody')}
            </Text>
            <Button title={t('common.done')} onPress={() => router.back()} style={styles.stretch} />
          </View>
        ) : (
          <>
            <View style={styles.notice}>
              <View style={styles.noticeIcon}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.noticeText}>
                {t('profile.pw.notice')}
              </Text>
            </View>

            {error ? <Banner message={error} /> : null}

            {otpStep ? (
              <View style={styles.card}>
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
              </View>
            ) : (
              <>
                <View style={styles.card}>
                  {hasPassword ? (
                    <>
                      <Text style={styles.label}>{t('profile.pw.current')}</Text>
                      <IconField
                        icon="lock-closed-outline"
                        label={t('profile.pw.enterCurrentField')}
                        value={current}
                        onChangeText={(v) => {
                          setCurrent(v);
                          if (wrongCurrent) setWrongCurrent(false);
                        }}
                        secureTextEntry
                        autoComplete="current-password"
                        textContentType="password"
                        error={wrongCurrent}
                      />
                    </>
                  ) : null}

                  <Text style={styles.label}>{t('profile.pw.new')}</Text>
                  <IconField
                    icon="key-outline"
                    label={t('profile.pw.enterNew')}
                    value={next}
                    onChangeText={setNext}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                  />

                  <Text style={styles.label}>{t('profile.pw.confirm')}</Text>
                  <IconField
                    icon="key-outline"
                    label={t('profile.pw.reenter')}
                    value={confirm}
                    onChangeText={setConfirm}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    error={confirm.length >= next.length && confirm.length > 0 && !matches}
                    returnKeyType="done"
                    onSubmitEditing={submit}
                  />

                  <View style={styles.rules}>
                    <Text style={styles.rulesTitle}>{t('profile.pw.mustHave')}</Text>
                    {PASSWORD_RULES.map((rule) => (
                      <ChecklistItem key={rule.label} label={rule.label} met={rule.test(next)} />
                    ))}
                    <ChecklistItem label={t('auth.pw.match')} met={matches} />
                    {hasPassword ? (
                      <ChecklistItem
                        label={t('profile.pw.differs')}
                        met={next.length > 0 && current.length > 0 && differs}
                      />
                    ) : null}
                  </View>
                </View>

                <Button
                  title={hasPassword ? t('profile.pw.update') : t('profile.pw.save')}
                  icon="lock-closed-outline"
                  onPress={submit}
                  loading={saving}
                  style={styles.save}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  stretch: { alignSelf: 'stretch' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: '#DDF3F1',
    borderWidth: 1,
    borderColor: '#C6EAE7',
    borderRadius: radius.lg,
    padding: spacing.sm + 6,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  noticeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    ...softShadow,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  rules: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.xs,
  },
  rulesTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  save: { marginTop: spacing.lg },
  success: { alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.lg },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  successText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
});
