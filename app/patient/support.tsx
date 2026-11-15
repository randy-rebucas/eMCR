import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useNavigation, usePreventRemove } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage, onServerReachable } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  appContext,
  platformLabel,
  sendSupportMessage,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  versionLabel,
} from '@/lib/support';
import { isNetworkError } from '@/lib/useApiData';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, KeyboardAvoider, useBottomPadding, useKeyboardVisible } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { IconField } from '@/components/auth';
import { t as translate, useT } from '@/lib/i18n';

/**
 * Write to the eMCR support team. The app version and phone details go with the message (shown
 * under the box), and the reply goes to the email given here, or by text to the account's number.
 */
export default function SupportScreen() {
  const t = useT();
  const navigation = useNavigation();
  const bottomPad = useBottomPadding();
  const keyboardVisible = useKeyboardVisible();
  const { patient, guardianOnly } = useAuth();
  // A guardian-only session is signed in on someone else's record: their email isn't the sender's.
  const [email, setEmail] = useState(!guardianOnly ? (patient?.email ?? '') : '');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [isSending, setSending] = useState(false);
  // Guards a second tap before `isSending` re-renders.
  const sending = useRef(false);
  const [reference, setReference] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const ctx = appContext();

  const dirty = !reference && message.trim().length > 0;

  // Ask before throwing away a typed message (back button, swipe, or the header chevron).
  usePreventRemove(dirty && !leaving, ({ repeat }) => {
    Alert.alert(translate('support.contact.discardTitle'), translate('support.contact.discardBody'), [
      { text: translate('support.contact.keepWriting'), style: 'cancel' },
      {
        text: translate('support.contact.discard'),
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          repeat();
        },
      },
    ]);
  });

  // The native-stack swipe-back can't be cancelled once it starts, so turn it off while there's a draft.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);

  useEffect(() => onServerReachable(() => setOffline(false)), []);

  function validate(): boolean {
    let ok = true;
    if (message.trim().length < SUPPORT_MESSAGE_MIN) {
      setMessageError(t('support.contact.tooShort', { min: SUPPORT_MESSAGE_MIN }));
      ok = false;
    } else setMessageError(null);
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError(t('support.contact.invalidEmail'));
      ok = false;
    } else setEmailError(null);
    return ok;
  }

  async function send() {
    if (sending.current) return;
    if (!validate()) return;
    sending.current = true;
    setSending(true);
    setSendError(null);
    try {
      setReference(await sendSupportMessage({ message, email }));
      setOffline(false);
    } catch (err) {
      if (isNetworkError(err)) setOffline(true);
      else setSendError(errorMessage(err, translate('support.contact.sendFailed')));
    } finally {
      sending.current = false;
      setSending(false);
    }
  }

  if (reference) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
        <SafeAreaView edges={['top']}>
          <AppHeader back />
        </SafeAreaView>
        <View style={styles.hero} accessibilityLiveRegion="polite">
          <View style={styles.heroIcon}>
            <Ionicons name="checkmark-circle" size={28} color={colors.accent} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t('support.contact.sentTitle')}
          </Text>
          <Text style={styles.heroBody}>{t('support.contact.sentBody')}</Text>
          <Text style={styles.heroRef} selectable>
            {t('support.contact.reference', { reference })}
          </Text>
        </View>
        <Button title={t('common.done')} onPress={() => router.back()} style={styles.action} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoider style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']}>
          <AppHeader back />
          <Text style={styles.title} accessibilityRole="header">
            {t('support.contact.title')}
          </Text>
          <Text style={styles.subtitle}>{t('support.contact.subtitle')}</Text>
        </SafeAreaView>

        <View style={styles.card}>
          <Text style={styles.label}>{t('support.contact.messageLabel')}</Text>
          <TextInput
            style={[styles.input, !!messageError && styles.inputError]}
            value={message}
            onChangeText={(v) => {
              setMessage(v);
              if (messageError && v.trim().length >= SUPPORT_MESSAGE_MIN) setMessageError(null);
            }}
            placeholder={t('support.contact.messagePlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={SUPPORT_MESSAGE_MAX}
            textAlignVertical="top"
            editable={!isSending}
            accessibilityLabel={t('support.contact.messageLabel')}
            accessibilityHint={t('support.contact.messagePlaceholder')}
          />
          {messageError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {messageError}
            </Text>
          ) : null}

          <Text style={[styles.label, styles.gapTop]}>{t('support.contact.emailLabel')}</Text>
          <IconField
            icon="mail-outline"
            label={t('support.contact.emailLabel')}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            editable={!isSending}
            error={!!emailError}
          />
          {emailError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {emailError}
            </Text>
          ) : (
            <Text style={styles.hint}>{t('support.contact.emailHint')}</Text>
          )}
        </View>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            {t('support.contact.attached', { version: versionLabel(ctx), device: platformLabel(ctx) })}
          </Text>
        </View>
      </ScrollView>

      <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} style={styles.barWrap}>
        {offline ? (
          <View style={styles.barError}>
            <Banner tone="warning" message={t('support.offline')} />
          </View>
        ) : sendError ? (
          <View style={styles.barError}>
            <Banner message={sendError} />
          </View>
        ) : null}
        <Button
          title={offline ? t('common.tryAgainTitle') : t('support.contact.send')}
          icon={offline ? 'refresh' : 'send'}
          onPress={send}
          loading={isSending}
          disabled={!message.trim()}
        />
      </SafeAreaView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  gapTop: { marginTop: spacing.md },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    fontSize: 15,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: -6 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xs, marginTop: spacing.md },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  barWrap: {
    paddingHorizontal: spacing.md + 4,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barError: { marginBottom: spacing.sm },
  action: { marginTop: spacing.lg },
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginTop: spacing.lg },
  heroIcon: { marginBottom: spacing.sm },
  heroTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  heroBody: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted, marginTop: spacing.xs },
  heroRef: { fontSize: 14, fontWeight: '600', color: colors.primaryText, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
});
