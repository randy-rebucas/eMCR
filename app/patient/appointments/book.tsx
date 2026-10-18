import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { apiRequest, ApiError, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { useApiData } from '@/lib/useApiData';
import { Appointment, BookingOptions, DoctorRef } from '@/lib/types';
import { doctorName, formatTime, toYmd } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, ChipGroup, LoadingView, SectionTitle, TextField, screenStyles } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

const DAYS_AHEAD = 30;

function upcomingDays(): { value: string; weekday: string; day: string; month: string }[] {
  const days = [];
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    days.push({
      value: toYmd(d),
      weekday: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      day: String(d.getDate()),
      month: d.toLocaleDateString(undefined, { month: 'short' }),
    });
  }
  return days;
}

export default function BookAppointmentScreen() {
  const doctorsQuery = useApiData<BookingOptions>('/api/patients/appointments');
  const days = useMemo(upcomingDays, []);

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [time, setTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTime(null);
    setSlots(null);
    setSlotsError(null);
    if (!doctorId || !date) return;
    let cancelled = false;
    setSlotsLoading(true);
    apiRequest<BookingOptions>(
      `/api/patients/appointments?date=${encodeURIComponent(date)}&doctorId=${encodeURIComponent(doctorId)}`
    )
      .then((result) => {
        if (cancelled) return;
        let available = result.availableSlots ?? [];
        // Today's slots that have already passed aren't bookable (approximated with the device clock).
        if (date === toYmd(new Date())) {
          const now = new Date();
          const minutesNow = now.getHours() * 60 + now.getMinutes();
          available = available.filter((slot) => {
            const [h, m] = slot.split(':').map(Number);
            return h * 60 + m > minutesNow;
          });
        }
        setSlots(available);
      })
      .catch((err) => {
        if (!cancelled) setSlotsError(errorMessage(err, "Couldn't load available times."));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, date, slotsVersion]);

  if (doctorsQuery.loading) return <LoadingView />;
  if (doctorsQuery.error && !doctorsQuery.data) {
    return <ErrorState message={doctorsQuery.error} onRetry={doctorsQuery.refresh} />;
  }

  const doctors: DoctorRef[] = doctorsQuery.data?.doctors ?? [];
  if (doctors.length === 0) {
    return <EmptyState message="No doctors are taking online bookings at your clinic right now. Please call the clinic." />;
  }

  async function submit() {
    if (!doctorId || !date || !time) {
      setError('Choose a doctor, a date and a time.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiRequest<Appointment>('/api/patients/appointments', {
        method: 'POST',
        body: {
          doctorId,
          appointmentDate: date,
          appointmentTime: time,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      });
      emitRefresh('appointments', 'notifications');
      if (created?._id) router.replace(`/patient/appointments/${created._id}`);
      else router.back();
    } catch (err) {
      setError(errorMessage(err, "Couldn't book the appointment. Please try again."));
      if (err instanceof ApiError && err.status === 409) {
        // Slot was taken meanwhile: reload the times.
        setSlotsVersion((v) => v + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={screenStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        {error ? <Banner message={error} /> : null}

        <SectionTitle>1. Doctor</SectionTitle>
        {doctors.map((doctor) => {
          const id = doctor._id ?? '';
          const selected = id === doctorId;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setDoctorId(id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{doctorName(doctor)}</Text>
              {doctor.specialization ? <Text style={screenStyles.cardMeta}>{doctor.specialization}</Text> : null}
            </TouchableOpacity>
          );
        })}

        <SectionTitle>2. Date</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
          {days.map((d) => {
            const selected = d.value === date;
            return (
              <TouchableOpacity
                key={d.value}
                style={[styles.day, selected && styles.optionSelected]}
                onPress={() => setDate(d.value)}
                accessibilityRole="button"
                accessibilityLabel={`${d.weekday} ${d.month} ${d.day}`}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.dayWeekday, selected && styles.optionTitleSelected]}>{d.weekday}</Text>
                <Text style={[styles.dayNumber, selected && styles.optionTitleSelected]}>{d.day}</Text>
                <Text style={[styles.dayWeekday, selected && styles.optionTitleSelected]}>{d.month}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <SectionTitle>3. Time</SectionTitle>
        {!doctorId || !date ? (
          <Text style={screenStyles.muted}>Choose a doctor and a date to see available times.</Text>
        ) : slotsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : slotsError ? (
          <TouchableOpacity onPress={() => setSlotsVersion((v) => v + 1)}>
            <Text style={styles.error}>{slotsError} Tap to retry.</Text>
          </TouchableOpacity>
        ) : slots && slots.length > 0 ? (
          <ChipGroup
            options={slots.map((slot) => ({ label: formatTime(slot), value: slot }))}
            value={time ?? ''}
            onChange={setTime}
            wrap
          />
        ) : (
          <Text style={screenStyles.muted}>No times left on this day. Try another date.</Text>
        )}

        <SectionTitle>4. Reason (optional)</SectionTitle>
        <TextField
          label="What's the visit for?"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
          placeholder="e.g. Follow-up check-up"
        />

        <Button title="Request appointment" onPress={submit} loading={submitting} disabled={!doctorId || !date || !time} />
        <Text style={[screenStyles.muted, { marginTop: spacing.md }]}>
          Requests are confirmed by the clinic. You'll get a notification when it's confirmed.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  option: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionTitleSelected: { color: colors.primary },
  days: { gap: spacing.sm, paddingBottom: spacing.xs },
  day: {
    width: 64,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayWeekday: { fontSize: 12, color: colors.textMuted },
  dayNumber: { fontSize: 20, fontWeight: '700', color: colors.text, marginVertical: 2 },
  error: { color: colors.danger, fontSize: 14 },
});
