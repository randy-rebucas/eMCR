import { useMemo, useState } from 'react';
import {
  FlatList,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useApiData } from '@/lib/useApiData';
import { formatDate } from '@/lib/format';
import {
  availableMeasures,
  formatNumber,
  formatReading,
  Measure,
  MeasureKey,
  Reading,
  readingsFor,
  visitTypeLabel,
  VitalsEntry,
} from '@/lib/visits';
import { colors, radius, spacing } from '@/lib/theme';
import { LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { t as translate, useT } from '@/lib/i18n';

/** The validated pair: teal for the main series (or systolic), slate for diastolic. */
const LINE_COLORS = [colors.accent, colors.slate];

/** Vitals recorded at clinic visits, one measure at a time: the latest reading, its trend, every reading. */
export default function VitalsScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<VitalsEntry[]>('/api/patients/me/vitals?limit=100', {
    offline: true,
  });
  const entries = useMemo(() => data ?? [], [data]);
  const measures = useMemo(() => availableMeasures(entries), [entries]);
  const [picked, setPicked] = useState<MeasureKey | null>(null);
  const measure = measures.find((m) => m.key === picked) ?? measures[0] ?? null;
  const readings = useMemo(() => (measure ? readingsFor(entries, measure.key) : []), [entries, measure]);
  const newestFirst = useMemo(() => [...readings].reverse(), [readings]);
  const typeByVisit = useMemo(() => new Map(entries.map((e) => [String(e.visitId), e.visitType])), [entries]);

  const titleBlock = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        {t('vitals.title')}
      </Text>
      <Text style={styles.subtitle}>{t('vitals.subtitle')}</Text>
    </SafeAreaView>
  );

  if (loading && !data) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>{titleBlock}</View>
        <LoadingView />
      </View>
    );
  }

  if (error && !data) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, styles.grow]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {titleBlock}
        <ErrorState message={error} onRetry={refresh} />
      </ScrollView>
    );
  }

  const latest = newestFirst[0] ?? null;
  const previous = newestFirst[1] ?? null;

  const header = (
    <View>
      {titleBlock}
      {offline ? (
        <View style={styles.banner}>
          <OfflineBanner offline={offline} updatedAt={updatedAt} subject={t('vitals.offlineSubject')} />
        </View>
      ) : error ? (
        <Text style={styles.stale}>{t('vitals.stale')}</Text>
      ) : null}

      {measure ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            accessibilityRole="tablist"
            style={styles.chipRow}
          >
            {measures.map((m) => {
              const selected = m.key === measure.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setPicked(m.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={m.label}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {latest ? (
            // The newest reading is what the patient opens this for: on navy.
            <View
              style={styles.hero}
              accessible
              accessibilityLabel={[
                t('vitals.latestA11y', { measure: measure.label, value: spoken(measure, latest.values), date: formatDate(latest.date) }),
                previous ? t('vitals.previousA11y', { value: spoken(measure, previous.values), date: formatDate(previous.date) }) : null,
              ]
                .filter(Boolean)
                .join('. ')}
            >
              <Text style={styles.heroEyebrow}>{t('vitals.latest', { measure: measure.label })}</Text>
              <Text style={styles.heroValue}>{formatReading(measure, latest.values)}</Text>
              <Text style={styles.heroDate}>{formatDate(latest.date, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              {previous ? (
                <Text style={styles.heroPrevious}>
                  {t('vitals.previous', { value: formatReading(measure, previous.values), date: formatDate(previous.date) })}
                </Text>
              ) : null}
              {measure.key === 'bp' ? <Text style={styles.heroHint}>{t('vitals.bpHint')}</Text> : null}
            </View>
          ) : null}

          <View style={styles.card}>
            {readings.length >= 2 ? (
              <TrendChart key={measure.key} measure={measure} readings={readings} />
            ) : (
              <View style={styles.single} accessible accessibilityLabel={t('vitals.singleA11y', { measure: measure.label })}>
                <Ionicons name="analytics-outline" size={28} color={colors.textMuted} />
                <Text style={styles.singleText}>{t('vitals.single')}</Text>
              </View>
            )}
          </View>

          <Text style={styles.listTitle} accessibilityRole="header">
            {t('vitals.readings', { count: readings.length })}
          </Text>
        </>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      data={measure ? newestFirst : []}
      keyExtractor={(r) => `${r.visitId}-${r.time}`}
      ListHeaderComponent={header}
      renderItem={({ item, index }) =>
        measure ? (
          <ReadingRow
            measure={measure}
            reading={item}
            visitType={typeByVisit.get(String(item.visitId))}
            first={index === 0}
            last={index === newestFirst.length - 1}
          />
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="pulse-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('vitals.empty.title')}</Text>
          <Text style={styles.emptyText}>{t('vitals.empty.text')}</Text>
        </View>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    />
  );
}

function spoken(measure: Measure, values: number[]): string {
  const text =
    measure.key === 'bp'
      ? translate('vitals.over', { top: formatNumber(values[0], 0), bottom: formatNumber(values[1], 0) })
      : formatNumber(values[0], measure.decimals);
  return measure.unitSpoken ? `${text} ${measure.unitSpoken}` : text;
}

/** Plain-language summary of the chart for screen readers. */
function chartSummary(measure: Measure, readings: Reading[]): string {
  const first = readings[0];
  const last = readings[readings.length - 1];
  const parts = [
    translate('vitals.chartIntro', {
      measure: measure.label,
      count: readings.length,
      from: formatDate(first.date),
      to: formatDate(last.date),
    }),
  ];
  const series = measure.key === 'bp' ? [translate('vitals.systolic'), translate('vitals.diastolic')] : [null];
  series.forEach((name, i) => {
    const vals = readings.map((r) => r.values[i]);
    const fmt = (v: number) => formatNumber(v, measure.decimals);
    const stats = {
      low: fmt(Math.min(...vals)),
      high: fmt(Math.max(...vals)),
      first: fmt(vals[0]),
      latest: fmt(vals[vals.length - 1]),
      unit: measure.unitSpoken ? ` ${measure.unitSpoken}` : '',
    };
    parts.push(name ? translate('vitals.seriesStatsNamed', { name, ...stats }) : translate('vitals.seriesStats', stats));
  });
  return parts.join(' ');
}

const CHART_HEIGHT = 190;
const PAD = { left: 40, right: 12, top: 12, bottom: 26 };

/**
 * One line per series over time, one y-axis. Tap anywhere on the plot to read the nearest reading
 * in the line above it (the latest is shown until then); the reading list below carries every
 * value for screen readers.
 */
function TrendChart({ measure, readings }: { measure: Measure; readings: Reading[] }) {
  const tr = useT();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(readings.length - 1);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const seriesCount = measure.key === 'bp' ? 2 : 1;
  const all = readings.flatMap((r) => r.values.slice(0, seriesCount));
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1e-9) {
    const pad = Math.max(1, Math.abs(hi) * 0.05);
    lo -= pad;
    hi += pad;
  } else {
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  const t0 = readings[0].time;
  const t1 = readings[readings.length - 1].time;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  // Space points by date; readings on the same moment fall back to even spacing.
  const x = (r: Reading, i: number) =>
    PAD.left + (t1 > t0 ? ((r.time - t0) / (t1 - t0)) * plotW : (i / Math.max(1, readings.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
  const ticks = [hi, (hi + lo) / 2, lo];
  const tickDecimals = hi - lo < 5 ? 1 : 0;
  const pick = readings[Math.min(selected, readings.length - 1)];
  const pickIndex = readings.indexOf(pick);

  function onPress(e: GestureResponderEvent) {
    const tapX = e.nativeEvent.locationX;
    let best = 0;
    readings.forEach((r, i) => {
      if (Math.abs(x(r, i) - tapX) < Math.abs(x(readings[best], best) - tapX)) best = i;
    });
    setSelected(best);
  }

  return (
    <View>
      {/* Readout: text colours only; the series colour stays on the marks. */}
      <Text style={styles.readout} accessibilityLiveRegion="polite">
        {tr('vitals.readout', {
          date: formatDate(pick.date, { month: 'short', day: 'numeric', year: 'numeric' }),
          value: formatReading(measure, pick.values),
        })}
      </Text>
      <Pressable onLayout={onLayout} onPress={onPress} accessible accessibilityRole="image" accessibilityLabel={chartSummary(measure, readings)}>
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {ticks.map((tk, i) => (
              <Line key={`g${i}`} x1={PAD.left} x2={width - PAD.right} y1={y(tk)} y2={y(tk)} stroke={colors.border} strokeWidth={1} />
            ))}
            {ticks.map((tk, i) => (
              <SvgText key={`t${i}`} x={PAD.left - 6} y={y(tk) + 4} fontSize={11} fill={colors.textMuted} textAnchor="end">
                {formatNumber(tk, tickDecimals)}
              </SvgText>
            ))}
            {/* The inspected reading: a hairline from top to bottom. */}
            <Line
              x1={x(pick, pickIndex)}
              x2={x(pick, pickIndex)}
              y1={PAD.top}
              y2={CHART_HEIGHT - PAD.bottom}
              stroke={colors.textMuted}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            {Array.from({ length: seriesCount }, (_, s) => (
              <Polyline
                key={`l${s}`}
                points={readings.map((r, i) => `${x(r, i)},${y(r.values[s])}`).join(' ')}
                fill="none"
                stroke={LINE_COLORS[s]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {Array.from({ length: seriesCount }, (_, s) =>
              readings.map((r, i) => (
                <Circle
                  key={`p${s}-${i}`}
                  cx={x(r, i)}
                  cy={y(r.values[s])}
                  r={i === pickIndex ? 5 : 3.5}
                  fill={i === pickIndex ? LINE_COLORS[s] : colors.surface}
                  stroke={i === pickIndex ? colors.surface : LINE_COLORS[s]}
                  strokeWidth={2}
                />
              ))
            )}
            <SvgText x={PAD.left} y={CHART_HEIGHT - 6} fontSize={11} fill={colors.textMuted} textAnchor="start">
              {formatDate(readings[0].date, { month: 'short', year: 'numeric' })}
            </SvgText>
            <SvgText x={width - PAD.right} y={CHART_HEIGHT - 6} fontSize={11} fill={colors.textMuted} textAnchor="end">
              {formatDate(readings[readings.length - 1].date, { month: 'short', year: 'numeric' })}
            </SvgText>
          </Svg>
        ) : (
          <View style={{ height: CHART_HEIGHT }} />
        )}
      </Pressable>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {measure.key === 'bp' ? (
          <>
            <LegendItem color={LINE_COLORS[0]} label={tr('vitals.legendSystolic')} />
            <LegendItem color={LINE_COLORS[1]} label={tr('vitals.legendDiastolic')} />
          </>
        ) : null}
        <Text style={styles.legendHint}>{tr('vitals.tapHint')}</Text>
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function ReadingRow({
  measure,
  reading,
  visitType,
  first,
  last,
}: {
  measure: Measure;
  reading: Reading;
  visitType?: string;
  first: boolean;
  last: boolean;
}) {
  const t = useT();
  const type = visitTypeLabel(visitType);
  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !first && styles.rowDivider]}
      onPress={() => router.push(`/patient/visits/${reading.visitId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${formatDate(reading.date)}, ${spoken(measure, reading.values)}. ${type}`}
      accessibilityHint={t('vitals.openVisitHint')}
    >
      <View style={styles.flex}>
        <Text style={styles.rowDate}>{formatDate(reading.date)}</Text>
        <Text style={styles.rowMeta}>{type}</Text>
      </View>
      <Text style={styles.rowValue}>{formatReading(measure, reading.values)}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  grow: { flexGrow: 1 },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  banner: { marginTop: spacing.md },
  stale: { fontSize: 13, color: colors.warning, marginTop: spacing.sm },
  chipRow: { marginTop: spacing.lg, marginHorizontal: -(spacing.md + 4) },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md + 4 },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  chipTextSelected: { color: colors.primaryText },

  hero: { marginTop: spacing.md, backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { fontSize: 34, fontWeight: '800', color: colors.primaryText, marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
  heroDate: { fontSize: 14, color: colors.onNavyMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  heroPrevious: {
    fontSize: 14,
    color: colors.primaryText,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    fontVariant: ['tabular-nums'],
  },
  heroHint: { fontSize: 12, color: colors.onNavyMuted, marginTop: spacing.xs },

  card: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
  },
  readout: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.xs, paddingLeft: spacing.xs, fontVariant: ['tabular-nums'] },
  single: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  singleText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, paddingLeft: PAD.left },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 4, borderRadius: 2 },
  legendText: { fontSize: 12, color: colors.textMuted },
  legendHint: { fontSize: 12, color: colors.textMuted },
  listTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  // Rows draw one ruled card: outer border on every row, corners on the ends.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    borderRadius: 1,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowDate: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
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
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
