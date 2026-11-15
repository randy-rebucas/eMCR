import { ReactNode, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useApiData } from '@/lib/useApiData';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { MEMBERSHIP_PATH, PatientMembership, STATE_LABEL, stateTone } from '@/lib/membership';
import { LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { t as translate, useT } from '@/lib/i18n';

/** Point counts from the server can be missing on older records. */
const num = (n: number | null | undefined) => (typeof n === 'number' && isFinite(n) ? n : 0);
const points = (n: number | null | undefined) =>
  translate('membership.points', { amount: num(n).toLocaleString('en-PH'), count: Math.abs(num(n)) });

/**
 * The patient's loyalty memberships, one card per clinic: tier, points, discount, expiry, the
 * membership number as a QR to show at the desk, and the latest points. Read-only. Kept on the
 * phone, since the card is shown at a clinic desk where the signal may be poor.
 */
export default function MembershipScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<PatientMembership[]>(MEMBERSHIP_PATH, {
    offline: true,
  });

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
          {offline ? (
            <View style={styles.banner}>
              <OfflineBanner offline={offline} updatedAt={updatedAt} subject={t('membership.offlineSubject')} />
            </View>
          ) : (
            <RefreshErrorBanner error={error} show={memberships.length > 0} />
          )}
        </SafeAreaView>
      }
      ListEmptyComponent={
        error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="card-outline" size={28} color={colors.primary} />
            <Text style={styles.emptyTitle}>{t('membership.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('membership.emptyBody')}</Text>
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
  const benefits = Array.isArray(m.benefits) ? m.benefits : [];
  const history = Array.isArray(m.history) ? m.history : [];
  const tone = stateTone(m.state);
  const stateLabel = STATE_LABEL[m.state] ? t(STATE_LABEL[m.state]) : m.state;

  return (
    <View style={styles.block}>
      {/* The card shown at the desk: solid navy, the QR on white so any scanner reads it. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.clinic} numberOfLines={1}>
              {m.clinicName ?? t('membership.clinic')}
            </Text>
            <View style={styles.tierRow}>
              <Ionicons name="ribbon" size={18} color={colors.accent} />
              <Text style={styles.tier}>{t('membership.tierMember', { tier: m.tierLabel })}</Text>
            </View>
          </View>
          <View style={[styles.chip, tone === 'attention' && styles.chipAttention]}>
            <Text style={[styles.chipText, tone === 'attention' && styles.chipTextAttention]}>{stateLabel}</Text>
          </View>
        </View>

        <View style={styles.heroMiddle}>
          <View style={styles.flex}>
            <Text style={styles.heroLabel}>{t('membership.pointsLabel')}</Text>
            <Text style={styles.points}>{num(m.points).toLocaleString('en-PH')}</Text>
          </View>
          {m.membershipNumber ? (
            <View style={styles.qr} accessible accessibilityLabel={t('membership.qrA11y', { number: m.membershipNumber })}>
              <QRCode value={m.membershipNumber} size={92} color={colors.text} backgroundColor={colors.surface} />
            </View>
          ) : null}
        </View>

        <View style={styles.heroFoot}>
          <Text style={styles.number} selectable>
            {m.membershipNumber}
          </Text>
          {m.expiryDate ? (
            <Text style={[styles.heroMeta, tone === 'attention' && styles.heroMetaAttention]}>
              {m.state === 'expired'
                ? t('membership.expiredOn', { date: formatDate(m.expiryDate) })
                : t('membership.validUntil', { date: formatDate(m.expiryDate) })}
            </Text>
          ) : null}
        </View>
      </View>
      {m.membershipNumber ? <Text style={styles.showHint}>{t('membership.showAtDesk')}</Text> : null}

      {m.state === 'due' || m.state === 'expired' ? (
        <View style={styles.notice}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.noticeText}>{m.state === 'due' ? t('membership.dueNote') : t('membership.expiredNote')}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Row label={t('membership.discountOnBills')}>
          <Text style={styles.value}>
            {m.discountActive && m.discountPercentage > 0 ? `${m.discountPercentage}%` : t('membership.noDiscount')}
          </Text>
        </Row>
        <Row label={t('membership.pointsTotals')} rule>
          <Text style={styles.value}>
            {t('membership.earnedUsed', { earned: points(m.totalPointsEarned), used: points(m.totalPointsRedeemed) })}
          </Text>
        </Row>
        {m.joinDate ? (
          <Row label={t('membership.memberSinceLabel')} rule>
            <Text style={styles.value}>{formatDate(m.joinDate, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          </Row>
        ) : null}
        {benefits.length ? (
          <View style={[styles.row, styles.rule]}>
            <Text style={styles.label}>{t('membership.benefits')}</Text>
            {benefits.map((b) => (
              <View key={b} style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {history.length ? (
          <>
            <TouchableOpacity
              style={[styles.historyToggle, styles.rule]}
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
                    <View key={`${h.createdAt}-${i}`} style={[styles.historyRow, styles.rule]}>
                      <View style={styles.flex}>
                        <Text style={styles.historyText} numberOfLines={2}>
                          {h.description}
                        </Text>
                        {h.createdAt ? <Text style={styles.meta}>{formatDate(h.createdAt)}</Text> : null}
                      </View>
                      <Text style={[styles.historyPoints, plus && styles.historyPlus]}>
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

function Row({ label, rule, children }: { label: string; rule?: boolean; children: ReactNode }) {
  return (
    <View style={[styles.row, rule && styles.rule]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, flexGrow: 1 },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  banner: { marginBottom: spacing.md },
  block: { marginBottom: spacing.xl },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, gap: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  clinic: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  tier: { fontSize: 20, fontWeight: '800', color: colors.primaryText },
  chip: { borderWidth: 1, borderColor: colors.navyLine, borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  chipAttention: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.primaryText },
  chipTextAttention: { color: colors.warning },
  heroMiddle: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  heroLabel: { fontSize: 12, fontWeight: '600', color: colors.onNavyMuted },
  points: { fontSize: 36, fontWeight: '800', color: colors.primaryText, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  qr: { backgroundColor: colors.surface, padding: 8, borderRadius: radius.sm },
  heroFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
  },
  number: { fontSize: 16, fontWeight: '700', color: colors.primaryText, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  heroMeta: { fontSize: 13, color: colors.onNavyMuted, fontVariant: ['tabular-nums'] },
  heroMetaAttention: { color: colors.warningSoft, fontWeight: '600' },
  showHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.md,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.warning },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  row: { paddingVertical: spacing.sm + 4, gap: 4 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  value: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  benefitText: { flex: 1, fontSize: 14, color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  historyToggleText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
  historyText: { fontSize: 14, color: colors.text },
  historyPoints: { fontSize: 15, fontWeight: '700', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  historyPlus: { color: colors.primaryOnSoft },

  empty: {
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
