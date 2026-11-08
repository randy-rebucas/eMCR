import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { cancelAppointment, canCancel, canReschedule } from '@/lib/appointments';
import { useApiData } from '@/lib/useApiData';
import { Appointment } from '@/lib/types';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { isVideoVisit, openVideoCall, opensLabel, useJoinUrl } from '@/lib/teleconsult';
import { Banner, Button, Card, DetailRow, LoadingView, screenStyles, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';
import { useT } from '@/lib/i18n';

export default function AppointmentDetailScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, poll, offline, stale, updatedAt } = useApiData<Appointment>(
    id ? `/api/patients/me/appointments/${encodeURIComponent(id)}` : null,
    { refreshOn: ['appointments'], offline: true }
  );
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

  const appointment = data;
  const cancellable = canCancel(appointment);
  const movable = canReschedule(appointment);
  const video = isVideoVisit(appointment);
  const opens = video ? opensLabel(appointment) : null;

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
      await cancelAppointment(appointment._id);
      poll();
    } catch (err) {
      setActionError(errorMessage(err, t('appointments.cancel.failedLong')));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ScrollView
      style={screenStyles.container}
      contentContainerStyle={[screenStyles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <OfflineBanner offline={offline} updatedAt={updatedAt} />
      {actionError ? <Banner message={actionError} /> : null}
      <Card>
        <View style={screenStyles.cardHeader}>
          <Text style={screenStyles.title}>
            {formatDate(appointment.appointmentDate ?? appointment.scheduledAt)}
            {appointment.appointmentTime ? ` · ${formatTime(appointment.appointmentTime)}` : ''}
          </Text>
          <StatusBadge status={appointment.status} />
        </View>
        <View style={{ height: 8 }} />
        <DetailRow label={t('appointments.detail.doctor')} value={doctorName(appointment.doctor)} />
        <DetailRow label={t('appointments.detail.specialization')} value={appointment.doctor?.specialization} />
        <DetailRow label={t('appointments.detail.reason')} value={appointment.reason} />
        {video ? <DetailRow label={t('appointments.detail.visitType')} value={t('appointments.videoCall')} /> : <DetailRow label={t('appointments.detail.room')} value={appointment.room} />}
        <DetailRow label={t('appointments.detail.duration')} value={appointment.duration ? t('appointments.detail.minutes', { minutes: appointment.duration }) : null} />
        <DetailRow label={t('appointments.detail.reference')} value={appointment.appointmentCode} />
      </Card>

      {joinUrl ? (
        <>
          <Button title={t('appointments.detail.joinVideo')} icon="videocam-outline" onPress={() => openVideoCall(joinUrl)} />
          <Text style={screenStyles.muted}>
            {t('appointments.detail.videoTips')}
          </Text>
        </>
      ) : opens ? (
        <Text style={screenStyles.muted}>{t('appointments.detail.opensJoin', { opens })}</Text>
      ) : null}

      {appointment.status === 'pending' ? (
        <Text style={screenStyles.muted}>{t('appointments.detail.pending')}</Text>
      ) : null}

      {movable ? (
        <Button
          title={t('appointments.reschedule')}
          icon="calendar-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/patient/appointments/reschedule', params: { id: appointment._id } })}
          disabled={cancelling}
        />
      ) : null}
      {cancellable ? (
        <Button title={t('appointments.cancel.confirm')} variant="dangerOutline" onPress={confirmCancel} loading={cancelling} />
      ) : null}
    </ScrollView>
  );
}
