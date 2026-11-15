import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import {
  appointmentProgress,
  appointmentStart,
  cancelAppointment,
  canCancel,
  canReschedule,
  daysUntil,
  isOverdue,
  isUpcoming,
  ProgressStep,
} from '@/lib/appointments';
import { useApiData } from '@/lib/useApiData';
import { Appointment, PatientClinic } from '@/lib/types';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { isVideoVisit, openVideoCall, opensLabel, useJoinUrl } from '@/lib/teleconsult';
import { Banner, Button, IconName, LoadingView, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { statusLabel } from '@/components/StatusBadge';
import { countdown } from '@/components/AppointmentCard';
import { ErrorState } from '@/components/ErrorState';
import { t as translate, TFunction, useT } from '@/lib/i18n';

function addressLine(address: PatientClinic['address']): string | null {
  if (!address) return null;
  const line = [address.street, address.city, address.state].filter(Boolean).join(', ');
  return line || null;
}

function callClinic(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() =>
    Alert.alert(translate('clinics.callFailedTitle'), translate('clinics.callFailedBody', { phone }))
  );
}

/** Opens the maps app (or the browser) on the clinic: the name helps when the address is vague. */
function openDirections(clinic: PatientClinic, address: string) {
  const q = encodeURIComponent(`${clinic.name}, ${address}`);
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => {});
}

/**
 * When the appointment was booked, or null. Staff can enter a visit after the fact (or import it),
 * and a booking date after the visit itself says nothing useful.
 */
function bookedAt(a: Appointment): string | null {
  if (!a.createdAt) return null;
  return appointmentStart(a) < new Date(a.createdAt).getTime() ? null : a.createdAt;
}

/** What the patient waits for next, in one line under the hero's facts; null when nothing. */
function nextStepLine(t: TFunction, a: Appointment, opens: string | null): string | null {
  if (isOverdue(a)) return t('appointments.detail.next.notClosed');
  if (a.status === 'pending' || a.status === 'rescheduled') return t('appointments.detail.pending');
  if (opens) return opens;
  return null;
}

export default function AppointmentDetailScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, poll, offline, stale, updatedAt } = useApiData<Appointment>(
    id ? `/api/patients/me/appointments/${encodeURIComponent(id)}` : null,
    { refreshOn: ['appointments'], offline: true }
  );
  // Where the appointment is: name, address and phone of the clinic it belongs to.
  const clinics = useApiData<PatientClinic[]>('/api/patients/me/clinics', { offline: true });
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reload when the video call opens, so the Join button appears without a pull-to-refresh.
  const opensAt = data?.teleconsult && !data.teleconsult.joinable ? data.teleconsult.opensAt : null;
  useEffect(() => {
    if (!opensAt) return;
    const wait = new Date(opensAt).getTime() - Date.now();
    if (!(wait > 0) || wait > 6 * 60 * 60 * 1000) return;
    const timer = setTimeout(refresh, wait + 1000);
    return () => clearTimeout(timer);
  }, [opensAt, refresh]);

  // No Join from a saved copy, and none once the call has closed.
  const joinUrl = useJoinUrl(data, offline || stale);

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message={t('appointments.notFound')} onRetry={refresh} />;

  const a = data;
  const cancellable = canCancel(a);
  const movable = canReschedule(a);
  const video = isVideoVisit(a);
  const opens = video ? opensLabel(a) : null;
  const upcoming = isUpcoming(a);
  const overdue = isOverdue(a);
  const doctor = doctorName(a.doctor);
  const when = new Date(a.appointmentDate ?? a.scheduledAt ?? '');
  const away = upcoming ? countdown(t, daysUntil(a)) : null;
  const clinic = clinics.data?.find((c) => c.tenantId === a.tenantId) ?? null;
  const address = clinic ? addressLine(clinic.address) : null;
  // Getting there only matters for an in-person visit still ahead.
  const showWayThere = upcoming && !video && !!clinic;
  const next = nextStepLine(t, a, opens);
  // A saved copy can't be moved or cancelled: the server has to answer.
  const needsServer = offline || stale;
  const confirmed = a.status === 'confirmed' || a.status === 'scheduled' || a.status === 'completed';

  function confirmCancel() {
    Alert.alert(t('appointments.cancel.title'), t('appointments.cancel.body'), [
      { text: t('appointments.cancel.keep'), style: 'cancel' },
      { text: t('appointments.cancel.confirm'), style: 'destructive', onPress: cancel },
    ]);
  }

  async function cancel() {
    setCancelling(true);
    setActionError(null);
    try {
      await cancelAppointment(a._id);
      poll();
    } catch (err) {
      setActionError(errorMessage(err, t('appointments.cancel.failedLong')));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <OfflineBanner offline={offline} updatedAt={updatedAt} />

      {/* The appointment itself, as on the Appointments tab's next-appointment card: solid navy. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>{away ?? t('appointments.detail.eyebrow')}</Text>
          <View style={[styles.heroStatus, overdue && styles.heroStatusAttention]}>
            <Ionicons
              name={overdue ? 'alert-circle' : confirmed ? 'checkmark-circle' : a.status === 'cancelled' || a.status === 'no-show' ? 'close-circle' : 'time-outline'}
              size={14}
              color={overdue ? colors.warning : confirmed ? colors.accent : colors.onNavyMuted}
            />
            <Text style={[styles.heroStatusText, overdue && styles.heroStatusTextAttention]}>
              {overdue ? t('appointments.card.pastDate') : statusLabel(t, a.status)}
            </Text>
          </View>
        </View>
        {!isNaN(when.getTime()) ? (
          <Text style={styles.heroWhen}>
            {formatDate(when, { weekday: 'long', month: 'long', day: 'numeric' })}
            {a.appointmentTime ? `\n${formatTime(a.appointmentTime)}` : ''}
          </Text>
        ) : null}
        <Text style={styles.heroReason}>{a.reason || t('appointments.card.fallbackTitle')}</Text>
        {doctor ? (
          <HeroLine icon="person-outline" text={`${doctor}${a.doctor?.specialization ? ` · ${a.doctor.specialization}` : ''}`} />
        ) : null}
        <HeroLine
          icon={video ? 'videocam-outline' : 'business-outline'}
          text={[video ? t('appointments.videoCall') : clinic?.name, !video ? a.room : null].filter(Boolean).join(' · ') || t('appointments.detail.inPerson')}
        />
        {next ? <Text style={styles.heroNext}>{next}</Text> : null}

        {joinUrl || (showWayThere && (address || clinic?.phone)) ? (
          <View style={styles.heroActions}>
            {joinUrl ? <HeroButton icon="videocam-outline" label={t('appointments.detail.joinVideo')} primary onPress={() => openVideoCall(joinUrl)} /> : null}
            {showWayThere && clinic && address ? (
              <HeroButton icon="navigate-outline" label={t('appointments.detail.directions')} onPress={() => openDirections(clinic, address)} />
            ) : null}
            {showWayThere && clinic?.phone ? (
              <HeroButton icon="call-outline" label={t('appointments.detail.callClinic')} onPress={() => callClinic(clinic.phone!)} />
            ) : null}
          </View>
        ) : null}
      </View>
      {joinUrl ? <Text style={styles.tip}>{t('appointments.detail.videoTips')}</Text> : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">
        {t('appointments.progress.title')}
      </Text>
      <View style={styles.card}>
        <Progress appointment={a} />
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        {t('appointments.detail.about')}
      </Text>
      <View style={styles.card}>
        {clinic ? <Row label={t('appointments.detail.clinic')} value={clinic.name} detail={address} first /> : null}
        <Row
          first={!clinic}
          label={t('appointments.detail.visitType')}
          value={video ? t('appointments.videoCall') : a.room ? t('appointments.detail.inPersonRoom', { room: a.room }) : t('appointments.detail.inPerson')}
        />
        {a.duration ? <Row label={t('appointments.detail.duration')} value={t('appointments.detail.minutes', { minutes: a.duration })} figures /> : null}
        {a.appointmentCode ? <Row label={t('appointments.detail.reference')} value={a.appointmentCode} figures selectable /> : null}
        {bookedAt(a) ? (
          <Row label={t('appointments.detail.requested')} value={formatDate(bookedAt(a)!, { month: 'long', day: 'numeric', year: 'numeric' })} figures />
        ) : null}
      </View>

      {movable || cancellable ? (
        <View style={styles.actions}>
          {actionError ? <Banner message={actionError} /> : null}
          {needsServer ? <Text style={styles.offlineNote}>{t('appointments.detail.needsConnection')}</Text> : null}
          {movable ? (
            <Button
              title={t('appointments.reschedule')}
              icon="calendar-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: '/patient/appointments/reschedule', params: { id: a._id } })}
              disabled={cancelling || needsServer}
            />
          ) : null}
          {cancellable ? (
            <TouchableOpacity
              style={styles.cancel}
              onPress={confirmCancel}
              disabled={cancelling || needsServer}
              accessibilityRole="button"
              accessibilityState={{ disabled: cancelling || needsServer, busy: cancelling }}
            >
              {cancelling ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={[styles.cancelText, needsServer && styles.cancelTextOff]}>{t('appointments.cancel.confirm')}</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function HeroLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.heroLine}>
      <Ionicons name={icon} size={16} color={colors.onNavyMuted} />
      <Text style={styles.heroLineText}>{text}</Text>
    </View>
  );
}

function HeroButton({ icon, label, primary, onPress }: { icon: IconName; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.heroButton, primary ? styles.heroButtonPrimary : styles.heroButtonGhost]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={colors.primaryText} />
      <Text style={styles.heroButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Label for each step, worded for where this appointment is. */
function stepText(t: TFunction, a: Appointment, step: ProgressStep): { title: string; detail: string | null } {
  const day = a.appointmentDate ?? a.scheduledAt;
  const booked = bookedAt(a);
  switch (step.key) {
    case 'requested':
      return {
        title: t('appointments.progress.requested'),
        detail: booked ? formatDate(booked, { month: 'short', day: 'numeric' }) : null,
      };
    case 'confirm':
      if (step.state === 'ended') {
        return {
          title: a.status === 'cancelled' ? t('appointments.progress.cancelled') : t('appointments.progress.neverConfirmed'),
          detail: null,
        };
      }
      return {
        title: a.status === 'rescheduled' ? t('appointments.progress.confirmMove') : t('appointments.progress.confirm'),
        detail: step.state === 'current' ? t('appointments.progress.waiting') : null,
      };
    case 'visit':
      if (step.state === 'ended') {
        return {
          title: a.status === 'no-show' ? t('appointments.progress.missed') : t('appointments.progress.notClosed'),
          detail: day ? formatDate(day, { month: 'short', day: 'numeric' }) : null,
        };
      }
      return {
        title: t('appointments.progress.visit'),
        detail: day ? formatDate(day, { weekday: 'short', month: 'short', day: 'numeric' }) : null,
      };
    case 'done':
      return { title: t('appointments.progress.done'), detail: null };
  }
}

/** Requested → clinic confirms → visit day → done, with where it stands now. */
function Progress({ appointment: a }: { appointment: Appointment }) {
  const t = useT();
  const steps = appointmentProgress(a);
  // Steps after one that ended didn't happen: leave them out rather than show them as "to do".
  const endedAt = steps.findIndex((s) => s.state === 'ended');
  const shown = endedAt >= 0 ? steps.slice(0, endedAt + 1) : steps;
  return (
    <View style={styles.progress}>
      {shown.map((step, i) => {
        const { title, detail } = stepText(t, a, step);
        const last = i === shown.length - 1;
        return (
          <View key={step.key} style={styles.step} accessible accessibilityLabel={[title, detail].filter(Boolean).join(', ')}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  step.state === 'done' && styles.dotDone,
                  step.state === 'current' && styles.dotCurrent,
                  step.state === 'ended' && styles.dotEnded,
                ]}
              >
                {step.state === 'done' ? <Ionicons name="checkmark" size={12} color={colors.primaryText} /> : null}
                {step.state === 'ended' ? <Ionicons name="close" size={12} color={colors.primaryText} /> : null}
              </View>
              {!last ? <View style={[styles.line, step.state === 'done' && styles.lineDone]} /> : null}
            </View>
            <View style={[styles.stepBody, !last && styles.stepBodySpaced]}>
              <Text style={[styles.stepTitle, step.state === 'todo' && styles.stepTitleTodo]}>{title}</Text>
              {detail ? <Text style={[styles.stepDetail, step.state === 'current' && styles.stepDetailCurrent]}>{detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Row({
  label,
  value,
  detail,
  figures,
  selectable,
  first,
}: {
  label: string;
  value: string;
  detail?: string | null;
  figures?: boolean;
  selectable?: boolean;
  /** Rows are optional, so each draws the line above it, except the first. */
  first?: boolean;
}) {
  return (
    <View style={[styles.row, !first && styles.dividerTop]} accessible accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, figures && styles.figures]} selectable={selectable}>
        {value}
      </Text>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
    </View>
  );
}

const DOT = 22;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatusAttention: { backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  heroStatusText: { fontSize: 13, fontWeight: '600', color: colors.primaryText },
  heroStatusTextAttention: { color: colors.warning },
  heroWhen: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: -0.3,
    marginTop: spacing.sm + 4,
    fontVariant: ['tabular-nums'],
  },
  heroReason: { fontSize: 16, fontWeight: '600', color: colors.primaryText, marginTop: spacing.md },
  heroLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs + 2, marginTop: spacing.xs + 2 },
  heroLineText: { flexShrink: 1, fontSize: 14, lineHeight: 19, color: colors.onNavyMuted },
  heroNext: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.primaryText,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
    fontVariant: ['tabular-nums'],
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md + 4 },
  heroButton: {
    flexGrow: 1,
    flexBasis: 128,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  heroButtonPrimary: { backgroundColor: colors.primary },
  heroButtonGhost: { borderWidth: 1, borderColor: colors.navyLine },
  heroButtonText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },
  tip: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: spacing.sm, paddingHorizontal: spacing.xs },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  progress: { paddingVertical: spacing.md },
  step: { flexDirection: 'row', gap: spacing.sm + 4 },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  // A ring, not a fill: this is where it stands now.
  dotCurrent: { borderColor: colors.primary, borderWidth: 3 },
  dotEnded: { backgroundColor: colors.slate, borderColor: colors.slate },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, minHeight: DOT, paddingTop: 1 },
  stepBodySpaced: { paddingBottom: spacing.md },
  stepTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  stepTitleTodo: { color: colors.textMuted, fontWeight: '400' },
  stepDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  stepDetailCurrent: { color: colors.primaryOnSoft, fontWeight: '600' },

  row: { paddingVertical: spacing.sm + 4 },
  rowLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  rowValue: { fontSize: 15, color: colors.text, marginTop: 2 },
  rowDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  figures: { fontVariant: ['tabular-nums'] },

  actions: { marginTop: spacing.lg, gap: spacing.sm },
  offlineNote: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  cancelTextOff: { color: colors.textMuted },
});
