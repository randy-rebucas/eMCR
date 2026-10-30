import { useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useApiData } from '@/lib/useApiData';
import { canReschedule } from '@/lib/appointments';
import { Appointment } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';
import { BookedSummary, BookingForm, BookingSuccess } from '@/components/BookingForm';
import { LoadingView, useBottomPadding } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';

/** The detail route also returns the appointment's clinic, which the booking form needs. */
type AppointmentAtClinic = Appointment & { tenantId?: string };

/** Move an appointment to another time with the same doctor (from the appointment's detail screen). */
export default function RescheduleAppointmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const bottomPad = useBottomPadding();
  const { data, loading, error, refresh } = useApiData<AppointmentAtClinic>(
    id ? `/api/patients/me/appointments/${encodeURIComponent(id)}` : null
  );
  const [moved, setMoved] = useState<BookedSummary | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Reschedule' });
  }, [navigation]);

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <ErrorState message="Appointment not found." onRetry={refresh} />;
  if (!moved && !canReschedule(data)) {
    return <ErrorState message="This appointment can no longer be moved in the app. Please contact the clinic." onRetry={refresh} />;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      keyboardShouldPersistTaps="handled"
    >
      {moved ? (
        <BookingSuccess booked={moved} rescheduled onView={() => router.back()} />
      ) : (
        <BookingForm
          reschedule={data}
          tenantId={typeof data.tenantId === 'string' ? data.tenantId : undefined}
          onBooked={setMoved}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
});
