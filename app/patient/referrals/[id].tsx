import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, errorMessage } from '@/lib/api';
import { useApiData } from '@/lib/useApiData';
import { formatDate, formatTime, humanize } from '@/lib/format';
import {
  openReferralLetter,
  Referral,
  REFERRALS_PATH,
  referredByText,
  referredToText,
  STATUS_HINT,
  STATUS_LABEL,
  URGENCY_LABEL,
} from '@/lib/referrals';
import { colors, radius, spacing } from '@/lib/theme';
import { Badge, Banner, Button, DetailRow, LoadingView, useBottomPadding } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';
import { softShadow } from '@/components/AppHeader';

/** One referral: who to, why, where it stands, the appointment booked from it and the letter. */
export default function ReferralDetailScreen() {
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh } = useApiData<Referral>(
    id ? `${REFERRALS_PATH}/${encodeURIComponent(id)}` : null,
    { refreshOn: ['appointments'] }
  );
  const [opening, setOpening] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // A short-lived link, downloaded into the app's cache and opened with the share sheet.
  async function openLetter() {
    if (!data) return;
    setOpening(true);
    setPdfError(null);
    try {
      await openReferralLetter(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_LETTER') refresh();
      setPdfError(errorMessage(err, "Couldn't open the referral letter. Please try again."));
    } finally {
      setOpening(false);
    }
  }

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Referral not found." onRetry={refresh} />;

  const urgency = URGENCY_LABEL[data.urgency];
  const appt = data.appointment;
  const apptWhen = appt
    ? [appt.appointmentDate ? formatDate(appt.appointmentDate) : null, appt.appointmentTime ? formatTime(appt.appointmentTime) : null]
        .filter(Boolean)
        .join(' at ')
    : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.icon}>
            <Ionicons name="git-branch-outline" size={26} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>{referredToText(data)}</Text>
            {data.referralCode ? <Text style={styles.meta}>Referral {data.referralCode}</Text> : null}
          </View>
        </View>
        <View style={styles.badges}>
          <Badge label={STATUS_LABEL[data.status] ?? humanize(data.status)} tone={data.status === 'declined' ? 'danger' : data.status === 'pending' ? 'warning' : data.status === 'cancelled' ? 'neutral' : 'primary'} />
          {urgency ? <Badge label={urgency} tone="danger" /> : null}
        </View>
        {STATUS_HINT[data.status] ? <Text style={styles.hint}>{STATUS_HINT[data.status]}</Text> : null}
      </View>

      <Text style={styles.section} accessibilityRole="header">
        Details
      </Text>
      <View style={styles.card}>
        <DetailRow label="Referred to" value={referredToText(data)} />
        <DetailRow label="Specialty" value={data.specialty} />
        <DetailRow label="Referred by" value={referredByText(data)} />
        <DetailRow label="Reason" value={data.reason} />
      </View>

      <Text style={styles.section} accessibilityRole="header">
        Progress
      </Text>
      <View style={styles.card}>
        <DetailRow label="Referred" value={data.referredDate ? formatDate(data.referredDate) : null} />
        <DetailRow label="Accepted" value={data.acceptedDate ? formatDate(data.acceptedDate) : null} />
        <DetailRow label="Completed" value={data.completedDate ? formatDate(data.completedDate) : null} />
        <DetailRow label="Declined" value={data.declinedDate ? formatDate(data.declinedDate) : null} />
        <DetailRow label="Follow-up" value={data.followUpDate ? formatDate(data.followUpDate) : null} />
      </View>

      {appt ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            Appointment
          </Text>
          <TouchableOpacity
            style={[styles.card, styles.apptRow]}
            onPress={() => router.push(`/patient/appointments/${appt._id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Appointment ${apptWhen ?? ''}, ${appt.status ?? ''}. Open`}
          >
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.body}>{apptWhen || 'Appointment'}</Text>
              {appt.appointmentCode ? <Text style={styles.meta}>{appt.appointmentCode}</Text> : null}
            </View>
            <StatusBadge status={appt.status} />
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </>
      ) : null}

      {data.letterAvailable ? (
        <View style={styles.pdf}>
          <Button title="Open referral letter (PDF)" icon="download-outline" variant="secondary" onPress={openLetter} loading={opening} />
          <Text style={styles.footnote}>Bring it to your appointment. The receiving doctor can check it is genuine with its QR code.</Text>
          {pdfError ? <Banner message={pdfError} /> : null}
        </View>
      ) : null}

      <Text style={styles.footnote}>Questions about this referral? Contact {data.clinic.name ?? 'your clinic'}.</Text>
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
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: spacing.sm },
  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  apptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  footnote: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  pdf: { marginTop: spacing.md, gap: spacing.sm },
});
