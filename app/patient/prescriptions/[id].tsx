import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { Prescription } from '@/lib/types';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import { prescriberName, visitOf } from '@/lib/prescriptions';
import { colors, radius, spacing } from '@/lib/theme';
import { DetailRow, LoadingView, useBottomPadding } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';
import { MedicationCard } from '@/components/MedicationCard';
import { softShadow } from '@/components/AppHeader';

export default function PrescriptionDetailScreen() {
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh } = useApiData<Prescription>(
    id ? `/api/patients/me/prescriptions/${encodeURIComponent(id)}` : null,
    { refreshOn: ['prescriptions'] }
  );

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Prescription not found." onRetry={refresh} />;

  const visit = visitOf(data);
  const dispenses = (data.pharmacyDispenses ?? []).filter((d) => d.pharmacyName || d.dispensedAt);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.icon}>
            <Ionicons name="document-text-outline" size={26} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>{formatDate(data.issuedAt ?? data.createdAt)}</Text>
            {data.prescriptionCode ? <Text style={styles.meta}>Rx {data.prescriptionCode}</Text> : null}
          </View>
          <StatusBadge status={data.status} />
        </View>
        <DetailRow label="Prescribed by" value={prescriberName(data)} />
        <DetailRow
          label="Visit"
          value={
            visit?.date
              ? `${visit.visitType ? humanize(visit.visitType) : 'Visit'} · ${formatDate(visit.date)}`
              : null
          }
        />
        <DetailRow label="Visit reference" value={visit?.visitCode} />
      </View>

      <Text style={styles.section} accessibilityRole="header">
        Medications
      </Text>
      {data.medications?.length ? (
        data.medications.map((med, index) => (
          <MedicationCard key={`${med.name}-${index}`} prescription={data} med={med} showStatus={false} />
        ))
      ) : (
        <Text style={styles.muted}>No medications listed.</Text>
      )}

      {data.notes ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            Doctor's Notes
          </Text>
          <View style={styles.card}>
            <Text style={styles.body}>{data.notes}</Text>
          </View>
        </>
      ) : null}

      {dispenses.length ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            Dispensing
          </Text>
          <View style={styles.card}>
            {dispenses.map((d, i) => (
              <View key={i} style={[styles.dispense, i < dispenses.length - 1 && styles.divider]}>
                <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={styles.body}>{d.pharmacyName ?? 'Pharmacy'}</Text>
                  {d.dispensedAt ? <Text style={styles.meta}>{formatDateTime(d.dispensedAt)}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.footnote}>Questions about your medication? Contact your clinic.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    ...softShadow,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  muted: { fontSize: 14, color: colors.textMuted },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  dispense: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  footnote: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
