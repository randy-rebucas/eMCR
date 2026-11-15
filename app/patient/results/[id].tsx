import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { LabResult } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { analyteLabel, displayValue, Flag, flagOf, isReady, rangeOf, summarize } from '@/lib/labResults';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorState } from '@/components/ErrorState';
import { isUnavailable, UnavailableView } from '@/components/StateView';
import { PlainKey, TFunction, useT } from '@/lib/i18n';

/**
 * Out of range is "worth asking your doctor about", not an error: amber, with an arrow so high and
 * low never rest on colour alone. In range is the app's teal.
 */
const FLAG: Record<Flag, { label: PlainKey; icon: IconName; color: string }> = {
  normal: { label: 'results.flag.normal', icon: 'checkmark-circle', color: colors.primary },
  high: { label: 'results.flag.high', icon: 'arrow-up-circle', color: colors.warning },
  low: { label: 'results.flag.low', icon: 'arrow-down-circle', color: colors.warning },
};

/** The one-line verdict for the hero: what the patient came to find out. */
function verdict(t: TFunction, ready: boolean, cancelled: boolean, s: ReturnType<typeof summarize>) {
  if (cancelled) return { title: t('results.banner.cancelled.title'), text: t('results.banner.cancelled.text'), attention: false };
  if (!ready) return { title: t('results.banner.processing.title'), text: t('results.banner.processing.text'), attention: false };
  if (s.total === 0) return { title: t('results.banner.noValues.title'), text: t('results.banner.noValues.text'), attention: false };
  if (s.outOfRange > 0) {
    return { title: t('results.banner.outOfRange.title', { count: s.outOfRange }), text: t('results.banner.outOfRange.text'), attention: true };
  }
  if (s.unrated === 0) return { title: t('results.banner.inRange.title'), text: t('results.banner.inRange.text'), attention: false };
  return { title: t('results.banner.unrated.title'), text: t('results.banner.unrated.text'), attention: false };
}

export default function LabResultDetailScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useApiData<LabResult>(
    id ? `/api/patients/me/lab-results/${encodeURIComponent(id)}` : null,
    { refreshOn: ['lab-results'], offline: true }
  );
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = record;

  if (loading) return <LoadingView />;
  // Gone, or another profile's record (often a push for a deleted record): Back, not Try Again.
  if (error && !data) return isUnavailable(record) ? <UnavailableView /> : <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <UnavailableView />;

  const result = data;
  const ready = isReady(result.status);
  const cancelled = result.status === 'cancelled';
  const keys = Object.keys(result.results ?? {});
  const summary = summarize(result);
  const testName = result.request?.testType ?? t('results.labTest');
  const when = result.resultDate ?? result.orderDate ?? result.createdAt;
  const v = verdict(t, ready, cancelled, summary);

  function share() {
    const lines = keys.map((key) => {
      const flag = flagOf(result, key);
      const range = result.referenceRanges?.[key];
      return `• ${analyteLabel(key)}: ${displayValue(result.results?.[key])}${
        range !== undefined && range !== null && range !== '' ? t('results.share.ref', { range: displayValue(range) }) : ''
      }${flag && flag !== 'normal' ? ` — ${t(FLAG[flag].label)}` : ''}`;
    });
    Share.share({
      title: testName,
      message: [`${testName} — ${formatDate(when)}`, ...lines, result.interpretation ? `\n${t('results.share.notes', { notes: result.interpretation })}` : '']
        .filter(Boolean)
        .join('\n'),
    }).catch(() => {});
  }

  const statusIcon: IconName = ready ? 'checkmark-circle' : cancelled ? 'close-circle' : 'time-outline';
  const statusLabel = ready ? t('common.result.ready') : cancelled ? t('common.result.cancelled') : t('common.result.processing');

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <OfflineBanner offline={offline} updatedAt={updatedAt} />

      {/* The test and what it says, on navy: the one thing this screen is for. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>{formatDate(when, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          <View style={styles.heroStatus}>
            <Ionicons name={statusIcon} size={14} color={ready ? colors.accent : colors.onNavyMuted} />
            <Text style={styles.heroStatusText}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {testName}
        </Text>
        {result.requestCode ? (
          <Text style={styles.heroMeta} selectable>
            {t('results.ref', { code: result.requestCode })}
          </Text>
        ) : null}
        <View style={styles.heroFoot} accessibilityRole="summary">
          {v.attention ? (
            <View style={styles.attentionChip}>
              <Ionicons name="alert-circle" size={14} color={colors.warning} />
              <Text style={styles.attentionText}>{v.title}</Text>
            </View>
          ) : (
            <Text style={styles.heroVerdict}>{v.title}</Text>
          )}
          <Text style={styles.heroVerdictText}>{v.text}</Text>
        </View>
      </View>

      {ready && keys.length > 0 ? (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('results.section.values')}
          </Text>
          <View style={styles.card}>
            {keys.map((key, i) => (
              <ValueRow key={key} result={result} name={key} first={i === 0} />
            ))}
          </View>
          {keys.some((k) => rangeOf(result, k)) ? (
            <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <View style={styles.legendBand} />
              <Text style={styles.legendText}>{t('results.meter.legend')}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {ready || result.interpretation ? (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('results.tab.notes')}
          </Text>
          <View style={[styles.card, styles.cardPadded]}>
            {result.interpretation ? (
              <Text style={styles.notes} selectable>
                {result.interpretation}
              </Text>
            ) : (
              <Text style={styles.muted}>{t('results.noNotes')}</Text>
            )}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">
        {t('results.section.about')}
      </Text>
      <View style={styles.card}>
        <InfoRow label={t('results.detail.ordered')} value={formatDate(result.orderDate ?? result.createdAt)} first />
        {result.resultDate ? <InfoRow label={t('results.detail.resultDate')} value={formatDate(result.resultDate)} /> : null}
        {result.request?.urgency ? <InfoRow label={t('results.detail.priority')} value={humanize(result.request.urgency)} /> : null}
        {result.request?.fastingRequired ? <InfoRow label={t('results.detail.fasting')} value={t('results.yes')} /> : null}
        {result.request?.description ? <InfoRow label={t('results.detail.description')} value={result.request.description} /> : null}
        {result.request?.preparationNotes ? <InfoRow label={t('results.detail.preparation')} value={result.request.preparationNotes} /> : null}
      </View>

      {ready && keys.length > 0 ? (
        <Button title={t('results.shareResults')} icon="share-outline" variant="secondary" onPress={share} style={styles.share} />
      ) : null}
      <Text style={styles.footnote}>{t('results.footnote')}</Text>
    </ScrollView>
  );
}

/** One analyte: name, value, its range, and where the value sits in that range. */
function ValueRow({ result, name, first }: { result: LabResult; name: string; first: boolean }) {
  const t = useT();
  const flag = flagOf(result, name);
  const tone = flag ? FLAG[flag] : null;
  const range = result.referenceRanges?.[name];
  const hasRange = range !== undefined && range !== null && range !== '';
  const meter = rangeOf(result, name);
  const value = displayValue(result.results?.[name]);
  const out = flag === 'high' || flag === 'low';
  return (
    <View
      style={[styles.valueRow, !first && styles.dividerTop]}
      accessible
      accessibilityLabel={[
        `${analyteLabel(name)}: ${value}`,
        hasRange ? t('results.meter.rangeA11y', { range: displayValue(range) }) : null,
        tone ? t(tone.label) : null,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={styles.valueTop}>
        <Text style={styles.valueName}>{analyteLabel(name)}</Text>
        <Text style={[styles.valueNumber, out && styles.valueNumberOut]}>{value}</Text>
      </View>
      <View style={styles.valueBottom}>
        <Text style={styles.valueRange}>{hasRange ? t('results.meter.range', { range: displayValue(range) }) : t('results.meter.noRange')}</Text>
        {tone ? (
          <View style={styles.flag}>
            <Ionicons name={tone.icon} size={14} color={tone.color} />
            <Text style={[styles.flagText, { color: out ? colors.warning : colors.primaryOnSoft }]}>{t(tone.label)}</Text>
          </View>
        ) : null}
      </View>
      {meter ? <RangeMeter {...meter} out={out} /> : null}
    </View>
  );
}

/**
 * A track with the reference range as a band in its middle third and a dot for the value, so
 * "how far out" reads at a glance. Values far outside are pinned to the ends.
 */
function RangeMeter({ value, low, high, out }: { value: number; low: number; high: number; out: boolean }) {
  // The range fills the middle third; one range-width of room on either side.
  const span = high - low;
  const pos = Math.min(1, Math.max(0, (value - (low - span)) / (span * 3)));
  return (
    <View style={styles.meter} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.meterTrack} />
      <View style={styles.meterBand} />
      <View style={[styles.meterDot, { left: `${pos * 100}%` }, out ? styles.meterDotOut : null]} />
    </View>
  );
}

function InfoRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.infoRow, !first && styles.dividerTop]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const DOT = 12;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatusText: { fontSize: 13, fontWeight: '600', color: colors.primaryText },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.primaryText, letterSpacing: -0.3, marginTop: spacing.sm + 4 },
  heroMeta: { fontSize: 13, color: colors.onNavyMuted, marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
  heroFoot: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    gap: spacing.xs + 2,
  },
  heroVerdict: { fontSize: 16, fontWeight: '700', color: colors.primaryText },
  heroVerdictText: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted },
  attentionChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  attentionText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.warning },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  cardPadded: { paddingVertical: spacing.md },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  valueRow: { paddingVertical: spacing.sm + 4, gap: spacing.xs },
  valueTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  valueName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  valueNumber: { fontSize: 17, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  valueNumberOut: { color: colors.warning },
  valueBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  valueRange: { flex: 1, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagText: { fontSize: 13, fontWeight: '700' },
  meter: { height: DOT, marginTop: spacing.xs, justifyContent: 'center' },
  meterTrack: { height: 4, borderRadius: 2, backgroundColor: colors.slateSoft },
  // The reference range: the middle third of the track.
  meterBand: { position: 'absolute', left: '33.33%', width: '33.34%', height: 4, borderRadius: 2, backgroundColor: colors.accent },
  meterDot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginLeft: -DOT / 2,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  meterDotOut: { backgroundColor: colors.warning },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  legendBand: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  legendText: { flex: 1, fontSize: 12, color: colors.textMuted },

  notes: { fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },

  infoRow: { paddingVertical: spacing.sm + 4 },
  infoLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  infoValue: { fontSize: 15, lineHeight: 21, color: colors.text, marginTop: 2 },

  share: { marginTop: spacing.lg },
  footnote: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
