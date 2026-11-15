import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { formatDate } from '@/lib/format';
import { Referral, REFERRALS_PATH, referredToText, STATUS_LABEL, statusTone, URGENCY_LABEL } from '@/lib/referrals';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useT } from '@/lib/i18n';

/** Referrals to a specialist or another clinic, newest first, as one ruled card. */
export default function ReferralsScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const list = usePaginatedList<Referral>(REFERRALS_PATH, { limit: 20, refreshOn: ['profile', 'family'], offline: true });

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {t('referrals.title')}
      </Text>
      <Text style={styles.subtitle}>{t('referrals.subtitle')}</Text>
      <OfflineBanner offline={list.offline} updatedAt={list.updatedAt} subject={t('referrals.offlineSubject')} />
      {list.error && list.items.length > 0 && !list.offline ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading) {
    empty = <ActivityIndicator color={colors.primary} style={styles.loading} />;
  } else if (list.error) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{list.error}</Text>
        <Button title={t('common.tryAgainTitle')} variant="secondary" onPress={list.reload} style={styles.stretch} />
      </View>
    );
  } else {
    empty = (
      <View style={styles.emptyCard}>
        <Ionicons name="git-branch-outline" size={28} color={colors.primary} />
        <Text style={styles.emptyTitle}>{t('referrals.empty.title')}</Text>
        <Text style={styles.emptyText}>{t('referrals.empty.text')}</Text>
      </View>
    );
  }

  const last = list.items.length - 1;
  return (
    <FlatList
      style={styles.root}
      data={list.items}
      keyExtractor={(r) => r._id}
      renderItem={({ item, index }) => <ReferralRow referral={item} first={index === 0} last={index === last} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loadingMore={list.loadingMore} error={list.loadMoreError} onRetry={list.loadMore} />}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
    />
  );
}

function ReferralRow({ referral: r, first, last }: { referral: Referral; first: boolean; last: boolean }) {
  const t = useT();
  const to = referredToText(r);
  const urgency = URGENCY_LABEL[r.urgency];
  const tone = statusTone(r.status);
  const status = STATUS_LABEL[r.status] ?? r.status;
  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast]}
      onPress={() => router.push(`/patient/referrals/${r._id}`)}
      accessibilityRole="button"
      accessibilityLabel={
        r.referredDate
          ? t('referrals.cardA11yDate', { to, status, date: formatDate(r.referredDate) })
          : t('referrals.cardA11y', { to, status })
      }
    >
      <View style={[styles.rowInner, !first && styles.rowRule]}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {to}
          </Text>
          {r.reason ? (
            <Text style={styles.reason} numberOfLines={2}>
              {r.reason}
            </Text>
          ) : null}
          <Text style={styles.rowMeta}>
            {[r.referredDate ? formatDate(r.referredDate) : null, r.referralCode].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.chips}>
            <View style={[styles.chip, tone === 'attention' && styles.chipAttention, tone === 'teal' && styles.chipTeal]}>
              <Text style={[styles.chipText, tone === 'attention' && styles.chipTextAttention, tone === 'teal' && styles.chipTextTeal]}>
                {status}
              </Text>
            </View>
            {urgency ? (
              <View style={[styles.chip, styles.chipAttention]}>
                <Ionicons name="alert-circle" size={12} color={colors.warning} />
                <Text style={[styles.chipText, styles.chipTextAttention]}>{urgency}</Text>
              </View>
            ) : null}
            {r.appointment ? (
              <View style={styles.appt}>
                <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                <Text style={styles.rowMeta}>{t('referrals.apptBooked')}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  headerSpacing: { marginBottom: spacing.md },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  loading: { marginVertical: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },

  row: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 6 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  reason: { fontSize: 14, lineHeight: 19, color: colors.text, marginTop: 2 },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.slateSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  chipAttention: { backgroundColor: colors.warningSoft },
  chipTeal: { backgroundColor: colors.primarySoft },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.slate },
  chipTextAttention: { color: colors.warning },
  chipTextTeal: { color: colors.primaryOnSoft },
  appt: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md, gap: spacing.sm },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
});
