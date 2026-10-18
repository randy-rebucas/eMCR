import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiRequest, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { useApiData } from '@/lib/useApiData';
import { Appointment } from '@/lib/types';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Banner, Button, Card, DetailRow, LoadingView, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';

const NOT_CANCELLABLE = new Set(['completed', 'cancelled', 'no-show']);

function isInFuture(a: Appointment): boolean {
  const date = a.appointmentDate ?? a.scheduledAt;
  if (!date) return false;
  const start = new Date(date);
  if (a.appointmentTime && /^\d{2}:\d{2}$/.test(a.appointmentTime)) {
    const [h, m] = a.appointmentTime.split(':').map(Number);
    start.setHours(h, m, 0, 0);
  }
  return start.getTime() > Date.now();
}

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, poll } = useApiData<Appointment>(
    id ? `/api/patients/me/appointments/${encodeURIComponent(id)}` : null,
    { refreshOn: ['appointments'] }
  );
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Appointment not found." onRetry={refresh} />;

  const appointment = data;
  // The server has the final say (clinic timezone); this only hides the button when it obviously can't work.
  const canCancel = !NOT_CANCELLABLE.has(appointment.status) && isInFuture(appointment);

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
      await apiRequest(`/api/patients/appointments/${encodeURIComponent(appointment._id)}`, { method: 'DELETE' });
      emitRefresh('appointments', 'notifications');
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
      contentContainerStyle={screenStyles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
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
        <DetailRow label="Room" value={appointment.room} />
        <DetailRow label="Duration" value={appointment.duration ? `${appointment.duration} min` : null} />
        <DetailRow label="Reference" value={appointment.appointmentCode} />
      </Card>

      {appointment.status === 'pending' ? (
        <Text style={screenStyles.muted}>The clinic will confirm this request. You'll get a notification once it does.</Text>
      ) : null}

      {canCancel ? (
        <Button title="Cancel appointment" variant="dangerOutline" onPress={confirmCancel} loading={cancelling} />
      ) : null}
    </ScrollView>
  );
}
