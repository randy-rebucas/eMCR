import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Banner, Button, KeyboardAvoider, LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
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
  // Open links first (the ones that can still be opened), then the ones that ended.
  const active = links.filter((l) => l.status === 'active');
  const ended = links.filter((l) => l.status !== 'active');
  const atLimit = data ? active.length >= data.maxActive : false;

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
        err instanceof ApiError && err.code === 'SHARE_LINK_LIMIT' ? err.message : errorMessage(err, t('share.createFailed'))
      );
    } finally {
      setCreating(false);
    }
  }

  function confirmRevoke(link: ShareLink) {
    Alert.alert(t('share.revokeTitle'), link.label ? t('share.revokeNamed', { label: link.label }) : t('share.revokeAnyone'), [
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
    ]);
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
    <KeyboardAvoider style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {header}

        {/* What the doctor gets, who else could open it, and what's open now. */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Ionicons name="document-text-outline" size={22} color={colors.primaryText} />
            <Text style={styles.heroTitle}>{t('share.heroTitle')}</Text>
          </View>
          <Text style={styles.heroText}>
            {other ? t('share.infoPdfOther', { whose: possessiveName(other) }) : t('share.infoPdfSelf')}
          </Text>
          <View style={styles.heroWarn}>
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <Text style={styles.heroWarnText}>{t('share.infoAnyone')}</Text>
          </View>
          {data ? (
            <Text style={styles.heroFoot}>
              {active.length
                ? t('share.openNow', { count: active.length, max: data.maxActive })
                : t('share.noneOpen')}
            </Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('share.newLink')}
        </Text>
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

          <Text style={[styles.label, styles.labelSpaced]}>{t('share.whoFor')}</Text>
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

          {createError ? (
            <View style={styles.spaced}>
              <Banner message={createError} />
            </View>
          ) : null}
          <Button title={t('share.create')} icon="share-outline" onPress={create} loading={creating} disabled={atLimit} style={styles.spaced} />
          {atLimit ? <Text style={styles.hintWarn}>{t('share.atLimit', { count: active.length })}</Text> : null}

          {fresh && fresh.link.status === 'active' ? (
            <View style={styles.fresh}>
              <Text style={styles.freshText}>{t('share.created')}</Text>
              <Button title={t('share.shareAgain')} variant="secondary" icon="share-outline" onPress={() => share(fresh.url, fresh.link)} />
            </View>
          ) : null}
        </View>

        <RefreshErrorBanner error={error} show={!!data} />
        {error && !data ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !links.length ? (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t('share.sharedLinks')}
            </Text>
            <Text style={styles.empty}>{t('share.empty')}</Text>
          </>
        ) : (
          <>
            {active.length ? (
              <>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('share.openLinks')}
                </Text>
                <View style={[styles.card, styles.list]}>
                  {active.map((link, i) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      last={i === active.length - 1}
                      revoking={revoking === link.id}
                      onRevoke={() => confirmRevoke(link)}
                    />
                  ))}
                </View>
              </>
            ) : null}
            {ended.length ? (
              <>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('share.endedLinks')}
                </Text>
                <View style={[styles.card, styles.list]}>
                  {ended.map((link, i) => (
                    <LinkRow key={link.id} link={link} last={i === ended.length - 1} revoking={false} onRevoke={() => {}} />
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.trackRow}>
              <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
              <Text style={styles.trackText}>{t('share.infoTracked')}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoider>
  );
}

function LinkRow({ link, last, revoking, onRevoke }: { link: ShareLink; last: boolean; revoking: boolean; onRevoke: () => void }) {
  const t = useT();
  const isActive = link.status === 'active';
  const when =
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
        <Ionicons
          name={isActive ? 'link-outline' : link.status === 'revoked' ? 'close-circle-outline' : 'time-outline'}
          size={20}
          color={isActive ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.rowTitle, !isActive && styles.muted]} numberOfLines={2}>
          {link.label || t('share.noName')}
        </Text>
        {/* Revoked is the patient's own choice, not an error: no red. */}
        {!isActive ? <Text style={styles.status}>{STATUS_LABEL[link.status]}</Text> : null}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLine, isActive && styles.rowLineStrong]}>{when}</Text>
        <Text style={styles.rowLine}>{opened}</Text>
        <Text style={styles.rowLine}>
          {t(link.sharedByFamily ? 'share.createdByFamily' : 'share.createdAt', { date: formatDateTime(link.createdAt) })}
        </Text>
        {isActive ? (
          <TouchableOpacity
            style={styles.revoke}
            onPress={onRevoke}
            disabled={revoking}
            accessibilityRole="button"
            accessibilityLabel={link.label ? t('share.revokeA11y', { label: link.label }) : t('share.revoke')}
            accessibilityState={{ busy: revoking }}
          >
            {revoking ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                <Text style={styles.revokeText}>{t('share.revoke')}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const ICON_GAP = 20 + spacing.sm + 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, gap: spacing.sm + 2 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.primaryText },
  heroText: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted },
  heroWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  heroWarnText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.warning, fontWeight: '600' },
  heroFoot: {
    fontSize: 14,
    color: colors.primaryText,
    paddingTop: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    fontVariant: ['tabular-nums'],
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  list: { paddingVertical: 0 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  labelSpaced: { marginTop: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
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
    minHeight: 48,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  hintWarn: { fontSize: 13, color: colors.warning, marginTop: spacing.sm, fontWeight: '600' },
  spaced: { marginTop: spacing.md },
  fresh: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  freshText: { fontSize: 13, lineHeight: 18, color: colors.primaryOnSoft },

  row: { paddingVertical: spacing.sm + 4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  rowBody: { marginLeft: ICON_GAP },
  rowLine: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  rowLineStrong: { color: colors.text },
  status: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  muted: { color: colors.textMuted },
  revoke: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44 },
  revokeText: { fontSize: 14, fontWeight: '600', color: colors.danger },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  trackText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  empty: { fontSize: 14, color: colors.textMuted },
});
