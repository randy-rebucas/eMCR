import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApiData } from '@/lib/useApiData';
import { Medication, Prescription } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Card, DetailRow, LoadingView, SectionTitle, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';

function MedicationCard({ med }: { med: Medication }) {
  const headline = [med.strength ?? med.dose, med.form].filter(Boolean).join(' · ');
  return (
    <Card>
      <Text style={screenStyles.cardTitle}>{med.name}</Text>
      {med.genericName ? <Text style={screenStyles.cardMeta}>{med.genericName}</Text> : null}
      {headline ? <Text style={screenStyles.cardLine}>{headline}</Text> : null}
      <View style={{ height: spacing.xs }} />
      <DetailRow label="Dose" value={med.dose} />
      <DetailRow label="How often" value={med.frequency} />
      <DetailRow label="Route" value={med.route} />
      <DetailRow label="Duration" value={med.durationDays ? `${med.durationDays} days` : null} />
      <DetailRow label="Quantity" value={med.quantity} />
      {med.instructions ? <Text style={[screenStyles.body, { marginTop: spacing.sm }]}>{med.instructions}</Text> : null}
    </Card>
  );
}

export default function PrescriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh } = useApiData<Prescription>(
    id ? `/api/patients/me/prescriptions/${encodeURIComponent(id)}` : null,
    { refreshOn: ['prescriptions'] }
  );

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Prescription not found." onRetry={refresh} />;

  const prescriber = data.prescribedBy
    ? [data.prescribedBy.firstName, data.prescribedBy.lastName].filter(Boolean).join(' ')
    : null;

  return (
    <ScrollView
      style={screenStyles.container}
      contentContainerStyle={screenStyles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <Card>
        <View style={screenStyles.cardHeader}>
          <Text style={screenStyles.title}>{formatDate(data.issuedAt ?? data.createdAt)}</Text>
          <StatusBadge status={data.status} />
        </View>
        <View style={{ height: spacing.sm }} />
        <DetailRow label="Prescribed by" value={prescriber || null} />
        <DetailRow label="Reference" value={data.prescriptionCode} />
      </Card>

      <SectionTitle>Medications</SectionTitle>
      {data.medications?.length ? (
        data.medications.map((med, index) => <MedicationCard key={`${med.name}-${index}`} med={med} />)
      ) : (
        <Card>
          <Text style={screenStyles.muted}>No medications listed.</Text>
        </Card>
      )}

      {data.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            <Text style={screenStyles.body}>{data.notes}</Text>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}
