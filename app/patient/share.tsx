import { ReactNode, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, errorMessage } from '@/lib/api';
import { useApiData } from '@/lib/useApiData';
import { useProfile } from '@/lib/profile';
import { formatDateTime } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import {
  createShareLink,
  DURATIONS,
  LABEL_MAX,
  revokeShareLink,
  SHARE_LINKS_PATH,
  ShareLink,
  ShareLinkDuration,
  ShareLinkList,
  STATUS_LABEL,
} from '@/lib/shareLinks';
import { Badge, Banner, Button, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { possessiveName, useT } from '@/lib/i18n';

/**
 * Share the health summary with another doctor: a link to the PDF that works until it expires
 * (24 hours, 7 days or 30 days) or the patient revokes it. Lists the profile's links with how
 * often each was opened. Honours the family profile being viewed (the API answers for it).
 */
export default function ShareScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { viewing } = useProfile();
  const { data, setData, loading, refreshing, error, refresh } = useApiData<ShareLinkList>(SHARE_LINKS_PATH, {
    refreshOn: ['profile', 'family'],
  });
  const [duration, setDuration] = useState<ShareLinkDuration>('7d');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  /** The link made on this screen: its URL can't be fetched again, so keep it to share again. */
  const [fresh, setFresh] = useState<{ url: string; link: ShareLink } | null>(null);

  // Another profile: its links, not the one just made for someone else.
  useEffect(() => {
    setFresh(null);
    setCreateError(null);
  }, [viewing?.id]);

  const other = viewing && !viewing.self ? viewing.firstName : null;
  const links = data?.links ?? [];
  const activeCount = links.filter((l) => l.status === 'active').length;
  const atLimit = data ? activeCount >= data.maxActive : false;

  async function share(url: string, link: ShareLink) {
    const until = t('share.opensUntil', { date: formatDateTime(link.expiresAt) });
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url, message: t('share.messageIos', { until }) }
          : { title: t('share.shareTitle'), message: t('share.messageAndroid', { url, until }) },
        { dialogTitle: t('share.dialogTitle'), subject: t('share.shareTitle') }
      );
    } catch {
      Alert.alert(t('share.shareFailedTitle'), t('share.shareFailedText'));
    }
  }

  async function create() {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createShareLink(duration, label);
      setFresh(result);
      setLabel('');
      setData((prev) => (prev ? { ...prev, links: [result.link, ...prev.links] } : prev));
      await share(result.url, result.link);
    } catch (err) {
      setCreateError(
        err instanceof ApiError && err.code === 'SHARE_LINK_LIMIT'
          ? err.message
          : errorMessage(err, t('share.createFailed'))
      );
    } finally {
      setCreating(false);
    }
  }

  function confirmRevoke(link: ShareLink) {
    Alert.alert(
      t('share.revokeTitle'),
      link.label ? t('share.revokeNamed', { label: link.label }) : t('share.revokeAnyone'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('share.revoke'),
          style: 'destructive',
          onPress: async () => {
            setRevoking(link.id);
            try {
              const { link: updated } = await revokeShareLink(link.id);
              setData((prev) => (prev ? { ...prev, links: prev.links.map((l) => (l.id === updated.id ? updated : l)) } : prev));
              setFresh((f) => (f?.link.id === updated.id ? null : f));
            } catch (err) {
              Alert.alert(t('share.revokeFailed'), errorMessage(err, t('share.revokeFailedFallback')));
            } finally {
              setRevoking(null);
            }
          },
        },
      ]
    );
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {t('share.title')}
      </Text>
      <Text style={styles.subtitle}>
        {other ? t('share.subtitleOther', { whose: possessiveName(other) }) : t('share.subtitleSelf')}
      </Text>
    </SafeAreaView>
  );

  if (loading && !data) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>{header}</View>
        <LoadingView />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {header}

      <View style={styles.explain}>
        <Info icon="document-text-outline">
          {other ? t('share.infoPdfOther', { whose: possessiveName(other) }) : t('share.infoPdfSelf')}
        </Info>
        <Info icon="people-outline" warn>
          {t('share.infoAnyone')}
        </Info>
        <Info icon="eye-outline">{t('share.infoTracked')}</Info>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t('share.howLong')}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {DURATIONS.map((d) => {
            const selected = d.value === duration;
            return (
              <TouchableOpacity
                key={d.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setDuration(d.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>{t('share.whoFor')}</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder={t('share.whoForPlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={LABEL_MAX}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel={t('share.whoForA11y')}
        />
        <Text style={styles.hint}>{t('share.whoForHint')}</Text>

        {createError ? <Banner message={createError} /> : null}
        <Button
          title={t('share.create')}
          icon="share-outline"
          onPress={create}
          loading={creating}
          disabled={atLimit}
          style={{ marginTop: spacing.md }}
        />
        {atLimit ? (
          <Text style={styles.hint}>{t('share.atLimit', { count: activeCount })}</Text>
        ) : null}
      </View>

      {fresh && fresh.link.status === 'active' ? (
        <View style={styles.fresh}>
          <Text style={styles.freshText}>{t('share.created')}</Text>
          <Button title={t('share.shareAgain')} variant="secondary" icon="share-outline" onPress={() => share(fresh.url, fresh.link)} />
        </View>
      ) : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">
        {t('share.sharedLinks')}
      </Text>
      {error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : links.length ? (
        <View style={[styles.card, styles.list]}>
          {links.map((link, i) => (
            <LinkRow
              key={link.id}
              link={link}
              last={i === links.length - 1}
              revoking={revoking === link.id}
              onRevoke={() => confirmRevoke(link)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>{t('share.empty')}</Text>
      )}
    </ScrollView>
  );
}

function LinkRow({ link, last, revoking, onRevoke }: { link: ShareLink; last: boolean; revoking: boolean; onRevoke: () => void }) {
  const t = useT();
  const ended =
    link.status === 'revoked'
      ? t('share.revokedAt', { date: formatDateTime(link.revokedAt) })
      : link.status === 'expired'
        ? t('share.expiredAt', { date: formatDateTime(link.expiresAt) })
        : t('share.expiresAt', { date: formatDateTime(link.expiresAt) });
  const opened =
    link.accessCount === 0
      ? t('share.notOpened')
      : t('share.opened', { count: link.accessCount, date: formatDateTime(link.lastAccessedAt) });
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowTitle, link.status !== 'active' && styles.muted]} numberOfLines={2}>
          {link.label || t('share.noName')}
        </Text>
        <Badge label={STATUS_LABEL[link.status]} tone={link.status === 'active' ? 'primary' : link.status === 'revoked' ? 'danger' : 'neutral'} />
      </View>
      <Text style={styles.rowLine}>
        {t(link.sharedByFamily ? 'share.createdByFamily' : 'share.createdAt', { date: formatDateTime(link.createdAt) })}
      </Text>
      <Text style={styles.rowLine}>{ended}</Text>
      <Text style={styles.rowLine}>{opened}</Text>
      {link.status === 'active' ? (
        <Button title={t('share.revoke')} variant="dangerOutline" icon="close-circle-outline" onPress={onRevoke} loading={revoking} style={styles.revoke} />
      ) : null}
    </View>
  );
}

function Info({ icon, warn, children }: { icon: IconName; warn?: boolean; children: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={warn ? colors.warning : colors.slate} />
      <Text style={[styles.infoText, warn && { color: colors.warning }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  explain: { backgroundColor: colors.slateSoft, borderRadius: radius.md, padding: spacing.sm + 4, gap: spacing.sm, marginBottom: spacing.md },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.slate },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    ...softShadow,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  chipTextSelected: { color: colors.primaryOnSoft },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  fresh: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  freshText: { fontSize: 13, lineHeight: 18, color: colors.primaryOnSoft },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { paddingVertical: spacing.sm + 4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  rowLine: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  muted: { color: colors.textMuted },
  list: { paddingVertical: 0 },
  revoke: { marginTop: spacing.sm },
  empty: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md },
});
