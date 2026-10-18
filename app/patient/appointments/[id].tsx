import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { cancelAppointment, canCancel } from '@/lib/appointments';
import { useApiData } from '@/lib/useApiData';
import { Appointment } from '@/lib/types';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Banner, Button, Card, DetailRow, LoadingView, screenStyles, useBottomPadding } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';

export default function AppointmentDetailScreen() {
  const bottomPad = useBottomPadding();
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
  const cancellable = canCancel(appointment);

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

      {cancellable ? (
        <Button title="Cancel appointment" variant="dangerOutline" onPress={confirmCancel} loading={cancelling} />
      ) : null}
    </ScrollView>
  );
}
