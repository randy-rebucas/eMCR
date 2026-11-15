import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest, errorMessage } from '@/lib/api';
import { openPdfLink } from '@/lib/documents';
import { useApiData } from '@/lib/useApiData';
import { Prescription } from '@/lib/types';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import { isCurrent, prescriberName, visitOf } from '@/lib/prescriptions';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, LoadingView, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { statusLabel } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';
import { isUnavailable, UnavailableView } from '@/components/StateView';
import { MedicationCard } from '@/components/MedicationCard';
import { useT } from '@/lib/i18n';

export default function PrescriptionDetailScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useApiData<Prescription>(
    id ? `/api/patients/me/prescriptions/${encodeURIComponent(id)}` : null,
    { refreshOn: ['prescriptions'], offline: true }
  );
  const { data, loading, refreshing, error, refresh, offline, stale, updatedAt } = record;
  const [opening, setOpening] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Ask for a short-lived link and download it into the app's cache (never the browser).
  async function openPdf() {
    if (!data) return;
    setOpening(true);
    setPdfError(null);
    try {
      const link = await apiRequest<{ url: string }>(`/api/patients/me/prescriptions/${encodeURIComponent(data._id)}/pdf-link`, { method: 'POST' });
      await openPdfLink(link.url, `Prescription-${data.prescriptionCode ?? data._id}`, t('prescriptions.prescription'));
    } catch (err) {
      setPdfError(errorMessage(err, t('prescriptions.openFailed')));
    } finally {
      setOpening(false);
    }
  }

  if (loading) return <LoadingView />;
  // Gone, or another profile's record (often a push for a deleted record): Back, not Try Again.
  if (error && !data) return isUnavailable(record) ? <UnavailableView /> : <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <UnavailableView />;

  const visit = visitOf(data);
  const dispenses = (data.pharmacyDispenses ?? []).filter((d) => d.pharmacyName || d.dispensedAt);
  const prescriber = prescriberName(data);
  const current = isCurrent(data);
  const cancelled = data.status === 'cancelled';
  // The PDF needs the server: a saved copy can't fetch a fresh link.
  const needsServer = offline || stale;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <OfflineBanner offline={offline} updatedAt={updatedAt} />

      {/* The prescription as a whole, on navy; the medicines follow. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>{t('prescriptions.prescription')}</Text>
          <View style={styles.heroStatus}>
            <Ionicons
              name={cancelled ? 'close-circle' : current ? 'checkmark-circle' : 'time-outline'}
              size={14}
              color={current && !cancelled ? colors.accent : colors.onNavyMuted}
            />
            <Text style={styles.heroStatusText}>
              {cancelled || !data.status ? statusLabel(t, data.status ?? 'cancelled') : current ? t('prescriptions.tab.current') : t('prescriptions.tab.past')}
            </Text>
          </View>
        </View>
        <Text style={styles.heroWhen}>{formatDate(data.issuedAt ?? data.createdAt, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
        <Text style={styles.heroCount}>{t('prescriptions.medicineCount', { count: data.medications?.length ?? 0 })}</Text>
        {prescriber ? <Text style={styles.heroLine}>{prescriber}</Text> : null}
        {data.prescriptionCode ? (
          <Text style={styles.heroRef} selectable>
            {t('prescriptions.rx', { code: data.prescriptionCode })}
          </Text>
        ) : null}
        {!cancelled ? (
          <View style={styles.heroFoot}>
            <TouchableOpacity
              style={[styles.heroButton, needsServer && styles.heroButtonOff]}
              onPress={openPdf}
              disabled={opening || needsServer}
              accessibilityRole="button"
              accessibilityState={{ disabled: opening || needsServer, busy: opening }}
            >
              <Ionicons name="download-outline" size={18} color={colors.primaryText} />
              <Text style={styles.heroButtonText}>{opening ? t('prescriptions.opening') : t('prescriptions.openPdf')}</Text>
            </TouchableOpacity>
            <Text style={styles.heroNote}>{needsServer ? t('prescriptions.pdfNeedsConnection') : t('prescriptions.pdfNote')}</Text>
          </View>
        ) : null}
      </View>
      {pdfError ? <Banner message={pdfError} /> : null}

      <Text style={styles.section} accessibilityRole="header">
        {t('prescriptions.medications')}
      </Text>
      {data.medications?.length ? (
        data.medications.map((med, index) => <MedicationCard key={`${med.name}-${index}`} prescription={data} med={med} />)
      ) : (
        <Text style={styles.muted}>{t('prescriptions.noMeds')}</Text>
      )}

      {data.notes ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            {t('prescriptions.doctorNotes')}
          </Text>
          <View style={[styles.card, styles.cardPadded]}>
            <Text style={styles.body} selectable>
              {data.notes}
            </Text>
          </View>
        </>
      ) : null}

      {visit?.date || dispenses.length ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            {t('prescriptions.where')}
          </Text>
          <View style={styles.card}>
            {visit?.date ? (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/patient/visits/${visit._id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${t('prescriptions.visit')}: ${visit.visitType ? humanize(visit.visitType) : ''} ${formatDate(visit.date)}`}
              >
                <Ionicons name="medkit-outline" size={18} color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    {visit.visitType ? humanize(visit.visitType) : t('prescriptions.visit')} · {formatDate(visit.date)}
                  </Text>
                  {visit.visitCode ? <Text style={styles.rowMeta}>{t('prescriptions.visitRef', { code: visit.visitCode })}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
            {dispenses.map((d, i) => (
              <View key={i} style={[styles.row, (i > 0 || visit?.date) && styles.dividerTop]}>
                <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{d.pharmacyName ?? t('prescriptions.pharmacy')}</Text>
                  {d.dispensedAt ? <Text style={styles.rowMeta}>{t('prescriptions.dispensedOn', { date: formatDateTime(d.dispensedAt) })}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.footnote}>{t('prescriptions.footnote')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  flex: { flex: 1 },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4, marginBottom: spacing.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatusText: { fontSize: 13, fontWeight: '600', color: colors.primaryText },
  heroWhen: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.primaryText, letterSpacing: -0.3, marginTop: spacing.sm + 4, fontVariant: ['tabular-nums'] },
  heroCount: { fontSize: 16, fontWeight: '600', color: colors.primaryText, marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
  heroLine: { fontSize: 14, color: colors.onNavyMuted, marginTop: spacing.xs + 2 },
  heroRef: { fontSize: 13, color: colors.onNavyMuted, marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
  heroFoot: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    gap: spacing.sm,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  heroButtonOff: { backgroundColor: colors.navyLine },
  heroButtonText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },
  heroNote: { fontSize: 13, lineHeight: 18, color: colors.onNavyMuted },

  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  cardPadded: { paddingVertical: spacing.md },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 56, paddingVertical: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  muted: { fontSize: 14, color: colors.textMuted },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  footnote: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
