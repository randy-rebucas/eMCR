import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { cancelAppointment, canCancel, canReschedule } from '@/lib/appointments';
import { useApiData } from '@/lib/useApiData';
import { Appointment } from '@/lib/types';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { isVideoVisit, openVideoCall, opensLabel } from '@/lib/teleconsult';
import { Banner, Button, Card, DetailRow, LoadingView, screenStyles, useBottomPadding } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';

export default function AppointmentDetailScreen() {
  const bottomPad = useBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, poll, offline, updatedAt } = useApiData<Appointment>(
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

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Appointment not found." onRetry={refresh} />;

  const appointment = data;
  const cancellable = canCancel(appointment);
  const movable = canReschedule(appointment);
  const video = isVideoVisit(appointment);
  const joinUrl = appointment.teleconsult?.joinable ? appointment.teleconsult.joinUrl : null;
  const opens = video ? opensLabel(appointment) : null;

  function confirmCancel() {
    Alert.alert('Cancel appointment?', 'The clinic will be notified. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel appointment', style: 'destructive', onPress: cancel },
    ]);
  }

  async function cancel() {
    setCancelling(true);
    setActionError(null);
    try {
      await cancelAppointment(appointment._id);
      poll();
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't cancel the appointment. Please try again."));
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
        <DetailRow label="Doctor" value={doctorName(appointment.doctor)} />
        <DetailRow label="Specialization" value={appointment.doctor?.specialization} />
        <DetailRow label="Reason" value={appointment.reason} />
        {video ? <DetailRow label="Visit type" value="Video call" /> : <DetailRow label="Room" value={appointment.room} />}
        <DetailRow label="Duration" value={appointment.duration ? `${appointment.duration} min` : null} />
        <DetailRow label="Reference" value={appointment.appointmentCode} />
      </Card>

      {joinUrl ? (
        <>
          <Button title="Join video call" icon="videocam-outline" onPress={() => openVideoCall(joinUrl)} />
          <Text style={screenStyles.muted}>
            Find a quiet, well-lit spot and allow camera and microphone access when asked. The doctor joins at your appointment time.
          </Text>
        </>
      ) : opens ? (
        <Text style={screenStyles.muted}>{opens}. The Join button appears here then.</Text>
      ) : null}

      {appointment.status === 'pending' ? (
        <Text style={screenStyles.muted}>The clinic will confirm this request. You'll get a notification once it does.</Text>
      ) : null}

      {movable ? (
        <Button
          title="Reschedule"
          icon="calendar-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/patient/appointments/reschedule', params: { id: appointment._id } })}
          disabled={cancelling}
        />
      ) : null}
      {cancellable ? (
        <Button title="Cancel appointment" variant="dangerOutline" onPress={confirmCancel} loading={cancelling} />
      ) : null}
    </ScrollView>
  );
}
