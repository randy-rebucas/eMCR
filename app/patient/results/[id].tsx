import { useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { LabResult } from '@/lib/types';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import { analyteLabel, displayValue, Flag, flagOf, isReady, summarize } from '@/lib/labResults';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, DetailRow, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorState } from '@/components/ErrorState';
import { ResultStatusPill } from '@/components/ResultStatusPill';
import { softShadow } from '@/components/AppHeader';

type Tab = 'summary' | 'details' | 'notes';

const FLAG_TONE: Record<Flag, { label: string; bg: string; fg: string }> = {
  normal: { label: 'Normal', bg: '#DCF5E7', fg: '#1F7A4A' },
  high: { label: 'High', bg: colors.dangerSoft, fg: colors.danger },
  low: { label: 'Low', bg: colors.warningSoft, fg: colors.warning },
};

export default function LabResultDetailScreen() {
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<LabResult>(
    id ? `/api/patients/me/lab-results/${encodeURIComponent(id)}` : null,
    { refreshOn: ['lab-results'], offline: true }
  );
  const [tab, setTab] = useState<Tab>('summary');

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Lab result not found." onRetry={refresh} />;

  const result = data;
  const ready = isReady(result.status);
  const keys = Object.keys(result.results ?? {});
  const summary = summarize(result);
  const testName = result.request?.testType ?? 'Lab test';
  const when = result.resultDate ?? result.orderDate ?? result.createdAt;

  function share() {
    const lines = keys.map((key) => {
      const flag = flagOf(result, key);
      const range = result.referenceRanges?.[key];
      return `• ${analyteLabel(key)}: ${displayValue(result.results?.[key])}${
        range !== undefined && range !== null && range !== '' ? ` (ref ${displayValue(range)})` : ''
      }${flag && flag !== 'normal' ? ` — ${FLAG_TONE[flag].label}` : ''}`;
    });
    Share.share({
      title: testName,
      message: [`${testName} — ${formatDate(when)}`, ...lines, result.interpretation ? `\nNotes: ${result.interpretation}` : '']
        .filter(Boolean)
        .join('\n'),
    }).catch(() => {});
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <OfflineBanner offline={offline} updatedAt={updatedAt} />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTile}>
          <Ionicons name="flask-outline" size={30} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {testName}
          </Text>
          <Text style={styles.meta}>{result.resultDate ? formatDateTime(result.resultDate) : formatDate(when)}</Text>
          {result.requestCode ? <Text style={styles.meta}>Ref: {result.requestCode}</Text> : null}
        </View>
        <ResultStatusPill status={result.status} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            { value: 'summary', label: 'Summary' },
            { value: 'details', label: 'Details' },
            { value: 'notes', label: "Doctor's Notes" },
          ] as { value: Tab; label: string }[]
        ).map((t) => {
          const selected = t.value === tab;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setTab(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'summary' ? (
        <>
          <SummaryBanner ready={ready} cancelled={result.status === 'cancelled'} summary={summary} />
          {ready && keys.length > 0 ? (
            <View style={styles.grid}>
              {keys.map((key) => {
                const flag = flagOf(result, key);
                const tone = flag ? FLAG_TONE[flag] : null;
                const range = result.referenceRanges?.[key];
                return (
                  <View
                    key={key}
                    style={[styles.value, flag === 'high' || flag === 'low' ? { borderColor: tone!.fg } : null]}
                    accessible
                    accessibilityLabel={`${analyteLabel(key)}: ${displayValue(result.results?.[key])}${tone ? `, ${tone.label}` : ''}`}
                  >
                    <Text style={styles.valueName} numberOfLines={2}>
                      {analyteLabel(key)}
                    </Text>
                    <Text style={[styles.valueNumber, flag === 'high' || flag === 'low' ? { color: tone!.fg } : null]}>
                      {displayValue(result.results?.[key])}
                    </Text>
                    {range !== undefined && range !== null && range !== '' ? (
                      <Text style={styles.valueRange}>({displayValue(range)})</Text>
                    ) : null}
                    {tone ? (
                      <View style={[styles.flag, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.flagText, { color: tone.fg }]}>{tone.label}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}

      {tab === 'details' ? (
        <View style={styles.card}>
          <DetailRow label="Test" value={testName} />
          <DetailRow label="Ordered" value={formatDate(result.orderDate ?? result.createdAt)} />
          <DetailRow label="Result date" value={result.resultDate ? formatDate(result.resultDate) : null} />
          <DetailRow label="Reference" value={result.requestCode} />
          <DetailRow label="Priority" value={result.request?.urgency ? humanize(result.request.urgency) : null} />
          <DetailRow label="Fasting required" value={result.request?.fastingRequired ? 'Yes' : null} />
          <DetailRow label="Description" value={result.request?.description} />
          {result.request?.preparationNotes ? (
            <Text style={styles.prep}>Preparation: {result.request.preparationNotes}</Text>
          ) : null}
        </View>
      ) : null}

      {tab === 'notes' ? (
        <View style={styles.card}>
          {result.interpretation ? (
            <Text style={styles.notes}>{result.interpretation}</Text>
          ) : (
            <Text style={styles.muted}>Your doctor hasn't added notes to this result yet.</Text>
          )}
        </View>
      ) : null}

      {ready && keys.length > 0 ? (
        <Button title="Share Results" icon="share-outline" onPress={share} style={styles.share} />
      ) : null}
      <Text style={styles.footnote}>Talk to your doctor about what these results mean for you.</Text>
    </ScrollView>
  );
}

function SummaryBanner({
  ready,
  cancelled,
  summary,
}: {
  ready: boolean;
  cancelled: boolean;
  summary: ReturnType<typeof summarize>;
}) {
  let icon: IconName;
  let title: string;
  let text: string;
  let tone: { bg: string; fg: string };
  if (cancelled) {
    icon = 'close-circle';
    title = 'This test was cancelled';
    text = 'Contact your clinic if you think this is a mistake.';
    tone = { bg: colors.slateSoft, fg: colors.slate };
  } else if (!ready) {
    icon = 'time';
    title = 'Results are being processed';
    text = "We'll notify you as soon as they're ready.";
    tone = { bg: colors.warningSoft, fg: colors.warning };
  } else if (summary.total === 0) {
    icon = 'document-text';
    title = 'Your result is ready';
    text = "There are no individual values to show. See Doctor's Notes, or ask your clinic for the report.";
    tone = { bg: colors.primarySoft, fg: colors.primary };
  } else if (summary.outOfRange > 0) {
    icon = 'alert-circle';
    title = `${summary.outOfRange} value${summary.outOfRange === 1 ? '' : 's'} outside the reference range`;
    text = 'This is common and not always a concern. Please discuss these results with your doctor.';
    tone = { bg: colors.dangerSoft, fg: colors.danger };
  } else if (summary.unrated === 0) {
    icon = 'checkmark-circle';
    title = 'Results are within the reference range';
    text = 'Please discuss them with your doctor for a full interpretation.';
    tone = { bg: '#E3F5EC', fg: '#1F7A4A' };
  } else {
    icon = 'information-circle';
    title = 'Your results are in';
    text = "Some values don't have a reference range. Your doctor can explain them.";
    tone = { bg: colors.primarySoft, fg: colors.primary };
  }
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg }]} accessibilityRole="summary">
      <Ionicons name={icon} size={36} color={tone.fg} />
      <View style={styles.flex}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerTile: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E4EEF0',
    borderRadius: radius.md,
    padding: 4,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextSelected: { color: colors.primaryText },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  bannerText: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing.md },
  value: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.sm + 6,
    marginBottom: spacing.sm + 2,
    ...softShadow,
  },
  valueName: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  valueNumber: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.xs },
  valueRange: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  flag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, marginTop: spacing.sm },
  flagText: { fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    ...softShadow,
  },
  prep: { fontSize: 14, color: colors.text, marginTop: spacing.sm, lineHeight: 20 },
  notes: { fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  share: { marginTop: spacing.lg },
  footnote: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
