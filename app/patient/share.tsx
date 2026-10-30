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
import { possessive, useProfile } from '@/lib/profile';
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

/**
 * Share the health summary with another doctor: a link to the PDF that works until it expires
 * (24 hours, 7 days or 30 days) or the patient revokes it. Lists the profile's links with how
 * often each was opened. Honours the family profile being viewed (the API answers for it).
 */
export default function ShareScreen() {
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

  const whose = possessive(viewing);
  const whoseInText = whose === 'Your' ? 'your' : whose;
  const links = data?.links ?? [];
  const activeCount = links.filter((l) => l.status === 'active').length;
  const atLimit = data ? activeCount >= data.maxActive : false;

  async function share(url: string, link: ShareLink) {
    const until = `Opens until ${formatDateTime(link.expiresAt)}.`;
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url, message: `Health summary (PDF). ${until}` }
          : { title: 'Health summary', message: `Health summary (PDF): ${url}\n${until}` },
        { dialogTitle: 'Share health summary', subject: 'Health summary' }
      );
    } catch {
      Alert.alert('Couldn’t open sharing', 'Try again, or revoke this link if you no longer need it.');
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
          : errorMessage(err, 'Couldn’t create the link. Check your connection and try again.')
      );
    } finally {
      setCreating(false);
    }
  }

  function confirmRevoke(link: ShareLink) {
    Alert.alert(
      'Revoke this link?',
      `${link.label ? `“${link.label}” ` : 'Anyone with the link '}will no longer be able to open the health summary. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevoking(link.id);
            try {
              const { link: updated } = await revokeShareLink(link.id);
              setData((prev) => (prev ? { ...prev, links: prev.links.map((l) => (l.id === updated.id ? updated : l)) } : prev));
              setFresh((f) => (f?.link.id === updated.id ? null : f));
            } catch (err) {
              Alert.alert('Couldn’t revoke', errorMessage(err, 'Please try again.'));
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
        Share with a doctor
      </Text>
      <Text style={styles.subtitle}>Send {whoseInText} health summary to another doctor with a link you can revoke.</Text>
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
          The link opens a PDF of {whoseInText} allergies, medicines, conditions and vaccinations from the clinics
          you can see in this app.
        </Info>
        <Info icon="people-outline" warn>
          Anyone who has the link can open it, until it expires or you revoke it. Only send it to people you trust.
        </Info>
        <Info icon="eye-outline">Each time it is opened, it is recorded and shown below.</Info>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>How long should it work?</Text>
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

        <Text style={[styles.label, { marginTop: spacing.md }]}>Who is it for? (optional)</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Dr. Santos, cardiology"
          placeholderTextColor={colors.textMuted}
          maxLength={LABEL_MAX}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="Who is it for? Optional"
        />
        <Text style={styles.hint}>Only you see this, to tell your links apart.</Text>

        {createError ? <Banner message={createError} /> : null}
        <Button
          title="Create link and share"
          icon="share-outline"
          onPress={create}
          loading={creating}
          disabled={atLimit}
          style={{ marginTop: spacing.md }}
        />
        {atLimit ? (
          <Text style={styles.hint}>You have {activeCount} active links, the most allowed. Revoke one to make another.</Text>
        ) : null}
      </View>

      {fresh && fresh.link.status === 'active' ? (
        <View style={styles.fresh}>
          <Text style={styles.freshText}>
            Link created. For privacy it is shown only now: if you lose it, revoke it and make a new one.
          </Text>
          <Button title="Share again" variant="secondary" icon="share-outline" onPress={() => share(fresh.url, fresh.link)} />
        </View>
      ) : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Shared links
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
        <Text style={styles.empty}>No links yet. Links you make appear here, with how often they were opened.</Text>
      )}
    </ScrollView>
  );
}

function LinkRow({ link, last, revoking, onRevoke }: { link: ShareLink; last: boolean; revoking: boolean; onRevoke: () => void }) {
  const ended =
    link.status === 'revoked'
      ? `Revoked ${formatDateTime(link.revokedAt)}`
      : link.status === 'expired'
        ? `Expired ${formatDateTime(link.expiresAt)}`
        : `Expires ${formatDateTime(link.expiresAt)}`;
  const opened =
    link.accessCount === 0
      ? 'Not opened yet'
      : `Opened ${link.accessCount === 1 ? 'once' : `${link.accessCount} times`} · last ${formatDateTime(link.lastAccessedAt)}`;
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowTitle, link.status !== 'active' && styles.muted]} numberOfLines={2}>
          {link.label || 'Link without a name'}
        </Text>
        <Badge label={STATUS_LABEL[link.status]} tone={link.status === 'active' ? 'primary' : link.status === 'revoked' ? 'danger' : 'neutral'} />
      </View>
      <Text style={styles.rowLine}>Created {formatDateTime(link.createdAt)}{link.sharedByFamily ? ' by a family manager' : ''}</Text>
      <Text style={styles.rowLine}>{ended}</Text>
      <Text style={styles.rowLine}>{opened}</Text>
      {link.status === 'active' ? (
        <Button title="Revoke" variant="dangerOutline" icon="close-circle-outline" onPress={onRevoke} loading={revoking} style={styles.revoke} />
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
