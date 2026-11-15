import { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { PatientClinic, Prescription } from '@/lib/types';
import { clinicTodayYmd, clinicYmd, formatDate, humanize } from '@/lib/format';
import { frequencyLabel } from '@/lib/prescriptions';
import {
  diagnosisText,
  followUp,
  primaryDiagnosis,
  Visit,
  visitAssessment,
  visitPlan,
  visitProvider,
  visitTypeLabel,
  vitalRows,
} from '@/lib/visits';
import { colors, radius, spacing } from '@/lib/theme';
import { LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useT } from '@/lib/i18n';

export default function VisitDetailScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<Visit>(
    id ? `/api/patients/me/visits/${encodeURIComponent(id)}` : null,
    { offline: true }
  );
  const clinics = useApiData<PatientClinic[]>('/api/patients/me/clinics', { offline: true });

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message={t('visits.notFound')} onRetry={refresh} />;

  const visit = data;
  const type = visitTypeLabel(visit.visitType);
  const doctor = visitProvider(visit);
  const clinic = visit.tenantId ? clinics.data?.find((c) => String(c.tenantId) === String(visit.tenantId)) ?? null : null;
  const diagnoses = (visit.diagnoses ?? []).filter((d) => diagnosisText(d));
  const main = primaryDiagnosis(visit);
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
  const nextDay = next?.date ? clinicYmd(new Date(next.date)) : null;
  // A follow-up still ahead is the one thing to act on: offer to book it at the same clinic.
  const followUpAhead = !!nextDay && nextDay >= clinicTodayYmd() && visit.status !== 'cancelled';
  const cancelled = visit.status === 'cancelled';
  const nothingRecorded =
    !visit.chiefComplaint?.trim() && !diagnoses.length && !assessment && !hasPlan && !vitals.length && !prescriptionIds.length && !next;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      {offline ? <OfflineBanner offline={offline} updatedAt={updatedAt} subject={t('visits.offlineSubjectOne')} /> : <RefreshErrorBanner error={error} />}

      {/* What the visit came to: the main finding, on navy. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>{type}</Text>
          {cancelled ? (
            <View style={styles.heroStatus}>
              <Ionicons name="close-circle" size={14} color={colors.onNavyMuted} />
              <Text style={styles.heroStatusText}>{t('visits.cancelled')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heroWhen}>{formatDate(visit.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {main ? diagnosisText(main) : visit.chiefComplaint?.trim() || type}
        </Text>
        {doctor ? <HeroLine icon="person-outline" text={doctor} /> : null}
        {clinic ? <HeroLine icon="business-outline" text={clinic.name} /> : null}
        {visit.visitCode ? (
          <Text style={styles.heroRef} selectable>
            {t('visits.ref', { code: visit.visitCode })}
          </Text>
        ) : null}
        {followUpAhead && next?.date ? (
          <View style={styles.heroFoot}>
            <Text style={styles.heroFollow}>
              {t('visits.followUpOn', { date: formatDate(next.date, { weekday: 'short', month: 'long', day: 'numeric' }) })}
            </Text>
            <TouchableOpacity
              style={styles.heroButton}
              onPress={() =>
                router.push({ pathname: '/patient/appointments/book', params: visit.tenantId ? { tenantId: String(visit.tenantId) } : {} })
              }
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primaryText} />
              <Text style={styles.heroButtonText}>{t('visits.bookFollowUp')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {cancelled ? <Note text={t('visits.wasCancelled')} /> : null}

      {visit.chiefComplaint?.trim() ? (
        <Section title={t('visits.reason')}>
          <Text style={styles.body}>{visit.chiefComplaint.trim()}</Text>
        </Section>
      ) : null}

      {diagnoses.length ? (
        <Section title={diagnoses.length === 1 ? t('visits.diagnosis') : t('visits.diagnoses')} flush>
          {diagnoses.map((d, i) => {
            const text = diagnosisText(d);
            const code = d.description?.trim() && d.code?.trim() ? d.code.trim() : null;
            return (
              <View
                key={`${d.code ?? ''}-${i}`}
                style={[styles.item, i > 0 && styles.dividerTop]}
                accessible
                accessibilityLabel={[text, code ? t('visits.icdA11y', { code }) : null, d.primary ? t('visits.mainA11y') : null]
                  .filter(Boolean)
                  .join('. ')}
              >
                <View style={styles.itemTop}>
                  <Text style={styles.itemTitle}>{text}</Text>
                  {d.primary && diagnoses.length > 1 ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{t('visits.main')}</Text>
                    </View>
                  ) : null}
                </View>
                {code ? <Text style={styles.itemLine}>{t('visits.icd', { code })}</Text> : null}
              </View>
            );
          })}
        </Section>
      ) : null}

      {assessment ? (
        <Section title={t('visits.assessment')}>
          <Text style={styles.body}>{assessment}</Text>
        </Section>
      ) : null}

      {hasPlan ? (
        <Section title={t('visits.treatmentPlan')}>
          {plan ? <Text style={[styles.body, styles.planText]}>{plan}</Text> : null}
          {meds.length ? (
            <SubList title={t('visits.medicines')}>
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
            <SubList title={t('visits.procedures')}>
              {procedures.map((p, i) => (
                <Bullet
                  key={`${p.name}-${i}`}
                  title={p.name}
                  line={[p.description, p.scheduledDate ? t('visits.scheduled', { date: formatDate(p.scheduledDate) }) : null].filter(Boolean).join(' · ')}
                />
              ))}
            </SubList>
          ) : null}
          {lifestyle.length ? (
            <SubList title={t('visits.lifestyle')}>
              {lifestyle.map((l, i) => (
                <Bullet key={i} title={l.category ? humanize(l.category) : t('visits.advice')} line={l.instructions} />
              ))}
            </SubList>
          ) : null}
        </Section>
      ) : null}

      {prescriptionIds.length ? (
        <Section title={t('visits.prescriptions')} flush>
          {prescriptionIds.map((pid, i) => (
            <PrescriptionLink key={pid} id={pid} index={i} first={i === 0} />
          ))}
        </Section>
      ) : null}

      {vitals.length ? (
        <Section title={t('visits.vitalsTaken')} flush>
          {vitals.map((v, i) => (
            <View key={v.label} style={[styles.vitalRow, i > 0 && styles.dividerTop]} accessible accessibilityLabel={`${v.label}: ${v.value}`}>
              <Text style={styles.vitalLabel}>{v.label}</Text>
              <Text style={styles.vitalValue}>{v.value}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.link, styles.dividerTop]}
            onPress={() => router.push('/patient/vitals')}
            accessibilityRole="link"
            accessibilityLabel={t('visits.seeVitals')}
          >
            <Ionicons name="analytics-outline" size={18} color={colors.primary} />
            <Text style={styles.linkText}>{t('visits.seeVitals')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </Section>
      ) : null}

      {next && !followUpAhead ? (
        <Section title={t('visits.followUp')}>
          {next.date ? <Text style={styles.followDate}>{formatDate(next.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text> : null}
          {next.instructions ? <Text style={[styles.body, next.date ? styles.followNote : null]}>{next.instructions}</Text> : null}
        </Section>
      ) : followUpAhead && next?.instructions ? (
        <Section title={t('visits.followUp')}>
          <Text style={styles.body}>{next.instructions}</Text>
        </Section>
      ) : null}

      {nothingRecorded ? <Note text={t('visits.nothingRecorded')} /> : null}
    </ScrollView>
  );
}

function HeroLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.heroLine}>
      <Ionicons name={icon} size={16} color={colors.onNavyMuted} />
      <Text style={styles.heroLineText}>{text}</Text>
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

/** One prescription written at the visit: names its medicines and opens the prescription. */
function PrescriptionLink({ id, index, first }: { id: string; index: number; first: boolean }) {
  const t = useT();
  const { data, loading, error } = useApiData<Prescription>(`/api/patients/me/prescriptions/${encodeURIComponent(id)}`, { offline: true });
  const names = (data?.medications ?? []).map((m) => m.name).filter(Boolean);
  const title = data?.prescriptionCode ? t('visits.rx', { code: data.prescriptionCode }) : t('visits.prescriptionN', { n: index + 1 });
  const line = loading ? t('visits.loadingShort') : error && !data ? t('visits.tapToOpen') : names.length ? names.join(', ') : t('visits.noMedicines');
  const status = data?.status === 'cancelled' ? t('visits.cancelled') : null;
  return (
    <TouchableOpacity
      style={[styles.item, !first && styles.dividerTop]}
      onPress={() => router.push(`/patient/prescriptions/${id}`)}
      accessibilityRole="button"
      accessibilityLabel={[title, status, loading ? null : line].filter(Boolean).join('. ')}
      accessibilityHint={t('visits.openPrescriptionHint')}
    >
      <View style={styles.itemTop}>
        <Text style={[styles.itemTitle, styles.figures]}>{title}</Text>
        {status ? <Text style={styles.statusMuted}>{status}</Text> : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <Text style={styles.itemLine} numberOfLines={2}>
        {line}
      </Text>
    </TouchableOpacity>
  );
}

/** A titled ruled card. `flush`: its rows bring their own padding and hairlines. */
function Section({ title, flush, children }: { title: string; flush?: boolean; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.card, !flush && styles.cardPadded]}>{children}</View>
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
  content: { padding: spacing.md, gap: 0 },
  figures: { fontVariant: ['tabular-nums'] },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatusText: { fontSize: 13, fontWeight: '600', color: colors.primaryText },
  heroWhen: { fontSize: 14, color: colors.onNavyMuted, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.primaryText, letterSpacing: -0.3, marginTop: spacing.xs },
  heroLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs + 2, marginTop: spacing.xs + 2 },
  heroLineText: { flexShrink: 1, fontSize: 14, lineHeight: 19, color: colors.onNavyMuted },
  heroRef: { fontSize: 13, color: colors.onNavyMuted, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
  heroFoot: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    gap: spacing.sm + 4,
  },
  heroFollow: { fontSize: 15, fontWeight: '600', color: colors.primaryText, fontVariant: ['tabular-nums'] },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  heroButtonText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },

  section: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  cardPadded: { paddingVertical: spacing.sm + 4 },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  planText: { marginBottom: spacing.sm },
  item: { paddingVertical: spacing.sm + 4, minHeight: 48, justifyContent: 'center' },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  itemLine: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tag: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText: { fontSize: 12, fontWeight: '700', color: colors.primaryOnSoft },
  statusMuted: { fontSize: 12, fontWeight: '700', color: colors.slate },
  subList: { paddingVertical: spacing.xs },
  subTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.xs },
  bullet: { paddingVertical: spacing.xs },
  bulletTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  bulletLine: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginLeft: spacing.md - 4 },
  vitalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 44, paddingVertical: spacing.sm },
  vitalLabel: { fontSize: 15, color: colors.textMuted },
  vitalValue: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  linkText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  followDate: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  followNote: { marginTop: spacing.xs },
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
