import { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { PatientClinic, Prescription } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { frequencyLabel } from '@/lib/prescriptions';
import {
  diagnosisText,
  followUp,
  Visit,
  visitAssessment,
  visitPlan,
  visitProvider,
  visitTypeLabel,
  vitalRows,
} from '@/lib/visits';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';
import { softShadow } from '@/components/AppHeader';

export default function VisitDetailScreen() {
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh } = useApiData<Visit>(
    id ? `/api/patients/me/visits/${encodeURIComponent(id)}` : null
  );
  const clinics = useApiData<PatientClinic[]>('/api/patients/me/clinics');

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Visit not found." onRetry={refresh} />;

  const visit = data;
  const type = visitTypeLabel(visit.visitType);
  const doctor = visitProvider(visit);
  const clinic = visit.tenantId
    ? clinics.data?.find((c) => String(c.tenantId) === String(visit.tenantId))?.name ?? null
    : null;
  const diagnoses = (visit.diagnoses ?? []).filter((d) => diagnosisText(d));
  const assessment = visitAssessment(visit);
  const plan = visitPlan(visit);
  const tp = visit.treatmentPlan;
  const meds = (tp?.medications ?? []).filter((m) => m.name?.trim());
  const procedures = (tp?.procedures ?? []).filter((p) => p.name?.trim());
  const lifestyle = (tp?.lifestyle ?? []).filter((l) => l.instructions?.trim());
  const hasPlan = !!plan || meds.length > 0 || procedures.length > 0 || lifestyle.length > 0;
  const vitals = vitalRows(visit.vitals);
  const prescriptionIds = (visit.prescriptions ?? []).map(String);
  const next = followUp(visit);
  const nothingRecorded =
    !visit.chiefComplaint?.trim() && !diagnoses.length && !assessment && !hasPlan && !vitals.length && !prescriptionIds.length && !next;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <View style={styles.headerTile}>
          <Ionicons name="medkit-outline" size={30} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {type}
          </Text>
          <Text style={styles.meta}>{formatDate(visit.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          {doctor || clinic ? <Text style={styles.meta}>{[doctor, clinic].filter(Boolean).join(' · ')}</Text> : null}
          {visit.visitCode ? <Text style={styles.meta}>Ref: {visit.visitCode}</Text> : null}
        </View>
      </View>

      {visit.status === 'cancelled' ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
          <Text style={styles.noteText}>This visit was cancelled.</Text>
        </View>
      ) : null}

      {visit.chiefComplaint?.trim() ? (
        <Section title="Reason for Visit" icon="chatbubble-ellipses-outline">
          <Text style={styles.body}>{visit.chiefComplaint.trim()}</Text>
        </Section>
      ) : null}

      {diagnoses.length ? (
        <Section title={diagnoses.length === 1 ? 'Diagnosis' : 'Diagnoses'} icon="clipboard-outline">
          {diagnoses.map((d, i) => {
            const text = diagnosisText(d);
            const code = d.description?.trim() && d.code?.trim() ? d.code.trim() : null;
            return (
              <View
                key={`${d.code ?? ''}-${i}`}
                style={[styles.item, i < diagnoses.length - 1 && styles.divider]}
                accessible
                accessibilityLabel={[text, code ? `ICD-10 code ${code}` : null, d.primary ? 'Main diagnosis' : null]
                  .filter(Boolean)
                  .join('. ')}
              >
                <View style={styles.itemTop}>
                  <Text style={styles.itemTitle}>{text}</Text>
                  {d.primary && diagnoses.length > 1 ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>Main</Text>
                    </View>
                  ) : null}
                </View>
                {code ? <Text style={styles.itemLine}>ICD-10: {code}</Text> : null}
              </View>
            );
          })}
        </Section>
      ) : null}

      {assessment ? (
        <Section title="Doctor's Assessment" icon="document-text-outline">
          <Text style={styles.body}>{assessment}</Text>
        </Section>
      ) : null}

      {hasPlan ? (
        <Section title="Treatment Plan" icon="list-outline">
          {plan ? <Text style={[styles.body, styles.planText]}>{plan}</Text> : null}
          {meds.length ? (
            <SubList title="Medicines">
              {meds.map((m, i) => (
                <Bullet
                  key={`${m.name}-${i}`}
                  title={m.name}
                  line={[m.dosage, frequencyLabel(m.frequency), m.duration, m.instructions].filter(Boolean).join(' · ')}
                />
              ))}
            </SubList>
          ) : null}
          {procedures.length ? (
            <SubList title="Procedures">
              {procedures.map((p, i) => (
                <Bullet
                  key={`${p.name}-${i}`}
                  title={p.name}
                  line={[p.description, p.scheduledDate ? `Scheduled ${formatDate(p.scheduledDate)}` : null].filter(Boolean).join(' · ')}
                />
              ))}
            </SubList>
          ) : null}
          {lifestyle.length ? (
            <SubList title="Lifestyle">
              {lifestyle.map((l, i) => (
                <Bullet key={i} title={l.category ? humanize(l.category) : 'Advice'} line={l.instructions} />
              ))}
            </SubList>
          ) : null}
        </Section>
      ) : null}

      {vitals.length ? (
        <Section title="Vitals Taken" icon="pulse-outline">
          {vitals.map((v, i) => (
            <View
              key={v.label}
              style={[styles.vitalRow, i < vitals.length - 1 && styles.divider]}
              accessible
              accessibilityLabel={`${v.label}: ${v.value}`}
            >
              <Text style={styles.vitalLabel}>{v.label}</Text>
              <Text style={styles.vitalValue}>{v.value}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={styles.link}
            onPress={() => router.push('/patient/vitals')}
            accessibilityRole="link"
            accessibilityLabel="See your vitals over time"
          >
            <Text style={styles.linkText}>See your vitals over time</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </Section>
      ) : null}

      {prescriptionIds.length ? (
        <Section title="Prescriptions" icon="medical-outline">
          {prescriptionIds.map((pid, i) => (
            <PrescriptionLink key={pid} id={pid} index={i} last={i === prescriptionIds.length - 1} />
          ))}
        </Section>
      ) : null}

      {next ? (
        <Section title="Follow-up" icon="calendar-outline">
          {next.date ? (
            <Text style={styles.followDate}>{formatDate(next.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          ) : null}
          {next.instructions ? <Text style={[styles.body, next.date ? styles.followNote : null]}>{next.instructions}</Text> : null}
        </Section>
      ) : null}

      {nothingRecorded ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
          <Text style={styles.noteText}>No notes from this visit are available yet. Ask your clinic if you need them.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

/** One prescription written at the visit: names its medicines and opens the prescription. */
function PrescriptionLink({ id, index, last }: { id: string; index: number; last: boolean }) {
  const { data, loading, error } = useApiData<Prescription>(`/api/patients/me/prescriptions/${encodeURIComponent(id)}`);
  const names = (data?.medications ?? []).map((m) => m.name).filter(Boolean);
  const title = data?.prescriptionCode ? `Rx ${data.prescriptionCode}` : `Prescription ${index + 1}`;
  const line = loading
    ? 'Loading…'
    : error && !data
      ? 'Tap to open'
      : names.length
        ? names.join(', ')
        : 'No medicines listed';
  const status = data?.status === 'cancelled' ? 'Cancelled' : null;
  return (
    <TouchableOpacity
      style={[styles.item, !last && styles.divider]}
      onPress={() => router.push(`/patient/prescriptions/${id}`)}
      accessibilityRole="button"
      accessibilityLabel={[title, status, loading ? null : line].filter(Boolean).join('. ')}
      accessibilityHint="Opens the prescription"
    >
      <View style={styles.itemTop}>
        <Text style={styles.itemTitle}>{title}</Text>
        {status ? (
          <View style={[styles.tag, styles.tagMuted]}>
            <Text style={[styles.tagText, styles.tagTextMuted]}>{status}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <Text style={styles.itemLine} numberOfLines={2}>
        {line}
      </Text>
    </TouchableOpacity>
  );
}

function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SubList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.subList}>
      <Text style={styles.subTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ title, line }: { title: string; line?: string | null }) {
  return (
    <View style={styles.bullet} accessible accessibilityLabel={[title, line].filter(Boolean).join('. ')}>
      <Text style={styles.bulletTitle}>• {title}</Text>
      {line ? <Text style={styles.bulletLine}>{line}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md + 4 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTile: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...softShadow,
  },
  body: { fontSize: 15, lineHeight: 21, color: colors.text, paddingVertical: spacing.xs },
  planText: { marginBottom: spacing.xs },
  item: { paddingVertical: spacing.sm + 4, minHeight: 44, justifyContent: 'center' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  itemLine: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tag: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText: { fontSize: 12, fontWeight: '700', color: colors.primaryOnSoft },
  tagMuted: { backgroundColor: colors.background },
  tagTextMuted: { color: colors.textMuted },
  subList: { paddingVertical: spacing.xs },
  subTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  bullet: { paddingVertical: spacing.xs },
  bulletTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  bulletLine: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginLeft: spacing.md - 4 },
  vitalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  vitalLabel: { fontSize: 15, color: colors.textMuted },
  vitalValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  followDate: { fontSize: 17, fontWeight: '700', color: colors.text, paddingVertical: spacing.xs },
  followNote: { paddingTop: 0 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.slate },
});
