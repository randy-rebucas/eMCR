import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, errorMessage } from '@/lib/api';
import { useApiData } from '@/lib/useApiData';
import { formatDate, formatTime, humanize } from '@/lib/format';
import {
  openReferralLetter,
  Referral,
  referralProgress,
  REFERRALS_PATH,
  ReferralStep,
  referredByText,
  referredToText,
  STATUS_HINT,
  STATUS_LABEL,
  statusTone,
  URGENCY_LABEL,
} from '@/lib/referrals';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, IconName, LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';
import { isUnavailable, UnavailableView } from '@/components/StateView';
import { OfflineBanner } from '@/components/OfflineBanner';
import { TFunction, useT } from '@/lib/i18n';

/** One referral: who to, why, where it stands, the appointment booked from it and the letter. */
export default function ReferralDetailScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useApiData<Referral>(
    id ? `${REFERRALS_PATH}/${encodeURIComponent(id)}` : null,
    { refreshOn: ['appointments'], offline: true }
  );
  const { data, loading, refreshing, error, refresh, offline, stale, updatedAt } = record;
  const [opening, setOpening] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // A short-lived link, downloaded into the app's cache and opened with the share sheet.
  async function openLetter() {
    if (!data) return;
    setOpening(true);
    setPdfError(null);
    try {
      await openReferralLetter(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_LETTER') refresh();
      setPdfError(errorMessage(err, t('referrals.openFailed')));
    } finally {
      setOpening(false);
    }
  }

  if (loading) return <LoadingView />;
  // Gone, or another profile's record (often a push for a deleted record): Back, not Try Again.
  if (error && !data) return isUnavailable(record) ? <UnavailableView /> : <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <UnavailableView />;

  const urgency = URGENCY_LABEL[data.urgency];
  const tone = statusTone(data.status);
  const by = referredByText(data);
  const specialty = data.referredTo.doctor?.specialization ?? data.specialty;
  const appt = data.appointment;
  const apptDate = appt?.appointmentDate ? formatDate(appt.appointmentDate, { weekday: 'short', month: 'short', day: 'numeric' }) : null;
  const apptTime = appt?.appointmentTime ? formatTime(appt.appointmentTime) : null;
  const apptWhen = appt
    ? apptDate && apptTime
      ? t('referrals.dateAtTime', { date: apptDate, time: apptTime })
      : apptDate ?? apptTime ?? ''
    : null;
  // The letter link comes from the server: a saved copy can't fetch it.
  const needsServer = offline || stale;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      {offline ? <OfflineBanner offline={offline} updatedAt={updatedAt} /> : <RefreshErrorBanner error={error} />}

      {/* Who the patient is referred to and what to do now: solid navy. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow} selectable>
            {data.referralCode ? t('referrals.code', { code: data.referralCode }) : t('referrals.title')}
          </Text>
          <View style={[styles.chip, tone === 'attention' && styles.chipAttention]}>
            <Text style={[styles.chipText, tone === 'attention' && styles.chipTextAttention]}>
              {STATUS_LABEL[data.status] ?? humanize(data.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>{referredToText(data)}</Text>
        {urgency ? (
          <View style={styles.urgent}>
            <Ionicons name="alert-circle" size={14} color={colors.warning} />
            <Text style={styles.urgentText}>{urgency}</Text>
          </View>
        ) : null}
        {by ? <HeroLine icon="person-outline" text={t('referrals.from', { who: by })} /> : null}
        {data.referredDate ? <HeroLine icon="calendar-outline" text={t('referrals.sentOn', { date: formatDate(data.referredDate) })} /> : null}
        {STATUS_HINT[data.status] ? <Text style={styles.heroNext}>{STATUS_HINT[data.status]}</Text> : null}

        {data.letterAvailable ? (
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={[styles.heroButton, needsServer && styles.heroButtonOff]}
              onPress={openLetter}
              disabled={opening || needsServer}
              accessibilityRole="button"
              accessibilityState={{ disabled: opening || needsServer, busy: opening }}
            >
              {opening ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={colors.primaryText} />
                  <Text style={styles.heroButtonText}>{t('referrals.openLetter')}</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.heroHint}>{needsServer ? t('referrals.letterNeedsConnection') : t('referrals.letterNote')}</Text>
            {pdfError ? <Banner message={pdfError} /> : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.section} accessibilityRole="header">
        {t('referrals.progress')}
      </Text>
      <View style={styles.card}>
        <Progress referral={data} />
      </View>

      {appt ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            {t('referrals.appointment')}
          </Text>
          <TouchableOpacity
            style={[styles.card, styles.apptRow]}
            onPress={() => router.push(`/patient/appointments/${appt._id}`)}
            accessibilityRole="button"
            accessibilityLabel={t('referrals.apptA11y', { when: apptWhen ?? '', status: appt.status ?? '' })}
          >
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.value}>{apptWhen || t('referrals.appointment')}</Text>
              {appt.appointmentCode ? <Text style={styles.meta}>{appt.appointmentCode}</Text> : null}
            </View>
            <StatusBadge status={appt.status} />
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </>
      ) : null}

      <Text style={styles.section} accessibilityRole="header">
        {t('referrals.details')}
      </Text>
      <View style={styles.card}>
        {data.reason ? <Row label={t('referrals.reason')} value={data.reason} first /> : null}
        {specialty ? <Row label={t('referrals.specialty')} value={specialty} first={!data.reason} /> : null}
        {by ? <Row label={t('referrals.referredBy')} value={by} first={!data.reason && !specialty} /> : null}
        <Row
          label={t('referrals.heldBy')}
          value={data.clinic.name ?? t('referrals.yourClinic')}
          first={!data.reason && !specialty && !by}
        />
        {data.followUpDate ? (
          <Row label={t('referrals.followUp')} value={formatDate(data.followUpDate, { month: 'long', day: 'numeric', year: 'numeric' })} />
        ) : null}
      </View>

      <Text style={styles.footnote}>{t('referrals.questions', { clinic: data.clinic.name ?? t('referrals.yourClinic') })}</Text>
    </ScrollView>
  );
}

function HeroLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.heroLine}>
      <Ionicons name={icon} size={16} color={colors.onNavyMuted} />
      <Text style={styles.heroLineText}>{text}</Text>
    </View>
  );
}

function stepTitle(t: TFunction, r: Referral, step: ReferralStep): string {
  if (step.key === 'referred') return t('referrals.step.referred');
  if (step.key === 'accepted') {
    if (step.state === 'ended') return r.status === 'declined' ? t('referrals.step.declined') : t('referrals.step.cancelled');
    return t('referrals.step.accepted');
  }
  return step.state === 'ended' ? t('referrals.step.cancelled') : t('referrals.step.seen');
}

/** Referred → accepted → seen, as on an appointment's "Where it stands". */
function Progress({ referral: r }: { referral: Referral }) {
  const t = useT();
  const steps = referralProgress(r);
  return (
    <View style={styles.progress}>
      {steps.map((step, i) => {
        const title = stepTitle(t, r, step);
        const detail =
          step.state === 'current'
            ? t('referrals.step.waiting')
            : step.date
              ? formatDate(step.date, { month: 'short', day: 'numeric', year: 'numeric' })
              : null;
        const last = i === steps.length - 1;
        return (
          <View key={step.key} style={styles.step} accessible accessibilityLabel={[title, detail].filter(Boolean).join(', ')}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  step.state === 'done' && styles.dotDone,
                  step.state === 'current' && styles.dotCurrent,
                  step.state === 'ended' && styles.dotEnded,
                ]}
              >
                {step.state === 'done' ? <Ionicons name="checkmark" size={12} color={colors.primaryText} /> : null}
                {step.state === 'ended' ? <Ionicons name="close" size={12} color={colors.primaryText} /> : null}
              </View>
              {!last ? <View style={[styles.line, step.state === 'done' && styles.lineDone]} /> : null}
            </View>
            <View style={[styles.stepBody, !last && styles.stepBodySpaced]}>
              <Text style={[styles.stepTitle, step.state === 'todo' && styles.stepTitleTodo]}>{title}</Text>
              {detail ? <Text style={[styles.stepDetail, step.state === 'current' && styles.stepDetailCurrent]}>{detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Row({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.rule]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const DOT = 22;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  flex: { flex: 1 },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onNavyMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  chip: { borderWidth: 1, borderColor: colors.navyLine, borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  chipAttention: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.primaryText },
  chipTextAttention: { color: colors.warning },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.primaryText, marginTop: spacing.sm + 4 },
  urgent: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  urgentText: { fontSize: 12, fontWeight: '700', color: colors.warning },
  heroLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs + 2, marginTop: spacing.sm },
  heroLineText: { flexShrink: 1, fontSize: 14, lineHeight: 19, color: colors.onNavyMuted, fontVariant: ['tabular-nums'] },
  heroNext: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.primaryText,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
  },
  heroActions: { marginTop: spacing.md, gap: spacing.sm },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  heroButtonOff: { backgroundColor: colors.navyLine },
  heroButtonText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },
  heroHint: { fontSize: 12, lineHeight: 17, color: colors.onNavyMuted, textAlign: 'center' },

  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: { paddingVertical: spacing.sm + 4 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  value: { fontSize: 15, lineHeight: 21, color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  apptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4, minHeight: 56 },

  progress: { paddingVertical: spacing.md },
  step: { flexDirection: 'row', gap: spacing.sm + 4 },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCurrent: { borderColor: colors.primary, borderWidth: 3 },
  dotEnded: { backgroundColor: colors.slate, borderColor: colors.slate },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, minHeight: DOT, paddingTop: 1 },
  stepBodySpaced: { paddingBottom: spacing.md },
  stepTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  stepTitleTodo: { color: colors.textMuted, fontWeight: '400' },
  stepDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  stepDetailCurrent: { color: colors.primaryOnSoft, fontWeight: '600' },

  footnote: { fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
