import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { formatDate } from '@/lib/format';
import { Referral, REFERRALS_PATH, referredToText, STATUS_LABEL, URGENCY_LABEL } from '@/lib/referrals';
import { colors, radius, spacing } from '@/lib/theme';
import { Badge, Banner, Button, ListFooter, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';

const TONE: Record<Referral['status'], 'primary' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  accepted: 'primary',
  completed: 'primary',
  declined: 'danger',
  cancelled: 'neutral',
};

/** Referrals to a specialist or another clinic, newest first. */
export default function ReferralsScreen() {
  const bottomPad = useBottomPadding();
  const list = usePaginatedList<Referral>(REFERRALS_PATH, { limit: 20, refreshOn: ['profile', 'family'] });

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        Referrals
      </Text>
      <Text style={styles.subtitle}>When your doctor refers you to a specialist or another clinic.</Text>
      {list.error && list.items.length > 0 ? <Banner message={list.error} /> : null}
    </SafeAreaView>
  );

  let empty;
  if (list.loading) {
    empty = <ActivityIndicator color={colors.primary} style={styles.loading} />;
  } else if (list.error) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{list.error}</Text>
        <Button title="Try Again" variant="secondary" onPress={list.reload} style={styles.stretch} />
      </View>
    );
  } else {
    empty = (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="git-branch-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No referrals</Text>
        <Text style={styles.emptyText}>If your doctor refers you to a specialist, you can follow it here.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={list.items}
      keyExtractor={(r) => r._id}
      renderItem={({ item }) => <ReferralCard referral={item} />}
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

function ReferralCard({ referral: r }: { referral: Referral }) {
  const to = referredToText(r);
  const urgency = URGENCY_LABEL[r.urgency];
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/patient/referrals/${r._id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Referral to ${to}, ${STATUS_LABEL[r.status] ?? r.status}${r.referredDate ? `, ${formatDate(r.referredDate)}` : ''}`}
    >
      <View style={styles.cardTop}>
        <View style={styles.icon}>
          <Ionicons name="git-branch-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {to}
          </Text>
          <Text style={styles.cardMeta}>
            {[r.referredDate ? formatDate(r.referredDate) : null, r.referralCode].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Badge label={STATUS_LABEL[r.status] ?? r.status} tone={TONE[r.status] ?? 'neutral'} />
      </View>
      {r.reason ? (
        <Text style={styles.reason} numberOfLines={2}>
          {r.reason}
        </Text>
      ) : null}
      <View style={styles.cardBottom}>
        {urgency ? <Badge label={urgency} tone="danger" /> : null}
        {r.appointment ? (
          <View style={styles.appt}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.cardMeta}>Appointment booked</Text>
          </View>
        ) : null}
        <View style={styles.flex} />
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
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
    ...softShadow,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  reason: { fontSize: 14, color: colors.text, marginTop: spacing.sm },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  appt: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
});
