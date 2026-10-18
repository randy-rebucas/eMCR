import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Appointment } from '@/lib/types';
import { cancelAppointment, canCancel } from '@/lib/appointments';
import { errorMessage } from '@/lib/api';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName } from './ui';
import { StatusBadge } from './StatusBadge';
import { softShadow } from './AppHeader';

/**
 * Date block + reason, doctor, time and room. `actions` adds the Cancel /
 * View Details row under upcoming appointments.
 */
export function AppointmentCard({
  appointment: a,
  actions = false,
  compact = false,
}: {
  appointment: Appointment;
  actions?: boolean;
  compact?: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const when = new Date(a.appointmentDate ?? a.scheduledAt ?? '');
  const valid = !isNaN(when.getTime());
  // formatDate reads the parts on the clinic's clock (dates are stored as clinic-midnight instants).
  const doctor = doctorName(a.doctor);
  const open = () => router.push(`/patient/appointments/${a._id}`);

  function confirmCancel() {
    Alert.alert('Cancel appointment?', 'The clinic will be notified. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel appointment',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelAppointment(a._id);
          } catch (err) {
            Alert.alert("Couldn't cancel", errorMessage(err, 'Please try again.'));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.main}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Appointment on ${formatDate(a.appointmentDate ?? a.scheduledAt)}${doctor ? ` with ${doctor}` : ''}, ${a.status}`}
      >
        <View style={[styles.dateBlock, compact && styles.dateBlockCompact]}>
          {valid ? (
            <>
              <Text style={styles.dateMonth}>{formatDate(when, { month: 'short' }).toUpperCase()}</Text>
              <Text style={[styles.dateDay, compact && styles.dateDayCompact]} maxFontSizeMultiplier={1.4}>
                {formatDate(when, { day: 'numeric' })}
              </Text>
              <Text style={styles.dateWeekday}>{formatDate(when, { weekday: 'short' })}</Text>
            </>
          ) : (
            <Ionicons name="calendar-outline" size={28} color={colors.primaryOnSoft} />
          )}
        </View>
        <View style={styles.flex}>
          <View style={styles.header}>
            <Text style={[styles.title, styles.flex]} numberOfLines={2}>
              {a.reason || 'Appointment'}
            </Text>
            <StatusBadge status={a.status} />
          </View>
          {doctor ? <Text style={styles.doctor}>{doctor}</Text> : null}
          {a.doctor?.specialization ? <Text style={styles.meta}>{a.doctor.specialization}</Text> : null}
          <View style={styles.metaRow}>
            {a.appointmentTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={styles.metaStrong}>{formatTime(a.appointmentTime)}</Text>
              </View>
            ) : null}
            {a.room ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={16} color={colors.primary} />
                <Text style={styles.metaStrong} numberOfLines={1}>
                  {a.room}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {!actions ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} style={styles.chevron} /> : null}
      </TouchableOpacity>

      {actions ? (
        <View style={styles.actions}>
          {canCancel(a) ? (
            <ActionButton
              icon="close-circle-outline"
              label="Cancel"
              tone="danger"
              onPress={confirmCancel}
              loading={cancelling}
            />
          ) : null}
          <ActionButton icon="document-text-outline" label="View Details" onPress={open} />
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  tone = 'default',
  loading = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  loading?: boolean;
}) {
  const color = tone === 'danger' ? colors.danger : colors.text;
  return (
    <TouchableOpacity
      style={styles.action}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={tone === 'danger' ? colors.danger : colors.textMuted} />
          <Text style={[styles.actionText, { color }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    marginBottom: spacing.sm + 4,
    ...softShadow,
  },
  main: { flexDirection: 'row', gap: spacing.md },
  dateBlock: {
    width: 76,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 4,
  },
  dateBlockCompact: { width: 68, paddingVertical: spacing.sm },
  // primaryOnSoft: plain primary is only 4.3:1 on the soft tint.
  dateMonth: { fontSize: 13, fontWeight: '700', color: colors.primaryOnSoft, letterSpacing: 0.5 },
  dateDay: { fontSize: 30, fontWeight: '800', color: colors.primaryOnSoft, lineHeight: 36 },
  dateDayCompact: { fontSize: 26, lineHeight: 32 },
  dateWeekday: { fontSize: 13, fontWeight: '600', color: colors.primaryOnSoft },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  doctor: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm + 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  metaStrong: { fontSize: 14, color: colors.text, fontWeight: '500', flexShrink: 1 },
  chevron: { alignSelf: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { fontSize: 14, fontWeight: '600' },
});
