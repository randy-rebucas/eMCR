import { ReactNode, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest, errorMessage } from '@/lib/api';
import { openPdfLink } from '@/lib/documents';
import { useApiData } from '@/lib/useApiData';
import { possessive, useProfile } from '@/lib/profile';
import { HealthSummary, SummaryMedication } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { OfflineBanner } from '@/components/OfflineBanner';

const SEVERE = new Set(['severe', 'high', 'life-threatening', 'anaphylaxis']);

/**
 * The patient's record from every clinic in one place: allergies, current medicines, conditions
 * and vaccinations, with a PDF to hand to a new clinic.
 */
export default function HealthSummaryScreen() {
  const bottomPad = useBottomPadding();
  const { viewing } = useProfile();
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<HealthSummary>(
    '/api/patients/me/health-summary',
    { refreshOn: ['prescriptions', 'profile'], offline: true }
  );
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const link = await apiRequest<{ url: string }>('/api/patients/me/health-summary/pdf-link', { method: 'POST' });
      await openPdfLink(link.url, 'Health-summary', 'Health Summary');
    } catch (err) {
      Alert.alert('Couldn’t open the PDF', errorMessage(err, 'Check your connection and try again.'));
    } finally {
      setDownloading(false);
    }
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <AppHeader back />
      <Text style={styles.title} accessibilityRole="header">
        Health Summary
      </Text>
      <Text style={styles.subtitle}>
        {possessive(viewing)} allergies, medicines and vaccinations from every clinic. Show it, or send the PDF, when you
        see a new doctor.
      </Text>
    </SafeAreaView>
  );

  if (loading && !data) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>{header}</View>
        <LoadingView />
      </View>
    );
  }

  const s = data;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {header}

      <OfflineBanner offline={offline} updatedAt={updatedAt} />
      {error && !s ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : s ? (
        <>
          <Button title="Download PDF" icon="download-outline" onPress={downloadPdf} loading={downloading} />
          <Button
            title="Share with a doctor"
            variant="secondary"
            icon="share-social-outline"
            onPress={() => router.push('/patient/share')}
            style={styles.shareButton}
          />
          {s.clinics.length ? (
            <Text style={styles.sources}>
              From {s.clinics.map((c) => c.name).join(', ')} · updated {formatDate(s.generatedAt)}
            </Text>
          ) : null}

          <Section title="Allergies" icon="alert-circle-outline" alert={s.allergies.length > 0}>
            {s.allergies.length ? (
              s.allergies.map((a, i) => (
                <Item
                  key={a.substance}
                  title={a.substance}
                  lines={[[a.reaction, a.severity ? humanize(a.severity) : null].filter(Boolean).join(' · '), a.clinics.join(', ')]}
                  flag={a.severity && SEVERE.has(a.severity.toLowerCase()) ? 'Severe' : null}
                  last={i === s.allergies.length - 1}
                />
              ))
            ) : (
              <Empty text="No known allergies recorded." />
            )}
          </Section>

          <Section title="Current Medicines" icon="bandage-outline">
            {s.medications.current.length ? (
              s.medications.current.map((m, i) => (
                <MedicationItem key={m.prescriptionId + m.name} med={m} current last={i === s.medications.current.length - 1} />
              ))
            ) : (
              <Empty text="No current medicines." />
            )}
          </Section>

          <Section title="Conditions" icon="medkit-outline">
            {s.conditions.length ? (
              s.conditions.map((c, i) => (
                <Item
                  key={c.condition}
                  title={c.condition}
                  lines={[
                    [humanize(c.status), c.diagnosisDate ? `since ${formatDate(c.diagnosisDate, { utc: true })}` : null]
                      .filter(Boolean)
                      .join(' · '),
                    c.notes,
                    c.clinics.join(', '),
                  ]}
                  muted={c.status === 'resolved'}
                  last={i === s.conditions.length - 1}
                />
              ))
            ) : (
              <Empty text="No conditions recorded." />
            )}
          </Section>

          <Section title="Vaccinations" icon="shield-checkmark-outline">
            {s.immunizations.length ? (
              s.immunizations.map((v, i) => (
                <Item
                  key={`${v.name}-${v.date}`}
                  title={v.name}
                  lines={[formatDate(v.date, { utc: true }), [v.clinic, v.batch ? `Batch ${v.batch}` : null].filter(Boolean).join(' · ')]}
                  last={i === s.immunizations.length - 1}
                />
              ))
            ) : (
              <Empty text="No vaccinations recorded." />
            )}
          </Section>

          {s.medications.recent.length ? (
            <Section title="Other Medicines This Year" icon="time-outline">
              {s.medications.recent.map((m, i) => (
                <MedicationItem key={m.prescriptionId + m.name} med={m} last={i === s.medications.recent.length - 1} />
              ))}
            </Section>
          ) : null}

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
            <Text style={styles.noteText}>
              Each clinic keeps its own record. If something is missing or wrong, ask that clinic to update it.
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function MedicationItem({ med, current, last }: { med: SummaryMedication; current?: boolean; last?: boolean }) {
  const dose = [med.strength, med.dose && med.dose !== med.strength ? med.dose : null, med.frequency].filter(Boolean).join(' · ');
  const when = current && med.endsAt ? `Until ${formatDate(med.endsAt, { utc: true })}` : `Prescribed ${formatDate(med.issuedAt)}`;
  return (
    <Item
      title={med.name}
      lines={[dose, med.instructions, [when, med.clinic].filter(Boolean).join(' · ')]}
      onPress={() => router.push(`/patient/prescriptions/${med.prescriptionId}`)}
      last={last}
    />
  );
}

function Section({ title, icon, alert, children }: { title: string; icon: IconName; alert?: boolean; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={alert ? colors.danger : colors.primary} />
        <Text style={[styles.sectionTitle, alert && styles.alert]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Item({
  title,
  lines,
  flag,
  muted,
  onPress,
  last,
}: {
  title: string;
  lines: (string | null | undefined)[];
  flag?: string | null;
  muted?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const shown = lines.filter((l): l is string => !!l && l.trim() !== '');
  const body = (
    <>
      <View style={styles.itemTop}>
        <Text style={[styles.itemTitle, muted && styles.mutedText]}>{title}</Text>
        {flag ? (
          <View style={styles.flag}>
            <Text style={styles.flagText}>{flag}</Text>
          </View>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>
      {shown.map((line, i) => (
        <Text key={i} style={styles.itemLine}>
          {line}
        </Text>
      ))}
    </>
  );
  const style = [styles.item, !last && styles.divider];
  return onPress ? (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityHint="Opens the prescription" style={style}>
      {body}
    </TouchableOpacity>
  ) : (
    <View style={style}>{body}</View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  shareButton: { marginTop: spacing.sm },
  sources: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  alert: { color: colors.danger },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    paddingHorizontal: spacing.md,
    ...softShadow,
  },
  item: { paddingVertical: spacing.sm + 4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  itemLine: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  mutedText: { color: colors.textMuted },
  flag: { backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  flagText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  empty: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.slate },
});
