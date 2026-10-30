import { useMemo, useState } from 'react';
import { FlatList, LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';

/** Second line colour (diastolic): a slate that reads apart from the teal. */
const SECOND = colors.slate;

/** Vitals recorded at clinic visits, one measure at a time, as a chart and a list. */
export default function VitalsScreen() {
  const bottomPad = useBottomPadding();
  const { data, loading, refreshing, error, refresh } = useApiData<VitalsEntry[]>('/api/patients/me/vitals?limit=100');
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
        Vitals
      </Text>
      <Text style={styles.subtitle}>Measurements taken at your clinic visits, over time.</Text>
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

  const header = (
    <View>
      {titleBlock}

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
            <View
              style={styles.latest}
              accessible
              accessibilityLabel={`Latest ${measure.label}: ${spoken(measure, latest.values)}, on ${formatDate(latest.date)}`}
            >
              <Text style={styles.latestLabel}>Latest {measure.label}</Text>
              <Text style={styles.latestValue}>{formatReading(measure, latest.values)}</Text>
              <Text style={styles.latestDate}>{formatDate(latest.date)}</Text>
              {measure.key === 'bp' ? <Text style={styles.latestHint}>Top number (systolic) / bottom number (diastolic)</Text> : null}
            </View>
          ) : null}

          <View style={styles.card}>
            {readings.length >= 2 ? (
              <TrendChart measure={measure} readings={readings} />
            ) : (
              <View style={styles.single} accessible accessibilityLabel={`Only one ${measure.label} reading so far. A chart appears once there are two.`}>
                <Ionicons name="analytics-outline" size={28} color={colors.textMuted} />
                <Text style={styles.singleText}>Only one reading so far. A chart appears once there are two.</Text>
              </View>
            )}
          </View>

          {error ? <Text style={styles.stale}>Couldn't refresh. Showing what was loaded before.</Text> : null}

          <Text style={styles.listTitle} accessibilityRole="header">
            Readings ({readings.length})
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
          <Text style={styles.emptyTitle}>No vitals yet</Text>
          <Text style={styles.emptyText}>
            Blood pressure, weight and other measurements taken at your clinic visits will show up here.
          </Text>
        </View>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    />
  );
}

function spoken(measure: Measure, values: number[]): string {
  const text =
    measure.key === 'bp'
      ? `${formatNumber(values[0], 0)} over ${formatNumber(values[1], 0)}`
      : formatNumber(values[0], measure.decimals);
  return measure.unitSpoken ? `${text} ${measure.unitSpoken}` : text;
}

/** Plain-language summary of the chart for screen readers. */
function chartSummary(measure: Measure, readings: Reading[]): string {
  const first = readings[0];
  const last = readings[readings.length - 1];
  const parts = [`${measure.label} chart, ${readings.length} readings from ${formatDate(first.date)} to ${formatDate(last.date)}.`];
  const series = measure.key === 'bp' ? ['Systolic', 'Diastolic'] : [null];
  series.forEach((name, i) => {
    const vals = readings.map((r) => r.values[i]);
    const low = Math.min(...vals);
    const high = Math.max(...vals);
    const fmt = (v: number) => formatNumber(v, measure.decimals);
    parts.push(
      `${name ? `${name}: ` : ''}lowest ${fmt(low)}, highest ${fmt(high)}, first ${fmt(vals[0])}, latest ${fmt(vals[vals.length - 1])}${
        measure.unitSpoken ? ` ${measure.unitSpoken}` : ''
      }.`
    );
  });
  return parts.join(' ');
}

const CHART_HEIGHT = 190;
const PAD = { left: 40, right: 12, top: 12, bottom: 26 };

function TrendChart({ measure, readings }: { measure: Measure; readings: Reading[] }) {
  const [width, setWidth] = useState(0);
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
  const lineColors = [colors.primary, SECOND];

  return (
    <View>
      <View
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={chartSummary(measure, readings)}
      >
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {ticks.map((t, i) => (
              <Line key={`g${i}`} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={1} />
            ))}
            {ticks.map((t, i) => (
              <SvgText key={`t${i}`} x={PAD.left - 6} y={y(t) + 4} fontSize={11} fill={colors.textMuted} textAnchor="end">
                {formatNumber(t, tickDecimals)}
              </SvgText>
            ))}
            {Array.from({ length: seriesCount }, (_, s) => (
              <Polyline
                key={`l${s}`}
                points={readings.map((r, i) => `${x(r, i)},${y(r.values[s])}`).join(' ')}
                fill="none"
                stroke={lineColors[s]}
                strokeWidth={2.5}
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
                  r={i === readings.length - 1 ? 4.5 : 3}
                  fill={i === readings.length - 1 ? lineColors[s] : colors.surface}
                  stroke={lineColors[s]}
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
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {measure.key === 'bp' ? (
          <>
            <LegendItem color={lineColors[0]} label="Systolic (top)" />
            <LegendItem color={lineColors[1]} label="Diastolic (bottom)" />
          </>
        ) : (
          <LegendItem color={lineColors[0]} label={measure.unit ? `${measure.label} (${measure.unit})` : measure.label} />
        )}
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
  const type = visitTypeLabel(visitType);
  return (
    <TouchableOpacity
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast]}
      onPress={() => router.push(`/patient/visits/${reading.visitId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${formatDate(reading.date)}, ${spoken(measure, reading.values)}. ${type}`}
      accessibilityHint="Opens the visit"
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
  latest: {
    marginTop: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  latestLabel: { fontSize: 13, fontWeight: '700', color: colors.primaryOnSoft },
  latestValue: { fontSize: 30, fontWeight: '800', color: colors.text, marginTop: 2 },
  latestDate: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  latestHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.sm + 4,
    ...softShadow,
  },
  single: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  singleText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm, paddingLeft: PAD.left },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 4, borderRadius: 2 },
  legendText: { fontSize: 12, color: colors.textMuted },
  stale: { fontSize: 12, color: colors.warning, marginTop: spacing.sm, textAlign: 'center' },
  listTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 0, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDate: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: '700', color: colors.text },
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
