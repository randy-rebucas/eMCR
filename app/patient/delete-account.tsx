import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage, onServerReachable } from '@/lib/api';
import { authenticate, canUseAppLock } from '@/lib/appLock';
import { formatDate } from '@/lib/format';
import { useProfile } from '@/lib/profile';
import {
  DELETE_ACCOUNT_URL,
  DELETION_REASON_MAX,
  DeletionRequest,
  DeletionStatus,
  getDeletionRequest,
  openWebPage,
  requestDeletion,
} from '@/lib/support';
import { isNetworkError } from '@/lib/useApiData';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName, KeyboardAvoider, LoadingView, useBottomPadding } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';
import { AppHeader } from '@/components/AppHeader';
import { PlainKey, t as translate, useT } from '@/lib/i18n';

const STATUS_LABEL: Record<DeletionStatus, PlainKey> = {
  open: 'support.delete.status.open',
  'in-progress': 'support.delete.status.inProgress',
  resolved: 'support.delete.status.resolved',
  closed: 'support.delete.status.closed',
};

const DELETED: PlainKey[] = [
  'support.delete.deleted.account',
  'support.delete.deleted.links',
  'support.delete.deleted.requests',
  'support.delete.deleted.devices',
];

const KEPT: PlainKey[] = ['support.delete.kept.clinics', 'support.delete.kept.billing', 'support.delete.kept.backups'];

/**
 * Ask for the signed-in person's eMCR account to be deleted, from inside the app (store policy).
 * A person reviews each request and finishes it within 30 days of confirming identity; the
 * request is always about the account holder, never the family member on screen.
 */
export default function DeleteAccountScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { viewing } = useProfile();
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; network: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  // Guards a second tap before `isSubmitting` re-renders.
  const submitting = useRef(false);
  const [justSent, setJustSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRequest(await getDeletionRequest());
      setOffline(false);
    } catch (err) {
      const network = isNetworkError(err);
      setLoadError({ message: network ? translate('support.offline') : errorMessage(err, translate('support.delete.loadFailed')), network });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The connection came back (any call got an answer): sending is possible again.
  useEffect(() => onServerReachable(() => setOffline(false)), []);

  async function send() {
    if (submitting.current || offline) return;
    submitting.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Confirm it's the account holder holding the phone, when the phone has a screen lock.
      if (await canUseAppLock()) {
        const check = await authenticate(translate('support.delete.authPrompt'));
        if (!check.ok) {
          if (check.message) setSubmitError(check.message);
          return;
        }
      }
      const created = await requestDeletion(reason);
      setRequest(created);
      setJustSent(true);
    } catch (err) {
      if (isNetworkError(err)) {
        setOffline(true);
      } else {
        setSubmitError(errorMessage(err, translate('support.delete.sendFailed')));
      }
    } finally {
      submitting.current = false;
      setSubmitting(false);
    }
  }

  function confirm() {
    if (submitting.current || offline) return;
    Alert.alert(translate('support.delete.confirmTitle'), translate('support.delete.confirmBody'), [
      { text: translate('common.cancel'), style: 'cancel' },
      { text: translate('support.delete.confirmAction'), style: 'destructive', onPress: send },
    ]);
  }

  if (loading && !request) return <LoadingView />;
  if (loadError && !request) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.pad}>
          <AppHeader back />
        </View>
        <ErrorState message={loadError.message} onRetry={load} />
      </SafeAreaView>
    );
  }

  const memberName = viewing && !viewing.self ? viewing.firstName : null;

  return (
    <KeyboardAvoider style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']}>
          <AppHeader back />
          <Text style={styles.title} accessibilityRole="header">
            {t('support.delete.title')}
          </Text>
          <Text style={styles.subtitle}>{t('support.delete.subtitle')}</Text>
        </SafeAreaView>

        {memberName ? (
          <View style={styles.spaced}>
            <Banner tone="warning" message={t('support.delete.memberNote', { name: memberName })} />
          </View>
        ) : null}

        {request ? <StatusCard request={request} justSent={justSent} /> : null}
        {/* A closed request (withdrawn, or couldn't be confirmed) can be followed by a new one. */}
        {!request || request.status === 'closed' ? (
          <>
            <Section title={t('support.delete.deletedTitle')} icon="trash-outline" danger items={DELETED} />
            <Section title={t('support.delete.keptTitle')} icon="archive-outline" items={KEPT} />
            <Section
              title={t('support.delete.processTitle')}
              icon="time-outline"
              items={['support.delete.process.review', 'support.delete.process.days', 'support.delete.process.final']}
            />

            <Text style={styles.label}>{t('support.delete.reasonLabel')}</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder={t('support.delete.reasonPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={DELETION_REASON_MAX}
              textAlignVertical="top"
              editable={!isSubmitting}
              accessibilityLabel={t('support.delete.reasonLabel')}
            />

            {offline ? (
              <View style={styles.spaced}>
                <Banner tone="warning" message={t('support.offline')} />
                <Button title={t('common.tryAgainTitle')} variant="secondary" icon="refresh" onPress={load} style={styles.retry} />
              </View>
            ) : null}
            {submitError ? (
              <View style={styles.spaced}>
                <Banner message={submitError} />
              </View>
            ) : null}

            <Button
              title={t('support.delete.action')}
              icon="trash-outline"
              variant="danger"
              onPress={confirm}
              loading={isSubmitting}
              disabled={offline}
              style={styles.action}
            />
            <Text style={styles.footnote}>{t('support.delete.actionNote')}</Text>
          </>
        ) : null}

        <TouchableOpacity style={styles.link} onPress={() => router.push('/patient/support')} accessibilityRole="button">
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
          <Text style={styles.linkText}>{t('support.delete.contactSupport')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={() => openWebPage(DELETE_ACCOUNT_URL)} accessibilityRole="link">
          <Ionicons name="open-outline" size={18} color={colors.primary} />
          <Text style={styles.linkText}>{t('support.delete.webPage')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoider>
  );
}

function StatusCard({ request, justSent }: { request: DeletionRequest; justSent: boolean }) {
  const t = useT();
  const date = formatDate(request.requestedAt, { month: 'long', day: 'numeric', year: 'numeric' });
  const done = request.status === 'resolved' || request.status === 'closed';
  return (
    <View style={styles.hero} accessibilityLiveRegion="polite">
      <View style={styles.heroTop}>
        <Text style={styles.heroEyebrow}>{t('support.delete.requestEyebrow')}</Text>
        <View style={styles.heroChip}>
          <Ionicons name={done ? 'checkmark-circle' : 'time-outline'} size={14} color={colors.accent} />
          <Text style={styles.heroChipText}>{t(STATUS_LABEL[request.status] ?? 'support.delete.status.open')}</Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>{justSent ? t('support.delete.sentTitle') : t('support.delete.existingTitle')}</Text>
      <Text style={styles.heroBody}>{t('support.delete.requestedOn', { date })}</Text>
      <Text style={styles.heroBody} selectable>
        {t('support.delete.reference', { reference: request.reference })}
      </Text>
      {!done ? <Text style={[styles.heroBody, styles.heroNext]}>{t('support.delete.next')}</Text> : null}
    </View>
  );
}

function Section({
  title,
  icon,
  items,
  danger,
}: {
  title: string;
  icon: IconName;
  items: PlainKey[];
  danger?: boolean;
}) {
  const t = useT();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, danger && styles.sectionIconDanger]}>
          <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.card}>
        {items.map((key) => (
          <View key={key} style={styles.item}>
            <Text style={styles.bullet}>{'•'}</Text>
            <Text style={styles.itemText}>{t(key)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: spacing.md + 4 },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  spaced: { marginTop: spacing.md },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconDanger: { backgroundColor: colors.dangerSoft },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  item: { flexDirection: 'row', gap: spacing.sm },
  bullet: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  itemText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: spacing.lg, marginBottom: 6 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    fontSize: 15,
    color: colors.text,
  },
  retry: { marginTop: spacing.sm },
  action: { marginTop: spacing.lg },
  footnote: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, minHeight: 44 },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginTop: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.navyLine,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  heroChipText: { fontSize: 12, fontWeight: '600', color: colors.primaryText },
  heroTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryText, marginTop: spacing.sm + 4 },
  heroBody: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted, marginTop: spacing.xs },
  heroNext: { marginTop: spacing.sm },
});
