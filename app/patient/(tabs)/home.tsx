import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/useApiData';
import { useUnread } from '@/lib/unread';
import { Appointment, InvoiceListEnvelope } from '@/lib/types';
import { doctorName, formatDate, formatMoney, formatTime } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Button, Card, ListRow, PressableCard, SectionTitle, screenStyles } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';

const UPCOMING_STATUSES = new Set(['pending', 'scheduled', 'confirmed', 'rescheduled']);

function appointmentStart(a: Appointment): number {
  const date = a.appointmentDate ?? a.scheduledAt;
  if (!date) return NaN;
  const day = new Date(date);
  if (a.appointmentTime && /^\d{2}:\d{2}$/.test(a.appointmentTime)) {
    const [h, m] = a.appointmentTime.split(':').map(Number);
    day.setHours(h, m, 0, 0);
  }
  return day.getTime();
}

export default function HomeScreen() {
  const { patient } = useAuth();
  const { unreadCount, refreshUnread } = useUnread();
  const appointments = useApiData<Appointment[]>('/api/patients/me/appointments?limit=20', {
    refreshOn: ['appointments'],
  });
  const invoices = useApiData<InvoiceListEnvelope>('/api/patients/me/invoices?limit=1', {
    envelope: true,
    refreshOn: ['invoices'],
  });

  const next = useMemo(() => {
    const now = Date.now() - 60 * 60 * 1000;
    return (appointments.data ?? [])
      .filter((a) => UPCOMING_STATUSES.has(a.status) && appointmentStart(a) >= now)
      .sort((a, b) => appointmentStart(a) - appointmentStart(b))[0];
  }, [appointments.data]);

  const balance = invoices.data?.summary?.outstandingBalance ?? 0;
  const refreshing = appointments.refreshing || invoices.refreshing;

  function refreshAll() {
    appointments.refresh();
    invoices.refresh();
    refreshUnread();
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={screenStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.primary} />}
      >
        <Text style={styles.greeting}>Hi{patient?.firstName ? `, ${patient.firstName}` : ''}</Text>
        <Text style={styles.subtitle}>Here's what's coming up.</Text>

        <SectionTitle>Next appointment</SectionTitle>
        {appointments.loading ? (
          <Card>
            <Text style={screenStyles.muted}>Loading…</Text>
          </Card>
        ) : appointments.error && !appointments.data ? (
          <Card>
            <Text style={screenStyles.muted}>{appointments.error}</Text>
          </Card>
        ) : next ? (
          <PressableCard onPress={() => router.push(`/patient/appointments/${next._id}`)}>
            <View style={screenStyles.cardHeader}>
              <Text style={screenStyles.cardTitle}>
                {formatDate(next.appointmentDate ?? next.scheduledAt)}
                {next.appointmentTime ? ` · ${formatTime(next.appointmentTime)}` : ''}
              </Text>
              <StatusBadge status={next.status} />
            </View>
            {doctorName(next.doctor) ? <Text style={screenStyles.cardLine}>{doctorName(next.doctor)}</Text> : null}
            {next.reason ? <Text style={screenStyles.cardMeta}>{next.reason}</Text> : null}
          </PressableCard>
        ) : (
          <Card>
            <Text style={screenStyles.muted}>No upcoming appointments.</Text>
          </Card>
        )}
        <Button title="Book an appointment" onPress={() => router.push('/patient/appointments/book')} />

        {balance > 0 ? (
          <>
            <SectionTitle>Billing</SectionTitle>
            <PressableCard onPress={() => router.push('/patient/invoices')}>
              <Text style={screenStyles.muted}>Outstanding balance</Text>
              <Text style={styles.balance}>{formatMoney(balance)}</Text>
              <Text style={screenStyles.cardMeta}>Pay at the clinic.</Text>
            </PressableCard>
          </>
        ) : null}

        <SectionTitle>Shortcuts</SectionTitle>
        <ListRow
          label="Notifications"
          detail={unreadCount ? `${unreadCount} unread` : 'All caught up'}
          badgeCount={unreadCount}
          onPress={() => router.push('/patient/notifications')}
        />
        <ListRow label="Queue status" onPress={() => router.push('/patient/queue')} />
        <ListRow label="Prescriptions" onPress={() => router.push('/patient/prescriptions')} />
        <ListRow label="Documents" onPress={() => router.push('/patient/documents')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 26, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  balance: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
});
