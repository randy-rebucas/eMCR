import { useLayoutEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useApiData } from '@/lib/useApiData';
import { appointmentStart, canReschedule } from '@/lib/appointments';
import { Appointment, PatientClinic } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';
import { BookedSummary, BookingForm, BookingSuccess } from '@/components/BookingForm';
import { LoadingView, useBottomPadding } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';
import { goBackOrHome, isUnavailable, StateView, UnavailableView } from '@/components/StateView';
import { PlainKey, t as translate, useT } from '@/lib/i18n';

/**
 * Why the app won't move this appointment, checked in the same order as canReschedule
 * (status, then time, then doctor and slot), so the patient knows what to do instead.
 */
function cantMoveReason(a: Appointment): PlainKey {
  if (a.status === 'cancelled') return 'appointments.reschedule.reason.cancelled';
  if (a.status === 'completed') return 'appointments.reschedule.reason.completed';
  if (a.status === 'no-show') return 'appointments.reschedule.reason.noShow';
  if (!(appointmentStart(a) > Date.now())) return 'appointments.reschedule.reason.passed';
  if (!a.doctor?._id || !a.appointmentDate || !a.appointmentTime) return 'appointments.reschedule.reason.noSlot';
  return 'appointments.reschedule.cantMove';
}

function callClinic(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() =>
    Alert.alert(translate('clinics.callFailedTitle'), translate('clinics.callFailedBody', { phone }))
  );
}

/** Move an appointment to another time with the same doctor (from the appointment's detail screen). */
export default function RescheduleAppointmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const navigation = useNavigation();
  const bottomPad = useBottomPadding();
  const record = useApiData<Appointment>(id ? `/api/patients/me/appointments/${encodeURIComponent(id)}` : null);
  const { data, loading, error, refresh } = record;
  const [moved, setMoved] = useState<BookedSummary | null>(null);
  const blocked = !!data && !moved && !canReschedule(data);
  // Only when it can't be moved: the clinic's phone, so the patient can ask them instead.
  const clinics = useApiData<PatientClinic[]>(blocked ? '/api/patients/me/clinics' : null, { offline: true });

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('appointments.reschedule') });
  }, [navigation, t]);

  if (loading) return <LoadingView />;
  if (error && !data) return isUnavailable(record) ? <UnavailableView /> : <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <UnavailableView />;
  if (blocked) {
    const phone = clinics.data?.find((c) => c.tenantId === data.tenantId)?.phone ?? null;
    return (
      <StateView
        fill
        icon="calendar-clear-outline"
        title={t('appointments.reschedule.cantMoveTitle')}
        message={t(cantMoveReason(data))}
        actions={[
          ...(phone
            ? [{ label: t('appointments.detail.callClinic'), icon: 'call-outline' as const, variant: 'primary' as const, onPress: () => callClinic(phone) }]
            : []),
          { label: t('common.goBack'), icon: 'arrow-back', onPress: goBackOrHome },
        ]}
      />
    );
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
