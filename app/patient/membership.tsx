import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useApiData } from '@/lib/useApiData';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { MEMBERSHIP_PATH, PatientMembership, STATE_LABEL, tierColors } from '@/lib/membership';
import { Badge, LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { t as translate, useT } from '@/lib/i18n';

/** Point counts from the server can be missing on older records. */
const num = (n: number | null | undefined) => (typeof n === 'number' && isFinite(n) ? n : 0);
const points = (n: number | null | undefined) =>
  translate('membership.points', { amount: num(n).toLocaleString('en-PH'), count: Math.abs(num(n)) });

/**
 * The patient's loyalty memberships, one card per clinic: tier, points, discount, expiry, the
 * membership number as a QR to show at the desk, and the latest points. Read-only.
 */
export default function MembershipScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const { data, loading, refreshing, error, refresh } = useApiData<PatientMembership[]>(MEMBERSHIP_PATH);

  if (loading && !data) return <LoadingView />;

  const memberships = data ?? [];

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      data={memberships}
      keyExtractor={(m) => m.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <SafeAreaView edges={['top']}>
          <AppHeader back />
          <Text style={styles.title} accessibilityRole="header">
            {t('membership.title')}
          </Text>
          <Text style={styles.subtitle}>{t('membership.subtitle')}</Text>
          <RefreshErrorBanner error={error} show={memberships.length > 0} />
        </SafeAreaView>
      }
      ListEmptyComponent={
        error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="card-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{t('membership.emptyTitle')}</Text>
            <Text style={styles.emptyText}>
              {t('membership.emptyBody')}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => <MembershipCard membership={item} />}
    />
  );
}

function MembershipCard({ membership: m }: { membership: PatientMembership }) {
  const t = useT();
  const [showHistory, setShowHistory] = useState(false);
  const tone = tierColors(m.tier);
  const benefits = Array.isArray(m.benefits) ? m.benefits : [];
  const history = Array.isArray(m.history) ? m.history : [];
  const stateTone = m.state === 'active' ? 'primary' : m.state === 'due' ? 'warning' : m.state === 'expired' || m.state === 'suspended' ? 'danger' : 'neutral';

  return (
    <View style={styles.block}>
      {/* The card itself */}
      <View style={[styles.card, { backgroundColor: tone.bg }]}>
        <View style={styles.cardTop}>
          <View style={styles.flex}>
            <Text style={[styles.clinic, { color: tone.accent }]} numberOfLines={1}>
              {m.clinicName ?? t('membership.clinic')}
            </Text>
            <Text style={[styles.tier, { color: tone.fg }]}>{t('membership.tierMember', { tier: m.tierLabel })}</Text>
          </View>
          <Ionicons name="ribbon" size={30} color={tone.accent} />
        </View>

        <View style={styles.cardMiddle}>
          <View style={styles.flex}>
            <Text style={[styles.cardLabel, { color: tone.accent }]}>{t('membership.pointsLabel')}</Text>
            <Text style={[styles.points, { color: tone.fg }]}>{num(m.points).toLocaleString('en-PH')}</Text>
          </View>
          {m.membershipNumber ? (
            <View style={styles.qr} accessible accessibilityLabel={t('membership.qrA11y', { number: m.membershipNumber })}>
              <QRCode value={m.membershipNumber} size={84} color={colors.text} backgroundColor="#FFFFFF" />
            </View>
          ) : null}
        </View>

        <View style={styles.cardBottom}>
          <Text style={[styles.number, { color: tone.fg }]} selectable>
            {m.membershipNumber}
          </Text>
          {m.expiryDate ? (
            <Text style={[styles.cardLabel, { color: tone.accent }]}>
              {m.state === 'expired'
                ? t('membership.expiredOn', { date: formatDate(m.expiryDate) })
                : t('membership.validUntil', { date: formatDate(m.expiryDate) })}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Details */}
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('membership.status')}</Text>
          <Badge label={STATE_LABEL[m.state] ? t(STATE_LABEL[m.state]) : m.state} tone={stateTone} />
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('membership.discountOnBills')}</Text>
          <Text style={styles.detailValue}>
            {m.discountActive && m.discountPercentage > 0 ? `${m.discountPercentage}%` : t('membership.noDiscount')}
          </Text>
        </View>
        {m.state === 'due' ? (
          <Text style={styles.note}>{t('membership.dueNote')}</Text>
        ) : m.state === 'expired' ? (
          <Text style={styles.note}>{t('membership.expiredNote')}</Text>
        ) : null}
        {benefits.length ? (
          <View style={styles.benefits}>
            {benefits.map((b) => (
              <View key={b} style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.meta}>
          {t('membership.earnedUsed', { earned: points(m.totalPointsEarned), used: points(m.totalPointsRedeemed) })}
          {m.joinDate ? t('membership.memberSince', { date: formatDate(m.joinDate) }) : ''}
        </Text>

        {history.length ? (
          <>
            <TouchableOpacity
              style={styles.historyToggle}
              onPress={() => setShowHistory((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showHistory }}
            >
              <Text style={styles.historyToggleText}>{t('membership.recentPoints')}</Text>
              <Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
            </TouchableOpacity>
            {showHistory
              ? history.map((h, i) => {
                  const plus = num(h.points) > 0;
                  return (
                    <View key={`${h.createdAt}-${i}`} style={styles.historyRow}>
                      <View style={styles.flex}>
                        <Text style={styles.historyText} numberOfLines={2}>
                          {h.description}
                        </Text>
                        {h.createdAt ? <Text style={styles.meta}>{formatDate(h.createdAt)}</Text> : null}
                      </View>
                      <Text style={[styles.historyPoints, { color: plus ? colors.success : colors.textMuted }]}>
                        {plus ? '+' : ''}
                        {num(h.points).toLocaleString('en-PH')}
                      </Text>
                    </View>
                  );
                })
              : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, flexGrow: 1 },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  block: { marginBottom: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.md + 4, gap: spacing.md, ...softShadow },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  clinic: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  tier: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  cardMiddle: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  cardLabel: { fontSize: 12, fontWeight: '600' },
  points: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  qr: { backgroundColor: '#FFFFFF', padding: 6, borderRadius: radius.sm },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  number: { fontSize: 16, fontWeight: '700', letterSpacing: 1.5 },
  details: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    marginTop: -spacing.sm,
    paddingTop: spacing.md + spacing.sm,
    gap: spacing.sm,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  detailLabel: { fontSize: 14, color: colors.textMuted },
  detailValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  note: { fontSize: 13, color: colors.warning },
  benefits: { gap: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  benefitText: { fontSize: 14, color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  historyToggleText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyText: { fontSize: 14, color: colors.text },
  historyPoints: { fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
});
