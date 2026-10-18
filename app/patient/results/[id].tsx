import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApiData } from '@/lib/useApiData';
import { LabResult } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Badge, Card, DetailRow, LoadingView, SectionTitle, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';

function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function LabResultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh } = useApiData<LabResult>(
    id ? `/api/patients/me/lab-results/${encodeURIComponent(id)}` : null,
    { refreshOn: ['lab-results'] }
  );

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Lab result not found." onRetry={refresh} />;

  const values = data.results && typeof data.results === 'object' ? Object.entries(data.results) : [];

  return (
    <ScrollView
      style={screenStyles.container}
      contentContainerStyle={screenStyles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <Card>
        <View style={screenStyles.cardHeader}>
          <Text style={screenStyles.title}>{data.request?.testType ?? 'Lab test'}</Text>
          <StatusBadge status={data.status} />
        </View>
        <View style={{ height: spacing.sm }} />
        <DetailRow label="Ordered" value={formatDate(data.orderDate ?? data.createdAt)} />
        <DetailRow label="Result date" value={data.resultDate ? formatDate(data.resultDate) : null} />
        <DetailRow label="Reference" value={data.requestCode} />
        <DetailRow label="Description" value={data.request?.description} />
      </Card>

      <SectionTitle>Results</SectionTitle>
      {values.length === 0 ? (
        <Card>
          <Text style={screenStyles.muted}>Results aren't available yet.</Text>
        </Card>
      ) : (
        <Card>
          {values.map(([key, value]) => {
            const flag = data.abnormalFlags?.[key];
            const range = data.referenceRanges?.[key];
            return (
              <View key={key} style={styles.resultRow}>
                <View style={styles.flex}>
                  <Text style={styles.resultName}>{humanize(key)}</Text>
                  {range !== undefined ? <Text style={screenStyles.cardMeta}>Reference: {display(range)}</Text> : null}
                </View>
                <View style={styles.resultValue}>
                  <Text style={[styles.value, flag && flag !== 'normal' ? styles.valueFlagged : null]}>
                    {display(value)}
                  </Text>
                  {flag && flag !== 'normal' ? <Badge label={humanize(flag)} tone="danger" /> : null}
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {data.interpretation ? (
        <>
          <SectionTitle>Interpretation</SectionTitle>
          <Card>
            <Text style={screenStyles.body}>{data.interpretation}</Text>
          </Card>
        </>
      ) : null}

      <Text style={[screenStyles.muted, { marginTop: spacing.md }]}>
        Talk to your doctor about what these results mean for you.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultName: { fontSize: 15, color: colors.text, fontWeight: '500' },
  resultValue: { alignItems: 'flex-end', gap: 4 },
  value: { fontSize: 15, color: colors.text, fontWeight: '600' },
  valueFlagged: { color: colors.danger },
});
